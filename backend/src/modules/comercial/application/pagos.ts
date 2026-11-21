// Módulo de Pagos (CU-C12, C13 · decisiones J y O): A5 para el Administrador y W5 para el cliente.
//  - Saldo = total de la cotización aceptada − pagos Confirmados: siempre se calcula, nunca se guarda.
//  - Pasarela (Stripe, solo tarjeta): se confirma sola. Manual (el Administrador, en el taller): confirmado al guardar.
//  - Zelle o cheque que informa el cliente con su comprobante: «Por confirmar» hasta que el Administrador lo revisa en
//    A5 · Por confirmar (confirma, o rechaza con motivo y el cliente sube otro que lo reemplaza).
//  - Un pago manual confirmado se anula con motivo; uno de la pasarela no (su devolución se hace en Stripe).
//  - Nada se borra (RG-03); toda escritura va a la bitácora (RG-02); cada pago confirmado lleva recibo REC-0000 (C13).
//  - Un pago nunca puede pasar de lo que se debe (contando los que esperan confirmación).
import { Prisma } from '@prisma/client';
import { env } from '../../../config/env.js';
import { prisma, type Db } from '../../../shared/infrastructure/prisma.js';
import { registrarBitacora } from '../../../shared/infrastructure/bitacora.js';
import { avisoAlCliente, avisosAlTaller, enviarCorreos, guardarAvisos, type Aviso } from '../../../shared/infrastructure/avisos.js';
import type { Correo } from '../../../shared/infrastructure/correo.js';
import { comprobanteValido, type AlmacenArchivos, type ArchivoSubido } from '../../../shared/infrastructure/archivos.js';
import type { Pasarela, ResultadoPago } from '../../../shared/infrastructure/pasarela.js';
import { logger } from '../../../shared/infrastructure/logger.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import { dinero } from '../domain/cotizacion.js';
import { hoyNegocio } from '../domain/calendario.js';
import { siguienteCodigoPedido } from './atencion.js';
import { siguienteRecibo } from './recibos.js';

interface Quien { usuarioId: number; ip?: string }
const error = (m: string, status = 400, errores?: Record<string, string>) => new ReglaNegocioError(m, status, errores);
const num = (d: { toString(): string } | null | undefined) => (d == null ? 0 : Number(d.toString()));
const r2 = (n: number) => Math.round(n * 100) / 100;
const D = (n: number) => new Prisma.Decimal(r2(n));
const SEGUNDOS_ENLACE = 15 * 60;
const CENTAVO = 0.005;

export const METODOS_MANUALES = ['efectivo', 'cheque', 'zelle', 'transferencia', 'tarjeta'] as const;
export type MetodoManual = (typeof METODOS_MANUALES)[number];
export const METODOS_INFORMADOS = ['zelle', 'cheque'] as const;
export type MetodoInformado = (typeof METODOS_INFORMADOS)[number];
/** Pedidos que ya no reciben pagos. */
const SIN_COBRO = ['Cancelado', 'Cerrado'];
const METODO: Record<string, string> = { efectivo: 'Efectivo', cheque: 'Cheque', zelle: 'Zelle', transferencia: 'Transferencia', tarjeta: 'Tarjeta' };

const nombreCliente = (c: { tipoPersona: string; razonSocial: string | null; nombres: string; apellidos: string }) =>
  c.tipoPersona === 'empresa' && c.razonSocial ? c.razonSocial : `${c.nombres} ${c.apellidos}`.trim();

// ---------------------------------------------------------------- La cuenta de un pedido

/** Total, pagado (confirmados), por confirmar, saldo y lo que todavía se puede cobrar o informar. */
export function cuenta(total: number, adelanto: number, pagos: { monto: Prisma.Decimal; estado: string }[]) {
  const suma = (estado: string) => r2(pagos.filter((p) => p.estado === estado).reduce((a, p) => a + num(p.monto), 0));
  const pagado = suma('Confirmado');
  const porConfirmar = suma('Por confirmar');
  return {
    total, adelanto, pagado, porConfirmar,
    saldo: r2(Math.max(0, total - pagado)),
    /** Lo que falta sin contar lo que espera confirmación: el tope de un pago nuevo. */
    disponible: r2(Math.max(0, total - pagado - porConfirmar)),
    faltaAdelanto: adelanto > 0 && pagado + CENTAVO < adelanto,
  };
}
type Cuenta = ReturnType<typeof cuenta>;

/** Mientras no termine de pagar el adelanto, lo que paga es adelanto; después, saldo. */
const conceptoDe = (c: Cuenta) => (c.faltaAdelanto ? 'adelanto' : 'saldo');

/** Bloquea el pedido hasta el final de la transacción: dos cobros a la vez no pueden pasar el saldo. */
const bloquearPedido = (tx: Db, id: number) => tx.$queryRaw`SELECT id FROM pedido WHERE id = ${id} FOR UPDATE`;

async function cuentaDelPedido(tx: Db, pedidoId: number) {
  const p = await tx.pedido.findUniqueOrThrow({
    where: { id: pedidoId },
    include: { pagos: true, cotizacion: true, cliente: true, solicitud: { select: { id: true, codigo: true } } },
  });
  return { p, c: cuenta(num(p.cotizacion?.total), num(p.cotizacion?.adelanto), p.pagos) };
}

