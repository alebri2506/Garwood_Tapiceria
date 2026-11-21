// A2b Atender la cita en el local o la visita a domicilio (CU-C05 → C08 → C09 → C11 → C14 · decisiones L).
// La cotización se arma con el backend de A4 (mismas reglas); aquí: el traslado, la respuesta del cliente (con el pedido
// y el adelanto cobrado en la visita) y el recojo. Toda escritura queda en la bitácora (RG-02); nada se borra (RG-03).
import { Prisma } from '@prisma/client';
import { prisma, type Db } from '../../../shared/infrastructure/prisma.js';
import { parametroNumero } from '../../../shared/infrastructure/parametros.js';
import { registrarBitacora } from '../../../shared/infrastructure/bitacora.js';
import { avisoAlCliente, enviarCorreos, guardarAvisos, type Aviso } from '../../../shared/infrastructure/avisos.js';
import type { Correo } from '../../../shared/infrastructure/correo.js';
import type { AlmacenArchivos } from '../../../shared/infrastructure/archivos.js';
import type { Rutas } from '../../../shared/infrastructure/rutas.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import { hoyNegocio, leerFecha } from '../domain/calendario.js';
import { diaCerrado, enNY, leerRango, minutosDe, sumarDias, turnoBloqueado, turnosDe, type Bloqueo } from '../domain/agenda.js';
import { dinero } from '../domain/cotizacion.js';
import { SERVICIOS } from '../domain/solicitud.js';
import type { DireccionEntrada } from '../http/solicitud.schemas.js';
import { siguienteRecibo } from './recibos.js';
import { bloqueosEntre, choca, exigirDiaDeCita, ocupacion, reglasAgenda } from './citas.js';
import { idDireccion, revisarDireccion } from './direcciones.js';
import { calcular, cargarSolicitud, prepararEscritura, publicarEn, type CotizacionEntrada } from './cotizaciones.js';

interface Quien { usuarioId: number; ip?: string }
const error = (m: string, status = 400, errores?: Record<string, string>) => new ReglaNegocioError(m, status, errores);
const num = (d: { toString(): string } | null | undefined) => (d == null ? 0 : Number(d.toString()));
const D = (n: number) => new Prisma.Decimal(Math.round(n * 100) / 100);
const nombreCliente = (c: { tipoPersona: string; razonSocial: string | null; nombres: string; apellidos: string }) =>
  c.tipoPersona === 'empresa' && c.razonSocial ? c.razonSocial : `${c.nombres} ${c.apellidos}`.trim();

export const METODOS_PAGO = ['efectivo', 'tarjeta', 'zelle', 'cheque'] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];
export const MOTIVOS_RECHAZO = ['Precio', 'Plazo de entrega', 'Elegirá otro taller', 'Otro motivo'] as const;
const codigoPedido = (n: number) => `PED-${String(n).padStart(4, '0')}`;

/** La cita que se está atendiendo: la programada (o la recién atendida) más reciente de la solicitud. */
async function citaDe(solicitudId: number) {
  return prisma.cita.findFirst({ where: { solicitudId, estado: { in: ['Programada', 'En atención', 'Atendida'] } }, orderBy: { fechaHora: 'desc' }, include: { direccion: true } });
}

/**
 * «Empezar» (CU-C05 · decisiones L.2.10): la cita o la visita queda «En atención» y su solicitud también, para poder
 * armar la cotización. No pasa a «Atendida» hasta registrar la respuesta del cliente (al publicar). Si ya estaba en
 * curso, no cambia nada (se retoma).
 */
export async function empezarAtencion(codigo: string, q: Quien) {
  const s = await cargarSolicitud(codigo);
  const cita = await citaDe(s.id);
  if (!cita) throw error('Esta solicitud no tiene una cita ni una visita para atender.', 409);
  if (cita.estado === 'En atención' || (cita.estado === 'Atendida' && s.estado !== 'En espera de cita')) return { cita: cita.estado, solicitud: s.estado };
  if (cita.estado !== 'Programada') throw error('Esta cita ya tiene un resultado.', 409);
  // Solo el día de la cita. Una ya «En atención» se retoma cualquier día (arriba): empezó el día que correspondía.
  exigirDiaDeCita(cita);
  await prisma.$transaction(async (tx) => {
    await tx.cita.update({ where: { id: cita.id }, data: { estado: 'En atención' } });
    if (s.estado === 'En espera de cita') await tx.solicitud.update({ where: { id: s.id }, data: { estado: 'En atención' } });
    await registrarBitacora(tx, {
      usuarioId: q.usuarioId, modulo: 'comercial', accion: 'cita_en_atencion', entidad: 'cita', entidadId: cita.id,
      valorAnterior: { cita: 'Programada', solicitud: s.estado }, valorNuevo: { cita: 'En atención', solicitud: s.estado === 'En espera de cita' ? 'En atención' : s.estado }, ip: q.ip,
    });
  });
  return { cita: 'En atención', solicitud: s.estado === 'En espera de cita' ? 'En atención' : s.estado };
}

