// W4 Mi cotización: el cliente la revisa y la responde desde su cuenta (CU-C09, C11, C14).
// Ve qué se hará con cada mueble, la tela, el traslado, el total y el adelanto; nunca el sugerido ni el desglose (RG-08).
// Rechazar y aceptar sin adelanto (cliente con pedidos cerrados) funcionan; aceptar con adelanto espera la pasarela de
// pago (todavía no existe), así que el backend lo rechaza. Toda escritura va a la bitácora (RG-02); nada se borra (RG-03).
import { prisma } from '../../../shared/infrastructure/prisma.js';
import { registrarBitacora } from '../../../shared/infrastructure/bitacora.js';
import { avisoAlCliente, enviarCorreos, guardarAvisos, type Aviso } from '../../../shared/infrastructure/avisos.js';
import type { Correo } from '../../../shared/infrastructure/correo.js';
import type { AlmacenArchivos } from '../../../shared/infrastructure/archivos.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import { hoyNegocio } from '../domain/calendario.js';
import { dinero } from '../domain/cotizacion.js';
import { SERVICIOS } from '../domain/solicitud.js';
import { MOTIVOS_RECHAZO, definirRecojo, disponibilidadRecojo, siguienteCodigoPedido } from './atencion.js';

interface Quien { usuarioId: number; ip?: string }
const error = (m: string, status = 400, errores?: Record<string, string>) => new ReglaNegocioError(m, status, errores);
const num = (d: { toString(): string } | null | undefined) => (d == null ? 0 : Number(d.toString()));
const SEGUNDOS_ENLACE = 15 * 60;

async function clienteDe(usuarioId: number) {
  const u = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!u?.clienteId) throw error('Solo un cliente puede ver sus cotizaciones.', 403);
  return u.clienteId;
}

/** La última cotización publicada de una solicitud del cliente con sesión (RG-07). El borrador del taller no se ve. */
async function cargar(usuarioId: number, codigo: string) {
  const clienteId = await clienteDe(usuarioId);
  const s = await prisma.solicitud.findUnique({
    where: { codigo },
    include: {
      cliente: true, direccion: true,
      muebles: { orderBy: { orden: 'asc' }, include: { tipoMueble: true, adjuntos: { orderBy: { id: 'asc' } } } },
      cotizaciones: {
        where: { estado: { not: 'Borrador' } }, orderBy: { version: 'desc' }, take: 1,
        include: {
          pedido: { include: { recojo: true } },
          muebles: { include: { actividades: { orderBy: { orden: 'asc' } }, telas: { include: { material: true } } } },
        },
      },
    },
  });
  if (!s || s.clienteId !== clienteId) throw error('No encontramos esa solicitud.', 404);
  const cot = s.cotizaciones[0];
  if (!cot) throw error('Su cotización todavía no está lista. Le avisamos aquí y por correo cuando la tengamos.', 404);
  return { s, cot };
}

/** «Pendiente de respuesta» con la vigencia ya pasada se muestra (y se trata) como vencida. */
const estadoEfectivo = (estado: string, vigencia: string | null) =>
  estado === 'Pendiente de respuesta' && vigencia != null && vigencia < hoyNegocio() ? 'Vencida' : estado;

const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
const nombreServicio = (codigo: string) => SERVICIOS.find((x) => x.codigo === codigo)?.nombre.replace(' (desde una foto)', '') ?? codigo;

