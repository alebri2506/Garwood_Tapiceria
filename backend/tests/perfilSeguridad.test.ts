// Mi perfil · paso 4 (W10 · decisiones-recientes.md E.3 y E.4): interruptores de avisos y cambio de contraseña.
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { prisma } from '../src/shared/infrastructure/prisma.js';
import type { Correo, MensajeCorreo } from '../src/shared/infrastructure/correo.js';
import { avisoAlCliente } from '../src/shared/infrastructure/avisos.js';

class CorreoEnMemoria implements Correo {
  enviados: MensajeCorreo[] = [];
  async enviar(m: MensajeCorreo) {
    this.enviados.push(m);
  }
}
const correo = new CorreoEnMemoria();
const app = crearApp({ correo });
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const CLAVE = 'Taller2026';

let n = 0;
/** Un cliente nuevo desde la web (no se toca a Laura, que usan las demás pruebas). */
async function nuevoCliente() {
  const email = `seguridad.${Date.now()}.${n++}@correo.com`;
  const r = await request(app).post('/api/auth/registro').send({
    tipoPersona: 'persona', nombres: 'Ana', apellidos: 'Prueba', email, telefono: '+19735550100', contrasena: CLAVE, avisosCorreo: true,
  });
  expect(r.status).toBe(201);
  const cliente = await prisma.cliente.findUniqueOrThrow({ where: { email }, include: { usuario: true } });
  return { email, token: r.body.token as string, clienteId: cliente.id, usuarioId: cliente.usuario!.id };
}
const avisos = (token: string, body: object) => request(app).patch('/api/cliente/perfil/avisos').set(auth(token)).send(body);

afterAll(() => prisma.$disconnect());

describe('E.3 Interruptores de avisos', () => {
  it('apaga y enciende cada uno; queda en la bitácora con texto legible', async () => {
    const c = await nuevoCliente();
    const r = await avisos(c.token, { informativos: false, novedades: true });
    expect(r.status).toBe(200);
    expect(r.body.avisos).toMatchObject({ informativos: false, novedades: true, obligatorios: expect.arrayContaining(['Citas y visitas']) });
    expect((await request(app).get('/api/cliente/perfil').set(auth(c.token))).body.avisos).toMatchObject({ informativos: false, novedades: true });

    const admin = (await request(app).post('/api/auth/login').send({ identificador: 'admin', contrasena: process.env.SEED_CONTRASENA })).body.token;
    const actividad = (await request(app).get(`/api/admin/auditoria?q=${encodeURIComponent('preferencias de avisos')}`).set(auth(admin))).body.registros[0];
    expect(actividad).toMatchObject({ nombre: 'Ana Prueba', cambio: 'Avisos informativos por correo: Sí → No · Recordatorios y novedades: No → Sí' });
  });

  it('con los informativos apagados, los obligatorios igual llegan por correo', async () => {
    const c = await nuevoCliente();
    await avisos(c.token, { informativos: false });
    const [cita] = await avisoAlCliente(prisma, c.clienteId, { tipo: 'cita_programada', titulo: 'Cita', mensaje: 'x' }, 'Asunto', 'Texto');
    const [recibida] = await avisoAlCliente(prisma, c.clienteId, { tipo: 'solicitud_registrada', titulo: 'Recibida', mensaje: 'x' }, 'Asunto', 'Texto');
    expect(cita!.correo?.para).toBe(c.email);
    expect(recibida!.correo).toBeUndefined();
  });

  it('pide al menos un interruptor y que sea sí o no', async () => {
    const c = await nuevoCliente();
    expect((await avisos(c.token, {})).body.mensaje).toBe('Indique qué aviso cambia');
    expect((await avisos(c.token, { informativos: 'no' })).body.mensaje).toBe('Indique sí o no');
  });
});