// ---------------------------------------------------------------- Cómo se ve un pago

const incluirPago = {
  pedido: { select: { id: true, codigo: true, estado: true } },
  cotizacion: {
    select: {
      codigo: true, total: true, adelanto: true,
      solicitud: { select: { codigo: true, cliente: { select: { tipoPersona: true, razonSocial: true, nombres: true, apellidos: true } } } },
    },
  },
  registrador: { select: { nombre: true, nombreUsuario: true, rol: { select: { nombre: true } } } },
  revisor: { select: { nombre: true, nombreUsuario: true } },
  anulador: { select: { nombre: true, nombreUsuario: true } },
  reemplazadoPor: { select: { id: true, estado: true } },
} satisfies Prisma.PagoInclude;
type PagoCompleto = Prisma.PagoGetPayload<{ include: typeof incluirPago }>;

const quienEs = (u: { nombre: string | null; nombreUsuario: string } | null) => (u ? u.nombre ?? u.nombreUsuario : null);
const ORIGEN: Record<string, string> = { pasarela: 'Pasarela', cliente: 'Cliente', conductor: 'Conductor', local: 'Manual', visita: 'Manual' };

/** Para A5: todo lo del pago, con el cliente y la cuenta de su pedido (sin costos internos). */
function pagoAdmin(x: PagoCompleto, c: Cuenta | undefined) {
  return {
    id: x.id, pedido: x.pedido?.codigo ?? null, estadoPedido: x.pedido?.estado ?? null,
    cotizacion: x.cotizacion.codigo, solicitud: x.cotizacion.solicitud.codigo, cliente: nombreCliente(x.cotizacion.solicitud.cliente),
    concepto: x.concepto, monto: num(x.monto), metodo: x.metodo, metodoNombre: METODO[x.metodo] ?? x.metodo,
    origen: x.origen, origenNombre: ORIGEN[x.origen] ?? x.origen, pasarela: x.origen === 'pasarela',
    estado: x.estado, detalle: x.detalle, referencia: x.referencia, recibo: x.recibo, comprobante: Boolean(x.comprobanteRuta),
    fecha: x.fecha.toISOString(),
    registradoPor: { nombre: quienEs(x.registrador), rol: x.registrador.rol.nombre },
    revision: x.fechaRevision ? { por: quienEs(x.revisor), fecha: x.fechaRevision.toISOString(), motivo: x.motivoRechazo } : null,
    anulacion: x.fechaAnulacion ? { por: quienEs(x.anulador), fecha: x.fechaAnulacion.toISOString(), motivo: x.motivoAnulacion } : null,
    reemplazaA: x.reemplazaId, reemplazadoPor: x.reemplazadoPor?.id ?? null,
    cuentaPedido: c ? { total: c.total, pagado: c.pagado, porConfirmar: c.porConfirmar, saldo: c.saldo } : null,
  };
}

/** Las cuentas de los pedidos de una lista de pagos, con una sola consulta. */
async function cuentasDePedidos(pedidoIds: number[]) {
  const ids = [...new Set(pedidoIds)];
  if (!ids.length) return new Map<number, Cuenta>();
  const pedidos = await prisma.pedido.findMany({ where: { id: { in: ids } }, include: { pagos: true, cotizacion: true } });
  return new Map(pedidos.map((p) => [p.id, cuenta(num(p.cotizacion?.total), num(p.cotizacion?.adelanto), p.pagos)]));
}

async function listaAdmin(where: Prisma.PagoWhereInput, orden: Prisma.SortOrder) {
  const pagos = await prisma.pago.findMany({ where, include: incluirPago, orderBy: [{ fecha: orden }, { id: orden }] });
  const cuentas = await cuentasDePedidos(pagos.flatMap((x) => (x.pedidoId ? [x.pedidoId] : [])));
  return pagos.map((x) => pagoAdmin(x, x.pedidoId ? cuentas.get(x.pedidoId) : undefined));
}

// ---------------------------------------------------------------- A5 · Administrador

/** Pestaña «Por confirmar»: lo que informó el cliente (Zelle, cheque) o cobró el conductor; los más antiguos primero. */
export const pagosPorConfirmar = () => listaAdmin({ estado: 'Por confirmar' }, 'asc');

/** Pestaña «Confirmados» (y los que se anularon después), con filtro por origen. Los más recientes primero. */
export function pagosConfirmados(origen?: 'pasarela' | 'manual') {
  return listaAdmin({
    estado: { in: ['Confirmado', 'Anulado'] },
    ...(origen === 'pasarela' ? { origen: 'pasarela' } : origen === 'manual' ? { origen: { not: 'pasarela' } } : {}),
  }, 'desc');
}

/**
 * Pestaña «Saldos pendientes»: pedidos que aún deben algo (sin los que tienen un pago por confirmar: ese dinero ya se
 * informó) y cotizaciones aceptadas que esperan su adelanto (todavía sin pedido: nace al pagarlo).
 */