// ---------------------------------------------------------------- Datos de la atención
/** Paso 1 «Recibir y revisar»: lo que pidió el cliente, mueble por mueble, con sus fotos y videos. */
export async function datosAtencion(codigo: string, almacen?: AlmacenArchivos) {
  const s = await cargarSolicitud(codigo);
  const [cita, direcciones, cot, pedido] = await Promise.all([
    citaDe(s.id),
    prisma.direccion.findMany({ where: { clienteId: s.clienteId, activo: true, OR: [{ guardada: true }, { id: s.direccionId ?? -1 }] }, orderBy: [{ esPrincipal: 'desc' }, { id: 'asc' }] }),
    prisma.cotizacion.findFirst({ where: { solicitudId: s.id }, orderBy: { version: 'desc' } }),
    prisma.pedido.findFirst({ where: { solicitudId: s.id }, include: { recojo: true } }),
  ]);
  const cuando = cita ? enNY(cita.fechaHora) : null;
  return {
    solicitud: { codigo: s.codigo!, estado: s.estado, telaOpcion: s.telaOpcion, traslado: s.traslado, direccionId: s.direccionId },
    cliente: { nombre: nombreCliente(s.cliente), telefono: s.cliente.telefono, email: s.cliente.email },
    cita: cita && cuando ? {
      id: cita.id, tipo: cita.tipo, estado: cita.estado, fecha: cuando.fecha,
      // La visita sin hora fija (solo la franja) se guarda a las 00:00.
      hora: cita.tipo === 'domicilio' && cuando.hora === '00:00' ? null : cuando.hora, franja: cita.franja,
      direccion: cita.direccion?.direccion ?? null,
    } : null,
    muebles: await Promise.all(s.muebles.map(async (m) => ({
      id: m.id, titulo: `${m.cantidad > 1 ? `${m.cantidad} × ` : ''}${m.tipoMueble.nombre}`,
      servicio: SERVICIOS.find((x) => x.codigo === m.servicio)?.nombre.replace(' (desde una foto)', '') ?? m.servicio, medidas: m.medidas,
      medios: almacen ? await Promise.all(m.adjuntos.map(async (x) => ({ nombre: x.nombreOriginal, tipo: x.tipo, url: await almacen.urlTemporal(x.ruta, 3600).catch(() => null) }))) : [],
    }))),
    // Con su ubicación, para el mapa del paso Traslado (el mismo de W2).
    direcciones: direcciones.map((d) => ({ id: d.id, etiqueta: d.etiqueta, texto: d.direccion, referencia: d.referencia, ciudad: d.ciudad, principal: d.esPrincipal, latitud: d.latitud == null ? null : Number(d.latitud), longitud: d.longitud == null ? null : Number(d.longitud) })),
    cotizacion: cot ? { codigo: cot.codigo, estado: cot.estado, total: num(cot.total), adelanto: num(cot.adelanto) } : null,
    pedido: pedido ? {
      codigo: pedido.codigo, estado: pedido.estado,
      recojo: pedido.recojo ? { tipo: pedido.recojo.tipo, estado: pedido.recojo.estado, fecha: pedido.recojo.fecha?.toISOString().slice(0, 10) ?? null, hora: pedido.recojo.hora } : null,
    } : null,
  };
}

