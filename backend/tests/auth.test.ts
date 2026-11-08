import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
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
const CONTRASENA_SEED = process.env.SEED_CONTRASENA!;

let n = 0;
const nuevoEmail = () => `cliente${Date.now()}${n++}@prueba.test`;
const persona = (email = nuevoEmail()) => ({
  tipoPersona: 'persona', nombres: 'Ana', apellidos: 'Ríos', email, telefono: '+19735550100',
  contrasena: 'Clave2026', avisosCorreo: true,
});
const login = (identificador: string, contrasena: string, recordarme = false) =>
  request(app).post('/api/auth/login').send({ identificador, contrasena, recordarme });

beforeEach(() => {
  correo.enviados = [];
});
afterAll(() => prisma.$disconnect());

describe('CU-S01 Iniciar sesión', () => {
  it('ingresa con correo y devuelve la sesión y la cookie de refresh', async () => {
    const res = await login('Laura.Mendez@correo.com', CONTRASENA_SEED, true);
    expect(res.status).toBe(200);
    expect(res.body.usuario).toMatchObject({ nombre: 'Laura Méndez', rol: 'Cliente' });
    expect(res.body.token).toEqual(expect.any(String));
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/garweb_refresh=.+HttpOnly/);
    expect(cookie).toMatch(/Max-Age=/); // "Recordarme" → cookie persistente
  });

  it('ingresa con nombre de usuario (personal del taller)', async () => {
    const res = await login('admin', CONTRASENA_SEED);
    expect(res.status).toBe(200);
    expect(res.body.usuario.rol).toBe('Administrador');
    expect(String(res.headers['set-cookie'])).not.toMatch(/Max-Age=/);
  });

  it('rechaza con el mismo mensaje un correo inexistente y una contraseña errada', async () => {
    const a = await login('nadie@prueba.test', 'Clave2026');
    const b = await login('tapicero', 'otra-clave1');
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.mensaje).toBe(b.body.mensaje);
    expect(a.body.mensaje).toContain('Tras 5 intentos');
  });

  it('bloquea la cuenta tras los intentos fallidos del parámetro, aun con la contraseña correcta', async () => {
    const email = nuevoEmail();
    await request(app).post('/api/auth/registro').send(persona(email)).expect(201);
    for (let i = 0; i < 4; i++) expect((await login(email, 'mala-clave1')).status).toBe(401);
    const quinto = await login(email, 'mala-clave1');
    expect(quinto.status).toBe(423);
    expect(quinto.body.mensaje).toContain('15 minutos');
    expect((await login(email, 'Clave2026')).status).toBe(423);

    const u = await prisma.usuario.findUniqueOrThrow({ where: { email } });
    const acciones = await prisma.bitacora.findMany({ where: { entidad: 'usuario', entidadId: u.id }, select: { accion: true } });
    expect(acciones.map((a) => a.accion)).toContain('cuenta_bloqueada');
  });

  it('no deja entrar a un usuario desactivado, y solo lo dice si la contraseña es correcta', async () => {
    const email = nuevoEmail();
    await request(app).post('/api/auth/registro').send(persona(email)).expect(201);
    await prisma.usuario.update({ where: { email }, data: { activo: false } });
    expect((await login(email, 'mala-clave1')).status).toBe(401);
    const res = await login(email, 'Clave2026');
    expect(res.status).toBe(403);
    expect(res.body.mensaje).toContain('desactivada');
  });

  it('valida los datos de entrada', async () => {
    const res = await request(app).post('/api/auth/login').send({ identificador: '' });
    expect(res.status).toBe(400);
    expect(res.body.mensaje).toBe('Ingrese su correo o usuario');
  });
});