describe('E.4.1 Cambiar contraseña', () => {
  const cambiar = (agente: ReturnType<typeof request.agent>, token: string, actual: string, contrasena: string) =>
    agente.post('/api/auth/contrasena').set(auth(token)).send({ actual, contrasena });

  it('pide la actual, una válida y distinta', async () => {
    const c = await nuevoCliente();
    const agente = request.agent(app);
    const mal = await cambiar(agente, c.token, 'NoEsLaClave1', 'Nueva2026');
    expect(mal.status).toBe(400);
    expect(mal.body.errores.actual).toBe('La contraseña actual no es correcta.');
    expect((await cambiar(agente, c.token, CLAVE, CLAVE)).body.mensaje).toBe('Use una contraseña distinta de la actual.');
    expect((await cambiar(agente, c.token, CLAVE, 'corta')).status).toBe(400);
  });

  it('cambia, cierra las sesiones en otros equipos, sigue en este y avisa por correo y en la campana', async () => {
    const c = await nuevoCliente();
    const otroEquipo = request.agent(app);
    await otroEquipo.post('/api/auth/login').send({ identificador: c.email, contrasena: CLAVE });
    const esteEquipo = request.agent(app);
    const token = (await esteEquipo.post('/api/auth/login').send({ identificador: c.email, contrasena: CLAVE, recordarme: true })).body.token;

    const r = await cambiar(esteEquipo, token, CLAVE, 'Nueva2026');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ token: expect.any(String), usuario: { rol: 'Cliente', debeCambiarContrasena: false } });
    expect(r.headers['set-cookie']?.[0]).toMatch(/garweb_refresh=.+Max-Age/); // conserva "Recordarme"

    expect((await esteEquipo.post('/api/auth/refresh')).status).toBe(200);
    expect((await otroEquipo.post('/api/auth/refresh')).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ identificador: c.email, contrasena: CLAVE })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ identificador: c.email, contrasena: 'Nueva2026' })).status).toBe(200);

    // Aviso por correo y en la campana (RG-05); con los informativos apagados se prueba en el caso siguiente.
    expect(correo.enviados.find((m) => m.para === c.email && m.asunto === 'GARWEB · Su contraseña cambió')).toBeDefined();
    const campana = await prisma.notificacion.findFirstOrThrow({ where: { usuarioId: c.usuarioId, tipo: 'contrasena_cambiada' } });
    expect(campana.titulo).toBe('Su contraseña cambió');
    const registro = await prisma.bitacora.findFirstOrThrow({ where: { usuarioId: c.usuarioId, accion: 'contrasena_cambiada' } });
    expect(JSON.stringify(registro)).not.toContain('Nueva2026');
  });

  it('el aviso llega por correo aunque apague los informativos', async () => {
    const c = await nuevoCliente();
    await avisos(c.token, { informativos: false });
    await cambiar(request.agent(app), c.token, CLAVE, 'Nueva2026');
    expect(correo.enviados.filter((m) => m.para === c.email && m.asunto === 'GARWEB · Su contraseña cambió')).toHaveLength(1);
  });

  it('sin sesión no se puede', async () => {
    expect((await request(app).post('/api/auth/contrasena').send({ actual: CLAVE, contrasena: 'Nueva2026' })).status).toBe(401);
  });
});

describe('E.4.2 Último ingreso', () => {
  it('es el ingreso anterior al de esta sesión (con un solo ingreso, no hay anterior)', async () => {
    const c = await nuevoCliente(); // registrarse no cuenta como "inicio de sesión"
    const primero = (await request(app).post('/api/auth/login').send({ identificador: c.email, contrasena: CLAVE })).body.token;
    expect((await request(app).get('/api/cliente/perfil').set(auth(primero))).body.ultimoIngreso).toBeNull();
    const segundo = (await request(app).post('/api/auth/login').send({ identificador: c.email, contrasena: CLAVE })).body.token;
    const ingresos = await prisma.bitacora.findMany({ where: { usuarioId: c.usuarioId, accion: 'login' }, orderBy: { fecha: 'asc' } });
    expect((await request(app).get('/api/cliente/perfil').set(auth(segundo))).body.ultimoIngreso).toBe(ingresos[0]!.fecha.toISOString());
  });
});
