// Agenda de citas en el local (CU-C03/C04). Turnos y ocupación son de EJEMPLO para maquetar W3:
// cuando exista la API vendrán de la disponibilidad que configura el Administrador y de las citas tomadas.
import { DIAS, MESES, feriadoDe, hoy, mismoDia } from '../fechas';

/** Inicio de cada turno de 30 min (parámetro "duración del turno de cita"). */
export const TURNOS = ['09:30', '10:00', '10:30', '11:00', '11:30', '15:00', '15:30', '16:00', '16:30'];
export const PRIMER_TURNO_TARDE = 5;
export const MINUTOS_TURNO = 30;
export const SEMANAS_VISIBLES = 12;
/** Pendiente: la dirección del local sale de los parámetros del taller. */
export const DIRECCION_LOCAL = '[dirección del local]';

export interface Turno {
  fecha: Date;
  hora: string;
}

export const sumarDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const lunesDe = (d: Date) => sumarDias(d, -((d.getDay() + 6) % 7));
export const ultimoDiaAgendable = () => sumarDias(lunesDe(hoy()), SEMANAS_VISIBLES * 7 - 1);

export function finDeTurno(hora: string, minutos = MINUTOS_TURNO) {
  const [h, m] = hora.split(':').map(Number) as [number, number];
  const t = h * 60 + m + minutos;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** Cerrado: domingos y feriados. Pasado: antes de hoy. */
export const cerrado = (d: Date) => d.getDay() === 0 || Boolean(feriadoDe(d));

/** ¿El turno j del día d está libre? (ocupación simulada, estable para cada fecha) */
export function libre(d: Date, j: number) {
  const base = hoy();
  if (d < base || d > ultimoDiaAgendable() || cerrado(d)) return false;
  if (mismoDia(d, base)) {
    const [h, m] = TURNOS[j]!.split(':').map(Number) as [number, number];
    const ahora = new Date();
    return h * 60 + m > ahora.getHours() * 60 + ahora.getMinutes() + 60; // al menos 1 h de anticipación
  }
  const dia = d.getDate() + (d.getMonth() + 1) * 31;
  const carga = ((dia * 53) % 13) % 7; // días más y menos llenos
  return (dia * 7 + j * 13) % 9 >= carga + 1;
}

export const libresDelDia = (d: Date) => TURNOS.filter((_, j) => libre(d, j)).length;

/** Primer turno libre desde mañana. */
export function primerTurnoLibre(): Turno | null {
  for (let d = sumarDias(hoy(), 1); d <= ultimoDiaAgendable(); d = sumarDias(d, 1)) {
    const j = TURNOS.findIndex((_, i) => libre(d, i));
    if (j >= 0) return { fecha: d, hora: TURNOS[j]! };
  }
  return null;
}

export const mismoTurno = (a: Turno | null, fecha: Date, hora: string) => Boolean(a && a.hora === hora && mismoDia(a.fecha, fecha));

export const textoTurno = (t: Turno) =>
  `${DIAS[t.fecha.getDay()]} ${t.fecha.getDate()} de ${MESES[t.fecha.getMonth()]} · ${t.hora}–${finDeTurno(t.hora)}`;
export const textoTurnoCorto = (t: Turno) =>
  `${DIAS[t.fecha.getDay()]!.slice(0, 3)} ${t.fecha.getDate()} ${MESES[t.fecha.getMonth()]!.slice(0, 3)} · ${t.hora}`;

/** Días con atención (lunes a sábado), con getDay(). */
export const DIAS_SEMANA_ISO = [1, 2, 3, 4, 5, 6];
