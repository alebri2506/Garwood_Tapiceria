// Módulo de Pagos (A5 · W5 · CU-C12, C13 · decisiones J y O): saldo calculado, pagos manuales confirmados al guardar,
// Zelle/cheque informados por el cliente «Por confirmar», rechazo con reemplazo, anulación, recibos y saldo con tarjeta.
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { prisma } from '../src/shared/infrastructure/prisma.js';
import { ConsolaCorreo } from '../src/shared/infrastructure/correo.js';
import { rutasFijas } from '../src/shared/infrastructure/rutas.js';
import type { Pasarela, ResultadoPago } from '../src/shared/infrastructure/pasarela.js';
import type { AlmacenArchivos } from '../src/shared/infrastructure/archivos.js';
import { hoyNegocio } from '../src/modules/comercial/domain/calendario.js';
import { instanteNY } from '../src/modules/comercial/domain/agenda.js';

const guardados: string[] = [];
const eliminados: string[] = [];
const almacen: AlmacenArchivos = {
  async guardar(_a, carpeta) { const r = `${carpeta}/c${guardados.length + 1}.png`; guardados.push(r); return r; },
  async eliminar(r) { eliminados.push(r); },
  async urlTemporal(ruta) { return `/prueba/${ruta}`; },
};
// Pasarela falsa (sin internet), como en las pruebas de W4.
const sesiones = new Map<string, ResultadoPago>();
const falsa: Pasarela = {
  async crearSesion(e) {
    const id = `cs_saldo_${sesiones.size + 1}`;
    sesiones.set(id, { sesion: id, pagado: false, referencia: null, monto: e.monto, metadata: e.metadata });
    return { id, url: `https://pago.prueba/${id}`, clientSecret: null };
  },
  async consultarSesion(id) { return sesiones.get(id)!; },
  async leerAviso(cuerpo, firma) {
    if (firma !== 'firma-valida') throw new Error('Firma no válida');
    return sesiones.get(JSON.parse(cuerpo.toString()).sesion) ?? null;
  },
};
const cobrar = (id: string) => sesiones.set(id, { ...sesiones.get(id)!, pagado: true, referencia: `pi_${id}` });
const app = crearApp({ correo: new ConsolaCorreo(), almacen, rutas: rutasFijas(14), pasarela: falsa });

const CLAVE = process.env.SEED_CONTRASENA!;
let admin = '';
let cliente = '';
const login = async (identificador: string) => (await request(app).post('/api/auth/login').send({ identificador, contrasena: CLAVE })).body.token as string;
const api = (metodo: 'get' | 'put' | 'post', ruta: string, token = admin) => request(app)[metodo](`/api/admin${ruta}`).set('Authorization', `Bearer ${token}`);
const cli = (metodo: 'get' | 'post', ruta: string, token = cliente) => request(app)[metodo](`/api/solicitudes${ruta}`).set('Authorization', `Bearer ${token}`);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)]);
const informar = (pedido: string, datos: object, archivo?: { buf: Buffer; nombre: string; tipo: string }) => {
  const r = cli('post', `/pedidos/${pedido}/pagos/informar`).field('datos', JSON.stringify(datos));
  return archivo ? r.attach('comprobante', archivo.buf, { filename: archivo.nombre, contentType: archivo.tipo }) : r;
};

let n = 0;
let navyId = 0;
let precioNavy: unknown = null;

