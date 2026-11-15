// A4 Armar cotización (CU-C07, C08, C11 · decisiones K): transporte, adelanto, borrador, publicar y tamaño de carga.
// Usa las plantillas de ejemplo del seed (sofá de 3 cuerpos · retapizado + espuma y otomán · retapizado).
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { prisma } from '../src/shared/infrastructure/prisma.js';
import { ConsolaCorreo } from '../src/shared/infrastructure/correo.js';
import { rutasFijas, variantesDireccion } from '../src/shared/infrastructure/rutas.js';
import {
  adelantoSugeridoPct, cargaDe, costearMueble, revisarAdelanto, transporteDe,
} from '../src/modules/comercial/domain/cotizacion.js';
import type { AlmacenArchivos } from '../src/shared/infrastructure/archivos.js';

const almacen: AlmacenArchivos = { async guardar() { return 'x'; }, async eliminar() {}, async urlTemporal(ruta) { return `/prueba/${ruta}`; } };
const app = crearApp({ correo: new ConsolaCorreo(), almacen, rutas: rutasFijas(14) });
const sinRuta = crearApp({ correo: new ConsolaCorreo(), almacen, rutas: rutasFijas(null) });
const CLAVE = process.env.SEED_CONTRASENA!;
let admin = '';
let cliente = '';
const login = async (identificador: string) => (await request(app).post('/api/auth/login').send({ identificador, contrasena: CLAVE })).body.token as string;
const api = (metodo: 'get' | 'put' | 'post', ruta: string, token = admin, a = app) => request(a)[metodo](`/api/admin/cotizaciones${ruta}`).set('Authorization', `Bearer ${token}`);

let n = 0;
/** Una solicitud de Laura lista para cotizar, creada directo en la base. */
async function solicitud(opciones: { tela?: string; traslado?: string | null; muebles?: { tipo: string; servicio: string; tela?: string }[] } = {}) {
  const laura = await prisma.cliente.findUniqueOrThrow({ where: { email: 'laura.mendez@correo.com' } });
  const adminId = (await prisma.usuario.findUniqueOrThrow({ where: { nombreUsuario: 'admin' } })).id;
  const tipos = await prisma.tipoMueble.findMany();
  const telas = await prisma.material.findMany({ where: { categoria: 'tela' } });
  const dir = await prisma.direccion.create({ data: { clienteId: laura.id, direccion: '48 Park St, Montclair, NJ 07042', ciudad: 'Montclair' } });
  const muebles = opciones.muebles ?? [{ tipo: 's3', servicio: 'retapizado_espuma', tela: 'TP-204-4' }, { tipo: 'ot', servicio: 'retapizado' }];
  n += 1;
  return prisma.solicitud.create({
    data: {
      codigo: `SOL-97${String(n).padStart(2, '0')}`, clienteId: laura.id, canal: 'web', telaOpcion: opciones.tela ?? 'catalogo', mismaTela: true,
      traslado: opciones.traslado === undefined ? 'delivery' : opciones.traslado, direccionId: dir.id, estado: 'Nueva', registradoPor: adminId,
      muebles: {
        create: muebles.map((m, i) => ({
          orden: i + 1, tipoMuebleId: tipos.find((t) => t.codigo === m.tipo)!.id, servicio: m.servicio,
          telas: m.tela ? { create: [{ materialId: telas.find((t) => t.codigo === m.tela)!.id, orden: 1 }] } : undefined,
        })),
      },
    },
  });
}

/** Lo que guardaría la pantalla a partir de lo que devuelve «armar». */
function entradaDe(a: { muebles: { solicitudMuebleId: number; actividades: { nombre: string; horasPersona: number; maquinaId: number | null; horasMaquina: number; materiales: { materialId: number; cantidad: number }[] }[]; telas: { materialId: number }[] }[] }, cambios: { yardas?: number; propuestos?: number[]; revisados?: boolean[]; adelanto?: number | null; transporte?: object } = {}) {
  return {
    muebles: a.muebles.map((m, i) => ({
      solicitudMuebleId: m.solicitudMuebleId,
      actividades: m.actividades.map((x) => ({ nombre: x.nombre, horasPersona: x.horasPersona, maquinaId: x.maquinaId, horasMaquina: x.horasMaquina, materiales: x.materiales.map((y) => ({ materialId: y.materialId, cantidad: y.cantidad })) })),
      telas: m.telas.map((t) => ({ materialId: t.materialId, yardas: cambios.yardas ?? 14 })),
      propuesto: cambios.propuestos?.[i] ?? 500, motivo: '', revisado: cambios.revisados?.[i] ?? true,
    })),
    transporte: cambios.transporte ?? { manual: false },
    adelanto: cambios.adelanto ?? null,
    observaciones: 'El cojín central tiene una mancha: el retapizado la cubre.',
  };
}

