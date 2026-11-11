// Paso 8 de Seguridad y parámetros: cambio obligatorio de la contraseña temporal (D.1.3) y cierre de sesión en la
// bitácora (D.2.2), dentro de CU-S01.
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { prisma } from '../src/shared/infrastructure/prisma.js';
import { ConsolaCorreo } from '../src/shared/infrastructure/correo.js';
import { DEBE_CAMBIAR_CONTRASENA } from '../src/shared/http/middlewares.js';

const app = crearApp({ correo: new ConsolaCorreo() });
const CLAVE = process.env.SEED_CONTRASENA!;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const login = (identificador: string, contrasena = CLAVE) => request(app).post('/api/auth/login').send({ identificador, contrasena });
let admin = '';

/** Crea un usuario del personal desde A20 y devuelve su contraseña temporal. */
async function nuevoPersonal(email: string) {
  const r = await request(app).post('/api/admin/usuarios').set(auth(admin)).send({ nombre: 'Prueba Uno', email, rol: 'Tapicero' });
  expect(r.status).toBe(201);
  return r.body.contrasenaTemporal as string;
}

beforeAll(async () => {
  admin = (await login('admin')).body.token;
});
afterAll(() => prisma.$disconnect());

describe('D.1.3 Primer ingreso con contraseña temporal', () => {
  it('la sesión avisa que debe cambiarla y la API no deja hacer nada más (bloqueo en el backend)', async () => {
    const temporal = await nuevoPersonal('rosa@garwood.test');
    const r = await login('rosa@garwood.test', temporal);
    expect(r.status).toBe(200);
    expect(r.body.usuario).toMatchObject({ nombre: 'Prueba Uno', rol: 'Tapicero', debeCambiarContrasena: true });

    const otra = await request(app).get('/api/notificaciones').set(auth(r.body.token));
    expect(otra.status).toBe(403);
    expect(otra.body.mensaje).toBe(DEBE_CAMBIAR_CONTRASENA);
    // Lo de su sesión sí responde.
    expect((await request(app).get('/api/auth/me').set(auth(r.body.token))).body).toMatchObject({ debeCambiarContrasena: true });
  });

  it('pide una contraseña válida y distinta de la temporal', async () => {
    const temporal = await nuevoPersonal('sara@garwood.test');
    const token = (await login('sara@garwood.test', temporal)).body.token;
    const cambiar = (contrasena: string) => request(app).post('/api/auth/cambiar-contrasena').set(auth(token)).send({ contrasena });

    expect((await cambiar('corta')).status).toBe(400);
    expect((await cambiar('sinnumeros')).body.mensaje).toBe('Incluya al menos un número');
    const igual = await cambiar(temporal);
    expect(igual.status).toBe(400);
    expect(igual.body.errores.contrasena).toBe('Use una contraseña distinta de la temporal.');
  });

  it('al cambiarla recibe una sesión normal, la temporal deja de servir y queda en la bitácora', async () => {
    const temporal = await nuevoPersonal('tomas@garwood.test');
    const otroEquipo = request.agent(app);
    await otroEquipo.post('/api/auth/login').send({ identificador: 'tomas@garwood.test', contrasena: temporal });
    const esteEquipo = request.agent(app);
    const token = (await esteEquipo.post('/api/auth/login').send({ identificador: 'tomas@garwood.test', contrasena: temporal, recordarme: true })).body.token;

    const r = await esteEquipo.post('/api/auth/cambiar-contrasena').set(auth(token)).send({ contrasena: 'MiClave2026' });
    expect(r.status).toBe(200);
    expect(r.body.usuario.debeCambiarContrasena).toBe(false);
    expect(r.headers['set-cookie']?.[0]).toMatch(/garweb_refresh=.+Max-Age/); // conserva "Recordarme"

    expect((await request(app).get('/api/notificaciones').set(auth(r.body.token))).status).toBe(200);
    expect((await esteEquipo.post('/api/auth/refresh')).body.usuario.debeCambiarContrasena).toBe(false);
    // La sesión abierta con la temporal en otro equipo ya no se renueva (D.1.6).
    expect((await otroEquipo.post('/api/auth/refresh')).status).toBe(401);

    expect((await login('tomas@garwood.test', temporal)).status).toBe(401);
    expect((await login('tomas@garwood.test', 'MiClave2026')).body.usuario.debeCambiarContrasena).toBe(false);
    expect((await request(app).post('/api/auth/cambiar-contrasena').set(auth(r.body.token)).send({ contrasena: 'OtraClave2026' })).body.mensaje)
      .toMatch(/ya no es temporal/);

    const u = await prisma.usuario.findUniqueOrThrow({ where: { nombreUsuario: 'tomas@garwood.test' } });
    const registro = await prisma.bitacora.findFirstOrThrow({ where: { accion: 'contrasena_cambiada', usuarioId: u.id } });
    expect(JSON.stringify(registro)).not.toContain('MiClave2026');
    const actividad = (await request(app).get('/api/admin/auditoria?q=tomas@garwood.test').set(auth(admin))).body.registros;
    expect(actividad).toContainEqual(expect.objectContaining({ accion: 'Contraseña cambiada', cambio: 'Reemplazó la contraseña temporal' }));
  });

  it('el personal ve su nombre en la sesión ("Carlos", no "tapicero")', async () => {
    expect((await login('tapicero')).body.usuario).toMatchObject({ nombre: 'Carlos', debeCambiarContrasena: false });
  });
});

describe('D.2.2 Cerrar sesión queda en la bitácora', () => {
  it('registra quién salió y cuándo; sin cookie, solo sale', async () => {
    const agente = request.agent(app);
    const r = await agente.post('/api/auth/login').send({ identificador: 'conductor', contrasena: CLAVE });
    const id = Number(r.body.usuario.id);
    const antes = await prisma.bitacora.count({ where: { accion: 'logout', usuarioId: id } });

    expect((await agente.post('/api/auth/logout')).status).toBe(204);
    expect(await prisma.bitacora.count({ where: { accion: 'logout', usuarioId: id } })).toBe(antes + 1);
    expect((await agente.post('/api/auth/refresh')).status).toBe(401);

    expect((await request(app).post('/api/auth/logout')).status).toBe(204);
    const actividad = (await request(app).get('/api/admin/auditoria?q=cierre%20de%20sesion').set(auth(admin))).body.registros[0];
    expect(actividad).toMatchObject({ usuario: 'conductor', modulo: 'Seguridad', accion: 'Cierre de sesión', registro: 'conductor' });
  });
});
