import { Prisma } from '@prisma/client';
import { prisma, type Db } from '../../../shared/infrastructure/prisma.js';
import { parametroNumero, parametroTexto } from '../../../shared/infrastructure/parametros.js';
import { registrarBitacora } from '../../../shared/infrastructure/bitacora.js';
import { avisoAlCliente, avisosAlTaller, enviarCorreos, guardarAvisos, type Aviso } from '../../../shared/infrastructure/avisos.js';
import type { Correo } from '../../../shared/infrastructure/correo.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import { hoyNegocio, leerFecha } from '../domain/calendario.js';
import { diaCerrado, enNY, franjaBloqueada, instanteNY, minutosDe, sumarDias, sumarMinutos, turnoBloqueado, turnosDe, type Bloqueo } from '../domain/agenda.js';
import { RESERVAN_RECOJO } from '../domain/solicitud.js';
import type { NombreRol } from '../../seguridad/application/tokens.js';
import type { DireccionEntrada } from '../http/solicitud.schemas.js';
import { idDireccion, revisarDireccion } from './direcciones.js';

const error = (m: string, status = 400) => new ReglaNegocioError(m, status);
export type TipoCita = 'local' | 'domicilio';
export type Franja = 'manana' | 'tarde';

export interface Quien { usuarioId: number; rol: NombreRol; ip?: string }

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const fechaLarga = (fecha: string) => {
  const d = leerFecha(fecha)!;
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
};

/** RG-04: horarios, duración y reglas de la agenda salen de `parametro`. */
export async function reglasAgenda(db: Db = prisma) {
  const [duracion, manana, tarde, dias, visitaDuracion, maxInasistencias, visitaManana, visitaTarde] = await Promise.all([
    parametroNumero(db, 'cita.duracion_min'),
    parametroTexto(db, 'agenda.turnos_manana'),
    parametroTexto(db, 'agenda.turnos_tarde'),
    parametroNumero(db, 'agenda.dias_adelante'),
    parametroNumero(db, 'visita.duracion_min'),
    parametroNumero(db, 'cita.reprogramaciones_inasistencia'),
    parametroTexto(db, 'visita.franja_manana'),
    parametroTexto(db, 'visita.franja_tarde'),
  ]);
  return {
    duracion, dias, visitaDuracion, maxInasistencias,
    turnos: [...turnosDe(manana, duracion), ...turnosDe(tarde, duracion)],
    rangoManana: manana, rangoTarde: tarde,
    franjas: { manana: visitaManana, tarde: visitaTarde } as Record<Franja, string>,
  };
}

const textoFranja = (rango: string) => rango.replace('-', '–');

export async function bloqueosEntre(desde: string, hasta: string): Promise<(Bloqueo & { id: number; motivo: string; creadoPor: number | null })[]> {
  const filas = await prisma.agendaBloqueo.findMany({ where: { activo: true, fecha: { gte: leerFecha(desde)!, lte: leerFecha(hasta)! } }, orderBy: [{ fecha: 'asc' }, { horaInicio: 'asc' }] });
  return filas.map((b) => ({ id: b.id, fecha: b.fecha.toISOString().slice(0, 10), horaInicio: b.horaInicio, horaFin: b.horaFin, motivo: b.motivo, creadoPor: b.creadoPor }));
}

/** La visita sin hora (el cliente eligió solo la franja) se guarda a las 00:00 de ese día. */
const horaDe = (c: { tipo: string; fechaHora: Date }) => {
  const { hora } = enNY(c.fechaHora);
  return c.tipo === 'local' || hora !== '00:00' ? hora : null;
};

/** Un tramo ocupado del día, en minutos desde las 00:00. */
export interface Tramo { desde: number; hasta: number }

/**
 * Lo que ocupa la agenda cada día ("AAAA-MM-DD" → tramos): citas en el local, visitas con hora (los turnos seguidos
 * que dura) y horas de recojo preferidas de solicitudes que aún esperan (`recojo.duracion_min`, W2).
 */