// ---------------------------------------------------------------- Traslado (paso 3)
/** Se define en la cita o la visita: delivery con su dirección, o lo lleva el cliente (CU-C07). */
export async function definirTraslado(codigo: string, traslado: 'delivery' | 'propio', direccion: DireccionEntrada | undefined, q: Quien) {
  const s = await cargarSolicitud(codigo);
  const cot = await prisma.cotizacion.findFirst({ where: { solicitudId: s.id }, orderBy: { version: 'desc' } });
  if (cot && cot.estado !== 'Borrador') throw error(`La cotización ${cot.codigo} ya se publicó: el traslado no se puede cambiar.`, 409);
  if (!['Nueva', 'En espera de cita', 'En atención', 'Atendida'].includes(s.estado)) throw error(`La solicitud está «${s.estado}»: el traslado ya no se cambia.`, 409);
  if (traslado === 'delivery' && !direccion) throw error('Indique la dirección de recojo y entrega.', 400, { direccion: 'Indique la dirección de recojo y entrega.' });
  await revisarDireccion(direccion, s.clienteId);
  await prisma.$transaction(async (tx) => {
    const direccionId = traslado === 'delivery' ? await idDireccion(tx, direccion, s.clienteId) : null;
    await tx.solicitud.update({ where: { id: s.id }, data: { traslado, direccionId } });
    await registrarBitacora(tx, {
      usuarioId: q.usuarioId, modulo: 'comercial', accion: 'traslado_definido', entidad: 'solicitud', entidadId: s.id,
      valorAnterior: { traslado: s.traslado, direccionId: s.direccionId }, valorNuevo: { traslado, direccionId }, ip: q.ip,
    });
  });
}

// ---------------------------------------------------------------- Respuesta del cliente (paso 5 · CU-C09, C11, C14)
export interface RespuestaEntrada {
  cotizacion: CotizacionEntrada;
  respuesta: 'acepta' | 'pensara' | 'rechaza';
  /** Acepta: paga el adelanto ahora (en la cita o la visita) o después desde su cuenta. */
  pagaAhora?: boolean;
  metodo?: MetodoPago;
  motivo?: (typeof MOTIVOS_RECHAZO)[number];
}

/** El siguiente PED-0000 (los pedidos de ejemplo tienen códigos propios: se sigue desde el mayor). */
export async function siguienteCodigoPedido(tx: Db) {
  const [r] = await tx.$queryRaw<{ n: number | null }[]>`SELECT MAX(CAST(SUBSTRING(codigo FROM 5) AS INTEGER)) AS n FROM pedido WHERE codigo ~ '^PED-[0-9]+$'`;
  return codigoPedido(Number(r?.n ?? 0) + 1);
}

/**
 * Lo que decide el cliente con el administrador presente. En todos los casos la cotización se publica primero (queda
 * con sus precios congelados y su vigencia):
 *  - «Lo pensará»: queda «Pendiente de respuesta» y le llega a su cuenta.
 *  - «No acepta»: «Rechazada» con motivo; la solicitud se cierra como Rechazada.
 *  - «Acepta» y paga después: «Aceptada: pendiente de adelanto» (el pedido nace cuando pague).
 *  - «Acepta» y paga ahora, o su adelanto es 0 %: «Aceptada», se genera el pedido y se registra el adelanto cobrado.
 */
