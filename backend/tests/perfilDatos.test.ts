// Mi perfil · paso 2 (CU-H02 · W10 · decisiones-recientes.md E.1 y E.4.2): ver el perfil, guardar datos y cambiar el correo.
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { prisma } from '../src/shared/infrastructure/prisma.js';
import type { Correo, MensajeCorreo } from '../src/shared/infrastructure/correo.js';

class CorreoEnMemoria implements Correo {
  enviados: MensajeCorreo[] = [];
  async enviar(m: MensajeCorreo) {
    this.enviados.push(m);
  }
}
const correo = new CorreoEnMemoria();
const app = crearApp({ correo });
const CLAVE = process.env.SEED_CONTRASENA!;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const login = async (identificador: string, contrasena = CLAVE) => (await request(app).post('/api/auth/login').send({ identificador, contrasena })).body.token as string;
const perfil = (token: string) => request(app).get('/api/cliente/perfil').set(auth(token));
const datos = (token: string, body: object) => request(app).patch('/api/cliente/perfil/datos').set(auth(token)).send(body);
const pedirCorreo = (token: string, email: string, contrasena = 'Taller2026') => request(app).post('/api/cliente/perfil/correo').set(auth(token)).send({ email, contrasena });
/** El enlace que llegó al correo nuevo. */
const tokenEnviadoA = (para: string) => /token=([\w-]+)/.exec(correo.enviados.filter((m) => m.para === para).at(-1)!.texto)![1]!;

/** Un cliente nuevo registrado desde la web (para no tocar a Laura, que usan las demás pruebas). */
async function registrar(email: string, extra: object = {}) {
  const r = await request(app).post('/api/auth/registro').send({
    tipoPersona: 'persona', nombres: 'Ana', apellidos: 'Prueba', email, telefono: '+19735550100', contrasena: 'Taller2026', avisosCorreo: true, ...extra,
  });
  expect(r.status).toBe(201);
  return r.body.token as string;
}

let laura = '';
beforeAll(async () => {
  await login('laura.mendez@correo.com');
  laura = await login('laura.mendez@correo.com');
});
afterAll(() => prisma.$disconnect());

describe('W10 Mi perfil: solo el cliente y solo lo suyo (RG-07)', () => {
  it('sin sesión 401; el personal no tiene Mi perfil (403)', async () => {
    expect((await request(app).get('/api/cliente/perfil')).status).toBe(401);
    expect((await perfil(await login('admin'))).status).toBe(403);
  });

  it('muestra los datos, cliente desde, avisos y el ingreso anterior al actual', async () => {
    const r = await perfil(laura);
    expect(r.status).toBe(200);
    expect(r.body.datos).toMatchObject({ tipoPersona: 'persona', nombres: 'Laura', apellidos: 'Méndez', email: 'laura.mendez@correo.com', telefono: '+19735550142' });
    expect(r.body.clienteDesde).toEqual(expect.any(String));
    expect(r.body.correoPendiente).toBeNull();
    expect(r.body.avisos).toMatchObject({ informativos: true, novedades: false });
    expect(r.body.avisos.obligatorios[0]).toBe('Citas y visitas');
    // Entró dos veces en beforeAll: el "último ingreso" es el anterior, no el de esta sesión.
    const [, anterior] = await prisma.bitacora.findMany({ where: { usuarioId: (await prisma.usuario.findUniqueOrThrow({ where: { nombreUsuario: 'laura.mendez@correo.com' } })).id, accion: 'login' }, orderBy: { fecha: 'desc' }, take: 2 });
    expect(r.body.ultimoIngreso).toBe(anterior!.fecha.toISOString());
  });

  it('cada cliente ve SU perfil: no hay forma de pedir el de otro', async () => {
    const otro = await registrar('otro.cliente@correo.com');
    expect((await perfil(otro)).body.datos.email).toBe('otro.cliente@correo.com');
    // Un id en la URL no existe como ruta.
    expect((await request(app).get('/api/cliente/perfil/1').set(auth(otro))).status).toBe(404);
  });
});

describe('E.1 Guardar datos', () => {
  it('cambia nombres, apellidos y teléfono, y queda en la bitácora', async () => {
    const token = await registrar('datos.persona@correo.com');
    const r = await datos(token, { nombres: ' Ana María ', apellidos: 'Prueba Soto', telefono: '+19735550199' });
    expect(r.status).toBe(200);
    expect(r.body.datos).toMatchObject({ nombres: 'Ana María', apellidos: 'Prueba Soto', telefono: '+19735550199' });
    const c = await prisma.cliente.findUniqueOrThrow({ where: { email: 'datos.persona@correo.com' } });
    const b = await prisma.bitacora.findFirstOrThrow({ where: { accion: 'cliente_actualizado', entidadId: c.id } });
    expect(b).toMatchObject({ modulo: 'historial', valorAnterior: { nombres: 'Ana', telefono: '+19735550100' }, valorNuevo: { nombres: 'Ana María' } });
  });

  it('no deja cambiar el tipo, el EIN ni el correo desde aquí, y valida el teléfono', async () => {
    const token = await registrar('datos.reglas@correo.com');
    expect((await datos(token, { tipoPersona: 'empresa' })).body.mensaje).toBe('Persona o empresa: No se cambia desde Mi perfil: pídalo al taller.');
    expect((await datos(token, { documento: '12-3456789' })).body.mensaje).toBe('El EIN: No se cambia desde Mi perfil: pídalo al taller.');
    expect((await datos(token, { email: 'x@y.com' })).body.mensaje).toMatch(/Cambiar correo/);
    expect((await datos(token, { telefono: '973-555' })).body.mensaje).toBe('Ingrese un teléfono de EE. UU.: +1 y 10 dígitos');
    expect((await datos(token, { razonSocial: 'Mi Empresa' })).body.mensaje).toBe('El nombre de la empresa y el cargo son solo para clientes empresa.');
  });

  it('una empresa edita su nombre, contacto y cargo; el EIN se muestra pero no cambia', async () => {
    const token = await registrar('compras@willow.test', { tipoPersona: 'empresa', razonSocial: 'Hotel Willow LLC', documento: '98-7654321', cargo: 'Compras' });
    const r = await datos(token, { razonSocial: 'Willow Hospitality LLC', nombres: 'Rosa', cargo: '' });
    expect(r.body.datos).toMatchObject({ tipoPersona: 'empresa', razonSocial: 'Willow Hospitality LLC', nombres: 'Rosa', cargo: null, documento: '98-7654321' });
    expect((await datos(token, { razonSocial: '  ' })).body.mensaje).toBe('Ingrese el nombre de la empresa');
  });
});