/** Una visita atendida con la cotización armada; el cliente responde con lo que se indique. */
async function respondida(respuesta: { pagaAhora: boolean; metodo?: string }) {
  const laura = await prisma.cliente.findUniqueOrThrow({ where: { email: 'laura.mendez@correo.com' } });
  const adminId = (await prisma.usuario.findUniqueOrThrow({ where: { nombreUsuario: 'admin' } })).id;
  const s3 = await prisma.tipoMueble.findUniqueOrThrow({ where: { codigo: 's3' } });
  const dir = await prisma.direccion.create({ data: { clienteId: laura.id, direccion: '48 Park St, Montclair, NJ 07042', ciudad: 'Montclair', guardada: true } });
  n += 1;
  const s = await prisma.solicitud.create({
    data: { codigo: `SOL-95${String(n).padStart(2, '0')}`, clienteId: laura.id, canal: 'web', telaOpcion: 'domicilio', estado: 'En espera de cita', registradoPor: adminId, muebles: { create: [{ orden: 1, tipoMuebleId: s3.id, servicio: 'retapizado_espuma' }] } },
  });
  const cita = await prisma.cita.create({ data: { solicitudId: s.id, tipo: 'domicilio', fechaHora: instanteNY(hoyNegocio(), '15:00'), duracionMin: 60, direccionId: dir.id, estado: 'Programada', registradoPor: adminId } });
  expect((await request(app).post(`/api/citas/${cita.id}/resultado`).set('Authorization', `Bearer ${admin}`).send({ resultado: 'atendida' })).status).toBe(200);
  expect((await api('put', `/atencion/${s.codigo}/traslado`).send({ traslado: 'delivery', direccion: { tipo: 'guardada', id: dir.id } })).status).toBe(200);
  const a = (await api('get', `/cotizaciones/armar/${s.codigo}`)).body;
  const cotizacion = {
    muebles: a.muebles.map((m: { solicitudMuebleId: number; actividades: { nombre: string; horasPersona: number; maquinaId: number | null; horasMaquina: number; materiales: { materialId: number; cantidad: number }[] }[] }) => ({
      solicitudMuebleId: m.solicitudMuebleId,
      actividades: m.actividades.map((x) => ({ nombre: x.nombre, horasPersona: x.horasPersona, maquinaId: x.maquinaId, horasMaquina: x.horasMaquina, materiales: x.materiales.map((y) => ({ materialId: y.materialId, cantidad: y.cantidad })) })),
      telas: [{ materialId: navyId, yardas: 14 }], propuesto: 1000, revisado: true,
    })),
    transporte: { manual: false }, adelanto: null, observaciones: '',
  };
  const r = await api('post', `/atencion/${s.codigo}/respuesta`).send({ cotizacion, respuesta: 'acepta', ...respuesta });
  expect(r.status).toBe(200);
  const cot = await prisma.cotizacion.findFirstOrThrow({ where: { solicitudId: s.id }, orderBy: { version: 'desc' } });
  return { s, cot, pedido: r.body.pedido as string | null, total: Number(cot.total), adelanto: Number(cot.adelanto) };
}
const r2 = (x: number) => Math.round(x * 100) / 100;

beforeAll(async () => {
  admin = await login('admin');
  cliente = await login('laura.mendez@correo.com');
  const navy = await prisma.material.findUniqueOrThrow({ where: { codigo: 'TP-204-4' } });
  navyId = navy.id;
  precioNavy = navy.precio;
  await prisma.material.update({ where: { id: navy.id }, data: { precio: 24 } });
});
afterAll(async () => {
  await prisma.material.update({ where: { codigo: 'TP-204-4' }, data: { precio: precioNavy as number | null } });
  await prisma.$disconnect();
});

describe('A5 · Pagos del Administrador', () => {
  it('solo el Administrador (RG-07)', async () => {
    expect((await api('get', '/pagos/resumen', cliente)).status).toBe(403);
    expect((await api('get', '/pagos/resumen')).status).toBe(200);
  });

  it('el adelanto cobrado en la visita lleva recibo; el pago manual queda confirmado, no pasa el saldo y se anula con motivo', async () => {
    const { pedido, total, adelanto } = await respondida({ pagaAhora: true, metodo: 'efectivo' });
    const pagos = await prisma.pago.findMany({ where: { pedido: { codigo: pedido! } } });
    expect(pagos[0]!.recibo).toMatch(/^REC-\d{4}$/);
    const saldo = r2(total - adelanto);

    const fila = (await api('get', '/pagos/saldos')).body.find((x: { pedido: string }) => x.pedido === pedido);
    expect(fila).toMatchObject({ total, pagado: adelanto, saldo, debe: saldo, faltaAdelanto: false });

    const mucho = await api('post', '/pagos').send({ pedido, monto: saldo + 1, metodo: 'cheque' });
    expect(mucho.status).toBe(400);
    expect(mucho.body.errores).toHaveProperty('monto');
    expect((await api('post', '/pagos').send({ pedido, monto: 10, metodo: 'bitcoin' })).status).toBe(400);
    expect((await api('post', '/pagos').send({ monto: 10, metodo: 'cheque' })).status).toBe(400);

    const r = await api('post', '/pagos').send({ pedido, monto: 100, metodo: 'cheque', detalle: 'Cheque 1043 · Chase' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ pedido, saldo: r2(saldo - 100), recibo: expect.stringMatching(/^REC-\d{4}$/) });
    expect(r.body.recibo).not.toBe(pagos[0]!.recibo);
    const conf = (await api('get', '/pagos/confirmados?origen=manual')).body.find((x: { id: number }) => x.id === r.body.id);
    expect(conf).toMatchObject({ estado: 'Confirmado', origenNombre: 'Manual', detalle: 'Cheque 1043 · Chase', cuentaPedido: { saldo: r2(saldo - 100) } });
    expect(JSON.stringify(conf)).not.toMatch(/sugerido|margen|costo/i);

    expect((await api('post', `/pagos/${r.body.id}/anular`).send({})).status).toBe(400);
    const an = await api('post', `/pagos/${r.body.id}/anular`).send({ motivo: 'El banco devolvió el cheque' });
    expect(an.body).toMatchObject({ estado: 'Anulado', saldo });
    expect((await api('post', `/pagos/${r.body.id}/anular`).send({ motivo: 'otra vez' })).status).toBe(409);
    expect(await prisma.bitacora.count({ where: { entidad: 'pago', entidadId: r.body.id, accion: { in: ['pago_registrado', 'pago_anulado'] } } })).toBe(2);
    expect(await prisma.notificacion.count({ where: { tipo: 'pago_anulado', enlace: `/cliente/pagos?pedido=${pedido}` } })).toBe(1);
  });

  it('cotización que espera su adelanto: aparece en Saldos; el pago manual debe cubrir el adelanto y genera el pedido', async () => {
    const { cot, adelanto } = await respondida({ pagaAhora: false });
    expect(cot.estado).toBe('Aceptada: pendiente de adelanto');
    const fila = (await api('get', '/pagos/saldos')).body.find((x: { cotizacion: string }) => x.cotizacion === cot.codigo);
    expect(fila).toMatchObject({ pedido: null, faltaAdelanto: true, debe: adelanto });

    expect((await api('post', '/pagos').send({ cotizacion: cot.codigo, monto: adelanto - 1, metodo: 'efectivo' })).status).toBe(400);
    const r = await api('post', '/pagos').send({ cotizacion: cot.codigo, monto: adelanto, metodo: 'efectivo' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ pedidoNuevo: true, pedido: expect.stringMatching(/^PED-\d{4}$/) });
    expect((await prisma.cotizacion.findUniqueOrThrow({ where: { id: cot.id } })).estado).toBe('Aceptada');
    expect(await prisma.pedido.findUniqueOrThrow({ where: { codigo: r.body.pedido } })).toMatchObject({ estado: 'Esperando mueble', cotizacionId: cot.id });
    expect((await api('post', '/pagos').send({ cotizacion: cot.codigo, monto: adelanto, metodo: 'efectivo' })).status).toBe(409);
  });
});

