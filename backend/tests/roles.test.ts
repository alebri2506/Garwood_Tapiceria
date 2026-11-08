import express from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { prisma } from '../src/shared/infrastructure/prisma.js';
import { ConsolaCorreo } from '../src/shared/infrastructure/correo.js';
import { autenticar, exigirRol, manejarErrores } from '../src/shared/http/middlewares.js';
import type { NombreRol } from '../src/modules/seguridad/application/tokens.js';

const app = crearApp({ correo: new ConsolaCorreo() });

// Rutas de ejemplo protegidas igual que lo estarán las de cada módulo.
const protegida = express();
protegida.get('/admin', autenticar, exigirRol('Administrador'), (_req, res) => { res.json({ ok: true }); });
protegida.get('/taller', autenticar, exigirRol('Tapicero', 'Administrador'), (_req, res) => { res.json({ ok: true }); });
protegida.use(manejarErrores);

const tokenDe = async (identificador: string) =>
  (await request(app).post('/api/auth/login').send({ identificador, contrasena: process.env.SEED_CONTRASENA })).body.token as string;

afterAll(() => prisma.$disconnect());

describe('RG-07 Autorización por rol en la API', () => {
  it.each<[string, NombreRol]>([
    ['admin', 'Administrador'],
    ['tapicero', 'Tapicero'],
    ['conductor', 'Conductor'],
    ['laura.mendez@correo.com', 'Cliente'],
  ])('%s ingresa con rol %s', async (identificador, rol) => {
    const res = await request(app).post('/api/auth/login').send({ identificador, contrasena: process.env.SEED_CONTRASENA });
    expect(res.body.usuario.rol).toBe(rol);
  });

  it('solo deja pasar a los roles permitidos', async () => {
    const [admin, tapicero, cliente] = await Promise.all([tokenDe('admin'), tokenDe('tapicero'), tokenDe('laura.mendez@correo.com')]);
    const get = (ruta: string, token: string) => request(protegida).get(ruta).set('Authorization', `Bearer ${token}`);

    expect((await get('/admin', admin)).status).toBe(200);
    expect((await get('/admin', tapicero)).status).toBe(403);
    expect((await get('/admin', cliente)).status).toBe(403);
    expect((await get('/taller', tapicero)).status).toBe(200);
    expect((await get('/taller', admin)).status).toBe(200);
    expect((await get('/taller', cliente)).body.mensaje).toBe('No tiene permiso para esta acción.');
    expect((await request(protegida).get('/admin')).status).toBe(401);
  });
});
