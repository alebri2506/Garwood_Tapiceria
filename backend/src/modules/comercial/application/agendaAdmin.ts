// A2 Agenda del Administrador (CU-C03 y C04): la semana con sus citas y visitas, los bloqueos y el horario.
import { prisma } from '../../../shared/infrastructure/prisma.js';
import { registrarBitacora } from '../../../shared/infrastructure/bitacora.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import { hoyNegocio, leerFecha } from '../domain/calendario.js';
import { enNY, motivoCierre, sumarDias, sumarMinutos, turnoBloqueado } from '../domain/agenda.js';
import { RESERVAN_RECOJO, SERVICIOS } from '../domain/solicitud.js';
import { parametroNumero } from '../../../shared/infrastructure/parametros.js';
import { bloqueosEntre, citaDto, fechaLarga, reglasAgenda, turnosOcupados, type Quien } from './citas.js';

const error = (m: string, status = 400) => new ReglaNegocioError(m, status);
const TELA: Record<string, string> = { trae: 'La trae el cliente', catalogo: 'Catálogo en línea', local: 'Ver en el local', domicilio: 'Visita a domicilio', sin: 'No lleva tela' };
const nombreCliente = (c: { tipoPersona: string; razonSocial: string | null; nombres: string; apellidos: string }) =>
  c.tipoPersona === 'empresa' && c.razonSocial ? c.razonSocial : `${c.nombres} ${c.apellidos}`.trim();

/** El lunes de la semana de `fecha` (la agenda va de lunes a sábado; el domingo, la siguiente). */
export function lunesDe(fecha: string) {
  const d = leerFecha(fecha)!;
  const dia = d.getUTCDay();
  // El domingo no se atiende: se muestra la semana que empieza.
  return sumarDias(fecha, dia === 0 ? 1 : 1 - dia);
}

/** A2: la semana que empieza en `desde` (lunes), con citas atendidas, programadas y faltas. */
export async function agendaSemana(desdePedido?: string) {
  const r = await reglasAgenda();
  const hoy = hoyNegocio();
  const desde = lunesDe(desdePedido && leerFecha(desdePedido) ? desdePedido : hoy);
  const hasta = sumarDias(desde, 5);
  const [bloqueos, citas, futuros, recojos, duracionRecojo] = await Promise.all([
    bloqueosEntre(desde, hasta),
    prisma.cita.findMany({
      where: { estado: { in: ['Programada', 'Atendida', 'No asistió'] }, fechaHora: { gte: new Date(`${desde}T00:00:00Z`), lt: new Date(`${sumarDias(hasta, 2)}T00:00:00Z`) } },
      orderBy: { fechaHora: 'asc' },
      include: {
        direccion: true,
        solicitud: {
          include: {
            cliente: true,
            muebles: { orderBy: { orden: 'asc' }, include: { tipoMueble: true, _count: { select: { adjuntos: true } } } },
            citas: { select: { estado: true } },
          },
        },
      },
    }),
    bloqueosEntre(hoy, sumarDias(hoy, r.dias)),
    // W2: horas de recojo preferidas de solicitudes que esperan; ocupan la agenda.
    prisma.solicitud.findMany({
      where: { horaPrefRecojo: { not: null }, estado: { in: RESERVAN_RECOJO }, fechaPrefRecojo: { gte: leerFecha(desde)!, lte: leerFecha(hasta)! } },
      include: { cliente: true, direccion: true, muebles: { orderBy: { orden: 'asc' }, include: { tipoMueble: true } } },
    }),
    parametroNumero(prisma, 'recojo.duracion_min'),
  ]);
  const ahora = enNY(new Date());

  return {
    desde, hasta, hoy, ahora: ahora.hora,
    turnos: r.turnos, duracionMin: r.duracion, visitaDuracionMin: r.visitaDuracion, maxInasistencias: r.maxInasistencias,
    horario: { manana: r.rangoManana, tarde: r.rangoTarde, visitaManana: r.franjas.manana, visitaTarde: r.franjas.tarde },
    dias: Array.from({ length: 6 }, (_, i) => {
      const fecha = sumarDias(desde, i);
      return { fecha, cerrado: motivoCierre(fecha, bloqueos) };
    }),
    bloqueos: bloqueos.filter((b) => b.horaInicio).map((b) => ({ id: b.id, fecha: b.fecha, horaInicio: b.horaInicio!, horaFin: b.horaFin!, motivo: b.motivo })),
    recojos: recojos.map((s) => ({
      solicitud: s.codigo!, estado: s.estado, cliente: nombreCliente(s.cliente), telefono: s.cliente.telefono,
      fecha: s.fechaPrefRecojo!.toISOString().slice(0, 10), hora: s.horaPrefRecojo!, hasta: sumarMinutos(s.horaPrefRecojo!, duracionRecojo),
      mueble: s.muebles.map((x) => `${x.cantidad > 1 ? `${x.cantidad} × ` : ''}${x.tipoMueble.nombre}`).join(', '), direccion: s.direccion?.direccion ?? null,
    })),
    proximosBloqueos: futuros.map((b) => ({ id: b.id, fecha: b.fecha, horaInicio: b.horaInicio, horaFin: b.horaFin, motivo: b.motivo })),
    citas: citas
      .map((c) => ({ c, dto: citaDto(c) }))
      .filter(({ dto }) => dto.fecha >= desde && dto.fecha <= hasta)
      .map(({ c, dto }) => {
        const s = c.solicitud;
        const m = s.muebles[0];
        return {
          ...dto,
          direccion: c.direccion?.direccion ?? null,
          solicitud: {
            codigo: s.codigo!, estado: s.estado, cliente: nombreCliente(s.cliente), telefono: s.cliente.telefono, email: s.cliente.email,
            mueble: s.muebles.map((x) => `${x.cantidad > 1 ? `${x.cantidad} × ` : ''}${x.tipoMueble.nombre}`).join(', '),
            servicio: m ? SERVICIOS.find((x) => x.codigo === m.servicio)?.nombre.replace(' (desde una foto)', '') ?? m.servicio : '',
            tela: TELA[s.telaOpcion] ?? s.telaOpcion, telaDescripcion: s.telaDescripcion,
            fotos: s.muebles.reduce((t, x) => t + x._count.adjuntos, 0),
            inasistencias: s.citas.filter((x) => x.estado === 'No asistió').length,
            tieneProgramada: s.citas.some((x) => x.estado === 'Programada'),
          },
        };
      }),
  };
}