describe('W5 · el cliente paga su pedido', () => {
  it('informa Zelle con captura: «Por confirmar» en A5; rechazo con motivo, reemplazo y confirmación con recibo', async () => {
    const { pedido, total, adelanto } = await respondida({ pagaAhora: true, metodo: 'efectivo' });
    const saldo = r2(total - adelanto);
    const zelle = { buf: PNG, nombre: 'zelle.png', tipo: 'image/png' };

    expect((await informar(pedido!, { metodo: 'zelle', monto: 50 })).body.errores).toHaveProperty('comprobante');
    expect((await informar(pedido!, { metodo: 'zelle', monto: 50 }, { buf: Buffer.from('hola, no soy un PDF'), nombre: 'x.pdf', tipo: 'application/pdf' })).status).toBe(400);
    expect((await informar(pedido!, { metodo: 'zelle', monto: 50 }, { buf: PNG, nombre: 'x.gif', tipo: 'image/gif' })).status).toBe(400);
    expect((await informar(pedido!, { metodo: 'zelle', monto: saldo + 1 }, zelle)).status).toBe(400);
    expect(eliminados.length).toBe(1); // El comprobante del intento fallido no queda guardado.

    const r = await informar(pedido!, { metodo: 'zelle', monto: saldo, detalle: 'Conf. ZL-889' }, zelle);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ estado: 'Por confirmar', concepto: 'saldo', monto: saldo });
    // Ya informó todo lo que debe: no puede informar otro, y el pedido sale de «Saldos» (está en «Por confirmar»).
    expect((await informar(pedido!, { metodo: 'cheque', monto: 10 })).status).toBe(409);
    expect((await api('get', '/pagos/saldos')).body.some((x: { pedido: string }) => x.pedido === pedido)).toBe(false);
    const pc = (await api('get', '/pagos/por-confirmar')).body.find((x: { id: number }) => x.id === r.body.id);
    expect(pc).toMatchObject({ origenNombre: 'Cliente', metodo: 'zelle', comprobante: true, registradoPor: { rol: 'Cliente' } });
    expect((await api('get', `/pagos/${r.body.id}/comprobante`)).body.url).toMatch(/^\/prueba\/pagos\//);
    expect(await prisma.notificacion.count({ where: { tipo: 'pago_por_confirmar', mensaje: { contains: 'Zelle' } } })).toBeGreaterThan(0);

    // Rechazo con motivo: el cliente lo ve y sube otro que lo reemplaza.
    expect((await api('post', `/pagos/${r.body.id}/rechazar`).send({ motivo: 'No se lee el monto' })).body.estado).toBe('Rechazado');
    expect((await api('post', `/pagos/${r.body.id}/confirmar`)).status).toBe(409);
    let w5 = (await cli('get', `/pedidos/${pedido}/pagos`)).body;
    expect(w5.pagos.find((x: { id: number }) => x.id === r.body.id)).toMatchObject({ estado: 'Rechazado', motivo: 'No se lee el monto', reemplazado: false });
    expect(w5).toMatchObject({ saldo, disponible: saldo, puedePagar: true, pagoEnLinea: true });
    const nuevo = await informar(pedido!, { metodo: 'zelle', monto: saldo, reemplaza: r.body.id }, zelle);
    expect(nuevo.status).toBe(201);
    expect((await informar(pedido!, { metodo: 'cheque', monto: 1, reemplaza: r.body.id })).status).toBe(409);

    // Confirmado: recibo, saldo $0 y aviso al cliente.
    const ok = await api('post', `/pagos/${nuevo.body.id}/confirmar`);
    expect(ok.body).toMatchObject({ estado: 'Confirmado', saldo: 0, recibo: expect.stringMatching(/^REC-\d{4}$/) });
    w5 = (await cli('get', `/pedidos/${pedido}/pagos`)).body;
    expect(w5).toMatchObject({ pagado: total, saldo: 0, porConfirmar: 0, puedePagar: false });
    expect(w5.pagos.find((x: { id: number }) => x.id === r.body.id).reemplazado).toBe(true);
    expect(w5.recibos.map((x: { codigo: string }) => x.codigo)).toContain(ok.body.recibo);
    expect(JSON.stringify(w5)).not.toMatch(/sugerido|margen|costo|registradoPor/i);
    expect(await prisma.notificacion.count({ where: { tipo: 'pago_confirmado', titulo: { contains: ok.body.recibo } } })).toBe(1);
    expect((await cli('get', `/pedidos/pagos/${nuevo.body.id}/comprobante`)).status).toBe(200);
  });

  it('paga el saldo con tarjeta (pasarela): cuenta una sola vez, lleva recibo y no se anula desde A5', async () => {
    const { pedido, total, adelanto } = await respondida({ pagaAhora: true, metodo: 'efectivo' });
    const saldo = r2(total - adelanto);
    const r = await cli('post', `/pedidos/${pedido}/pagos/en-linea`);
    expect(r.status).toBe(200);
    const id = r.body.url.split('/').pop() as string;
    expect(sesiones.get(id)).toMatchObject({ monto: saldo, metadata: { pedido, concepto: 'saldo' } });

    expect((await cli('post', `/pedidos/${pedido}/pagos/en-linea/confirmar`).send({ sesion: id })).body.estado).toBe('pendiente');
    cobrar(id);
    const ok = await cli('post', `/pedidos/${pedido}/pagos/en-linea/confirmar`).send({ sesion: id });
    expect(ok.body).toMatchObject({ estado: 'registrado', pedido, recibo: expect.stringMatching(/^REC-\d{4}$/) });
    // El aviso de Stripe llega después: sigue siendo un solo pago.
    expect((await request(app).post('/api/pagos/stripe/aviso').set('stripe-signature', 'firma-valida').set('Content-Type', 'application/json').send(JSON.stringify({ sesion: id }))).status).toBe(200);
    const pagos = await prisma.pago.findMany({ where: { pedido: { codigo: pedido! }, origen: 'pasarela' } });
    expect(pagos).toHaveLength(1);
    expect(pagos[0]).toMatchObject({ estado: 'Confirmado', concepto: 'saldo', metodo: 'tarjeta' });
    expect((await cli('get', `/pedidos/${pedido}/pagos`)).body).toMatchObject({ saldo: 0, pagoEnLinea: false });
    expect((await cli('post', `/pedidos/${pedido}/pagos/en-linea`)).status).toBe(409);
    expect((await api('post', `/pagos/${pagos[0]!.id}/anular`).send({ motivo: 'Devolución' })).status).toBe(409);
  });

  it('solo ve y paga sus pedidos (RG-07)', async () => {
    const { pedido } = await respondida({ pagaAhora: true, metodo: 'efectivo' });
    const otro = await prisma.cliente.create({ data: { tipoPersona: 'persona', nombres: 'Ana', apellidos: 'Ajena', telefono: '+19735550777', canalRegistro: 'web' } });
    await prisma.pedido.update({ where: { codigo: pedido! }, data: { clienteId: otro.id } });
    expect((await cli('get', `/pedidos/${pedido}/pagos`)).status).toBe(404);
    expect((await informar(pedido!, { metodo: 'cheque', monto: 10 })).status).toBe(404);
    expect((await cli('get', '/pedidos/NOEXISTE/pagos', admin)).status).toBe(403);
  });
});
