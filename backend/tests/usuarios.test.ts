// Usuarios del personal (CU-S03, S04 · A20 › Usuarios · decisiones D.1).
// Decisión del equipo (10/11): sin nombre de usuario aparte; nombres y apellidos + correo obligatorio, con el que se entra.
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { prisma } from '../src/shared/infrastructure/prisma.js';
import { ConsolaCorreo } from '../src/shared/infrastructure/correo.js';
import { CORREO_OBLIGATORIO, SIN_ADMINISTRADOR, generarContrasenaTemporal, motivoNoCambiarRol, motivoNoDesactivar } from '../src/modules/seguridad/domain/usuarios.js';

const app = crearApp({ correo: new ConsolaCorreo() });
const CLAVE = process.env.SEED_CONTRASENA!;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const login = (identificador: string, contrasena = CLAVE) => request(app).post('/api/auth/login').send({ identificador, contrasena });
/** Inicia sesión con un agente que guarda la cookie de refresh, para probar la renovación. */
async function sesion(identificador: string, contrasena: string) {
  const agente = request.agent(app);
  const r = await agente.post('/api/auth/login').send({ identificador, contrasena });
  expect(r.status).toBe(200);
  return agente;
}
let admin = '', adminId = 0;
const api = {
  listar: () => request(app).get('/api/admin/usuarios').set(auth(admin)),
  crear: (datos: object) => request(app).post('/api/admin/usuarios').set(auth(admin)).send(datos),
  editar: (id: number, datos: object) => request(app).patch(`/api/admin/usuarios/${id}`).set(auth(admin)).send(datos),
  accion: (id: number, accion: 'desactivar' | 'reactivar' | 'contrasena-temporal') => request(app).post(`/api/admin/usuarios/${id}/${accion}`).set(auth(admin)),
};
const idDe = async (email: string) => (await prisma.usuario.findFirstOrThrow({ where: { email } })).id;

beforeAll(async () => {
  const r = await login('admin');
  admin = r.body.token;
  adminId = Number(r.body.usuario.id);
});
afterAll(() => prisma.$disconnect());

describe('Reglas de usuarios (sin base de datos)', () => {
  it('la contraseña temporal se dicta fácil y cumple la regla de contraseñas', () => {
    for (let i = 0; i < 50; i++) {
      const c = generarContrasenaTemporal();
      expect(c).toMatch(/^[a-hj-km-np-z]{5}-[2-9]{4}$/);
      expect(c.length).toBeGreaterThanOrEqual(8);
    }
  });

  it('D.1.5: nadie se desactiva a sí mismo y siempre queda un Administrador activo', () => {
    expect(motivoNoDesactivar({ esUnoMismo: true, esAdministradorActivo: true, otrosAdministradoresActivos: 3 })).toBe('No puede desactivar su propia cuenta.');
    expect(motivoNoDesactivar({ esUnoMismo: false, esAdministradorActivo: true, otrosAdministradoresActivos: 0 })).toBe(SIN_ADMINISTRADOR);
    expect(motivoNoDesactivar({ esUnoMismo: false, esAdministradorActivo: true, otrosAdministradoresActivos: 1 })).toBeNull();
    expect(motivoNoCambiarRol({ esUnoMismo: true, esAdministradorActivo: true, otrosAdministradoresActivos: 0, rolNuevo: 'Tapicero' })).toBe(SIN_ADMINISTRADOR);
    expect(motivoNoCambiarRol({ esUnoMismo: true, esAdministradorActivo: true, otrosAdministradoresActivos: 1, rolNuevo: 'Tapicero' })).toBeNull();
  });
});

