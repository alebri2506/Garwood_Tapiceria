// CU-C06 A16 Plantillas de cotización: costeo, matriz, crear, versionar y validar. Usa las plantillas de ejemplo del seed.
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { prisma } from '../src/shared/infrastructure/prisma.js';
import { ConsolaCorreo } from '../src/shared/infrastructure/correo.js';
import { costearPlantilla, mismasActividades, tieneHoras, type ActividadEntrada } from '../src/modules/comercial/domain/plantillas.js';

const app = crearApp({ correo: new ConsolaCorreo() });
const CLAVE = process.env.SEED_CONTRASENA!;
const login = async (identificador: string) => (await request(app).post('/api/auth/login').send({ identificador, contrasena: CLAVE })).body.token as string;
let admin = '';
let cliente = '';
const api = (metodo: 'get' | 'post' | 'put', ruta: string, token = admin) => request(app)[metodo](`/api/admin/plantillas${ruta}`).set('Authorization', `Bearer ${token}`);
const tipo = async (codigo: string) => (await prisma.tipoMueble.findUniqueOrThrow({ where: { codigo } })).id;

beforeAll(async () => {
  admin = await login('admin');
  cliente = await login('laura.mendez@correo.com');
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('Costeo de una plantilla (sin base de datos)', () => {
  const p = { tarifaHora: 15, costosFijos: 60, margenPct: 75 };

  it('materiales + mano de obra + maquinaria + costos fijos, y el margen encima (ejemplo del diseño: sofá de 3 cuerpos)', () => {
    const c = costearPlantilla([
      { horasPersona: 1.5, horasMaquina: 0, tarifaMaquina: 0, materiales: [] },
      { horasPersona: 1.5, horasMaquina: 0.5, tarifaMaquina: 4, materiales: [{ precio: 17, cantidad: 14 }] },
      { horasPersona: 4, horasMaquina: 4, tarifaMaquina: 6, materiales: [{ precio: 6, cantidad: 2 }, { precio: 1.2, cantidad: 3 }] },
      { horasPersona: 3, horasMaquina: 2, tarifaMaquina: 5, materiales: [{ precio: 6, cantidad: 1 }, { precio: 18, cantidad: 0.5 }] },
    ], p);
    expect(c).toEqual({ horas: 10, materiales: 268.6, manoObra: 150, maquinaria: 36, fijos: 60, costo: 514.6, sugerido: 901 });
  });

  it('sin actividades no hay costos fijos; hace falta al menos una actividad con horas', () => {
    expect(costearPlantilla([], p)).toMatchObject({ costo: 0, fijos: 0, sugerido: 0 });
    expect(tieneHoras([{ horasPersona: 0 }])).toBe(false);
    expect(tieneHoras([{ horasPersona: 0 }, { horasPersona: 0.5 }])).toBe(true);
  });

  it('detecta si cambió algo (para no crear versiones vacías)', () => {
    const a: ActividadEntrada[] = [{ nombre: 'Cortar tela', horasPersona: 1.5, maquinaId: 1, horasMaquina: 0.5, materiales: [{ materialId: 1, cantidad: 14 }] }];
    expect(mismasActividades(a, [{ ...a[0]!, nombre: ' Cortar tela ' }])).toBe(true);
    expect(mismasActividades(a, [{ ...a[0]!, horasPersona: 2 }])).toBe(false);
  });
});

describe('A16 · API de plantillas', () => {
  it('solo el Administrador (RG-07)', async () => {
    expect((await api('get', '/', cliente)).status).toBe(403);
    expect((await request(app).get('/api/admin/plantillas')).status).toBe(401);
  });

  it('la matriz: tipos de mueble × servicios, máquinas con tarifa, materiales con precio y las plantillas activas', async () => {
    const r = await api('get', '/');
    expect(r.status).toBe(200);
    expect(r.body.tiposMueble).toHaveLength(12);
    expect(r.body.servicios.map((s: { corto: string }) => s.corto)).toEqual(['Retapizado completo', 'Retapizado + espuma', 'Solo espuma', 'Reparación de estructura', 'Fabricación a medida']);
    expect(r.body.maquinas.map((m: { nombre: string }) => m.nombre)).toContain('Máquina de coser industrial');
    expect(r.body.costos).toEqual({ tarifaHora: 15, costosFijos: 60, margenPct: 75 });
    expect(r.body.materiales.every((m: { precio: number }) => m.precio >= 0)).toBe(true);
    const s3 = await tipo('s3');
    const p = r.body.plantillas.find((x: { tipoMuebleId: number; servicio: string }) => x.tipoMuebleId === s3 && x.servicio === 'retapizado');
    expect(p).toMatchObject({ version: 1, horas: 10 });
    expect(p.sugerido).toBeGreaterThan(0);
  });

  it('el detalle trae las actividades, el costeo y quién la editó; la tela no va en la plantilla', async () => {
    const s3 = await tipo('s3');
    const id = (await prisma.plantilla.findFirstOrThrow({ where: { tipoMuebleId: s3, servicio: 'retapizado', activa: true } })).id;
    const r = await api('get', `/${id}`);
    expect(r.body).toMatchObject({ version: 1, activa: true, usos: 0, editadoPor: 'Administrador', servicioNombre: 'Retapizado completo' });
    expect(r.body.actividades).toHaveLength(4);
    expect(r.body.actividades[1]).toMatchObject({ nombre: 'Cortar tela', materiales: [] });
    expect(r.body.actividades.flatMap((a: ActividadEntrada) => a.materiales).every((m: { materialId: number | null }) => m.materialId != null)).toBe(true);
    expect(r.body.costeo.horas).toBe(10);
  });

  it('crea una plantilla nueva (versión 1) y queda en la bitácora; no deja dos para la misma combinación', async () => {
    const sL = await tipo('sL');
    const coser = (await prisma.maquina.findUniqueOrThrow({ where: { nombre: 'Máquina de coser industrial' } })).id;
    const hilo = await prisma.material.findUniqueOrThrow({ where: { codigo: 'MAT-0006' } });
    const datos = { tipoMuebleId: sL, servicio: 'retapizado', actividades: [
      { nombre: 'Desmontar tapiz', horasPersona: 2, maquinaId: null, horasMaquina: 0, materiales: [] },
      { nombre: 'Coser fundas', horasPersona: 5, maquinaId: coser, horasMaquina: 5, materiales: [{ materialId: hilo.id, cantidad: 2 }] },
    ] };
    const r = await api('post', '/').send(datos);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ version: 1, tipoMueble: 'Sofá seccional (en L)' });
    expect(r.body.costeo).toMatchObject({ horas: 7, manoObra: 105, maquinaria: 30, fijos: 60 });
    expect(r.body.costeo.materiales).toBeCloseTo(2 * Number(hilo.precio), 2);
    expect(await prisma.bitacora.count({ where: { accion: 'plantilla_creada', entidadId: r.body.id } })).toBe(1);
    expect((await api('post', '/').send(datos)).status).toBe(409);
  });

  it('valida lo que se guarda: horas, máquina, materiales repetidos o fuera del inventario', async () => {
    const bn = await tipo('bn');
    const base = { tipoMuebleId: bn, servicio: 'retapizado' };
    const sinHoras = await api('post', '/').send({ ...base, actividades: [{ nombre: 'Revisar', horasPersona: 0, materiales: [] }] });
    expect(sinHoras.body.mensaje).toMatch(/al menos una actividad con horas/);
    const sinMaquina = await api('post', '/').send({ ...base, actividades: [{ nombre: 'Coser', horasPersona: 1, maquinaId: null, horasMaquina: 2 }] });
    expect(sinMaquina.body.errores).toHaveProperty('actividades.0.horasMaquina');
    const grapas = (await prisma.material.findUniqueOrThrow({ where: { codigo: 'MAT-0008' } })).id;
    const repetido = await api('post', '/').send({ ...base, actividades: [{ nombre: 'Cortar', horasPersona: 1, materiales: [{ materialId: grapas, cantidad: 2 }, { materialId: grapas, cantidad: 3 }] }] });
    expect(repetido.body.mensaje).toMatch(/ya está en la actividad/);
    const tela = await prisma.material.findFirstOrThrow({ where: { categoria: 'tela' } });
    const noStock = await api('post', '/').send({ ...base, actividades: [{ nombre: 'Cortar', horasPersona: 1, materiales: [{ materialId: tela.id, cantidad: 3 }] }] });
    expect(noStock.body.mensaje).toMatch(/ya no está en el inventario/);
    // La tela de referencia (sin material) ya no existe: solo materiales de stock.
    const sinMaterial = await api('post', '/').send({ ...base, actividades: [{ nombre: 'Cortar tela', horasPersona: 1, materiales: [{ materialId: null, cantidad: 3 }] }] });
    expect(sinMaterial.status).toBe(400);
    const negativa = await api('post', '/').send({ ...base, actividades: [{ nombre: 'Cortar', horasPersona: -1 }] });
    expect(negativa.status).toBe(400);
  });

  it('guardar cambios crea la versión 2 y deja la 1 inactiva (no se borra); sin cambios no crea versión', async () => {
    const ar = await tipo('ar');
    const v1 = await prisma.plantilla.findFirstOrThrow({ where: { tipoMuebleId: ar, servicio: 'retapizado', activa: true } });
    const detalle = (await api('get', `/${v1.id}`)).body;

    const igual = await api('put', `/${v1.id}`).send({ actividades: detalle.actividades });
    expect(igual.body).toMatchObject({ sinCambios: true, version: 1 });

    const cambiadas = detalle.actividades.map((a: ActividadEntrada, i: number) => (i === 0 ? { ...a, horasPersona: a.horasPersona + 1 } : a));
    const v2 = await api('put', `/${v1.id}`).send({ actividades: cambiadas });
    expect(v2.status).toBe(200);
    expect(v2.body).toMatchObject({ sinCambios: false, version: 2, versiones: 2 });
    expect(v2.body.costeo.horas).toBe(detalle.costeo.horas + 1);
    expect((await prisma.plantilla.findUniqueOrThrow({ where: { id: v1.id } })).activa).toBe(false);
    expect(await prisma.plantillaActividad.count({ where: { plantillaId: v1.id } })).toBe(detalle.actividades.length);
    expect(await prisma.bitacora.count({ where: { accion: 'plantilla_modificada', entidadId: v2.body.id } })).toBe(1);

    // Guardar sobre la versión vieja (otra pestaña) se rechaza.
    expect((await api('put', `/${v1.id}`).send({ actividades: cambiadas })).status).toBe(409);
  });

  it('el precio sugerido usa los precios de hoy del Inventario', async () => {
    const ch = await tipo('ch');
    const p = await prisma.plantilla.findFirstOrThrow({ where: { tipoMuebleId: ch, servicio: 'retapizado', activa: true } });
    const antes = (await api('get', `/${p.id}`)).body.costeo;
    const espuma = await prisma.material.findUniqueOrThrow({ where: { codigo: 'MAT-0001' } });
    await prisma.material.update({ where: { id: espuma.id }, data: { precio: Number(espuma.precio) + 100 } });
    try {
      const despues = (await api('get', `/${p.id}`)).body.costeo;
      expect(despues.materiales).toBeCloseTo(antes.materiales + 100 * 0.25, 2);
    } finally {
      await prisma.material.update({ where: { id: espuma.id }, data: { precio: espuma.precio } });
    }
  });
});