export async function saldosPendientes() {
  const [pedidos, sinPedido] = await Promise.all([
    prisma.pedido.findMany({
      where: { estado: { notIn: SIN_COBRO } },
      include: { pagos: { orderBy: { fecha: 'asc' } }, cotizacion: true, cliente: true, solicitud: { select: { codigo: true } } },
      orderBy: { fechaCreacion: 'asc' },
    }),
    prisma.cotizacion.findMany({
      where: { estado: 'Aceptada: pendiente de adelanto', pedido: null },
      include: { solicitud: { select: { codigo: true, cliente: true } } },
      orderBy: { fechaRespuesta: 'asc' },
    }),
  ]);
  const filas = pedidos.flatMap((p) => {
    const c = cuenta(num(p.cotizacion?.total), num(p.cotizacion?.adelanto), p.pagos);
    if (c.saldo <= 0 || c.porConfirmar > 0) return [];
    return [{
      pedido: p.codigo, cotizacion: p.cotizacion?.codigo ?? null, solicitud: p.solicitud.codigo, cliente: nombreCliente(p.cliente),
      estadoPedido: p.estado, ...c, debe: c.faltaAdelanto ? r2(c.adelanto - c.pagado) : c.saldo,
      pagos: p.pagos.filter((x) => x.estado === 'Confirmado').map((x) => ({
        concepto: x.concepto, metodo: x.metodo, origen: x.origen, monto: num(x.monto), fecha: (x.fechaRevision ?? x.fecha).toISOString(), recibo: x.recibo,
      })),
    }];
  });
  const esperanAdelanto = sinPedido.map((t) => {
    const c = cuenta(num(t.total), num(t.adelanto), []);
    return {
      pedido: null, cotizacion: t.codigo, solicitud: t.solicitud.codigo, cliente: nombreCliente(t.solicitud.cliente),
      estadoPedido: 'Cotización aceptada', ...c, debe: c.adelanto, pagos: [],
    };
  });
  return [...esperanAdelanto, ...filas];
}

/** Indicadores de A5: por confirmar, cobrado hoy (día del negocio) y saldo por cobrar. */
export async function resumenPagos() {
  const hoy = hoyNegocio();
  const [porConfirmar, confirmados, saldos] = await Promise.all([
    prisma.pago.findMany({ where: { estado: 'Por confirmar' }, select: { monto: true } }),
    prisma.pago.findMany({ where: { estado: 'Confirmado', OR: [{ fecha: { gte: new Date(Date.now() - 2 * 86_400_000) } }, { fechaRevision: { gte: new Date(Date.now() - 2 * 86_400_000) } }] }, select: { monto: true, fecha: true, fechaRevision: true } }),
    saldosPendientes(),
  ]);
  const deHoy = confirmados.filter((x) => hoyNegocio(x.fechaRevision ?? x.fecha) === hoy);
  const suma = (xs: { monto: Prisma.Decimal }[]) => r2(xs.reduce((a, x) => a + num(x.monto), 0));
  return {
    porConfirmar: { cantidad: porConfirmar.length, monto: suma(porConfirmar) },
    cobradoHoy: { cantidad: deHoy.length, monto: suma(deHoy) },
    saldoPorCobrar: { cantidad: saldos.length, monto: r2(saldos.reduce((a, s) => a + s.debe, 0)) },
  };
}

/** Aviso al cliente de un pago confirmado, con su recibo (RG-05). */
async function avisoConfirmado(tx: Db, clienteId: number, solicitudId: number, pedido: string, monto: number, metodo: string, recibo: string, saldo: number) {
  const resto = saldo > 0 ? `Su saldo ahora es ${dinero(saldo)}.` : 'Su pedido quedó pagado por completo.';
  return avisoAlCliente(tx, clienteId, {
    solicitudId, tipo: 'pago_confirmado', titulo: `Pago confirmado · recibo ${recibo}`,
    mensaje: `Confirmamos su pago de ${dinero(monto)} (${(METODO[metodo] ?? metodo).toLowerCase()}) del pedido ${pedido}. ${resto}`, enlace: `/cliente/pagos?pedido=${pedido}`,
  }, `Pago confirmado · recibo ${recibo}`, `Confirmamos su pago de ${dinero(monto)} (${(METODO[metodo] ?? metodo).toLowerCase()}) del pedido ${pedido}. Su recibo es el ${recibo}. ${resto}`);
}

export interface PagoManual { pedido?: string; cotizacion?: string; monto: number; metodo: MetodoManual; detalle?: string }

/**
 * «+ Registrar pago manual»: lo que el cliente pagó en el taller o fuera de la pasarela. Queda confirmado al guardar,
 * con recibo. Para una cotización que espera su adelanto, el pago debe cubrir el adelanto y genera el pedido (CU-C14).
 */