export async function ocupacion(desde: string, hasta: string, ignorar: { citaId?: number; solicitudId?: number } = {}) {
  const [citas, recojos, duracionRecojo] = await Promise.all([
    prisma.cita.findMany({
      where: { estado: 'Programada', fechaHora: { gte: instanteNY(desde), lt: instanteNY(sumarDias(hasta, 1)) }, NOT: ignorar.citaId ? { id: ignorar.citaId } : undefined },
      select: { tipo: true, fechaHora: true, duracionMin: true },
    }),
    prisma.solicitud.findMany({
      where: { horaPrefRecojo: { not: null }, estado: { in: RESERVAN_RECOJO }, fechaPrefRecojo: { gte: leerFecha(desde)!, lte: leerFecha(hasta)! }, NOT: ignorar.solicitudId ? { id: ignorar.solicitudId } : undefined },
      select: { fechaPrefRecojo: true, horaPrefRecojo: true },
    }),
    parametroNumero(prisma, 'recojo.duracion_min'),
  ]);
  const porDia = new Map<string, Tramo[]>();
  const poner = (fecha: string, hora: string, minutos: number) => {
    const desdeMin = minutosDe(hora);
    porDia.set(fecha, [...(porDia.get(fecha) ?? []), { desde: desdeMin, hasta: desdeMin + minutos }]);
  };
  for (const c of citas) {
    const hora = horaDe(c);
    if (hora) poner(enNY(c.fechaHora).fecha, hora, c.duracionMin);
  }
  for (const s of recojos) poner(s.fechaPrefRecojo!.toISOString().slice(0, 10), s.horaPrefRecojo!, duracionRecojo);
  return porDia;
}

/** El tramo [desde, hasta) choca con alguno de la lista. */
export const choca = (tramos: Tramo[] | undefined, desde: number, hasta: number) => Boolean(tramos?.some((x) => x.desde < hasta && x.hasta > desde));

/** Turnos del local ocupados por día ("AAAA-MM-DD" → horas): los que chocan con cualquier tramo ocupado. */
export async function turnosOcupados(desde: string, hasta: string, r: { turnos: string[]; duracion: number }, ignorarCitaId?: number) {
  const porDia = await ocupacion(desde, hasta, { citaId: ignorarCitaId });
  const turnos = new Map<string, Set<string>>();
  for (const [fecha, tramos] of porDia) {
    turnos.set(fecha, new Set(r.turnos.filter((h) => choca(tramos, minutosDe(h), minutosDe(h) + r.duracion))));
  }
  return turnos;
}

/** Ya hay una visita programada en esa franja de ese día (con o sin hora). */
async function visitaEnFranja(fecha: string, franja: Franja, ignorarCitaId?: number) {
  return prisma.cita.findFirst({
    where: { tipo: 'domicilio', estado: 'Programada', franja, fechaHora: { gte: instanteNY(fecha), lt: instanteNY(sumarDias(fecha, 1)) }, NOT: ignorarCitaId ? { id: ignorarCitaId } : undefined },
  });
}

/** CU-C04: días con turnos (local) o franjas (domicilio) libres entre `desde` y `desde + dias`. */
export async function disponibilidad(tipo: TipoCita, desdePedido: string, diasPedidos: number) {
  const r = await reglasAgenda();
  const hoy = hoyNegocio();
  // Las visitas a domicilio se piden desde el día siguiente.
  const primero = tipo === 'domicilio' ? sumarDias(hoy, 1) : hoy;
  const desde = leerFecha(desdePedido) && desdePedido > primero ? desdePedido : primero;
  const limite = sumarDias(hoy, r.dias);
  const hasta = [sumarDias(desde, Math.min(Math.max(diasPedidos, 1), 100) - 1), limite].sort()[0]!;

  const [bloqueos, visitas, porDia] = await Promise.all([
    bloqueosEntre(desde, hasta),
    prisma.cita.findMany({
      where: { tipo: 'domicilio', estado: 'Programada', fechaHora: { gte: instanteNY(desde), lt: instanteNY(sumarDias(hasta, 1)) } },
      select: { fechaHora: true, franja: true },
    }),
    turnosOcupados(desde, hasta, r),
  ]);
  const ocupados = new Set(visitas.map((c) => `${enNY(c.fechaHora).fecha}|${c.franja}`));
  const ahora = enNY(new Date());

  const dias = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    const cerrado = diaCerrado(f, bloqueos);
    if (tipo === 'local') {
      dias.push({
        fecha: f, cerrado,
        turnos: r.turnos.map((hora) => ({
          hora,
          libre: !cerrado && !turnoBloqueado(f, hora, bloqueos) && !porDia.get(f)?.has(hora) && !(f === ahora.fecha && hora <= ahora.hora),
        })),
      });
    } else {
      dias.push({
        fecha: f, cerrado,
        franjas: (['manana', 'tarde'] as Franja[]).map((codigo) => ({
          codigo, nombre: `${codigo === 'manana' ? 'Mañana' : 'Tarde'} · ${textoFranja(r.franjas[codigo])}`,
          libre: !cerrado && !franjaBloqueada(f, r.franjas[codigo], bloqueos) && !ocupados.has(`${f}|${codigo}`),
        })),
      });
    }
  }
  return {
    tipo, desde, hasta, limite,
    duracionMin: tipo === 'local' ? r.duracion : r.visitaDuracion,
    horario: tipo === 'local' ? `${textoFranja(r.rangoManana)} y ${textoFranja(r.rangoTarde)}` : `${textoFranja(r.franjas.manana)} y ${textoFranja(r.franjas.tarde)}`,
    dias,
  };
}

