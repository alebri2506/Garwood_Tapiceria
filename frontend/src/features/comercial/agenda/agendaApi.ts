import { API_URL, apiFetch } from '../../../shared/api/http';
import type { CitaDto } from '../solicitud/solicitudApi';

// A2 Agenda del Administrador (CU-C03, C04): la semana, bloqueos y vencer tras la segunda inasistencia.
// Agendar, reprogramar y cancelar usan citasApi; marcar asistencia, adminSolicitudesApi.resultadoCita.

export interface CitaAgenda extends CitaDto {
  direccion: string | null;
  solicitud: {
    codigo: string; estado: string; cliente: string; telefono: string; email: string | null; mueble: string; servicio: string;
    tela: string; telaDescripcion: string | null; fotos: number; inasistencias: number; tieneProgramada: boolean;
  };
}
export interface BloqueoAgenda { id: number; fecha: string; horaInicio: string | null; horaFin: string | null; motivo: string }
export interface Semana {
  desde: string; hasta: string; hoy: string; ahora: string;
  turnos: string[]; duracionMin: number; visitaDuracionMin: number; maxInasistencias: number;
  horario: { manana: string; tarde: string; visitaManana: string; visitaTarde: string };
  dias: { fecha: string; cerrado: string | null }[];
  bloqueos: (BloqueoAgenda & { horaInicio: string; horaFin: string })[];
  proximosBloqueos: BloqueoAgenda[];
  citas: CitaAgenda[];
}

interface AgendaApi {
  semana(desde?: string): Promise<Semana>;
  bloquear(bloques: { fecha: string; hora: string }[], motivo?: string): Promise<{ bloqueados: number }>;
  vencer(codigo: string): Promise<void>;
}

const http: AgendaApi = {
  semana: (desde) => apiFetch(`/admin/agenda${desde ? `?desde=${desde}` : ''}`),
  bloquear: (bloques, motivo) => apiFetch('/admin/agenda/bloqueos', { method: 'POST', body: JSON.stringify({ bloques, motivo }) }),
  vencer: async (codigo) => { await apiFetch(`/admin/solicitudes/${encodeURIComponent(codigo)}/vencer`, { method: 'POST' }); },
};

// ---------------------------------------------------------------- API simulada (sin VITE_API_URL): una semana de ejemplo.
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TURNOS = ['09:30', '10:00', '10:30', '11:00', '11:30', '15:00', '15:30', '16:00', '16:30'];
const bloqueados: BloqueoAgenda[] = [];
function lunes(desde?: string) {
  const d = desde ? new Date(`${desde}T12:00:00`) : new Date();
  d.setDate(d.getDate() + (d.getDay() === 0 ? 1 : 1 - d.getDay()));
  return d;
}
const ejemplo = (id: number, fecha: string, hora: string, cliente: string, mueble: string, estado: string, tipo: 'local' | 'domicilio' = 'local'): CitaAgenda => ({
  id, tipo, fecha, hora, franja: tipo === 'domicilio' ? (hora < '12:00' ? 'manana' : 'tarde') : null, duracionMin: tipo === 'local' ? 30 : 60, estado, reprogramaciones: 0,
  direccion: tipo === 'domicilio' ? '48 Park St, Montclair, NJ 07042' : null,
  solicitud: { codigo: `SOL-00${70 + id}`, estado: estado === 'Atendida' ? 'Atendida' : 'En espera de cita', cliente, telefono: '+19735550142', email: null, mueble, servicio: 'Retapizado completo', tela: tipo === 'local' ? 'Ver en el local' : 'Visita a domicilio', telaDescripcion: null, fotos: 2, inasistencias: estado === 'No asistió' ? 1 : 0, tieneProgramada: estado === 'Programada' },
});
const simulada: AgendaApi = {
  semana: async (desde) => {
    const l = lunes(desde);
    const dias = Array.from({ length: 6 }, (_, i) => { const d = new Date(l); d.setDate(l.getDate() + i); return iso(d); });
    const hoy = iso(new Date());
    return {
      desde: dias[0]!, hasta: dias[5]!, hoy, ahora: `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`,
      turnos: TURNOS, duracionMin: 30, visitaDuracionMin: 60, maxInasistencias: 1,
      horario: { manana: '09:30-12:00', tarde: '15:00-17:00', visitaManana: '09:00-12:00', visitaTarde: '15:00-17:00' },
      dias: dias.map((fecha) => ({ fecha, cerrado: null })),
      bloqueos: bloqueados.filter((b) => dias.includes(b.fecha)) as Semana['bloqueos'],
      proximosBloqueos: bloqueados,
      citas: [
        ejemplo(1, dias[0]!, '09:30', 'Mark Ellison', 'Sillón', 'Atendida'),
        ejemplo(2, dias[1]!, '10:00', 'Laura Méndez', 'Sofá de 3 cuerpos', 'Programada'),
        ejemplo(3, dias[2]!, '16:00', 'Linda Park', 'Sofá seccional (en L)', 'Programada', 'domicilio'),
        ejemplo(4, dias[3]!, '11:00', 'Tom Becker', 'Cabecera de cama', 'No asistió'),
      ],
    };
  },
  bloquear: async (bloques, motivo = 'Bloqueado por el administrador') => {
    bloques.forEach((b) => bloqueados.push({ id: bloqueados.length + 1, fecha: b.fecha, horaInicio: b.hora, horaFin: TURNOS[TURNOS.indexOf(b.hora) + 1] ?? '17:00', motivo }));
    return { bloqueados: bloques.length };
  },
  vencer: async () => undefined,
};

export const agendaApi: AgendaApi = API_URL ? http : simulada;