export async function registrarPagoManual(e: PagoManual, q: Quien, correo: Correo) {
  if (!e.pedido === !e.cotizacion) throw error('Elija el pedido (o la cotización aceptada) al que corresponde el pago.');
  const monto = r2(e.monto);
  const detalle = e.detalle?.trim() || null;
  const ahora = new Date();

  const r = await prisma.$transaction(async (tx) => {
    let pedidoId: number;
    let pedido: string;
    let avisos: Aviso[] = [];
    if (e.pedido) {
      const ped = await tx.pedido.findUnique({ where: { codigo: e.pedido } });
      if (!ped) throw error('No encontramos ese pedido.', 404);
      await bloquearPedido(tx, ped.id);
      const { p, c } = await cuentaDelPedido(tx, ped.id);
      if (SIN_COBRO.includes(p.estado)) throw error(`El pedido ${p.codigo} está ${p.estado.toLowerCase()}: ya no recibe pagos.`, 409);
      if (c.disponible <= 0) throw error(c.porConfirmar > 0 ? `El pedido ${p.codigo} tiene un pago por confirmar que cubre lo que debe: revíselo primero.` : `El pedido ${p.codigo} ya está pagado.`, 409);
      if (monto > c.disponible + CENTAVO) throw error(`No puede ser mayor que lo que debe el pedido (${dinero(c.disponible)}).`, 400, { monto: `Máximo ${dinero(c.disponible)}.` });
      pedidoId = p.id; pedido = p.codigo;
      const concepto = conceptoDe(c);
      const recibo = await siguienteRecibo(tx);
      const pago = await tx.pago.create({
        data: { cotizacionId: p.cotizacionId!, pedidoId, concepto, monto: D(monto), metodo: e.metodo, origen: 'local', estado: 'Confirmado', detalle, recibo, registradoPor: q.usuarioId, revisadoPor: q.usuarioId, fechaRevision: ahora },
      });
      await registrarBitacora(tx, {
        usuarioId: q.usuarioId, modulo: 'comercial', accion: 'pago_registrado', entidad: 'pago', entidadId: pago.id,
        valorNuevo: { pedido, concepto, monto, metodo: e.metodo, origen: 'local', estado: 'Confirmado', detalle, recibo, saldoAntes: c.saldo, saldoDespues: r2(c.saldo - monto) }, ip: q.ip,
      });
      avisos = await avisoConfirmado(tx, p.clienteId, p.solicitudId, pedido, monto, e.metodo, recibo, r2(c.saldo - monto));
      await guardarAvisos(tx, avisos);
      return { id: pago.id, recibo, pedido, saldo: r2(c.saldo - monto), pedidoNuevo: false, avisos };
    }

    // Cotización aceptada que espera el adelanto: con este pago nace el pedido.
    const cot = await tx.cotizacion.findUnique({
      where: { codigo: e.cotizacion! },
      include: { pedido: true, solicitud: { include: { cliente: true, muebles: { orderBy: { orden: 'asc' }, include: { tipoMueble: true } } } } },
    });
    if (!cot) throw error('No encontramos esa cotización.', 404);
    await tx.$queryRaw`SELECT id FROM cotizacion WHERE id = ${cot.id} FOR UPDATE`;
    const vigente = await tx.cotizacion.findUniqueOrThrow({ where: { id: cot.id }, include: { pedido: true } });
    if (vigente.estado !== 'Aceptada: pendiente de adelanto' || vigente.pedido) throw error('Esta cotización no está esperando su adelanto.', 409);
    const total = num(cot.total);
    const adelanto = num(cot.adelanto);
    if (monto + CENTAVO < adelanto) throw error(`Para generar el pedido el pago debe cubrir el adelanto (${dinero(adelanto)}).`, 400, { monto: `Mínimo ${dinero(adelanto)}.` });
    if (monto > total + CENTAVO) throw error(`No puede ser mayor que el total de la cotización (${dinero(total)}).`, 400, { monto: `Máximo ${dinero(total)}.` });
    const s = cot.solicitud;
    pedido = await siguienteCodigoPedido(tx);
    const descripcion = s.muebles.map((m) => `${m.cantidad > 1 ? `${m.cantidad} × ` : ''}${m.tipoMueble.nombre}`).join(', ').slice(0, 120);
    // CU-C14: el mueble sigue en la casa del cliente → «Esperando mueble» hasta que el taller lo recibe.
    const nuevo = await tx.pedido.create({ data: { codigo: pedido, solicitudId: s.id, clienteId: s.clienteId, estado: 'Esperando mueble', descripcion, cotizacionId: cot.id } });
    pedidoId = nuevo.id;
    await tx.cotizacion.update({ where: { id: cot.id }, data: { estado: 'Aceptada' } });
    const recibo = await siguienteRecibo(tx);
    const pago = await tx.pago.create({
      data: { cotizacionId: cot.id, pedidoId, concepto: 'adelanto', monto: D(monto), metodo: e.metodo, origen: 'local', estado: 'Confirmado', detalle, recibo, registradoPor: q.usuarioId, revisadoPor: q.usuarioId, fechaRevision: ahora },
    });
    await registrarBitacora(tx, {
      usuarioId: q.usuarioId, modulo: 'comercial', accion: 'cotizacion_aceptada', entidad: 'cotizacion', entidadId: cot.id,
      valorAnterior: { estado: 'Aceptada: pendiente de adelanto' }, valorNuevo: { estado: 'Aceptada', pedido, adelantoPagado: monto }, ip: q.ip,
    });
    await registrarBitacora(tx, {
      usuarioId: q.usuarioId, modulo: 'comercial', accion: 'pedido_generado', entidad: 'pedido', entidadId: nuevo.id,
      valorNuevo: { codigo: pedido, solicitud: s.codigo, cotizacion: cot.codigo, estado: 'Esperando mueble', total, adelanto: monto }, ip: q.ip,
    });
    await registrarBitacora(tx, {
      usuarioId: q.usuarioId, modulo: 'comercial', accion: 'pago_registrado', entidad: 'pago', entidadId: pago.id,
      valorNuevo: { pedido, concepto: 'adelanto', monto, metodo: e.metodo, origen: 'local', estado: 'Confirmado', detalle, recibo }, ip: q.ip,
    });
    const saldo = r2(total - monto);
    avisos = [
      ...(await avisoAlCliente(tx, s.clienteId, {
        solicitudId: s.id, tipo: 'pedido_generado', titulo: `Su pedido ${pedido} está en marcha`,
        mensaje: `Recibimos su adelanto de ${dinero(monto)}. Aceptó la cotización ${cot.codigo} (total ${dinero(total)}).`, enlace: '/cliente/pedidos',
      }, `Su pedido ${pedido} está en marcha`, `Hola ${s.cliente.nombres}: recibimos su adelanto de ${dinero(monto)} por la cotización ${cot.codigo} (total ${dinero(total)}). Su pedido es el ${pedido} y su recibo el ${recibo}.${s.traslado === 'delivery' ? ' Elija el día del recojo desde su cuenta de GARWEB.' : ''}`)),
      ...(await avisoConfirmado(tx, s.clienteId, s.id, pedido, monto, e.metodo, recibo, saldo)),
    ];
    await guardarAvisos(tx, avisos);
    return { id: pago.id, recibo, pedido, saldo, pedidoNuevo: true, avisos };
  });
  await enviarCorreos(correo, r.avisos);
  const { avisos: _a, ...resto } = r;
  return resto;
}

