// Turnos de la agenda (CU-C03 y C04). Sin Express ni Prisma.
//  - Cita en el local: turnos de `cita.duracion_min` dentro de las franjas de atención, un cliente por turno.
//  - Visita a domicilio: el cliente elige el día y la franja (mañana o tarde), una visita por franja.
//    El Administrador puede fijarle una hora (A2e): ocupa los turnos seguidos que dura la visita (1 hora).
import { feriados, leerFecha } from './calendario.js';

const ZONA = 'America/New_York';

/** "09:30-12:00" (o "9:30–12:00", como lo guarda A14) → minutos de inicio y fin. */
export function leerRango(rango: string) {
  const m = /^(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})$/.exec(rango.trim());
  if (!m) throw new Error(`Rango de horario inválido: ${rango}`);
  return { desde: +m[1]! * 60 + +m[2]!, hasta: +m[3]! * 60 + +m[4]! };
}

/** "HH:MM" → minutos desde las 00:00. */
export const minutosDe = (hora: string) => +hora.slice(0, 2) * 60 + +hora.slice(3, 5);

/** "09:30-12:00" → turnos de `duracion` minutos que empiezan dentro del rango. */
export function turnosDe(rango: string, duracion: number): string[] {
  const { desde, hasta } = leerRango(rango);
  const turnos: string[] = [];
  for (let t = desde; t + duracion <= hasta; t += duracion) turnos.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  return turnos;
}

/** Minutos que Nueva Jersey está detrás de UTC en ese instante (300 en invierno, 240 en verano). */
function desfaseNY(instante: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(instante).map((x) => [x.type, x.value]));
  const local = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!);
  return (instante.getTime() - local) / 60_000;
}

/** Fecha 'AAAA-MM-DD' y hora 'HH:MM' de Nueva Jersey → instante UTC. */
export function instanteNY(fecha: string, hora = '00:00') {
  const [h, mi] = hora.split(':').map(Number);
  const d = leerFecha(fecha)!;
  const ingenuo = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h!, mi!);
  const primero = ingenuo + desfaseNY(new Date(ingenuo)) * 60_000;
  return new Date(ingenuo + desfaseNY(new Date(primero)) * 60_000);
}

/** Instante UTC → fecha y hora de Nueva Jersey. */
export function enNY(instante: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(instante).map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

export interface Bloqueo { fecha: string; horaInicio: string | null; horaFin: string | null }

/** Días sin atención: domingos, feriados y bloqueos de todo el día. */
export function diaCerrado(fecha: string, bloqueos: Bloqueo[]) {
  const d = leerFecha(fecha);
  if (!d || d.getUTCDay() === 0) return true;
  if (feriados(d.getUTCFullYear()).some((f) => f.fecha.getTime() === d.getTime())) return true;
  return bloqueos.some((b) => b.fecha === fecha && !b.horaInicio);
}

/** El turno cae dentro de un bloqueo por horas de ese día. */
export const turnoBloqueado = (fecha: string, hora: string, bloqueos: Bloqueo[]) =>
  bloqueos.some((b) => b.fecha === fecha && b.horaInicio && b.horaFin && hora >= b.horaInicio && hora < b.horaFin);

/** Una franja de visita queda bloqueada si algún bloqueo por horas la toca. */
export const franjaBloqueada = (fecha: string, rango: string, bloqueos: Bloqueo[]) => {
  const [desde, hasta] = rango.split('-') as [string, string];
  return bloqueos.some((b) => b.fecha === fecha && b.horaInicio && b.horaFin && b.horaInicio < hasta && b.horaFin > desde);
};

/** Por qué el día no tiene atención (o null si atiende). */
export function motivoCierre(fecha: string, bloqueos: (Bloqueo & { motivo?: string })[]) {
  const d = leerFecha(fecha);
  if (!d) return 'Fecha no válida';
  if (d.getUTCDay() === 0) return 'Domingo';
  const feriado = feriados(d.getUTCFullYear()).find((f) => f.fecha.getTime() === d.getTime());
  if (feriado) return `Feriado · ${feriado.nombre}`;
  const todoElDia = bloqueos.find((b) => b.fecha === fecha && !b.horaInicio);
  return todoElDia ? todoElDia.motivo ?? 'Bloqueado' : null;
}

/** "15:30" + 30 → "16:00". */
export function sumarMinutos(hora: string, n: number) {
  const [h, m] = hora.split(':').map(Number);
  const t = h! * 60 + m! + n;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export const sumarDias = (fecha: string, n: number) => {
  const d = leerFecha(fecha)!;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