export async function verMiCotizacion(usuarioId: number, codigo: string, almacen: AlmacenArchivos) {
  const { s, cot } = await cargar(usuarioId, codigo);
  const vigencia = cot.vigenciaHasta?.toISOString().slice(0, 10) ?? null;
  const estado = estadoEfectivo(cot.estado, vigencia);
  const total = num(cot.total);
  const adelanto = num(cot.adelanto);
  const muebles = await Promise.all(s.muebles.map(async (m) => {
    const cm = cot.muebles.find((x) => x.solicitudMuebleId === m.id);
    const foto = m.adjuntos.find((a) => a.tipo === 'foto');
    const telas = (cm?.telas ?? []).map((t) => ({
      nombre: t.material.nombre, pattern: t.material.pattern, numeroColor: t.material.numeroColor, colorHex: t.material.colorHex,
    }));
    return {
      tipo: m.tipoMueble.nombre, cantidad: m.cantidad, servicio: nombreServicio(m.servicio),
      // Lo que se hará, sin horas, máquinas ni costos (RG-08).
      trabajos: (cm?.actividades ?? []).map((a) => a.nombre),
      telas,
      tela: telas.length ? null : s.telaOpcion === 'trae' ? 'Lo brinda usted' : s.telaOpcion === 'sin' ? 'No lleva tela' : null,
      precio: num(cm?.precioPropuesto),
      foto: foto ? await almacen.urlTemporal(foto.ruta, SEGUNDOS_ENLACE).catch(() => null) : null,
    };
  }));
  const pedido = cot.pedido;
  return {
    solicitud: s.codigo, codigo: cot.codigo, estado, nombre: s.cliente.nombres,
    publicada: cot.fechaPublicacion?.toISOString() ?? null, vigenciaHasta: vigencia,
    diasRestantes: vigencia && estado === 'Pendiente de respuesta' ? diasEntre(hoyNegocio(), vigencia) : null,
    muebles, transporte: num(cot.transporte), total, adelanto,
    adelantoPct: total > 0 ? Math.round((adelanto / total) * 100) : 0,
    traslado: s.traslado, direccion: s.direccion?.direccion ?? null,
    observaciones: (cot.observaciones ?? '').split('\n').map((x) => x.trim()).filter(Boolean),
    respuesta: cot.fechaRespuesta ? { fecha: cot.fechaRespuesta.toISOString(), medio: cot.medioRespuesta, motivo: cot.motivoRechazo } : null,
    pedido: pedido ? {
      codigo: pedido.codigo,
      recojo: pedido.recojo ? { tipo: pedido.recojo.tipo, fecha: pedido.recojo.fecha?.toISOString().slice(0, 10) ?? null, hora: pedido.recojo.hora } : null,
    } : null,
    // El recojo lo elige el cliente aquí solo si el pedido ya existe, es con delivery y aún no tiene uno.
    eligeRecojo: Boolean(pedido && !pedido.recojo && s.traslado === 'delivery'),
  };
}

export type RespuestaCliente =
  | { respuesta: 'rechaza'; motivo: (typeof MOTIVOS_RECHAZO)[number]; comentario?: string }
  | { respuesta: 'acepta'; comentario?: string };

/**
 * El cliente responde desde su cuenta (medio «Plataforma»). Solo mientras está «Pendiente de respuesta» y vigente.
 *  - Rechaza: «Rechazada» con motivo; la solicitud se cierra como Rechazada.
 *  - Acepta sin adelanto (0 %): «Aceptada» y se genera el pedido en «Esperando mueble».
 *  - Acepta con adelanto: necesita la pasarela de pago, que todavía no existe → 409.
 */