async function pagoParaRevisar(tx: Db, id: number) {
  const x = await tx.pago.findUnique({ where: { id }, select: { pedidoId: true } });
  if (!x) throw error('No encontramos ese pago.', 404);
  if (x.pedidoId) await bloquearPedido(tx, x.pedidoId);
  return tx.pago.findUniqueOrThrow({ where: { id }, include: { pedido: true } });
}

/** «Confirmar: recibí el dinero»: el pago por confirmar pasa a Confirmado y se emite su recibo. */
export async function confirmarPago(id: number, q: Quien, correo: Correo) {
  const r = await prisma.$transaction(async (tx) => {
    const x = await pagoParaRevisar(tx, id);
    if (x.estado !== 'Por confirmar') throw error(`Este pago ya está ${x.estado.toLowerCase()}.`, 409);
    if (!x.pedido) throw error('El pago no tiene pedido.', 409);
    const { c } = await cuentaDelPedido(tx, x.pedido.id);
    const monto = num(x.monto);
    if (c.pagado + monto > c.total + CENTAVO) throw error(`Confirmarlo pasaría el total del pedido (debe ${dinero(c.saldo)}). Recházelo con el motivo y pida el monto correcto.`, 409);
    const recibo = await siguienteRecibo(tx);
    const ahora = new Date();
    await tx.pago.update({ where: { id }, data: { estado: 'Confirmado', recibo, revisadoPor: q.usuarioId, fechaRevision: ahora } });
    const saldo = r2(c.saldo - monto);
    await registrarBitacora(tx, {
      usuarioId: q.usuarioId, modulo: 'comercial', accion: 'pago_confirmado', entidad: 'pago', entidadId: id,
      valorAnterior: { estado: 'Por confirmar' }, valorNuevo: { estado: 'Confirmado', recibo, pedido: x.pedido.codigo, monto, saldoDespues: saldo }, ip: q.ip,
    });
    const avisos = await avisoConfirmado(tx, x.pedido.clienteId, x.pedido.solicitudId, x.pedido.codigo, monto, x.metodo, recibo, saldo);
    await guardarAvisos(tx, avisos);
    return { id, estado: 'Confirmado', recibo, pedido: x.pedido.codigo, saldo, avisos };
  });
  await enviarCorreos(correo, r.avisos);
  const { avisos: _a, ...resto } = r;
  return resto;
}

/** Rechazar con motivo: el dinero no llegó o el comprobante no sirve. El cliente puede subir otro que lo reemplace. */
export async function rechazarPago(id: number, motivo: string, q: Quien, correo: Correo) {
  const r = await prisma.$transaction(async (tx) => {
    const x = await pagoParaRevisar(tx, id);
    if (x.estado !== 'Por confirmar') throw error(`Este pago ya está ${x.estado.toLowerCase()}.`, 409);
    await tx.pago.update({ where: { id }, data: { estado: 'Rechazado', motivoRechazo: motivo, revisadoPor: q.usuarioId, fechaRevision: new Date() } });
    await registrarBitacora(tx, {
      usuarioId: q.usuarioId, modulo: 'comercial', accion: 'pago_rechazado', entidad: 'pago', entidadId: id,
      valorAnterior: { estado: 'Por confirmar' }, valorNuevo: { estado: 'Rechazado', motivo, pedido: x.pedido?.codigo }, ip: q.ip,
    });
    const avisos = x.pedido ? await avisoAlCliente(tx, x.pedido.clienteId, {
      solicitudId: x.pedido.solicitudId, tipo: 'pago_rechazado', titulo: `No pudimos confirmar su pago del pedido ${x.pedido.codigo}`,
      mensaje: `Motivo: ${motivo}. Puede subir otro comprobante desde Pagos del pedido.`, enlace: `/cliente/pagos?pedido=${x.pedido.codigo}`,
    }, `No pudimos confirmar su pago del pedido ${x.pedido.codigo}`, `No pudimos confirmar su pago de ${dinero(num(x.monto))} (${(METODO[x.metodo] ?? x.metodo).toLowerCase()}) del pedido ${x.pedido.codigo}. Motivo: ${motivo}. Puede subir otro comprobante desde su cuenta de GARWEB o llamarnos.`) : [];
    await guardarAvisos(tx, avisos);
    return { id, estado: 'Rechazado', pedido: x.pedido?.codigo ?? null, avisos };
  });
  await enviarCorreos(correo, r.avisos);
  const { avisos: _a, ...resto } = r;
  return resto;
}