describe('CU-H01 Registrar cliente', () => {
  it('crea cliente persona con usuario rol Cliente, auditoría y sesión iniciada', async () => {
    const email = nuevoEmail();
    const res = await request(app).post('/api/auth/registro').send(persona(email.toUpperCase()));
    expect(res.status).toBe(201);
    expect(res.body.usuario).toMatchObject({ nombre: 'Ana Ríos', rol: 'Cliente' });

    const cliente = await prisma.cliente.findUniqueOrThrow({ where: { email }, include: { usuario: { include: { rol: true } } } });
    expect(cliente).toMatchObject({ tipoPersona: 'persona', canalRegistro: 'web', documento: null });
    expect(cliente.usuario?.rol.nombre).toBe('Cliente');
    expect(cliente.usuario?.contrasenaHash).not.toBe('Clave2026');
    expect(await prisma.bitacora.count({ where: { accion: 'cliente_registrado', entidadId: cliente.id } })).toBe(1);
    expect((await login(email, 'Clave2026')).status).toBe(200);
  });

  it('crea cliente empresa con EIN y usa la razón social como nombre', async () => {
    const res = await request(app).post('/api/auth/registro').send({
      ...persona(), tipoPersona: 'empresa', razonSocial: 'Willow Hospitality LLC', documento: '12-3456789', cargo: 'Jefa de compras',
    });
    expect(res.status).toBe(201);
    expect(res.body.usuario.nombre).toBe('Willow Hospitality LLC');
  });

  it('no permite correos ni EIN duplicados', async () => {
    const dupCorreo = await request(app).post('/api/auth/registro').send(persona('laura.mendez@correo.com'));
    expect(dupCorreo.status).toBe(409);
    expect(dupCorreo.body.mensaje).toContain('correo');

    const dupEin = await request(app).post('/api/auth/registro').send({
      ...persona(), tipoPersona: 'empresa', razonSocial: 'Otra LLC', documento: '12-3456789',
    });
    expect(dupEin.status).toBe(409);
    expect(dupEin.body.mensaje).toContain('EIN');
  });

  it('exige EIN válido a las empresas, teléfono de EE. UU. y contraseña con número', async () => {
    const sinEin = await request(app).post('/api/auth/registro').send({ ...persona(), tipoPersona: 'empresa', razonSocial: 'X LLC' });
    expect(sinEin.status).toBe(400);
    expect(sinEin.body.errores.documento).toBeDefined();

    const telefono = await request(app).post('/api/auth/registro').send({ ...persona(), telefono: '5550100' });
    expect(telefono.status).toBe(400);

    const clave = await request(app).post('/api/auth/registro').send({ ...persona(), contrasena: 'sinnumeros' });
    expect(clave.body.mensaje).toBe('Incluya al menos un número');
  });
});

describe('CU-S02 Recuperar contraseña', () => {
  const tokenDelCorreo = () => correo.enviados[0].texto.match(/token=([\w-]+)/)![1];

  it('responde igual exista o no el correo, y solo envía correo si existe', async () => {
    const a = await request(app).post('/api/auth/recuperar').send({ email: 'nadie@prueba.test' });
    expect(a.status).toBe(200);
    expect(correo.enviados).toHaveLength(0);

    const b = await request(app).post('/api/auth/recuperar').send({ email: 'conductor@garwood.test' });
    expect(b.body).toEqual(a.body);
    expect(correo.enviados).toHaveLength(1);
    expect(correo.enviados[0].texto).toContain('vence en 30 minutos');
  });

  it('cambia la contraseña con el enlace, lo invalida y levanta el bloqueo', async () => {
    const email = nuevoEmail();
    await request(app).post('/api/auth/registro').send(persona(email)).expect(201);
    await prisma.usuario.update({ where: { email }, data: { bloqueadoHasta: new Date(Date.now() + 600_000) } });

    await request(app).post('/api/auth/recuperar').send({ email }).expect(200);
    const token = tokenDelCorreo();
    await request(app).post('/api/auth/restablecer').send({ token, contrasena: 'Nueva2026' }).expect(200);

    expect((await login(email, 'Nueva2026')).status).toBe(200);
    expect((await login(email, 'Clave2026')).status).toBe(401);
    const reuso = await request(app).post('/api/auth/restablecer').send({ token, contrasena: 'Otra2026x' });
    expect(reuso.status).toBe(400);
  });

  it('rechaza un enlace vencido y uno reemplazado por otro más nuevo', async () => {
    const email = nuevoEmail();
    await request(app).post('/api/auth/registro').send(persona(email)).expect(201);

    await request(app).post('/api/auth/recuperar').send({ email });
    const viejo = tokenDelCorreo();
    correo.enviados = [];
    await request(app).post('/api/auth/recuperar').send({ email });
    const nuevo = tokenDelCorreo();
    expect((await request(app).post('/api/auth/restablecer').send({ token: viejo, contrasena: 'Nueva2026' })).status).toBe(400);

    await prisma.tokenRecuperacion.updateMany({ where: { usuario: { email }, fechaUso: null }, data: { fechaExpiracion: new Date(Date.now() - 1000) } });
    const vencido = await request(app).post('/api/auth/restablecer').send({ token: nuevo, contrasena: 'Nueva2026' });
    expect(vencido.status).toBe(400);
    expect(vencido.body.mensaje).toContain('venció');
  });
});

describe('Sesión: refresh, me y logout', () => {
  it('renueva el access token con la cookie y conserva "Recordarme"', async () => {
    const agente = request.agent(app);
    await agente.post('/api/auth/login').send({ identificador: 'admin', contrasena: CONTRASENA_SEED, recordarme: true }).expect(200);
    const res = await agente.post('/api/auth/refresh');
    expect(res.status).toBe(200);
    expect(res.body.usuario.rol).toBe('Administrador');
    expect(String(res.headers['set-cookie'])).toMatch(/Max-Age=/);

    await agente.post('/api/auth/logout').expect(204);
    expect((await agente.post('/api/auth/refresh')).status).toBe(401);
  });

  it('GET /me exige un access token válido', async () => {
    const { body } = await login('laura.mendez@correo.com', CONTRASENA_SEED);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${body.token}`);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ rol: 'Cliente', email: 'laura.mendez@correo.com' });
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer falso')).status).toBe(401);
  });
});