export interface TurnoEntrada { fecha: string; hora?: string; franja?: Franja }

/** Revisa que el turno pedido exista, esté libre y dentro del plazo; devuelve el instante y la duración. */
export async function revisarTurno(tipo: TipoCita, t: TurnoEntrada, ignorarCitaId?: number) {
  const r = await reglasAgenda();
  const hoy = hoyNegocio();
  const d = leerFecha(t.fecha);
  if (!d) throw error('La fecha no es válida.');
  if (t.fecha < (tipo === 'domicilio' ? sumarDias(hoy, 1) : hoy)) throw error(tipo === 'domicilio' ? 'Las visitas se agendan desde mañana.' : 'Esa fecha ya pasó.');
  if (t.fecha > sumarDias(hoy, r.dias)) throw error(`Elija una fecha dentro de los próximos ${r.dias} días.`);
  const bloqueos = await bloqueosEntre(t.fecha, t.fecha);
  if (diaCerrado(t.fecha, bloqueos)) throw error('El taller no atiende ese día. Elija otro.');

  // Cita en el local (un turno) o visita con hora fijada por el Administrador (los turnos seguidos que dura).
  if (tipo === 'local' || t.hora) {
    if (!t.hora || !r.turnos.includes(t.hora)) throw error('Elija uno de los turnos de la agenda.');
    const n = tipo === 'local' ? 1 : Math.max(1, Math.ceil(r.visitaDuracion / r.duracion));
    const horas = Array.from({ length: n }, (_, k) => sumarMinutos(t.hora!, k * r.duracion));
    if (!horas.every((h) => r.turnos.includes(h))) throw error(`La visita necesita ${r.visitaDuracion} minutos seguidos dentro del horario. Elija otro turno.`);
    if (horas.some((h) => turnoBloqueado(t.fecha, h, bloqueos))) throw error('Ese turno no está disponible. Elija otro.');
    const ahora = enNY(new Date());
    if (t.fecha === ahora.fecha && t.hora <= ahora.hora) throw error('Ese turno ya pasó. Elija otro.');
    const ocupadas = (await turnosOcupados(t.fecha, t.fecha, r, ignorarCitaId)).get(t.fecha);
    if (horas.some((h) => ocupadas?.has(h))) throw error('Ese turno se acaba de ocupar. Elija otro.', 409);
    const fechaHora = instanteNY(t.fecha, t.hora);
    if (tipo === 'local') return { fechaHora, franja: null, duracion: r.duracion, texto: `${fechaLarga(t.fecha)}, ${t.hora}` };
    const franja: Franja = t.hora < '12:00' ? 'manana' : 'tarde';
    if (await visitaEnFranja(t.fecha, franja, ignorarCitaId)) throw error('Ya hay una visita a domicilio en esa franja. Elija otro horario.', 409);
    return { fechaHora, franja, duracion: r.visitaDuracion, texto: `${fechaLarga(t.fecha)}, ${t.hora}–${sumarMinutos(t.hora, r.visitaDuracion)}` };
  }
  if (!t.franja || !(t.franja in r.franjas)) throw error('Elija la franja de la visita: mañana o tarde.');
  if (franjaBloqueada(t.fecha, r.franjas[t.franja], bloqueos)) throw error('Esa franja no está disponible. Elija otra.');
  if (await visitaEnFranja(t.fecha, t.franja, ignorarCitaId)) throw error('Esa franja se acaba de ocupar. Elija otra.', 409);
  return { fechaHora: instanteNY(t.fecha), franja: t.franja, duracion: r.visitaDuracion, texto: `${fechaLarga(t.fecha)}, por la ${t.franja === 'manana' ? 'mañana' : 'tarde'} (${textoFranja(r.franjas[t.franja])})` };
}

