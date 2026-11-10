import { API_URL, apiDescargar, apiFetch, guardarArchivo } from '../../../shared/api/http';

// CU-S06 · A20 › Registro de actividad: consultar con filtros y exportar a CSV (decisiones D.2).

export interface FiltrosActividad {
  desde?: string;
  hasta?: string;
  usuarioId?: number;
  modulo?: string;
  q?: string;
  pagina?: number;
}
export interface RegistroActividad {
  id: number; fecha: string; usuario: string; modulo: string; accion: string; registro: string; cambio: string; ip: string | null;
}
export interface PaginaActividad {
  desde: string; hasta: string; truncado: boolean; total: number; pagina: number; porPagina: number;
  registros: RegistroActividad[];
  opciones: { usuarios: { id: number; nombreUsuario: string; nombre: string | null }[]; modulos: { codigo: string; nombre: string }[] };
}

interface AuditoriaApi {
  listar(f: FiltrosActividad): Promise<PaginaActividad>;
  exportar(f: FiltrosActividad): Promise<void>;
}

/** ?desde=…&hasta=…: los filtros vacíos no se envían (el backend usa los últimos 30 días). */
export function consulta(f: FiltrosActividad) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '' && v !== null) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

const http: AuditoriaApi = {
  listar: (f) => apiFetch(`/admin/auditoria${consulta(f)}`),
  exportar: ({ pagina: _, ...f }) => apiDescargar(`/admin/auditoria/exportar${consulta(f)}`, 'garweb-actividad.csv'),
};

// ---------------------------------------------------------------- Sin API: unas filas de ejemplo.
const hace = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const ejemplo: RegistroActividad[] = [
  { id: 6, fecha: hace(5), usuario: 'admin', modulo: 'Configuración', accion: 'Parámetro', registro: 'Duración del turno de cita', cambio: '45 min → 30 min', ip: null },
  { id: 5, fecha: hace(60), usuario: 'admin', modulo: 'Comercial', accion: 'Cita programada', registro: 'SOL-0012', cambio: 'lun 16 nov, 10:00', ip: null },
  { id: 4, fecha: hace(180), usuario: 'sistema', modulo: 'Seguridad', accion: 'Intentos fallidos', registro: 'tapicero', cambio: 'Cuenta bloqueada por intentos fallidos', ip: null },
  { id: 3, fecha: hace(600), usuario: 'laura.mendez@correo.com', modulo: 'Comercial', accion: 'Solicitud registrada', registro: 'SOL-0012', cambio: 'Nueva · 1 mueble · 3 archivos · por la web', ip: null },
  { id: 2, fecha: hace(1500), usuario: 'admin', modulo: 'Seguridad', accion: 'Inicio de sesión', registro: 'admin', cambio: '', ip: null },
];
const filtrar = (f: FiltrosActividad) => {
  const q = (f.q ?? '').toLowerCase();
  const modulo = f.modulo && { comercial: 'Comercial', historial: 'Historial', configuracion: 'Configuración', seguridad: 'Seguridad' }[f.modulo];
  return ejemplo.filter((r) => (!modulo || r.modulo === modulo) && (!q || Object.values(r).join(' ').toLowerCase().includes(q)));
};
const simulada: AuditoriaApi = {
  listar: async (f) => {
    const registros = filtrar(f);
    return {
      desde: f.desde ?? '', hasta: f.hasta ?? '', truncado: false, total: registros.length, pagina: 1, porPagina: 50, registros,
      opciones: {
        usuarios: [{ id: 1, nombreUsuario: 'admin', nombre: 'Administrador' }, { id: 2, nombreUsuario: 'tapicero', nombre: 'Carlos' }],
        modulos: [{ codigo: 'comercial', nombre: 'Comercial' }, { codigo: 'historial', nombre: 'Historial' }, { codigo: 'configuracion', nombre: 'Configuración' }, { codigo: 'seguridad', nombre: 'Seguridad' }],
      },
    };
  },
  exportar: async (f) => {
    const celda = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const filas = [['Fecha y hora', 'Usuario', 'Módulo', 'Acción', 'Registro', 'Antes → después'], ...filtrar(f).map((r) => [r.fecha, r.usuario, r.modulo, r.accion, r.registro, r.cambio])];
    guardarArchivo(new Blob(['﻿' + filas.map((x) => x.map(celda).join(',')).join('\r\n')], { type: 'text/csv' }), 'garweb-actividad-ejemplo.csv');
  },
};

export const auditoriaApi: AuditoriaApi = API_URL ? http : simulada;
