// W2 · recojo preferido por hora (diseño del 11/11). Cada hora es un bloque de `recojo.duracion_min` dentro de las
// franjas del taller (`taller.franja_manana` / `taller.franja_tarde`) y se cruza con la agenda del Administrador:
// sale «Ocupada» si choca con una cita, una visita, otro recojo o un bloqueo. Al enviar la solicitud, la hora queda
// reservada en la agenda mientras la solicitud espera (RESERVAN_RECOJO).
import { prisma } from '../../../shared/infrastructure/prisma.js';
import { parametroNumero, parametroTexto } from '../../../shared/infrastructure/parametros.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import { hoyNegocio, leerFecha, motivoSinRecojo } from '../domain/calendario.js';
import { enNY, leerRango, minutosDe, motivoCierre, sumarDias, sumarMinutos } from '../domain/agenda.js';
import { bloqueosEntre, choca, ocupacion, type Tramo } from './citas.js';

const error = (m: string, status = 400) => new ReglaNegocioError(m, status);
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** RG-04: horas de recojo y cuántos días adelante se pueden pedir. */
export async function reglasRecojo() {
  const [manana, tarde, duracion, diasMax] = await Promise.all([
    parametroTexto(prisma, 'taller.franja_manana'),
    parametroTexto(prisma, 'taller.franja_tarde'),
    parametroNumero(prisma, 'recojo.duracion_min'),
    parametroNumero(prisma, 'recojo.dias_anticipacion_max'),
  ]);
  const horas: string[] = [];
  for (const rango of [manana, tarde]) {
    const { desde, hasta } = leerRango(rango);
    for (let t = desde; t + duracion <= hasta; t += duracion) horas.push(hhmm(t));
  }
  return { horas, duracion, diasMax };
}

/** Por qué no se puede esa hora de recojo (o null si está libre). */
function motivoHora(fecha: string, hora: string, duracion: number, tramos: Tramo[] | undefined, bloqueos: Tramo[] | undefined, ahora: { fecha: string; hora: string }) {
  if (fecha === ahora.fecha && hora <= ahora.hora) return 'Hora pasada';
  const desde = minutosDe(hora), hasta = desde + duracion;
  if (choca(bloqueos, desde, hasta)) return 'Hora bloqueada';
  if (choca(tramos, desde, hasta)) return 'Hora ocupada';
  return null;
}

/** Los bloqueos por horas de cada día, como tramos. */
const tramosBloqueo = (bloqueos: Awaited<ReturnType<typeof bloqueosEntre>>) => {
  const porDia = new Map<string, Tramo[]>();
  for (const b of bloqueos) {
    if (!b.horaInicio || !b.horaFin) continue;
    porDia.set(b.fecha, [...(porDia.get(b.fecha) ?? []), { desde: minutosDe(b.horaInicio), hasta: minutosDe(b.horaFin) }]);
  }
  return porDia;
};

/**
 * W2 · semanas de lunes a sábado (desde la semana actual) con cada hora de recojo y si está libre.
 * Domingos, feriados, días pasados y más allá de `recojo.dias_anticipacion_max` salen cerrados.
 */
export async function disponibilidadRecojo() {
  const r = await reglasRecojo();
  const hoy = hoyNegocio();
  const ahora = enNY(new Date());
  const dia = leerFecha(hoy)!.getUTCDay();
  const lunes = sumarDias(hoy, dia === 0 ? 1 : 1 - dia);
  const semanas = Math.max(1, Math.ceil((r.diasMax + (dia === 0 ? 0 : dia - 1)) / 7));
  const hasta = sumarDias(lunes, semanas * 7 - 1);
  const [porDia, bloqueos] = await Promise.all([ocupacion(lunes, hasta), bloqueosEntre(lunes, hasta)]);
  const bloqueosPorDia = tramosBloqueo(bloqueos);

  const dias = [];
  for (let s = 0; s < semanas; s++) {
    for (let d = 0; d < 6; d++) {
      const fecha = sumarDias(lunes, s * 7 + d);
      const cerrado = motivoSinRecojo(fecha, r.diasMax, hoy) ?? motivoCierre(fecha, bloqueos);
      dias.push({
        fecha, cerrado,
        horas: r.horas.map((hora) => {
          const motivo = cerrado ? null : motivoHora(fecha, hora, r.duracion, porDia.get(fecha), bloqueosPorDia.get(fecha), ahora);
          return { hora, hasta: sumarMinutos(hora, r.duracion), libre: !cerrado && !motivo, motivo };
        }),
      });
    }
  }
  return { duracionMin: r.duracion, horas: r.horas, semanas, dias };
}

/** Al enviar la solicitud: la hora existe, el día admite recojos y nada en la agenda la ocupa. */
export async function revisarHoraRecojo(fecha: string, hora: string) {
  const r = await reglasRecojo();
  if (!r.horas.includes(hora)) throw error('Elija una de las horas de recojo del calendario.');
  const sinRecojo = motivoSinRecojo(fecha, r.diasMax);
  if (sinRecojo) throw error(sinRecojo);
  const [porDia, bloqueos] = await Promise.all([ocupacion(fecha, fecha), bloqueosEntre(fecha, fecha)]);
  const cierre = motivoCierre(fecha, bloqueos);
  if (cierre) throw error(`Ese día no hay recojos: ${cierre.toLowerCase()}.`);
  const motivo = motivoHora(fecha, hora, r.duracion, porDia.get(fecha), tramosBloqueo(bloqueos).get(fecha), enNY(new Date()));
  if (motivo === 'Hora pasada') throw error('Esa hora ya pasó. Elija otra.');
  if (motivo) throw error('Esa hora de recojo ya está ocupada. Elija otra.', 409);
}
