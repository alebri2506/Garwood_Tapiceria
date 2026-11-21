// A14 Parámetros › Máquinas: listar, agregar, cambiar la tarifa y desactivar (RG-02, RG-03, RG-04).
// Las pruebas trabajan con máquinas nuevas para no cambiar las del seed, que usan las pruebas de plantillas.
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { prisma } from '../src/shared/infrastructure/prisma.js';
import { ConsolaCorreo } from '../src/shared/infrastructure/correo.js';

const app = crearApp({ correo: new ConsolaCorreo() });
const CLAVE = process.env.SEED_CONTRASENA!;
const login = async (identificador: string) => (await request(app).post('/api/auth/login').send({ identificador, contrasena: CLAVE })).body.token as string;
let admin = '';
let cliente = '';
const api = (metodo: 'get' | 'post' | 'put', ruta: string, token = admin) =>
  request(app)[metodo](`/api/admin/parametros/maquinas${ruta}`).set('Authorization', `Bearer ${token}`);

beforeAll(async () => {
  admin = await login('admin');
  cliente = await login('laura.mendez@correo.com');
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('A14 › Máquinas', () => {
  it('solo el Administrador (RG-07)', async () => {
    expect((await api('get', '', cliente)).status).toBe(403);
    expect((await request(app).get('/api/admin/parametros/maquinas')).status).toBe(401);
  });

  it('lista las máquinas del seed con su tarifa, si están activas y cuántas plantillas las usan', async () => {
    const r = await api('get', '');
    expect(r.status).toBe(200);
    expect(r.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ nombre: 'Mesa de corte', tarifaHora: 4, activo: true }),
      expect.objectContaining({ nombre: 'Máquina de coser industrial', tarifaHora: 6, activo: true }),
    ]));
    expect(r.body.every((m: { usos: number }) => Number.isInteger(m.usos))).toBe(true);
  });

  it('agrega una máquina y queda en la bitácora; no repite nombres ni acepta tarifas negativas', async () => {
    const r = await api('post', '').send({ nombre: '  Remalladora  ', tarifaHora: 3.5 });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ nombre: 'Remalladora', tarifaHora: 3.5, activo: true, usos: 0 });
    expect(await prisma.bitacora.count({ where: { accion: 'maquina_creada', entidadId: r.body.id } })).toBe(1);

    expect((await api('post', '').send({ nombre: 'remalladora', tarifaHora: 2 })).status).toBe(409);
    const negativa = await api('post', '').send({ nombre: 'Pistola de calor', tarifaHora: -1 });
    expect(negativa.status).toBe(400);
    expect(negativa.body.errores).toHaveProperty('tarifaHora');
    expect((await api('post', '').send({ tarifaHora: 2 })).status).toBe(400);
  });

  it('cambia la tarifa: bitácora con el valor anterior y el nuevo, línea en el historial y precio de hoy en Plantillas', async () => {
    const m = (await api('post', '').send({ nombre: 'Compresor', tarifaHora: 2 })).body;
    const igual = await api('put', `/${m.id}`).send({ tarifaHora: 2 });
    expect(igual.body).toMatchObject({ sinCambios: true, tarifaHora: 2 });

    const r = await api('put', `/${m.id}`).send({ tarifaHora: 2.75 });
    expect(r.body).toMatchObject({ sinCambios: false, tarifaHora: 2.75 });
    const b = await prisma.bitacora.findFirstOrThrow({ where: { accion: 'maquina_modificada', entidadId: m.id } });
    expect(b).toMatchObject({ modulo: 'configuracion', valorAnterior: { tarifaHora: '2.00' }, valorNuevo: { tarifaHora: '2.75' } });

    const historial = (await request(app).get('/api/admin/parametros/historial').set('Authorization', `Bearer ${admin}`)).body;
    expect(historial[0]).toMatchObject({ etiqueta: 'Tarifa · Compresor', unidad: 'USD/h', valorAnterior: '2.00', valorNuevo: '2.75', usuario: 'Administrador' });

    const catalogo = (await request(app).get('/api/admin/plantillas').set('Authorization', `Bearer ${admin}`)).body;
    expect(catalogo.maquinas).toContainEqual({ id: m.id, nombre: 'Compresor', tarifaHora: 2.75, activo: true });

    expect((await api('put', `/${m.id}`).send({ nombre: 'Mesa de corte' })).status).toBe(409);
    expect((await api('put', '/999999').send({ tarifaHora: 1 })).status).toBe(404);
  });

  it('desactivar no la borra: deja de ofrecerse para plantillas nuevas y se puede reactivar', async () => {
    const m = (await api('post', '').send({ nombre: 'Lijadora', tarifaHora: 3 })).body;
    const r = await api('put', `/${m.id}/estado`).send({ activo: false });
    expect(r.body).toMatchObject({ id: m.id, activo: false });
    expect(await prisma.maquina.findUnique({ where: { id: m.id } })).not.toBeNull();
    expect(await prisma.bitacora.count({ where: { accion: 'maquina_desactivada', entidadId: m.id } })).toBe(1);

    const tipo = (await prisma.tipoMueble.findUniqueOrThrow({ where: { codigo: 'bn' } })).id;
    const plantilla = await request(app).post('/api/admin/plantillas').set('Authorization', `Bearer ${admin}`)
      .send({ tipoMuebleId: tipo, servicio: 'estructura', actividades: [{ nombre: 'Lijar', horasPersona: 1, maquinaId: m.id, horasMaquina: 1 }] });
    expect(plantilla.status).toBe(400);
    expect(plantilla.body.errores).toHaveProperty('actividades.0.maquinaId');

    expect((await api('put', `/${m.id}/estado`).send({ activo: true })).body.activo).toBe(true);
    expect(await prisma.bitacora.count({ where: { accion: 'maquina_activada', entidadId: m.id } })).toBe(1);
  });
});