/** Anular un pago manual ya confirmado (p. ej. el banco devolvió el cheque): el saldo vuelve a subir. */
export async function anularPago(id: number, motivo: string, q: Quien, correo: Correo) {
  const r = await prisma.$transaction(async (tx) => {
    const x = await pagoParaRevisar(tx, id);
    if (x.estado !== 'Confirmado') throw error('Solo se anula un pago confirmado.', 409);
    if (x.origen === 'pasarela') throw error('Un pago de la pasarela no se anula aquí: su devolución se hace en Stripe.', 409);
    await tx.pago.update({ where: { id }, data: { estado: 'Anulado', motivoAnulacion: motivo, anuladoPor: q.usuarioId, fechaAnulacion: new Date() } });
    const saldo = x.pedido ? (await cuentaDelPedido(tx, x.pedido.id)).c.saldo : null;
    await registrarBitacora(tx, {
      usuarioId: q.usuarioId, modulo: 'comercial', accion: 'pago_anulado', entidad: 'pago', entidadId: id,
      valorAnterior: { estado: 'Confirmado', recibo: x.recibo }, valorNuevo: { estado: 'Anulado', motivo, pedido: x.pedido?.codigo, saldoDespues: saldo }, ip: q.ip,
    });
    const avisos = x.pedido ? await avisoAlCliente(tx, x.pedido.clienteId, {
      solicitudId: x.pedido.solicitudId, tipo: 'pago_anulado', titulo: `Se anuló un pago del pedido ${x.pedido.codigo}`,
      mensaje: `El pago de ${dinero(num(x.monto))} (recibo ${x.recibo}) se anuló. Motivo: ${motivo}. Su saldo es ${dinero(saldo ?? 0)}.`, enlace: `/cliente/pagos?pedido=${x.pedido.codigo}`,
    }, `Se anuló un pago del pedido ${x.pedido.codigo}`, `El pago de ${dinero(num(x.monto))} (recibo ${x.recibo}) del pedido ${x.pedido.codigo} se anuló. Motivo: ${motivo}. Su saldo ahora es ${dinero(saldo ?? 0)}. Si tiene dudas, llámenos.`) : [];
    await guardarAvisos(tx, avisos);
    return { id, estado: 'Anulado', pedido: x.pedido?.codigo ?? null, saldo, avisos };
  });
  await enviarCorreos(correo, r.avisos);
  const { avisos: _a, ...resto } = r;
  return resto;
}

/** Enlace temporal para ver el comprobante (los archivos son privados). El cliente solo ve los suyos (RG-07). */
export async function comprobanteDePago(id: number, almacen: AlmacenArchivos, usuarioCliente?: number) {
  const x = await prisma.pago.findUnique({ where: { id }, include: { pedido: true } });
  if (usuarioCliente != null) {
    const u = await prisma.usuario.findUnique({ where: { id: usuarioCliente } });
    if (!x || !u?.clienteId || x.pedido?.clienteId !== u.clienteId) throw error('No encontramos ese pago.', 404);
  }
  if (!x?.comprobanteRuta) throw error('Este pago no tiene comprobante.', 404);
  return { url: await almacen.urlTemporal(x.comprobanteRuta, SEGUNDOS_ENLACE), mime: x.comprobanteMime };
}

// ---------------------------------------------------------------- W5 · Cliente

async function pedidoDelCliente(usuarioId: number, codigo: string) {
  const u = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!u?.clienteId) throw error('Solo un cliente puede ver sus pagos.', 403);
  const p = await prisma.pedido.findUnique({
    where: { codigo },
    include: { cotizacion: true, cliente: true, pagos: { orderBy: [{ fecha: 'asc' }, { id: 'asc' }], include: { reemplazadoPor: { select: { id: true } } } } },
  });
  if (!p || p.clienteId !== u.clienteId) throw error('No encontramos ese pedido.', 404);
  return p;
}

/** W5: la cuenta del pedido, sus pagos (con su estado y motivo) y los recibos. Sin costos internos (RG-08). */
export async function misPagos(usuarioId: number, codigo: string, pasarela: Pasarela | null) {
  const p = await pedidoDelCliente(usuarioId, codigo);
  const c = cuenta(num(p.cotizacion?.total), num(p.cotizacion?.adelanto), p.pagos);
  const abierto = !SIN_COBRO.includes(p.estado);
  return {
    pedido: p.codigo, titulo: p.descripcion, estadoPedido: p.estado, cotizacion: p.cotizacion?.codigo ?? null, ...c,
    pagos: p.pagos.map((x) => ({
      id: x.id, concepto: x.concepto, monto: num(x.monto), metodo: x.metodo, metodoNombre: METODO[x.metodo] ?? x.metodo,
      enLinea: x.origen === 'pasarela', estado: x.estado, fecha: x.fecha.toISOString(), fechaRevision: x.fechaRevision?.toISOString() ?? null,
      detalle: x.detalle, recibo: x.recibo, comprobante: Boolean(x.comprobanteRuta),
      motivo: x.estado === 'Rechazado' ? x.motivoRechazo : x.estado === 'Anulado' ? x.motivoAnulacion : null,
      reemplazado: Boolean(x.reemplazadoPor), reemplazaA: x.reemplazaId,
    })),
    recibos: p.pagos.filter((x) => x.recibo && x.estado === 'Confirmado').map((x) => ({
      codigo: x.recibo!, concepto: x.concepto, monto: num(x.monto), fecha: (x.fechaRevision ?? x.fecha).toISOString(),
    })),
    /** Lo que puede pagar o informar ahora (el saldo menos lo que ya espera confirmación). */
    puedePagar: abierto && c.disponible > 0,
    pagoEnLinea: Boolean(pasarela) && abierto && c.disponible > 0,
  };
}