/** Solo el Administrador fija la hora de una visita; el cliente elige la franja. */
const turnoSegunRol = (quien: Quien, tipo: TipoCita, t: TurnoEntrada): TurnoEntrada =>
  tipo === 'domicilio' && quien.rol !== 'Administrador' ? { fecha: t.fecha, franja: t.franja } : t;

/** El cliente solo maneja las citas de sus solicitudes (RG-07); el Administrador, todas. */
async function solicitudDe(quien: Quien, codigo: string) {
  const s = await prisma.solicitud.findUnique({ where: { codigo }, include: { cliente: true } });
  if (!s) throw error('No encontramos esa solicitud.', 404);
  if (quien.rol !== 'Administrador') {
    const u = await prisma.usuario.findUnique({ where: { id: quien.usuarioId } });
    if (!u?.clienteId || u.clienteId !== s.clienteId) throw error('No encontramos esa solicitud.', 404);
  }
  return s;
}

/** Qué tipo de cita corresponde: la visita si la pidió; si no, el local. */
export const tipoCitaDe = (telaOpcion: string): TipoCita => (telaOpcion === 'domicilio' ? 'domicilio' : 'local');

export const turnoOcupado = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

export interface AgendarEntrada extends TurnoEntrada { solicitud: string; tipo: TipoCita; direccion?: DireccionEntrada }

/** CU-C04 Programar cita (en el local) o visita a domicilio para una solicitud en espera de cita. */
export async function agendarCita(quien: Quien, e: AgendarEntrada, correo: Correo) {
  const s = await solicitudDe(quien, e.solicitud);
  if (s.estado !== 'En espera de cita') throw error('Esta solicitud no está esperando una cita.');
  if (quien.rol !== 'Administrador' && e.tipo !== tipoCitaDe(s.telaOpcion)) {
    throw error(e.tipo === 'domicilio' ? 'Su solicitud es para ver las telas en el local.' : 'Su solicitud es para una visita a domicilio.');
  }
  if (await prisma.cita.findFirst({ where: { solicitudId: s.id, estado: 'Programada' } })) {
    throw error('Esta solicitud ya tiene una cita programada. Reprográmela si necesita otro día.', 409);
  }
  if (e.tipo === 'domicilio') {
    if (!e.direccion) throw error('Indique dónde lo visitamos.');
    await revisarDireccion(e.direccion, s.clienteId);
  }
  const inasistencias = await prisma.cita.count({ where: { solicitudId: s.id, estado: 'No asistió' } });
  // Tras usar su reprogramación por inasistencia, solo el taller puede ofrecerle un último turno (A2f).
  const { maxInasistencias } = await reglasAgenda();
  if (quien.rol !== 'Administrador' && inasistencias > maxInasistencias) {
    throw error('Ya usó su reprogramación por inasistencia: comuníquese con el taller.');
  }
  const turno = await revisarTurno(e.tipo, turnoSegunRol(quien, e.tipo, e));

  let avisos: Aviso[] = [];
  try {
    const cita = await prisma.$transaction(async (tx) => {
      const direccionId = e.tipo === 'domicilio' ? await idDireccion(tx, e.direccion, s.clienteId) : null;
      const c = await tx.cita.create({
        data: {
          solicitudId: s.id, tipo: e.tipo, fechaHora: turno.fechaHora, franja: turno.franja, duracionMin: turno.duracion,
          direccionId, reprogramaciones: inasistencias, estado: 'Programada', registradoPor: quien.usuarioId,
        },
      });
      await registrarBitacora(tx, {
        usuarioId: quien.usuarioId, modulo: 'comercial', accion: 'cita_programada', entidad: 'cita', entidadId: c.id,
        valorNuevo: { solicitud: s.codigo, tipo: e.tipo, fecha: e.fecha, hora: e.hora ?? null, franja: e.franja ?? null }, ip: quien.ip,
      });
      const que = e.tipo === 'local' ? 'Su cita en el taller' : 'La visita a su casa';
      avisos = [
        ...(await avisoAlCliente(tx, s.clienteId, { solicitudId: s.id, tipo: 'cita_programada', titulo: `${que} quedó programada`, mensaje: `${s.codigo} · ${turno.texto}.`, enlace: '/cliente/pedidos/solicitudes' },
          `GARWEB · ${que} quedó programada`, `${que} para la solicitud ${s.codigo} quedó para el ${turno.texto}.\n\nPuede reprogramarla o cancelarla desde Mis pedidos › Solicitudes.`)),
        ...(await avisosAlTaller(tx, { solicitudId: s.id, tipo: 'cita_programada', titulo: `${e.tipo === 'local' ? 'Cita' : 'Visita'} programada · ${s.codigo}`, mensaje: turno.texto, enlace: '/admin/agenda' })),
      ];
      await guardarAvisos(tx, avisos);
      return c;
    });
    await enviarCorreos(correo, avisos);
    return citaDto(cita);
  } catch (err) {
    if (turnoOcupado(err)) throw error('Ese turno se acaba de ocupar. Elija otro.', 409);
    throw err;
  }
}