describe('E.1.4 Cambiar el correo con confirmación', () => {
  it('pide la contraseña actual y un correo que no use otra cuenta', async () => {
    const token = await registrar('cambio.reglas@correo.com');
    const mal = await pedirCorreo(token, 'nuevo.reglas@correo.com', 'NoEsLaClave1');
    expect(mal.status).toBe(400);
    expect(mal.body.errores.contrasena).toBe('La contraseña no es correcta.');
    expect((await pedirCorreo(token, 'cambio.reglas@correo.com')).body.mensaje).toBe('Ese ya es su correo.');
    expect((await pedirCorreo(token, 'Laura.Mendez@correo.com')).status).toBe(409);
    expect((await pedirCorreo(token, 'admin')).body.mensaje).toBe('El correo no es válido');
  });

  it('avisa al anterior, manda el enlace al nuevo y solo cambia al confirmar', async () => {
    const token = await registrar('viejo@correo.com');
    const r = await pedirCorreo(token, 'Nuevo@Correo.com');
    expect(r.status).toBe(200);
    expect(r.body.correoPendiente).toMatchObject({ email: 'nuevo@correo.com' });
    // 24 h (parámetro correo.horas_confirmacion).
    const horas = (new Date(r.body.correoPendiente.vence).getTime() - Date.now()) / 3_600_000;
    expect(horas).toBeGreaterThan(23.9);
    expect(horas).toBeLessThanOrEqual(24);

    expect(correo.enviados.find((m) => m.para === 'viejo@correo.com' && m.asunto.includes('Se pidió cambiar su correo'))).toBeDefined();
    expect(correo.enviados.find((m) => m.para === 'nuevo@correo.com')!.texto).toMatch(/confirmar-correo\?token=/);
    const usuarioId = (await prisma.usuario.findUniqueOrThrow({ where: { email: 'viejo@correo.com' } })).id;
    expect(await prisma.notificacion.count({ where: { usuarioId, tipo: 'correo_cambio_solicitado' } })).toBe(1);
    expect((await perfil(token)).body.correoPendiente.email).toBe('nuevo@correo.com');

    // Mientras no confirma, entra con el de siempre.
    expect(await login('viejo@correo.com', 'Taller2026')).toEqual(expect.any(String));
    expect(await login('nuevo@correo.com', 'Taller2026')).toBeUndefined();

    const confirmar = await request(app).post('/api/auth/confirmar-correo').send({ token: tokenEnviadoA('nuevo@correo.com') });
    expect(confirmar.body).toMatchObject({ email: 'nuevo@correo.com' });
    expect(await login('nuevo@correo.com', 'Taller2026')).toEqual(expect.any(String));
    expect(await login('viejo@correo.com', 'Taller2026')).toBeUndefined();
    expect(await prisma.cliente.findUnique({ where: { email: 'nuevo@correo.com' } })).not.toBeNull();
    // El enlace no sirve dos veces.
    expect((await request(app).post('/api/auth/confirmar-correo').send({ token: tokenEnviadoA('nuevo@correo.com') })).status).toBe(400);

    const actividad = (await request(app).get('/api/admin/auditoria?q=correo%20cambiado').set(auth(await login('admin')))).body.registros[0];
    expect(actividad).toMatchObject({ accion: 'Correo cambiado', cambio: 'viejo@correo.com → nuevo@correo.com' });
  });

  it('un pedido nuevo anula el anterior, y un enlace vencido no sirve', async () => {
    const token = await registrar('dos.pedidos@correo.com');
    await pedirCorreo(token, 'primero@correo.com');
    const primero = tokenEnviadoA('primero@correo.com');
    await pedirCorreo(token, 'segundo@correo.com');
    expect((await request(app).post('/api/auth/confirmar-correo').send({ token: primero })).body.mensaje)
      .toBe('El enlace venció o ya se usó. Vuelva a pedir el cambio desde Mi perfil.');

    await prisma.cambioCorreo.updateMany({ where: { emailNuevo: 'segundo@correo.com' }, data: { fechaExpiracion: new Date(Date.now() - 1000) } });
    expect((await request(app).post('/api/auth/confirmar-correo').send({ token: tokenEnviadoA('segundo@correo.com') })).status).toBe(400);
    expect((await perfil(token)).body.correoPendiente).toBeNull();
  });
});