export async function responderMiCotizacion(usuarioId: number, codigo: string, r: RespuestaCliente, q: Quien, correo: Correo) {
  const { s, cot } = await cargar(usuarioId, codigo);
  const vigencia = cot.vigenciaHasta?.toISOString().slice(0, 10) ?? null;
  const estado = estadoEfectivo(cot.estado, vigencia);
  if (estado === 'Vencida') throw error('Esta cotización ya venció. Llámenos y la recalculamos con los precios de hoy.', 409);
  if (estado !== 'Pendiente de respuesta') throw error('Esta cotización ya fue respondida.', 409);
  const adelanto = num(cot.adelanto);
  if (r.respuesta === 'acepta' && adelanto > 0) {
    throw error('El pago del adelanto en línea todavía no está disponible. Llámenos al taller para aceptar su cotización.', 409);
  }
  const comentario = r.comentario?.trim() || null;
  const ahora = new Date();

  const resultado = await prisma.$transaction(async (tx) => {
    // Evita responder dos veces a la vez (dos pestañas): solo cambia si sigue pendiente.
    const nuevoEstado = r.respuesta === 'rechaza' ? 'Rechazada' : 'Aceptada';
    const cambio = await tx.cotizacion.updateMany({
      where: { id: cot.id, estado: 'Pendiente de respuesta' },
      data: { estado: nuevoEstado, medioRespuesta: 'Plataforma', fechaRespuesta: ahora, comentarioRespuesta: comentario, ...(r.respuesta === 'rechaza' ? { motivoRechazo: r.motivo } : {}) },
    });
    if (cambio.count === 0) throw error('Esta cotización ya fue respondida.', 409);
    let avisos: Aviso[] = [];
    let pedido: string | null = null;

    if (r.respuesta === 'rechaza') {
      await tx.solicitud.update({ where: { id: s.id }, data: { estado: 'Rechazada' } });
      await registrarBitacora(tx, {
        usuarioId: q.usuarioId, modulo: 'comercial', accion: 'cotizacion_rechazada', entidad: 'cotizacion', entidadId: cot.id,
        valorAnterior: { estado: 'Pendiente de respuesta' }, valorNuevo: { estado: nuevoEstado, motivo: r.motivo, comentario, medio: 'Plataforma' }, ip: q.ip,
      });
    } else {
      pedido = await siguienteCodigoPedido(tx);
      const descripcion = s.muebles.map((m) => `${m.cantidad > 1 ? `${m.cantidad} × ` : ''}${m.tipoMueble.nombre}`).join(', ').slice(0, 120);
      // CU-C14: el mueble sigue en la casa del cliente → «Esperando mueble» hasta que el taller lo recibe.
      const nuevo = await tx.pedido.create({ data: { codigo: pedido, solicitudId: s.id, clienteId: s.clienteId, estado: 'Esperando mueble', descripcion, cotizacionId: cot.id } });
      await registrarBitacora(tx, {
        usuarioId: q.usuarioId, modulo: 'comercial', accion: 'cotizacion_aceptada', entidad: 'cotizacion', entidadId: cot.id,
        valorAnterior: { estado: 'Pendiente de respuesta' }, valorNuevo: { estado: nuevoEstado, medio: 'Plataforma', comentario, pedido }, ip: q.ip,
      });
      await registrarBitacora(tx, {
        usuarioId: q.usuarioId, modulo: 'comercial', accion: 'pedido_generado', entidad: 'pedido', entidadId: nuevo.id,
        valorNuevo: { codigo: pedido, solicitud: s.codigo, cotizacion: cot.codigo, estado: 'Esperando mueble', total: num(cot.total), adelanto: 0 }, ip: q.ip,
      });
      // Constancia de lo que aceptó (RG-05: correo y notificación).
      avisos = await avisoAlCliente(tx, s.clienteId, {
        solicitudId: s.id, tipo: 'pedido_generado', titulo: `Su pedido ${pedido} está en marcha`,
        mensaje: `Aceptó la cotización ${cot.codigo}: total ${dinero(num(cot.total))}, sin adelanto.`, enlace: '/cliente/pedidos',
      }, `Su pedido ${pedido} está en marcha`, `Hola ${s.cliente.nombres}: registramos que aceptó la cotización ${cot.codigo} (total ${dinero(num(cot.total))}, sin adelanto). Su pedido es el ${pedido}; lo puede seguir en su cuenta de GARWEB.`);
      await guardarAvisos(tx, avisos);
    }
    return { estado: nuevoEstado, pedido, avisos };
  });
  await enviarCorreos(correo, resultado.avisos);
  return { cotizacion: cot.codigo, estado: resultado.estado, pedido: resultado.pedido, eligeRecojo: Boolean(resultado.pedido) && s.traslado === 'delivery' };
}

/** Horas libres del camión para que el cliente elija el recojo de su pedido. */
export const disponibilidadParaCliente = () => disponibilidadRecojo();

/** El cliente agenda el recojo de su propio pedido (las mismas reglas que en la visita: una hora libre, un recojo por hora). */
export async function agendarMiRecojo(usuarioId: number, codigo: string, r: { fecha: string; hora: string }, q: Quien, correo: Correo) {
  const { cot } = await cargar(usuarioId, codigo);
  if (!cot.pedido) throw error('Su pedido todavía no se generó.', 409);
  await definirRecojo(cot.pedido.codigo, { tipo: 'agendado', fecha: r.fecha, hora: r.hora }, q, correo);
  return { pedido: cot.pedido.codigo, fecha: r.fecha, hora: r.hora };
}