async function citaPropia(quien: Quien, citaId: number) {
  const c = await prisma.cita.findUnique({ where: { id: citaId }, include: { solicitud: true } });
  if (!c) throw error('No encontramos esa cita.', 404);
  await solicitudDe(quien, c.solicitud.codigo!);
  if (c.estado !== 'Programada') throw error('Esta cita ya no está programada.');
  // La cita en el local se cambia hasta antes del turno; la visita, hasta el día anterior.
  const { fecha } = enNY(c.fechaHora);
  const aTiempo = c.tipo === 'local' ? c.fechaHora.getTime() > Date.now() : fecha > hoyNegocio();
  if (quien.rol !== 'Administrador' && !aTiempo) {
    throw error(c.tipo === 'local' ? 'La cita ya empezó o pasó: comuníquese con el taller.' : 'La visita se cambia hasta el día anterior: comuníquese con el taller.');
  }
  return c;
}

/** CU-C04 Reprogramar: la cita anterior queda "Reprogramada" y se crea la nueva (nada se borra). */
export async function reprogramarCita(quien: Quien, citaId: number, t: TurnoEntrada, correo: Correo) {
  const anterior = await citaPropia(quien, citaId);
  const turno = await revisarTurno(anterior.tipo as TipoCita, turnoSegunRol(quien, anterior.tipo as TipoCita, t), anterior.id);
  let avisos: Aviso[] = [];
  try {
    const nueva = await prisma.$transaction(async (tx) => {
      await tx.cita.update({ where: { id: anterior.id }, data: { estado: 'Reprogramada' } });
      const c = await tx.cita.create({
        data: {
          solicitudId: anterior.solicitudId, tipo: anterior.tipo, fechaHora: turno.fechaHora, franja: turno.franja, duracionMin: turno.duracion,
          direccionId: anterior.direccionId, reprogramaciones: anterior.reprogramaciones, estado: 'Programada', registradoPor: quien.usuarioId,
        },
      });
      await registrarBitacora(tx, {
        usuarioId: quien.usuarioId, modulo: 'comercial', accion: 'cita_reprogramada', entidad: 'cita', entidadId: c.id,
        valorAnterior: { citaId: anterior.id, fechaHora: anterior.fechaHora.toISOString(), franja: anterior.franja },
        valorNuevo: { fecha: t.fecha, hora: t.hora ?? null, franja: t.franja ?? null }, ip: quien.ip,
      });
      const que = anterior.tipo === 'local' ? 'Su cita' : 'La visita';
      avisos = [
        ...(await avisoAlCliente(tx, anterior.solicitud.clienteId, { solicitudId: anterior.solicitudId, tipo: 'cita_reprogramada', titulo: `${que} cambió de día`, mensaje: `${anterior.solicitud.codigo} · ahora el ${turno.texto}.`, enlace: '/cliente/pedidos/solicitudes' },
          `GARWEB · ${que} cambió de día`, `${que} de la solicitud ${anterior.solicitud.codigo} ahora es el ${turno.texto}.`)),
        ...(await avisosAlTaller(tx, { solicitudId: anterior.solicitudId, tipo: 'cita_reprogramada', titulo: `Reprogramada · ${anterior.solicitud.codigo}`, mensaje: turno.texto, enlace: '/admin/agenda' })),
      ];
      await guardarAvisos(tx, avisos);
      return c;
    });
    await enviarCorreos(correo, avisos);
    return citaDto(nueva);
  } catch (err) {
    if (turnoOcupado(err)) throw error('Ese turno se acaba de ocupar. Elija otro.', 409);
    throw err;
  }
}