export interface PagoInformado { metodo: MetodoInformado; monto: number; detalle?: string; reemplaza?: number }

/**
 * El cliente informa un pago por Zelle (captura obligatoria) o cheque (foto opcional). Queda «Por confirmar» y el
 * Administrador lo revisa en A5. Si reemplaza a uno rechazado, se enlazan (el rechazado se conserva, RG-03).
 */
export async function informarPago(usuarioId: number, codigo: string, e: PagoInformado, archivo: ArchivoSubido | undefined, deps: { almacen: AlmacenArchivos; correo: Correo }, ip?: string) {
  const p = await pedidoDelCliente(usuarioId, codigo);
  if (SIN_COBRO.includes(p.estado)) throw error(`Su pedido está ${p.estado.toLowerCase()}: ya no recibe pagos.`, 409);
  if (e.metodo === 'zelle' && !archivo) throw error('Suba la captura del envío por Zelle.', 400, { comprobante: 'Suba la captura del envío por Zelle.' });
  if (archivo && !(await comprobanteValido(archivo))) throw error(`«${archivo.originalname}» no es un JPG, PNG o PDF de hasta 5 MB.`, 400, { comprobante: 'Suba un JPG, PNG o PDF de hasta 5 MB.' });
  const monto = r2(e.monto);
  const ruta = archivo ? await deps.almacen.guardar(archivo, `pagos/${p.codigo}`) : null;

  try {
    const r = await prisma.$transaction(async (tx) => {
      await bloquearPedido(tx, p.id);
      const { c } = await cuentaDelPedido(tx, p.id);
      if (c.disponible <= 0) throw error(c.porConfirmar > 0 ? 'Ya informó un pago que cubre lo que debe: espere a que el taller lo revise.' : 'Su pedido ya está pagado.', 409);
      if (monto > c.disponible + CENTAVO) throw error(`No puede ser mayor que lo que debe (${dinero(c.disponible)}).`, 400, { monto: `Máximo ${dinero(c.disponible)}.` });
      if (e.reemplaza != null) {
        const viejo = await tx.pago.findUnique({ where: { id: e.reemplaza }, include: { reemplazadoPor: true } });
        if (!viejo || viejo.pedidoId !== p.id || viejo.estado !== 'Rechazado') throw error('Solo se reemplaza un pago rechazado de este pedido.', 409);
        if (viejo.reemplazadoPor) throw error('Ese pago ya fue reemplazado.', 409);
      }
      const concepto = conceptoDe(c);
      const detalle = e.detalle?.trim() || null;
      const pago = await tx.pago.create({
        data: {
          cotizacionId: p.cotizacionId!, pedidoId: p.id, concepto, monto: D(monto), metodo: e.metodo, origen: 'cliente', estado: 'Por confirmar',
          detalle, comprobanteRuta: ruta, comprobanteMime: archivo?.mimetype ?? null, reemplazaId: e.reemplaza ?? null, registradoPor: usuarioId,
        },
      });
      await registrarBitacora(tx, {
        usuarioId, modulo: 'comercial', accion: 'pago_informado', entidad: 'pago', entidadId: pago.id,
        valorNuevo: { pedido: p.codigo, concepto, monto, metodo: e.metodo, estado: 'Por confirmar', detalle, comprobante: Boolean(ruta), reemplaza: e.reemplaza ?? null }, ip,
      });
      const avisos = await avisosAlTaller(tx, {
        tipo: 'pago_por_confirmar', titulo: `Pago por confirmar · ${p.codigo}`,
        mensaje: `${nombreCliente(p.cliente)} informó un pago de ${dinero(monto)} por ${METODO[e.metodo]}. Revíselo en Pagos › Por confirmar.`, enlace: '/admin/pagos',
      });
      await guardarAvisos(tx, avisos);
      return { id: pago.id, estado: 'Por confirmar', concepto, monto, avisos };
    });
    await enviarCorreos(deps.correo, r.avisos);
    const { avisos: _a, ...resto } = r;
    return resto;
  } catch (err) {
    // Si no se registró el pago, el comprobante no queda huérfano.
    if (ruta) await deps.almacen.eliminar(ruta).catch(() => undefined);
    throw err;
  }
}

const sinPasarela = () => error('El pago en línea todavía no está disponible. Pague por Zelle, cheque o en el taller.', 503);