let precioNavy: unknown = null;
beforeAll(async () => {
  admin = await login('admin');
  cliente = await login('laura.mendez@correo.com');
  // Las telas de prueba del seed no tienen precio: el Lino Navy 204 vale $24 la yarda en estas pruebas.
  const navy = await prisma.material.findUniqueOrThrow({ where: { codigo: 'TP-204-4' } });
  precioNavy = navy.precio;
  await prisma.material.update({ where: { id: navy.id }, data: { precio: 24 } });
});
afterAll(async () => {
  await prisma.material.update({ where: { codigo: 'TP-204-4' }, data: { precio: precioNavy as number | null } });
  await prisma.$disconnect();
});

describe('Reglas de la cotización (sin base de datos)', () => {
  it('transporte como una app de taxi: millas × 2 × tarifa + la carga de todos los muebles sumada', () => {
    const carga = cargaDe(['grande', 'chica'], { chica: 15, mediana: 30, grande: 45 });
    expect(carga).toBe(60);
    expect(transporteDe(14, 1.6, carga)).toEqual({ distancia: 45, carga: 60, total: 105 });
  });

  it('para ubicar una dirección se quita el local, la suite o el departamento (OpenStreetMap no los reconoce)', () => {
    expect(variantesDireccion('469 South Avenue E B, Westfield, NJ 07090')).toEqual(['469 South Avenue E B, Westfield, NJ 07090', '469 South Avenue E, Westfield, NJ 07090']);
    expect(variantesDireccion('12 Main St Apt 4B, Newark, NJ')).toEqual(['12 Main St Apt 4B, Newark, NJ', '12 Main St, Newark, NJ']);
    expect(variantesDireccion('10 Park Ave N, Summit, NJ')).toEqual(['10 Park Ave N, Summit, NJ']);
  });

  it('adelanto: 40 % sin pedidos cerrados, 0 % con historial; nunca más del máximo', () => {
    expect(adelantoSugeridoPct(0, { sinHistorial: 40, conHistorial: 0 })).toBe(40);
    expect(adelantoSugeridoPct(2, { sinHistorial: 40, conHistorial: 0 })).toBe(0);
    expect(revisarAdelanto(500, 1000, 50)).toBeNull();
    expect(revisarAdelanto(501, 1000, 50)).toMatch(/50 %.*\$500/);
    expect(revisarAdelanto(-1, 1000, 50)).toMatch(/negativo/);
  });

  it('precio sugerido de un mueble: tela + materiales + mano de obra + maquinaria; los costos fijos una sola vez', () => {
    const p = { tarifaHora: 15, costosFijos: 60, margenPct: 75 };
    const a = [{ horasPersona: 2, horasMaquina: 1, tarifaMaquina: 6, materiales: [{ precio: 10, cantidad: 2 }] }];
    expect(costearMueble(a, [{ yardas: 3, precio: 24 }], p, true)).toMatchObject({ materiales: 92, manoObra: 30, maquinaria: 6, fijos: 60, sugerido: 329 });
    expect(costearMueble(a, [], p, false)).toMatchObject({ fijos: 0, sugerido: Math.round((20 + 30 + 6) * 1.75) });
  });
});