describe('CU-S03 API de usuarios del personal', () => {
  it('solo el Administrador puede ver y gestionar usuarios', async () => {
    const tapicero = (await login('tapicero')).body.token;
    expect((await request(app).get('/api/admin/usuarios')).status).toBe(401);
    expect((await request(app).get('/api/admin/usuarios').set(auth(tapicero))).status).toBe(403);
    expect((await request(app).post('/api/admin/usuarios').set(auth(tapicero)).send({ nombre: 'Xx Yy', email: 'x@garwood.test', rol: 'Tapicero' })).status).toBe(403);
  });

  it('lista solo al personal, con "Producción" en pantalla y el último acceso de la bitácora (D.1.1, D.1.8)', async () => {
    const r = await api.listar();
    expect(r.status).toBe(200);
    const porCorreo = Object.fromEntries(r.body.usuarios.map((u: { email: string }) => [u.email, u]));
    expect(porCorreo['laura.mendez@correo.com']).toBeUndefined();
    expect(porCorreo['tapicero@garwood.test']).toMatchObject({ nombre: 'Carlos', rol: 'Tapicero', rolEtiqueta: 'Producción', dispositivo: 'Celular', activo: true });
    expect(porCorreo['admin@garwood.test'].ultimoAcceso).toEqual(expect.any(String));
    expect(r.body.opciones.roles.map((x: { etiqueta: string }) => x.etiqueta)).toEqual(['Producción', 'Conductor', 'Administrador']);
    expect(r.body.opciones.dispositivos).toEqual(['Computadora', 'Celular', 'Tablet']);
  });

  it('crea con nombres y apellidos y correo; entra con su correo y una contraseña temporal que se muestra una sola vez (D.1.2, D.1.3)', async () => {
    const r = await api.crear({ nombre: '  Pedro   Ruiz ', email: ' Pedro.Ruiz@Garwood.test ', rol: 'Tapicero', dispositivo: 'Celular' });
    expect(r.status).toBe(201);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.usuario).toMatchObject({ nombre: 'Pedro Ruiz', email: 'pedro.ruiz@garwood.test', rolEtiqueta: 'Producción', debeCambiarContrasena: true, ultimoAcceso: null });
    const temporal: string = r.body.contrasenaTemporal;

    // Entra con su correo; en la base solo queda el hash y en la bitácora nunca aparece la contraseña.
    expect((await login('pedro.ruiz@garwood.test', temporal)).status).toBe(200);
    const u = await prisma.usuario.findUniqueOrThrow({ where: { email: 'pedro.ruiz@garwood.test' } });
    expect(u.nombreUsuario).toBe('pedro.ruiz@garwood.test');
    expect(u.contrasenaHash).not.toContain(temporal);
    const registros = await prisma.bitacora.findMany({ where: { entidad: 'usuario', entidadId: u.id } });
    expect(registros.map((b) => b.accion)).toContain('usuario_creado');
    expect(JSON.stringify(registros)).not.toContain(temporal);
  });

  it('exige nombres y apellidos y correo, y no repite el correo de otra cuenta', async () => {
    const sinCorreo = await api.crear({ nombre: 'Ana Torres', rol: 'Conductor' });
    expect(sinCorreo.status).toBe(400);
    expect(sinCorreo.body.mensaje).toBe(CORREO_OBLIGATORIO);
    expect((await api.crear({ nombre: 'Ana', email: 'ana@garwood.test', rol: 'Conductor' })).body.mensaje).toBe('Ingrese nombres y apellidos (por ejemplo, Pedro Ruiz)');
    expect((await api.crear({ nombre: 'Ana Torres', email: 'no-es-correo', rol: 'Conductor' })).body.mensaje).toBe('El correo no es válido');

    const correoDeCliente = await api.crear({ nombre: 'Otra Persona', email: 'Laura.Mendez@correo.com', rol: 'Administrador' });
    expect(correoDeCliente.status).toBe(409);
    expect(correoDeCliente.body.errores.email).toBe('Ya existe una cuenta con ese correo.');
  });

  it('edita nombre, rol, dispositivo y correo; con el correo nuevo entra y el anterior deja de servir (D.1.4)', async () => {
    const id = await idDe('pedro.ruiz@garwood.test');
    expect((await api.editar(id, { nombreUsuario: 'pedro' })).body.mensaje).toBe('La cuenta se identifica por su correo: cambie el correo.');
    expect((await api.editar(id, { email: '' })).body.mensaje).toBe(CORREO_OBLIGATORIO);
    expect((await api.editar(id, { email: 'laura.mendez@correo.com' })).body.errores.email).toBe('Ya existe una cuenta con ese correo.');

    const r = await api.editar(id, { nombre: 'Pedro Ruiz Soto', rol: 'Conductor', dispositivo: 'Tablet', email: 'pedro.soto@garwood.test' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ nombre: 'Pedro Ruiz Soto', email: 'pedro.soto@garwood.test', rolEtiqueta: 'Conductor', dispositivo: 'Tablet' });
    const temporal = (await api.accion(id, 'contrasena-temporal')).body.contrasenaTemporal;
    expect((await login('pedro.soto@garwood.test', temporal)).status).toBe(200);
    expect((await login('pedro.ruiz@garwood.test', temporal)).status).toBe(401);

    // En el registro de actividad se lee el cambio con "Producción", no "Tapicero".
    const actividad = (await request(app).get('/api/admin/auditoria?q=usuario%20editado').set(auth(admin))).body.registros[0];
    expect(actividad).toMatchObject({ nombre: 'Administrador', usuario: 'admin', accion: 'Usuario editado', registro: 'pedro.soto@garwood.test' });
    expect(actividad.cambio).toBe('Nombre: Pedro Ruiz → Pedro Ruiz Soto · Rol: Producción → Conductor · Dispositivo: Celular → Tablet · Correo: pedro.ruiz@garwood.test → pedro.soto@garwood.test');
  });

  it('a una cuenta antigua sin correo se le pide completarlo al editarla', async () => {
    const rol = await prisma.rol.findUniqueOrThrow({ where: { nombre: 'Tapicero' } });
    const viejo = await prisma.usuario.create({ data: { nombreUsuario: 'viejo.taller', nombre: 'Cuenta Antigua', rolId: rol.id, contrasenaHash: 'x' } });
    expect((await api.editar(viejo.id, { dispositivo: 'Tablet' })).body.mensaje).toBe(CORREO_OBLIGATORIO);
    const r = await api.editar(viejo.id, { email: 'antigua@garwood.test' });
    expect(r.body).toMatchObject({ email: 'antigua@garwood.test', nombreUsuario: 'antigua@garwood.test' });
  });

  it('cambiar el rol corta la renovación de su sesión: vuelve a entrar con el rol nuevo (D.1.6)', async () => {
    const agente = await sesion('tapicero', CLAVE);
    const id = await idDe('tapicero@garwood.test');
    expect((await agente.post('/api/auth/refresh')).status).toBe(200);

    await api.editar(id, { rol: 'Conductor' });
    expect((await agente.post('/api/auth/refresh')).status).toBe(401);
    expect((await login('tapicero@garwood.test')).body.usuario.rol).toBe('Conductor');

    await api.editar(id, { rol: 'Tapicero' });
  });

  it('nadie se desactiva a sí mismo; desactivar corta el acceso y reactivar lo devuelve (D.1.5, D.1.6)', async () => {
    expect((await api.accion(adminId, 'desactivar')).body.mensaje).toBe('No puede desactivar su propia cuenta.');

    const agente = await sesion('conductor', CLAVE);
    const id = await idDe('conductor@garwood.test');
    expect((await api.accion(id, 'desactivar')).body).toMatchObject({ activo: false });
    expect((await agente.post('/api/auth/refresh')).status).toBe(401);
    expect((await login('conductor')).body.mensaje).toBe('Su cuenta está desactivada. Comuníquese con Garwood para reactivarla.');
    // Sigue en la lista (no se borra) y queda en la bitácora.
    expect((await api.listar()).body.usuarios.find((u: { id: number }) => u.id === id)).toMatchObject({ activo: false });

    expect((await api.accion(id, 'reactivar')).body).toMatchObject({ activo: true });
    expect((await login('conductor')).status).toBe(200);
    const acciones = (await prisma.bitacora.findMany({ where: { entidad: 'usuario', entidadId: id }, select: { accion: true } })).map((b) => b.accion);
    expect(acciones).toEqual(expect.arrayContaining(['usuario_desactivado', 'usuario_reactivado']));
  });

  it('no deja al sistema sin Administrador activo', async () => {
    const r = await api.editar(adminId, { rol: 'Tapicero' });
    expect(r.status).toBe(400);
    expect(r.body.mensaje).toBe(SIN_ADMINISTRADOR);
    expect((await login('admin')).body.usuario.rol).toBe('Administrador');
  });

  it('una contraseña temporal nueva reemplaza la anterior y corta la sesión abierta (D.1.4)', async () => {
    const creado = (await api.crear({ nombre: 'Luisa Paz', email: 'luisa.paz@garwood.test', rol: 'Conductor' })).body;
    const agente = await sesion('luisa.paz@garwood.test', creado.contrasenaTemporal);

    const r = await api.accion(creado.usuario.id, 'contrasena-temporal');
    expect(r.status).toBe(200);
    expect(r.body.contrasenaTemporal).not.toBe(creado.contrasenaTemporal);
    expect(r.body.usuario.debeCambiarContrasena).toBe(true);
    expect((await login('luisa.paz@garwood.test', creado.contrasenaTemporal)).status).toBe(401);
    expect((await login('luisa.paz@garwood.test', r.body.contrasenaTemporal)).status).toBe(200);
    expect((await agente.post('/api/auth/refresh')).status).toBe(401);

    const actividad = (await request(app).get('/api/admin/auditoria?q=contrasena%20temporal').set(auth(admin))).body.registros[0];
    expect(actividad).toMatchObject({ accion: 'Contraseña temporal', registro: 'luisa.paz@garwood.test' });
    expect(JSON.stringify(actividad)).not.toContain(r.body.contrasenaTemporal);
  });

  it('un cliente no se gestiona aquí', async () => {
    const laura = await prisma.usuario.findFirstOrThrow({ where: { email: 'laura.mendez@correo.com' } });
    expect((await api.accion(laura.id, 'desactivar')).status).toBe(404);
    expect((await api.editar(laura.id, { nombre: 'Laura Otra' })).body.mensaje).toBe('No encontramos ese usuario del personal.');
  });
});