/** CU-C04 Cancelar: libera el turno; la solicitud sigue esperando una cita. */
export async function cancelarCita(quien: Quien, citaId: number, correo: Correo) {
  const c = await citaPropia(quien, citaId);
  let avisos: Aviso[] = [];
  await prisma.$transaction(async (tx) => {
    await tx.cita.update({ where: { id: c.id }, data: { estado: 'Cancelada' } });
    await registrarBitacora(tx, { usuarioId: quien.usuarioId, modulo: 'comercial', accion: 'cita_cancelada', entidad: 'cita', entidadId: c.id, valorAnterior: { estado: 'Programada' }, valorNuevo: { estado: 'Cancelada' }, ip: quien.ip });
    avisos = await avisosAlTaller(tx, { solicitudId: c.solicitudId, tipo: 'cita_cancelada', titulo: `${c.tipo === 'local' ? 'Cita' : 'Visita'} cancelada · ${c.solicitud.codigo}`, mensaje: 'El turno quedó libre.', enlace: '/admin/agenda' });
    await guardarAvisos(tx, avisos);
  });
  await enviarCorreos(correo, avisos);
  return { estado: 'Cancelada' as const };
}

/**
 * CU-C04/C05 El Administrador registra cómo terminó la cita. Si el cliente no asistió, puede reprogramar
 * `cita.reprogramaciones_inasistencia` veces. Si vuelve a faltar, por regla la solicitud vence, pero lo decide el
 * Administrador (A2f): darla por vencida u ofrecerle un último turno.
 */