describe('A4 · Armar cotización', () => {
  it('solo el Administrador (RG-07)', async () => {
    const s = await solicitud();
    expect((await api('get', `/armar/${s.codigo}`, cliente)).status).toBe(403);
    expect((await request(app).get(`/api/admin/cotizaciones/armar/${s.codigo}`)).status).toBe(401);
  });

  it('propone la cotización: un bloque por mueble con su plantilla, la tela que eligió el cliente, transporte y adelanto', async () => {
    const s = await solicitud();
    const r = await api('get', `/armar/${s.codigo}`);
    expect(r.status).toBe(200);
    expect(r.body.cotizacion).toMatchObject({ codigo: null, estado: 'Borrador', editable: true });
    expect(r.body.cliente).toMatchObject({ nombre: 'Laura Méndez', historial: 'sin pedidos cerrados' });
    expect(r.body.muebles).toHaveLength(2);
    const [sofa, otoman] = r.body.muebles;
    expect(sofa).toMatchObject({ clave: 'Mueble 1', titulo: 'Sofá de 3 cuerpos', revisado: true });
    expect(sofa.actividades.length).toBeGreaterThan(0);
    expect(sofa.tela).toMatchObject({ tipo: 'taller', telas: [{ nombre: 'Lino Navy 204', precio: 24, yardas: 0 }] });
    // «Misma tela para todos»: el otomán usa la del sofá.
    expect(otoman).toMatchObject({ clave: 'Mueble 2', revisado: false, tela: { tipo: 'taller', telas: [{ nombre: 'Lino Navy 204' }] } });
    // 14 mi × 2 × $1.60 = $45 + sofá (grande $45) + otomán (chica $15) = $105.
    expect(r.body.transporte).toMatchObject({ aplica: true, millas: 14, distancia: 45, carga: 60, calculado: 105, manual: false });
    expect(r.body.condiciones).toMatchObject({ adelantoPct: 40, adelantoMaxPct: 50, adelanto: null, razon: 'sin pedidos cerrados' });
  });

  it('la tela que trae el cliente no se cobra; la de la cita todavía no existe y no deja publicar', async () => {
    const trae = await solicitud({ tela: 'trae', muebles: [{ tipo: 'ar', servicio: 'retapizado' }] });
    expect((await api('get', `/armar/${trae.codigo}`)).body.muebles[0].tela).toMatchObject({ tipo: 'cliente', nota: 'Lo brinda el cliente', telas: [] });

    const cita = await solicitud({ tela: 'local', muebles: [{ tipo: 'ar', servicio: 'retapizado' }] });
    await prisma.solicitud.update({ where: { id: cita.id }, data: { estado: 'Atendida' } });
    const a = (await api('get', `/armar/${cita.codigo}`)).body;
    expect(a.muebles[0].tela.tipo).toBe('pendiente');
    const r = await api('post', `/armar/${cita.codigo}/publicar`).send(entradaDe(a));
    expect(r.status).toBe(400);
    expect(r.body.errores).toHaveProperty('muebles.0.tela');
  });

  it('guarda el borrador sin crear filas (se reescribe sin borrar) y lo devuelve como quedó', async () => {
    const s = await solicitud();
    const a = (await api('get', `/armar/${s.codigo}`)).body;
    const r = await api('put', `/armar/${s.codigo}`).send(entradaDe(a, { yardas: 15, propuestos: [1050, 180], revisados: [true, false] }));
    expect(r.status).toBe(200);
    expect(r.body.codigo).toMatch(/^COT-\d{4}$/);
    const cot = await prisma.cotizacion.findUniqueOrThrow({ where: { codigo: r.body.codigo }, include: { muebles: true } });
    expect(cot).toMatchObject({ estado: 'Borrador', muebles: [] });
    expect(cot.borrador).not.toBeNull();
    expect(await prisma.bitacora.count({ where: { accion: 'cotizacion_creada', entidadId: cot.id } })).toBe(1);

    const b = (await api('get', `/armar/${s.codigo}`)).body;
    expect(b.cotizacion).toMatchObject({ codigo: r.body.codigo, estado: 'Borrador', editable: true });
    expect(b.muebles.map((m: { propuesto: number }) => m.propuesto)).toEqual([1050, 180]);
    expect(b.muebles[0].tela.telas[0].yardas).toBe(15);
    expect(b.observaciones).toMatch(/mancha/);

    await api('put', `/armar/${s.codigo}`).send(entradaDe(a, { propuestos: [1000, 180] }));
    expect(await prisma.cotizacion.count({ where: { solicitudId: s.id } })).toBe(1);
    expect(await prisma.bitacora.count({ where: { accion: 'cotizacion_guardada', entidadId: cot.id } })).toBe(1);
  });

  it('no publica si falta revisar un mueble, si faltan yardas o si el adelanto pasa del 50 %', async () => {
    const s = await solicitud();
    const a = (await api('get', `/armar/${s.codigo}`)).body;
    const sinRevisar = await api('post', `/armar/${s.codigo}/publicar`).send(entradaDe(a, { revisados: [true, false] }));
    expect(sinRevisar.status).toBe(400);
    expect(sinRevisar.body.errores).toHaveProperty('muebles.1.revisado');
    const sinYardas = await api('post', `/armar/${s.codigo}/publicar`).send(entradaDe(a, { yardas: 0 }));
    expect(sinYardas.body.errores).toHaveProperty(['muebles.0.telas.0.yardas']);
    // Total = 500 + 500 + 105 = 1105 → máximo 50 % = $553.
    const alto = await api('post', `/armar/${s.codigo}/publicar`).send(entradaDe(a, { adelanto: 600 }));
    expect(alto.body.errores.adelanto).toMatch(/50 %.*\$553/);
    expect((await prisma.solicitud.findUniqueOrThrow({ where: { id: s.id } })).estado).toBe('Nueva');
  });

  it('publica: congela los precios, la solicitud pasa a Cotizada y el cliente recibe el aviso', async () => {
    const s = await solicitud();
    const a = (await api('get', `/armar/${s.codigo}`)).body;
    const r = await api('post', `/armar/${s.codigo}/publicar`).send(entradaDe(a, { propuestos: [1050, 180], adelanto: 500 }));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ total: 1050 + 180 + 105 });
    const cot = await prisma.cotizacion.findUniqueOrThrow({ where: { codigo: r.body.codigo }, include: { muebles: { include: { telas: true, actividades: true } } } });
    expect(cot).toMatchObject({ estado: 'Pendiente de respuesta', borrador: null, adelantoModificado: true });
    expect(Number(cot.adelanto)).toBe(500);
    expect(cot.vigenciaHasta).not.toBeNull();
    expect(cot.muebles).toHaveLength(2);
    expect(Number(cot.muebles[0]!.telas[0]!.precio)).toBe(24);
    expect(Number(cot.muebles[0]!.precioSugerido)).toBeGreaterThan(0);
    expect((await prisma.solicitud.findUniqueOrThrow({ where: { id: s.id } })).estado).toBe('Cotizada');
    expect(await prisma.notificacion.count({ where: { solicitudId: s.id, tipo: 'cotizacion_publicada' } })).toBe(1);
    expect(await prisma.bitacora.count({ where: { entidad: 'solicitud', entidadId: s.id, accion: 'solicitud_cotizada' } })).toBe(1);

    // Congelada: cambiar el precio de la tela ya no la altera; tampoco se puede volver a editar.
    await prisma.material.update({ where: { codigo: 'TP-204-4' }, data: { precio: 30 } });
    try {
      const vista = (await api('get', `/armar/${s.codigo}`)).body;
      expect(vista.cotizacion).toMatchObject({ estado: 'Pendiente de respuesta', editable: false });
      expect(vista.muebles[0].tela.telas[0].precio).toBe(24);
    } finally {
      await prisma.material.update({ where: { codigo: 'TP-204-4' }, data: { precio: 24 } });
    }
    expect((await api('put', `/armar/${s.codigo}`).send(entradaDe(a))).status).toBe(409);
  });

  it('si no se puede calcular la distancia, el transporte se ingresa a mano con su motivo', async () => {
    const s = await solicitud();
    const a = (await api('get', `/armar/${s.codigo}`, admin, sinRuta)).body;
    expect(a.transporte).toMatchObject({ aplica: true, millas: null, calculado: null });
    const sinMonto = await api('post', `/armar/${s.codigo}/publicar`, admin, sinRuta).send(entradaDe(a));
    expect(sinMonto.body.errores).toHaveProperty(['transporte.monto']);
    const aMano = await api('post', `/armar/${s.codigo}/publicar`, admin, sinRuta).send(entradaDe(a, { transporte: { manual: true, monto: 120, motivo: 'OpenStreetMap no ubica la dirección' } }));
    expect(aMano.status).toBe(200);
    const cot = await prisma.cotizacion.findUniqueOrThrow({ where: { codigo: aMano.body.codigo } });
    expect(cot).toMatchObject({ transporteManual: true, motivoTransporte: 'OpenStreetMap no ubica la dirección' });
    expect(Number(cot.transporte)).toBe(120);
  });

  it('el cliente que lo lleva no paga transporte', async () => {
    const s = await solicitud({ traslado: 'propio' });
    const a = (await api('get', `/armar/${s.codigo}`)).body;
    expect(a.transporte).toMatchObject({ aplica: false, monto: 0 });
  });
});

