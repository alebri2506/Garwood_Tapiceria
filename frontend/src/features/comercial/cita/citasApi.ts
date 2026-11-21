import { API_URL, ApiError, apiFetch } from '../../../shared/api/http';
import { SOLICITUDES_SIMULADAS, type CitaDto, type DireccionEnvio } from '../solicitud/solicitudApi';
import { DIAS_SEMANA_ISO, TURNOS, libre } from './agenda';

// CU-C03/C04 · turnos libres, programar, reprogramar y cancelar citas (W3) y visitas a domicilio (W3b).

export type TipoCita = 'local' | 'domicilio';
export interface DiaLocal { fecha: string; cerrado: boolean; turnos: { hora: string; libre: boolean }[] }
/** W3b (diseño del 13/11): horas de visita de 1 hora; «Ocup.» si chocan con la agenda del administrador o un bloqueo. */
export interface HoraVisita { hora: string; hasta: string; libre: boolean; motivo: string | null }
export interface DiaVisita { fecha: string; cerrado: string | boolean | null; horas: HoraVisita[] }
export interface Disponibilidad<D> { tipo: TipoCita; desde: string; hasta: string; limite: string; duracionMin: number; horario: string; dias: D[]; /** Solo visitas: las horas del día (9:00, 10:00…). */ horas?: string[] }

export interface TurnoPedido { fecha: string; hora?: string }

export interface CitasApi {
  disponibilidadLocal(): Promise<Disponibilidad<DiaLocal>>;
  disponibilidadVisita(): Promise<Disponibilidad<DiaVisita>>;
  agendar(e: TurnoPedido & { solicitud: string; tipo: TipoCita; direccion?: DireccionEnvio }): Promise<CitaDto>;
  reprogramar(id: number, t: TurnoPedido): Promise<CitaDto>;
  cancelar(id: number): Promise<void>;
}

const httpCitasApi: CitasApi = {
  disponibilidadLocal: () => apiFetch('/citas/disponibilidad?tipo=local&dias=100'),
  disponibilidadVisita: () => apiFetch('/citas/disponibilidad?tipo=domicilio&dias=100'),
  agendar: (e) => apiFetch('/citas', { method: 'POST', body: JSON.stringify(e) }),
  reprogramar: (id, t) => apiFetch(`/citas/${id}/reprogramar`, { method: 'POST', body: JSON.stringify(t) }),
  cancelar: async (id) => { await apiFetch(`/citas/${id}/cancelar`, { method: 'POST' }); },
};

// ---------------------------------------------------------------- API simulada (sin VITE_API_URL): ocupación de ejemplo.
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function diasSimulados<D>(desdeManana: boolean, f: (d: Date) => D) {
  const out: D[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (desdeManana) d.setDate(d.getDate() + 1);
  for (let i = 0; i < 84; i++, d.setDate(d.getDate() + 1)) out.push(f(new Date(d)));
  return out;
}
let idCita = 1;
const HORAS_VISITA = ['09:00', '10:00', '11:00', '15:00', '16:00'];
const mockCitasApi: CitasApi = {
  disponibilidadLocal: async () => {
    const dias = diasSimulados(false, (d) => ({ fecha: iso(d), cerrado: !DIAS_SEMANA_ISO.includes(d.getDay()), turnos: TURNOS.map((hora, j) => ({ hora, libre: libre(d, j) })) }));
    return { tipo: 'local', desde: dias[0]!.fecha, hasta: dias[dias.length - 1]!.fecha, limite: dias[dias.length - 1]!.fecha, duracionMin: 30, horario: '09:30–12:00 y 15:00–17:00', dias };
  },
  disponibilidadVisita: async () => {
    const dias = diasSimulados(true, (d) => ({
      fecha: iso(d), cerrado: d.getDay() === 0 ? 'Domingo' : null,
      horas: HORAS_VISITA.map((hora, k) => {
        const libreH = d.getDay() !== 0 && (d.getDate() * 3 + k * 5) % 7 > 1;
        return { hora, hasta: `${String(+hora.slice(0, 2) + 1).padStart(2, '0')}:00`, libre: libreH, motivo: libreH ? null : 'Hora ocupada' };
      }),
    }));
    return { tipo: 'domicilio', desde: dias[0]!.fecha, hasta: dias[dias.length - 1]!.fecha, limite: dias[dias.length - 1]!.fecha, duracionMin: 60, horario: '09:00–12:00 y 15:00–17:00', horas: HORAS_VISITA, dias };
  },
  agendar: async (e) => {
    const s = SOLICITUDES_SIMULADAS.find((x) => x.codigo === e.solicitud);
    if (!s) throw new ApiError('No encontramos esa solicitud.', 404);
    s.cita = { id: idCita++, tipo: e.tipo, fecha: e.fecha, hora: e.hora ?? null, franja: e.tipo === 'domicilio' && e.hora ? (e.hora < '12:00' ? 'manana' : 'tarde') : null, duracionMin: e.tipo === 'local' ? 30 : 60, estado: 'Programada', reprogramaciones: s.inasistencias, direccion: e.direccion?.tipo === 'nueva' ? e.direccion.texto : null };
    return s.cita;
  },
  reprogramar: async (id, t) => {
    const s = SOLICITUDES_SIMULADAS.find((x) => x.cita?.id === id);
    if (!s?.cita) throw new ApiError('No encontramos esa cita.', 404);
    s.cita = { ...s.cita, id: idCita++, fecha: t.fecha, hora: t.hora ?? null, franja: s.cita.tipo === 'domicilio' && t.hora ? (t.hora < '12:00' ? 'manana' : 'tarde') : null };
    return s.cita;
  },
  cancelar: async (id) => {
    const s = SOLICITUDES_SIMULADAS.find((x) => x.cita?.id === id);
    if (s?.cita) s.cita = { ...s.cita, estado: 'Cancelada' };
  },
};

export const citasApi: CitasApi = API_URL ? httpCitasApi : mockCitasApi;
