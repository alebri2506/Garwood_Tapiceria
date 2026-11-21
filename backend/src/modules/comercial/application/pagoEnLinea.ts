// W4 · pagar el adelanto en línea con la pasarela (decisiones J · CU-C11, C12, C14). El cliente paga en la página segura
// de Stripe; al confirmarse el cobro (al volver a GARWEB o por el aviso de Stripe, lo que llegue primero) la cotización
// queda «Aceptada», se registra el pago «Confirmado» y se genera el pedido. Todo queda en la bitácora (RG-02).
import { Prisma } from '@prisma/client';
import { env } from '../../../config/env.js';
import { prisma } from '../../../shared/infrastructure/prisma.js';
import { registrarBitacora } from '../../../shared/infrastructure/bitacora.js';
import { avisoAlCliente, enviarCorreos, guardarAvisos, type Aviso } from '../../../shared/infrastructure/avisos.js';
import type { Correo } from '../../../shared/infrastructure/correo.js';
import type { Pasarela, ResultadoPago } from '../../../shared/infrastructure/pasarela.js';
import { logger } from '../../../shared/infrastructure/logger.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import { dinero } from '../domain/cotizacion.js';
import { siguienteCodigoPedido } from './atencion.js';
import { cargar, estadoEfectivo } from './miCotizacion.js';
import { registrarCobroDePedido } from './pagos.js';
import { siguienteRecibo } from './recibos.js';

const error = (m: string, status = 400) => new ReglaNegocioError(m, status);
const num = (d: { toString(): string } | null | undefined) => (d == null ? 0 : Number(d.toString()));
const sinPasarela = () => error('El pago en línea todavía no está disponible. Llámenos al taller para aceptar su cotización.', 503);

/** «Aceptar y pagar el adelanto»: crea la sesión de pago por el adelanto de la cotización y devuelve su página. */
export async function iniciarPagoAdelanto(usuarioId: number, codigo: string, pasarela: Pasarela | null, comentario?: string, incrustado = false) {
  if (!pasarela) throw sinPasarela();
  const { s, cot } = await cargar(usuarioId, codigo);
  const estado = estadoEfectivo(cot.estado, cot.vigenciaHasta?.toISOString().slice(0, 10) ?? null);
  if (estado === 'Vencida') throw error('Esta cotización ya venció. Llámenos y la recalculamos con los precios de hoy.', 409);
  if (estado !== 'Pendiente de respuesta' && estado !== 'Aceptada: pendiente de adelanto') throw error('Esta cotización ya fue respondida.', 409);
  const adelanto = num(cot.adelanto);
  if (adelanto <= 0) throw error('Esta cotización no lleva adelanto: acéptela y su pedido se genera al instante.', 409);
  const volver = `${env.APP_URL}/cliente/cotizacion?solicitud=${encodeURIComponent(codigo)}`;
  const sesion = await pasarela.crearSesion({
    monto: adelanto,
    descripcion: `Adelanto de la cotización ${cot.codigo} · Garwood Tapicería`,
    detalle: `${s.muebles.map((m) => `${m.cantidad > 1 ? `${m.cantidad} × ` : ''}${m.tipoMueble.nombre}`).join(', ')} · total ${dinero(num(cot.total))}. Con este pago generamos su pedido.`.slice(0, 300),
    incrustado,
    email: s.cliente.email,
    metadata: { cotizacionId: String(cot.id), cotizacion: cot.codigo, solicitud: codigo, usuarioId: String(usuarioId), ...(comentario?.trim() ? { comentario: comentario.trim().slice(0, 450) } : {}) },
    exito: `${volver}&pago=ok`,
    cancelado: `${volver}&pago=cancelado`,
  });
  return { url: sesion.url, clientSecret: sesion.clientSecret };
}

/**
 * Registra un cobro aprobado por la pasarela. Se puede llamar varias veces con el mismo cobro (al volver el cliente y
 * por el aviso de Stripe): la `referencia` única hace que solo el primero cuente.
 */