/** W5 · «Pagar con tarjeta»: abre Stripe Checkout por lo que debe (saldo menos lo que espera confirmación). */
export async function iniciarPagoEnLinea(usuarioId: number, codigo: string, pasarela: Pasarela | null) {
  if (!pasarela) throw sinPasarela();
  const p = await pedidoDelCliente(usuarioId, codigo);
  if (SIN_COBRO.includes(p.estado)) throw error(`Su pedido está ${p.estado.toLowerCase()}: ya no recibe pagos.`, 409);
  const c = cuenta(num(p.cotizacion?.total), num(p.cotizacion?.adelanto), p.pagos);
  if (c.disponible <= 0) throw error(c.porConfirmar > 0 ? 'Ya informó un pago que cubre lo que debe: espere a que el taller lo revise.' : 'Su pedido ya está pagado.', 409);
  const concepto = conceptoDe(c);
  const volver = `${env.APP_URL}/cliente/pagos?pedido=${encodeURIComponent(p.codigo)}`;
  const sesion = await pasarela.crearSesion({
    monto: c.disponible,
    descripcion: `${concepto === 'adelanto' ? 'Adelanto' : 'Saldo'} del pedido ${p.codigo} · Garwood Tapicería`,
    email: p.cliente.email,
    metadata: { pedidoId: String(p.id), pedido: p.codigo, cotizacionId: String(p.cotizacionId), concepto, usuarioId: String(usuarioId) },
    exito: `${volver}&pago=ok`,
    cancelado: `${volver}&pago=cancelado`,
  });
  return { url: sesion.url };
}

/**
 * Registra el cobro de la pasarela para un pedido que ya existe (saldo, o adelanto pendiente). Igual que el adelanto de
 * W4: la `referencia` única hace que el cobro cuente una sola vez aunque llegue al volver y por el aviso de Stripe.
 */
export async function registrarCobroDePedido(p: ResultadoPago, correo: Correo) {
  if (!p.pagado || !p.referencia) return { estado: 'pendiente' as const, pedido: p.metadata.pedido ?? null, recibo: null };
  const previo = await prisma.pago.findUnique({ where: { referencia: p.referencia } });
  if (previo) return { estado: 'registrado' as const, pedido: p.metadata.pedido ?? null, recibo: previo.recibo };
  const pedidoId = Number(p.metadata.pedidoId);
  const usuarioId = Number(p.metadata.usuarioId);
  const concepto = p.metadata.concepto === 'adelanto' ? 'adelanto' : 'saldo';
  try {
    const r = await prisma.$transaction(async (tx) => {
      const ped = await tx.pedido.findUnique({ where: { id: pedidoId } });
      if (!ped || !usuarioId) throw error('El pago no corresponde a ningún pedido.', 404);
      await bloquearPedido(tx, ped.id);
      const { p: pedido, c } = await cuentaDelPedido(tx, ped.id);
      // Ya se cobró: se registra igual. Si pasa lo que debía (otro pago entró mientras pagaba), el taller lo devuelve.
      if (c.pagado + p.monto > c.total + CENTAVO) logger.warn({ pedido: pedido.codigo, cobrado: p.monto, saldo: c.saldo }, 'El cobro de la pasarela pasa el saldo del pedido');
      const recibo = await siguienteRecibo(tx);
      const ahora = new Date();
      const pago = await tx.pago.create({
        data: { cotizacionId: pedido.cotizacionId!, pedidoId: pedido.id, concepto, monto: D(p.monto), metodo: 'tarjeta', origen: 'pasarela', estado: 'Confirmado', referencia: p.referencia, recibo, registradoPor: usuarioId, fechaRevision: ahora },
      });
      const saldo = r2(Math.max(0, c.saldo - p.monto));
      await registrarBitacora(tx, {
        usuarioId, modulo: 'comercial', accion: 'pago_registrado', entidad: 'pago', entidadId: pago.id,
        valorNuevo: { pedido: pedido.codigo, concepto, monto: p.monto, metodo: 'tarjeta', origen: 'pasarela', estado: 'Confirmado', referencia: p.referencia, recibo, saldoDespues: saldo },
      });
      const avisos = await avisoConfirmado(tx, pedido.clienteId, pedido.solicitudId, pedido.codigo, p.monto, 'tarjeta', recibo, saldo);
      await guardarAvisos(tx, avisos);
      return { pedido: pedido.codigo, recibo, avisos };
    });
    await enviarCorreos(correo, r.avisos);
    return { estado: 'registrado' as const, pedido: r.pedido, recibo: r.recibo };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const ya = await prisma.pago.findUnique({ where: { referencia: p.referencia } });
      if (ya) return { estado: 'registrado' as const, pedido: p.metadata.pedido ?? null, recibo: ya.recibo };
    }
    throw e;
  }
}

/** Al volver de la pasarela: consulta la sesión y registra el cobro si se aprobó. */
export async function confirmarPagoEnLinea(usuarioId: number, codigo: string, sesion: string, pasarela: Pasarela | null, correo: Correo) {
  if (!pasarela) throw sinPasarela();
  const p = await pedidoDelCliente(usuarioId, codigo);
  const r = await pasarela.consultarSesion(sesion);
  if (r.metadata.pedidoId !== String(p.id)) throw error('Ese pago no corresponde a este pedido.', 409);
  return registrarCobroDePedido(r, correo);
}