export async function registrarResultado(quien: Quien, citaId: number, resultado: 'atendida' | 'no_asistio', correo: Correo) {
  const c = await prisma.cita.findUnique({ where: { id: citaId }, include: { solicitud: true } });
  if (!c) throw error('No encontramos esa cita.', 404);
  if (c.estado !== 'Programada') throw error('Esta cita ya tiene un resultado.');
  const { maxInasistencias } = await reglasAgenda();
  const faltas = (await prisma.cita.count({ where: { solicitudId: c.solicitudId, estado: 'No asistió' } })) + (resultado === 'no_asistio' ? 1 : 0);
  const sinReprogramacion = resultado === 'no_asistio' && faltas > maxInasistencias;
  let avisos: Aviso[] = [];
  await prisma.$transaction(async (tx) => {
    await tx.cita.update({ where: { id: c.id }, data: { estado: resultado === 'atendida' ? 'Atendida' : 'No asistió' } });
    const estado = resultado === 'atendida' ? 'Atendida' : c.solicitud.estado;
    if (estado !== c.solicitud.estado) await tx.solicitud.update({ where: { id: c.solicitudId }, data: { estado } });
    await registrarBitacora(tx, {
      usuarioId: quien.usuarioId, modulo: 'comercial', accion: resultado === 'atendida' ? 'cita_atendida' : 'cita_inasistencia', entidad: 'cita', entidadId: c.id,
      valorAnterior: { solicitud: c.solicitud.estado }, valorNuevo: { cita: resultado, solicitud: estado, inasistencias: resultado === 'no_asistio' ? faltas : undefined }, ip: quien.ip,
    });
    if (resultado === 'no_asistio') {
      const que = c.tipo === 'local' ? 'su cita' : 'la visita';
      const titulo = c.tipo === 'local' ? 'No asistió a su cita' : 'No lo encontramos en casa';
      avisos = await avisoAlCliente(tx, c.solicitud.clienteId,
        sinReprogramacion
          ? { solicitudId: c.solicitudId, tipo: 'cita_inasistencia', titulo, mensaje: `Ya usó su reprogramación: comuníquese con el taller si todavía quiere ${que}.`, enlace: '/cliente/pedidos/solicitudes' }
          : { solicitudId: c.solicitudId, tipo: 'cita_inasistencia', titulo, mensaje: `Puede reprogramar ${que} una sola vez desde Mis pedidos › Solicitudes.`, enlace: '/cliente/pedidos/solicitudes' },
        `GARWEB · ${titulo}`,
        sinReprogramacion
          ? `No pudimos realizar ${que} de la solicitud ${c.solicitud.codigo} por segunda vez. Ya usó su reprogramación: comuníquese con el taller.`
          : `No pudimos realizar ${que} de la solicitud ${c.solicitud.codigo}. Puede reprogramarla una sola vez desde Mis pedidos › Solicitudes.`);
      await guardarAvisos(tx, avisos);
    }
  });
  await enviarCorreos(correo, avisos);
  return { cita: resultado === 'atendida' ? 'Atendida' : 'No asistió', inasistencias: faltas, puedeReprogramar: resultado === 'no_asistio' && !sinReprogramacion };
}

/** A2f: tras la segunda inasistencia, el Administrador da la solicitud por vencida (se avisa al cliente). */
export async function vencerSolicitud(quien: Quien, codigo: string, correo: Correo) {
  const s = await prisma.solicitud.findUnique({ where: { codigo } });
  if (!s) throw error('No encontramos esa solicitud.', 404);
  const { maxInasistencias } = await reglasAgenda();
  const faltas = await prisma.cita.count({ where: { solicitudId: s.id, estado: 'No asistió' } });
  if (s.estado !== 'En espera de cita' || faltas <= maxInasistencias) throw error('Solo vence una solicitud cuyo cliente faltó más veces de las permitidas.');
  if (await prisma.cita.findFirst({ where: { solicitudId: s.id, estado: 'Programada' } })) throw error('La solicitud tiene una cita programada: cancélela antes.');
  let avisos: Aviso[] = [];
  await prisma.$transaction(async (tx) => {
    await tx.solicitud.update({ where: { id: s.id }, data: { estado: 'Vencida' } });
    await registrarBitacora(tx, { usuarioId: quien.usuarioId, modulo: 'comercial', accion: 'solicitud_vencida', entidad: 'solicitud', entidadId: s.id, valorAnterior: { estado: s.estado }, valorNuevo: { estado: 'Vencida', inasistencias: faltas }, ip: quien.ip });
    avisos = await avisoAlCliente(tx, s.clienteId,
      { solicitudId: s.id, tipo: 'solicitud_vencida', titulo: `Su solicitud ${codigo} venció`, mensaje: 'No pudimos realizar la cita por segunda vez. Si más adelante quiere el servicio, envíe una nueva solicitud.', enlace: '/cliente/pedidos/solicitudes' },
      `GARWEB · Su solicitud ${codigo} venció`, `No pudimos realizar la cita de la solicitud ${codigo} por segunda vez, así que la solicitud venció. Si más adelante quiere el servicio, envíe una nueva solicitud.`);
    await guardarAvisos(tx, avisos);
  });
  await enviarCorreos(correo, avisos);
}

export function citaDto(c: { id: number; tipo: string; fechaHora: Date; franja: string | null; duracionMin: number; estado: string; reprogramaciones: number }) {
  const { fecha } = enNY(c.fechaHora);
  return { id: c.id, tipo: c.tipo as TipoCita, fecha, hora: horaDe(c), franja: c.franja as Franja | null, duracionMin: c.duracionMin, estado: c.estado, reprogramaciones: c.reprogramaciones };
}