export async function registrarPagoAprobado(p: ResultadoPago, correo: Correo) {
  // W5: el cobro es de un pedido que ya existe (saldo): lo registra el módulo de Pagos.
  if (p.metadata.pedidoId) return registrarCobroDePedido(p, correo);
  if (!p.pagado || !p.referencia) return { estado: 'pendiente' as const, pedido: null };
  const previo = await prisma.pago.findUnique({ where: { referencia: p.referencia }, include: { pedido: { select: { codigo: true } } } });
  if (previo) return { estado: 'registrado' as const, pedido: previo.pedido?.codigo ?? null };

  const cotizacionId = Number(p.metadata.cotizacionId);
  const usuarioId = Number(p.metadata.usuarioId);
  const cot = await prisma.cotizacion.findUnique({
    where: { id: cotizacionId },
    include: { solicitud: { include: { cliente: true, muebles: { orderBy: { orden: 'asc' }, include: { tipoMueble: true } } } } },
  });
  if (!cot || !usuarioId) throw error('El pago no corresponde a ninguna cotización.', 404);
  const s = cot.solicitud;
  if (Math.abs(num(cot.adelanto) - p.monto) > 0.01) logger.warn({ cotizacion: cot.codigo, cobrado: p.monto, adelanto: num(cot.adelanto) }, 'El monto cobrado no coincide con el adelanto');

  let resultado: { pedido: string | null; avisos: Aviso[] };
  try {
    resultado = await prisma.$transaction(async (tx) => {
      // Ya pagó: la cotización se acepta aunque su plazo haya vencido mientras pagaba. Si ya no estaba pendiente
      // (rechazada, por ejemplo), el cobro queda registrado sin pedido para que el taller lo revise y lo devuelva.
      const aceptable = ['Pendiente de respuesta', 'Aceptada: pendiente de adelanto'].includes(cot.estado);
      let pedido: string | null = null;
      let pedidoId: number | null = null;
      if (aceptable) {
        await tx.cotizacion.update({ where: { id: cot.id }, data: { estado: 'Aceptada', medioRespuesta: cot.medioRespuesta ?? 'Plataforma', fechaRespuesta: cot.fechaRespuesta ?? new Date(), comentarioRespuesta: cot.comentarioRespuesta ?? p.metadata.comentario ?? null } });
        pedido = await siguienteCodigoPedido(tx);
        const descripcion = s.muebles.map((m) => `${m.cantidad > 1 ? `${m.cantidad} × ` : ''}${m.tipoMueble.nombre}`).join(', ').slice(0, 120);
        // CU-C14: el mueble sigue en la casa del cliente → «Esperando mueble» hasta que el taller lo recibe.
        const nuevo = await tx.pedido.create({ data: { codigo: pedido, solicitudId: s.id, clienteId: s.clienteId, estado: 'Esperando mueble', descripcion, cotizacionId: cot.id } });
        pedidoId = nuevo.id;
        await registrarBitacora(tx, {
          usuarioId, modulo: 'comercial', accion: 'cotizacion_aceptada', entidad: 'cotizacion', entidadId: cot.id,
          valorAnterior: { estado: cot.estado }, valorNuevo: { estado: 'Aceptada', medio: 'Plataforma', pedido, pago: 'pasarela' },
        });
        await registrarBitacora(tx, {
          usuarioId, modulo: 'comercial', accion: 'pedido_generado', entidad: 'pedido', entidadId: nuevo.id,
          valorNuevo: { codigo: pedido, solicitud: s.codigo, cotizacion: cot.codigo, estado: 'Esperando mueble', total: num(cot.total), adelanto: p.monto },
        });
      }
      const pago = await tx.pago.create({
        data: { cotizacionId: cot.id, pedidoId, concepto: 'adelanto', monto: new Prisma.Decimal(p.monto), metodo: 'tarjeta', origen: 'pasarela', estado: 'Confirmado', referencia: p.referencia, recibo: await siguienteRecibo(tx), registradoPor: usuarioId, fechaRevision: new Date() },
      });
      await registrarBitacora(tx, {
        usuarioId, modulo: 'comercial', accion: 'pago_registrado', entidad: 'pago', entidadId: pago.id,
        valorNuevo: { pedido, concepto: 'adelanto', monto: p.monto, metodo: 'tarjeta', origen: 'pasarela', estado: 'Confirmado', referencia: p.referencia, conPedido: aceptable },
      });
      const avisos = pedido
        ? await avisoAlCliente(tx, s.clienteId, {
          solicitudId: s.id, tipo: 'pedido_generado', titulo: `Su pedido ${pedido} está en marcha`,
          mensaje: `Recibimos su adelanto de ${dinero(p.monto)} con tarjeta. Aceptó la cotización ${cot.codigo} (total ${dinero(num(cot.total))}).`, enlace: '/cliente/pedidos',
        }, `Su pedido ${pedido} está en marcha`, `Hola ${s.cliente.nombres}: recibimos su adelanto de ${dinero(p.monto)} con tarjeta por la cotización ${cot.codigo} (total ${dinero(num(cot.total))}). Su pedido es el ${pedido}; elija el día del recojo desde su cuenta de GARWEB.`)
        : [];
      await guardarAvisos(tx, avisos);
      return { pedido, avisos };
    });
  } catch (e) {
    // El mismo cobro llegó dos veces a la vez (el cliente y el aviso de Stripe): gana el primero.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const ya = await prisma.pago.findUnique({ where: { referencia: p.referencia }, include: { pedido: { select: { codigo: true } } } });
      return { estado: 'registrado' as const, pedido: ya?.pedido?.codigo ?? null };
    }
    throw e;
  }
  await enviarCorreos(correo, resultado.avisos);
  return { estado: 'registrado' as const, pedido: resultado.pedido };
}

/** Al volver de la pasarela: consulta la sesión (sin esperar el aviso de Stripe) y registra el pago si se cobró. */
export async function confirmarPagoAdelanto(usuarioId: number, codigo: string, sesion: string, pasarela: Pasarela | null, correo: Correo) {
  if (!pasarela) throw sinPasarela();
  const { cot } = await cargar(usuarioId, codigo);
  const p = await pasarela.consultarSesion(sesion);
  if (p.metadata.cotizacionId !== String(cot.id)) throw error('Ese pago no corresponde a esta cotización.', 409);
  return registrarPagoAprobado(p, correo);
}
