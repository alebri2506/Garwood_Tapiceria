import { API_URL, ApiError, apiFetch } from '../../../shared/api/http';
import { SOLICITUDES_SIMULADAS, type CitaDto, type DireccionEnvio } from '../solicitud/solicitudApi';
import { DIAS_SEMANA_ISO, TURNOS, libre } from './agenda';

// CU-C03/C04 · turnos libres, programar, reprogramar y cancelar citas (W3) y visitas a domicilio (W3b).

export type TipoCita = 'local' | 'domicilio';
export interface DiaLocal { fecha: string; cerrado: boolean; turnos: { hora: string; libre: boolean }[] }
export interface DiaVisita { fecha: string; cerrado: boolean; franjas: { codigo: 'manana' | 'tarde'; nombre: string; libre: boolean }[] }
export interface Disponibilidad<D> { tipo: TipoCita; desde: string; hasta: string; limite: string; duracionMin: number; horario: string; dias: D[] }

export interface TurnoPedido { fecha: string; hora?: string; franja?: 'manana' | 'tarde' }

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
const mockCitasApi: CitasApi = {
  disponibilidadLocal: async () => {
    const dias = diasSimulados(false, (d) => ({ fecha: iso(d), cerrado: !DIAS_SEMANA_ISO.includes(d.getDay()), turnos: TURNOS.map((hora, j) => ({ hora, libre: libre(d, j) })) }));
    return { tipo: 'local', desde: dias[0]!.fecha, hasta: dias[dias.length - 1]!.fecha, limite: dias[dias.length - 1]!.fecha, duracionMin: 30, horario: '09:30–12:00 y 15:00–17:00', dias };
  },
  disponibilidadVisita: async () => {
    const dias = diasSimulados(true, (d) => ({
      fecha: iso(d), cerrado: d.getDay() === 0,
      franjas: [{ codigo: 'manana' as const, nombre: 'Mañana · 09:00–12:00', libre: d.getDay() !== 0 && d.getDate() % 5 !== 1 }, { codigo: 'tarde' as const, nombre: 'Tarde · 15:00–17:00', libre: d.getDay() !== 0 && d.getDate() % 4 !== 2 }],
    }));
    return { tipo: 'domicilio', desde: dias[0]!.fecha, hasta: dias[dias.length - 1]!.fecha, limite: dias[dias.length - 1]!.fecha, duracionMin: 60, horario: '09:00–12:00 y 15:00–17:00', dias };
  },
  agendar: async (e) => {
    const s = SOLICITUDES_SIMULADAS.find((x) => x.codigo === e.solicitud);
    if (!s) throw new ApiError('No encontramos esa solicitud.', 404);
    s.cita = { id: idCita++, tipo: e.tipo, fecha: e.fecha, hora: e.hora ?? null, franja: e.franja ?? null, duracionMin: e.tipo === 'local' ? 30 : 60, estado: 'Programada', reprogramaciones: s.inasistencias, direccion: e.direccion?.tipo === 'nueva' ? e.direccion.texto : null };
    return s.cita;
  },
  reprogramar: async (id, t) => {
    const s = SOLICITUDES_SIMULADAS.find((x) => x.cita?.id === id);
    if (!s?.cita) throw new ApiError('No encontramos esa cita.', 404);
    s.cita = { ...s.cita, id: idCita++, fecha: t.fecha, hora: t.hora ?? null, franja: t.franja ?? null };
    return s.cita;
  },
  cancelar: async (id) => {
    const s = SOLICITUDES_SIMULADAS.find((x) => x.cita?.id === id);
    if (s?.cita) s.cita = { ...s.cita, estado: 'Cancelada' };
  },
};

export const citasApi: CitasApi = API_URL ? httpCitasApi : mockCitasApi;