describe('A14 › Tamaño de carga por tipo de mueble', () => {
  it('lista los tipos con su tamaño y cambiarlo queda en la bitácora y en el historial', async () => {
    const lista = (await request(app).get('/api/admin/parametros/cargas').set('Authorization', `Bearer ${admin}`)).body;
    expect(lista).toEqual(expect.arrayContaining([expect.objectContaining({ nombre: 'Sofá de 3 cuerpos', tamanoCarga: 'grande' }), expect.objectContaining({ nombre: 'Otomán o puf', tamanoCarga: 'chica' })]));
    const banco = lista.find((t: { nombre: string }) => t.nombre === 'Banco (bench)');
    const r = await request(app).put(`/api/admin/parametros/cargas/${banco.id}`).set('Authorization', `Bearer ${admin}`).send({ tamanoCarga: 'chica' });
    expect(r.body).toMatchObject({ tamanoCarga: 'chica', sinCambios: false });
    const historial = (await request(app).get('/api/admin/parametros/historial').set('Authorization', `Bearer ${admin}`)).body;
    expect(historial[0]).toMatchObject({ etiqueta: 'Carga · Banco (bench)', valorAnterior: 'mediana', valorNuevo: 'chica' });
    expect((await request(app).put(`/api/admin/parametros/cargas/${banco.id}`).set('Authorization', `Bearer ${admin}`).send({ tamanoCarga: 'enorme' })).status).toBe(400);
    await request(app).put(`/api/admin/parametros/cargas/${banco.id}`).set('Authorization', `Bearer ${admin}`).send({ tamanoCarga: 'mediana' });
  });
});