/** CU-C03: el Administrador bloquea turnos libres (uno o varios, en distintos días). El cliente deja de verlos. */
export async function bloquearTurnos(quien: Quien, bloques: { fecha: string; hora: string }[], motivo: string) {
  const r = await reglasAgenda();
  const ahora = enNY(new Date());
  const unicos = [...new Map(bloques.map((b) => [`${b.fecha}|${b.hora}`, b])).values()].sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`));
  const desde = unicos[0]!.fecha, hasta = unicos[unicos.length - 1]!.fecha;
  const [existentes, ocupados] = await Promise.all([bloqueosEntre(desde, hasta), turnosOcupados(desde, hasta, r)]);

  for (const b of unicos) {
    const que = `${fechaLarga(b.fecha)} a las ${b.hora}`;
    if (!leerFecha(b.fecha) || !r.turnos.includes(b.hora)) throw error(`El turno del ${b.fecha} a las ${b.hora} no existe en la agenda.`);
    if (b.fecha < ahora.fecha || (b.fecha === ahora.fecha && b.hora <= ahora.hora)) throw error(`El turno del ${que} ya pasó.`);
    if (motivoCierre(b.fecha, existentes)) throw error(`El ${fechaLarga(b.fecha)} el taller no atiende.`);
    if (turnoBloqueado(b.fecha, b.hora, existentes)) throw error(`El turno del ${que} ya está bloqueado.`);
    if (ocupados.get(b.fecha)?.has(b.hora)) throw error(`El turno del ${que} tiene una cita: reprográmela antes de bloquear.`);
  }

  await prisma.$transaction(async (tx) => {
    for (const b of unicos) {
      const fila = await tx.agendaBloqueo.create({ data: { fecha: leerFecha(b.fecha)!, horaInicio: b.hora, horaFin: sumarMinutos(b.hora, r.duracion), motivo, creadoPor: quien.usuarioId } });
      await registrarBitacora(tx, { usuarioId: quien.usuarioId, modulo: 'comercial', accion: 'agenda_bloqueo', entidad: 'agenda_bloqueo', entidadId: fila.id, valorNuevo: { fecha: b.fecha, hora: b.hora, motivo }, ip: quien.ip });
    }
  });
  return { bloqueados: unicos.length };
}

/**
 * A2 · quitar un bloqueo: no se borra (RG-03), queda anulado con quién y cuándo, y el turno vuelve a estar libre
 * para los clientes. Los bloqueos de días pasados no se tocan: son historia.
 */
export async function quitarBloqueo(quien: Quien, id: number) {
  const b = await prisma.agendaBloqueo.findUnique({ where: { id } });
  if (!b || !b.activo) throw error('Ese bloqueo ya no existe.', 404);
  const fecha = b.fecha.toISOString().slice(0, 10);
  if (fecha < hoyNegocio()) throw error('Ese bloqueo ya pasó: queda en el historial.');
  await prisma.$transaction(async (tx) => {
    await tx.agendaBloqueo.update({ where: { id }, data: { activo: false, quitadoPor: quien.usuarioId, fechaQuitado: new Date() } });
    await registrarBitacora(tx, {
      usuarioId: quien.usuarioId, modulo: 'comercial', accion: 'agenda_desbloqueo', entidad: 'agenda_bloqueo', entidadId: id,
      valorAnterior: { fecha, hora: b.horaInicio, motivo: b.motivo }, valorNuevo: { activo: false }, ip: quien.ip,
    });
  });
}