export async function responderEnAtencion(codigo: string, r: RespuestaEntrada, q: Quien, rutas: Rutas, correo: Correo) {
  if (r.respuesta === 'rechaza' && !r.motivo) throw error('Elija el motivo del rechazo.', 400, { motivo: 'Elija el motivo del rechazo.' });
  const { s, p, existente, cerrados } = await prepararEscritura(codigo);
  const c = await calcular(s, r.cotizacion, p, rutas, existente ? { millas: existente.millas == null ? null : num(existente.millas) } : null, cerrados, true);
  const generaPedido = r.respuesta === 'acepta' && (c.adelanto === 0 || r.pagaAhora === true);
  if (generaPedido && c.adelanto > 0 && !r.metodo) throw error('Elija el medio de pago del adelanto.', 400, { metodo: 'Elija el medio de pago del adelanto.' });
  const [vigenciaDias, plazoAdelanto, cita] = await Promise.all([Promise.resolve(p.vigenciaDias), parametroNumero(prisma, 'pago.plazo_adelanto_dias'), citaDe(s.id)]);
  const vigencia = sumarDias(hoyNegocio(), vigenciaDias);
  const origen = cita?.tipo === 'domicilio' ? 'visita' : 'local';

  const resultado = await prisma.$transaction(async (tx) => {
    const cot = await publicarEn(tx, s, c, r.cotizacion, q, existente, vigencia);
    const ahora = new Date();
    const fecha = leerFecha(vigencia)!.toLocaleDateString('es-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    let avisos: Aviso[] = [];
    let estado = 'Pendiente de respuesta';
    let pedido: string | null = null;

    if (r.respuesta === 'pensara') {
      avisos = await avisoAlCliente(tx, s.clienteId, {
        solicitudId: s.id, tipo: 'cotizacion_publicada', titulo: `Su cotización ${cot.codigo} está lista`,
        mensaje: `Total ${dinero(c.total)}. Puede aceptarla o rechazarla hasta el ${fecha}.`, enlace: '/cliente/pedidos/solicitudes',
      }, `Su cotización ${cot.codigo} está lista`, `Hola ${s.cliente.nombres}: le dejamos la cotización de su solicitud ${s.codigo}. Total: ${dinero(c.total)}. Vigente hasta el ${fecha}. Revísela en su cuenta de GARWEB.`);
    } else if (r.respuesta === 'rechaza') {
      estado = 'Rechazada';
      await tx.cotizacion.update({ where: { id: cot.id }, data: { estado, motivoRechazo: r.motivo!, medioRespuesta: 'En persona', fechaRespuesta: ahora } });
      await tx.solicitud.update({ where: { id: s.id }, data: { estado: 'Rechazada' } });
      await registrarBitacora(tx, {
        usuarioId: q.usuarioId, modulo: 'comercial', accion: 'cotizacion_rechazada', entidad: 'cotizacion', entidadId: cot.id,
        valorAnterior: { estado: 'Pendiente de respuesta' }, valorNuevo: { estado, motivo: r.motivo, medio: 'En persona' }, ip: q.ip,
      });
    } else if (!generaPedido) {
      estado = 'Aceptada: pendiente de adelanto';
      await tx.cotizacion.update({ where: { id: cot.id }, data: { estado, medioRespuesta: 'En persona', fechaRespuesta: ahora } });
      await registrarBitacora(tx, {
        usuarioId: q.usuarioId, modulo: 'comercial', accion: 'cotizacion_aceptada', entidad: 'cotizacion', entidadId: cot.id,
        valorAnterior: { estado: 'Pendiente de respuesta' }, valorNuevo: { estado, medio: 'En persona', adelanto: c.adelanto }, ip: q.ip,
      });
      const limite = leerFecha(sumarDias(hoyNegocio(), plazoAdelanto))!.toLocaleDateString('es-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
      avisos = await avisoAlCliente(tx, s.clienteId, {
        solicitudId: s.id, tipo: 'cotizacion_aceptada', titulo: `Aceptó la cotización ${cot.codigo}`,
        mensaje: `Total ${dinero(c.total)}. Pague el adelanto de ${dinero(c.adelanto)} hasta el ${limite} para que generemos su pedido.`, enlace: '/cliente/pedidos/solicitudes',
      }, `Aceptó la cotización ${cot.codigo}`, `Hola ${s.cliente.nombres}: registramos que aceptó la cotización ${cot.codigo} (total ${dinero(c.total)}). Pague el adelanto de ${dinero(c.adelanto)} hasta el ${limite} desde su cuenta o en el taller; con el pago generamos su pedido.`);
    } else {
      estado = 'Aceptada';
      await tx.cotizacion.update({ where: { id: cot.id }, data: { estado, medioRespuesta: 'En persona', fechaRespuesta: ahora } });
      pedido = await siguienteCodigoPedido(tx);
      const descripcion = s.muebles.map((m) => `${m.cantidad > 1 ? `${m.cantidad} × ` : ''}${m.tipoMueble.nombre}`).join(', ').slice(0, 120);
      // CU-C14: el mueble sigue en la casa del cliente → «Esperando mueble» hasta que el taller lo recibe.
      const nuevo = await tx.pedido.create({ data: { codigo: pedido, solicitudId: s.id, clienteId: s.clienteId, estado: 'Esperando mueble', descripcion, cotizacionId: cot.id } });
      if (c.adelanto > 0) {
        const pago = await tx.pago.create({ data: { cotizacionId: cot.id, pedidoId: nuevo.id, concepto: 'adelanto', monto: D(c.adelanto), metodo: r.metodo!, origen, estado: 'Confirmado', recibo: await siguienteRecibo(tx), registradoPor: q.usuarioId, revisadoPor: q.usuarioId, fechaRevision: ahora } });
        await registrarBitacora(tx, {
          usuarioId: q.usuarioId, modulo: 'comercial', accion: 'pago_registrado', entidad: 'pago', entidadId: pago.id,
          valorNuevo: { pedido, concepto: 'adelanto', monto: c.adelanto, metodo: r.metodo, origen, estado: 'Confirmado' }, ip: q.ip,
        });
      }
      await registrarBitacora(tx, {
        usuarioId: q.usuarioId, modulo: 'comercial', accion: 'cotizacion_aceptada', entidad: 'cotizacion', entidadId: cot.id,
        valorAnterior: { estado: 'Pendiente de respuesta' }, valorNuevo: { estado, medio: 'En persona', pedido }, ip: q.ip,
      });
      await registrarBitacora(tx, {
        usuarioId: q.usuarioId, modulo: 'comercial', accion: 'pedido_generado', entidad: 'pedido', entidadId: nuevo.id,
        valorNuevo: { codigo: pedido, solicitud: s.codigo, cotizacion: cot.codigo, estado: 'Esperando mueble', total: c.total, adelanto: c.adelanto }, ip: q.ip,
      });
      // Constancia para el cliente de lo que aceptó (ya no se firma la orden en la tablet · decisiones L).
      avisos = await avisoAlCliente(tx, s.clienteId, {
        solicitudId: s.id, tipo: 'pedido_generado', titulo: `Su pedido ${pedido} está en marcha`,
        mensaje: `Aceptó la cotización ${cot.codigo}: total ${dinero(c.total)}${c.adelanto > 0 ? `, adelanto ${dinero(c.adelanto)} pagado` : ''}.`, enlace: '/cliente/pedidos',
      }, `Su pedido ${pedido} está en marcha`, `Hola ${s.cliente.nombres}: registramos que aceptó la cotización ${cot.codigo} (total ${dinero(c.total)}${c.adelanto > 0 ? `, adelanto ${dinero(c.adelanto)} pagado en ${r.metodo}` : ''}). Su pedido es el ${pedido}; lo puede seguir en su cuenta de GARWEB.`);
    }
    await guardarAvisos(tx, avisos);
    return { cotizacion: cot.codigo, estado, pedido, avisos };
  });
  await enviarCorreos(correo, resultado.avisos);
  return {
    cotizacion: resultado.cotizacion, estado: resultado.estado, total: c.total, adelanto: c.adelanto, vigenciaHasta: vigencia,
    pedido: resultado.pedido, recojoPendiente: Boolean(resultado.pedido) && s.traslado === 'delivery',
  };
}

// ---------------------------------------------------------------- Recojo (último paso · decisiones L)
const enHora = (h: string, min: number) => {
  const t = +h.slice(0, 2) * 60 + +h.slice(3) + min;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/**
 * Horas de inicio del recojo: las mismas de la Agenda (turnos de `cita.duracion_min`, 30 min, en `agenda.turnos_*`),
 * porque es una sola agenda (decisiones L.2.9). El recojo dura `recojo.duracion_min` (1 h): solo se ofrecen los
 * inicios donde esa hora entera cabe antes del almuerzo o del cierre (9:30, 10:00, 10:30, 11:00 · 15:00, 15:30, 16:00).
 */
async function reglasRecojo() {
  const [duracion, diasMax, agenda] = await Promise.all([
    parametroNumero(prisma, 'recojo.duracion_min'), parametroNumero(prisma, 'recojo.dias_anticipacion_max'), reglasAgenda(),
  ]);
  const inicios = (rango: string) => turnosDe(rango, agenda.duracion).filter((h) => minutosDe(h) + duracion <= leerRango(rango).hasta);
  return { duracion, diasMax, turnos: [...inicios(agenda.rangoManana), ...inicios(agenda.rangoTarde)] };
}

/**
 * Horas para el recojo: lunes a sábado, cada 30 min como la Agenda, de `recojo.duracion_min`, hasta
 * `recojo.dias_anticipacion_max` días. Sin domingos, feriados ni bloqueos; sin cruzarse con citas, visitas ni otro
 * recojo (una sola agenda · un camión).
 */
export async function disponibilidadRecojo() {
  const { duracion, diasMax, turnos } = await reglasRecojo();
  const hoy = hoyNegocio();
  const hasta = sumarDias(hoy, diasMax);
  const ahora = enNY(new Date());
  // Una sola agenda sin cruces: otros recojos, citas en el local y visitas (con hora o por franja) ocupan la hora.
  const { franjas } = await reglasAgenda();
  const [bloqueos, ocupada] = await Promise.all([bloqueosEntre(hoy, hasta), ocupacion(hoy, hasta, {}, franjas)]);
  const dias = [];
  for (let f = hoy; f <= hasta; f = sumarDias(f, 1)) {
    if (leerFecha(f)!.getUTCDay() === 0) continue; // domingo
    const cerrado = diaCerrado(f, bloqueos as Bloqueo[]);
    dias.push({
      fecha: f,
      horas: turnos.map((h) => {
        const fin = enHora(h, duracion);
        const estado = (f === hoy && h <= ahora.hora) ? 'pasada'
          : cerrado || turnoBloqueado(f, h, bloqueos as Bloqueo[], duracion) ? 'cerrada'
            : choca(ocupada.get(f), minutosDe(h), minutosDe(h) + duracion) ? 'ocupada' : 'libre';
        return { inicio: h, fin, estado };
      }),
    });
  }
  return { duracionMin: duracion, dias };
}

export type RecojoEntrada = { tipo: 'agendado'; fecha: string; hora: string } | { tipo: 'en_visita' };

/** Define el recojo del pedido recién generado: agendado en una hora libre o hecho en la misma visita. */
export async function definirRecojo(codigoPedido: string, r: RecojoEntrada, q: Quien, correo: Correo) {
  const pedido = await prisma.pedido.findUnique({ where: { codigo: codigoPedido }, include: { solicitud: { include: { cliente: true } }, recojo: true } });
  if (!pedido) throw error('No encontramos ese pedido.', 404);
  if (pedido.recojo) throw error('Este pedido ya tiene su recojo definido.', 409);
  if (pedido.solicitud.traslado !== 'delivery') throw error('El cliente lleva el mueble al taller: no hay recojo.', 409);
  const { duracion } = await reglasRecojo();
  if (r.tipo === 'en_visita') {
    const cita = await citaDe(pedido.solicitudId);
    if (cita?.tipo !== 'domicilio') throw error('Solo en una visita a domicilio se puede llevar el mueble en el momento.', 409);
  } else {
    const dia = (await disponibilidadRecojo()).dias.find((d) => d.fecha === r.fecha);
    const hora = dia?.horas.find((h) => h.inicio === r.hora);
    if (!hora) throw error('Elija un día y una hora de la agenda del recojo.', 400);
    if (hora.estado !== 'libre') throw error(hora.estado === 'ocupada' ? 'Esa hora ya está tomada por otro recojo. Elija otra.' : 'Esa hora ya no está disponible. Elija otra.', 409);
  }
  let avisos: Aviso[] = [];
  try {
    await prisma.$transaction(async (tx) => {
      const nuevo = await tx.recojo.create({
        data: r.tipo === 'en_visita'
          ? { pedidoId: pedido.id, tipo: 'en_visita', fecha: leerFecha(hoyNegocio())!, hora: enNY(new Date()).hora, duracionMin: duracion, direccionId: pedido.solicitud.direccionId, estado: 'Realizado', registradoPor: q.usuarioId }
          : { pedidoId: pedido.id, tipo: 'agendado', fecha: leerFecha(r.fecha)!, hora: r.hora, duracionMin: duracion, direccionId: pedido.solicitud.direccionId, estado: 'Programado', registradoPor: q.usuarioId },
      });
      await registrarBitacora(tx, {
        usuarioId: q.usuarioId, modulo: 'despacho', accion: r.tipo === 'en_visita' ? 'recojo_en_visita' : 'recojo_agendado', entidad: 'recojo', entidadId: nuevo.id,
        valorNuevo: { pedido: pedido.codigo, ...(r.tipo === 'agendado' ? { fecha: r.fecha, hora: r.hora } : { estado: 'Realizado' }) }, ip: q.ip,
      });
      if (r.tipo === 'agendado') {
        const dia = leerFecha(r.fecha)!.toLocaleDateString('es-US', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
        avisos = await avisoAlCliente(tx, pedido.clienteId, {
          solicitudId: pedido.solicitudId, tipo: 'recojo_programado', titulo: `Recojo de su pedido ${pedido.codigo}`,
          mensaje: `Pasamos el ${dia} entre ${r.hora} y ${enHora(r.hora, duracion)}.`, enlace: '/cliente/pedidos',
        }, `Recojo de su pedido ${pedido.codigo}`, `Hola ${pedido.solicitud.cliente.nombres}: pasamos a recoger su mueble el ${dia} entre ${r.hora} y ${enHora(r.hora, duracion)}. Puede cambiarlo desde su cuenta.`);
        await guardarAvisos(tx, avisos);
      }
    });
  } catch (e) {
    // Dos personas eligieron la misma hora al mismo tiempo: gana la primera (índice único `recojo_una_por_hora`).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw error('Esa hora acaba de tomarse para otro recojo. Elija otra.', 409);
    throw e;
  }
  await enviarCorreos(correo, avisos);
  return pedido.solicitud.codigo!;
}

