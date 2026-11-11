import { API_URL, apiDescargar, apiFetch, guardarArchivo } from '../../../shared/api/http';

// CU-S06 · A20 › Registro de actividad: consultar con filtros y exportar a CSV (decisiones D.2).

/** Filtro "Quién" (equipo, 10/11): por tipo, porque una lista con cada persona no sirve cuando hay muchos clientes. */
export type TipoActor = 'personal' | 'clientes' | 'sistema';

export interface FiltrosActividad {
  desde?: string;
  hasta?: string;
  tipo?: TipoActor;
  modulo?: string;
  q?: string;
  pagina?: number;
}
export interface RegistroActividad {
  /** `nombre`: quién lo hizo ("Laura Méndez"); `usuario`: su correo o usuario, para distinguir a dos personas con el mismo nombre. */
  id: number; fecha: string; nombre: string; usuario: string; modulo: string; accion: string; registro: string; cambio: string; ip: string | null;
}
export interface PaginaActividad {
  desde: string; hasta: string; truncado: boolean; total: number; pagina: number; porPagina: number;
  registros: RegistroActividad[];
  opciones: { tipos: { codigo: TipoActor; nombre: string }[]; modulos: { codigo: string; nombre: string }[] };
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
type Ejemplo = RegistroActividad & { tipo: TipoActor };
const ejemplo: Ejemplo[] = [
  { id: 6, tipo: 'personal', fecha: hace(5), nombre: 'Administrador Gerencia', usuario: 'admin@garwood.test', modulo: 'Configuración', accion: 'Parámetro', registro: 'Duración del turno de cita', cambio: '45 min → 30 min', ip: null },
  { id: 5, tipo: 'personal', fecha: hace(60), nombre: 'Administrador Gerencia', usuario: 'admin@garwood.test', modulo: 'Comercial', accion: 'Cita programada', registro: 'SOL-0012', cambio: 'lun 16 nov, 10:00', ip: null },
  { id: 4, tipo: 'sistema', fecha: hace(180), nombre: 'Sistema', usuario: 'sistema', modulo: 'Seguridad', accion: 'Intentos fallidos', registro: 'carlos@garwood.test', cambio: 'Cuenta bloqueada por intentos fallidos', ip: null },
  { id: 3, tipo: 'clientes', fecha: hace(600), nombre: 'Laura Méndez', usuario: 'laura.mendez@correo.com', modulo: 'Comercial', accion: 'Solicitud registrada', registro: 'SOL-0012', cambio: 'Nueva · 1 mueble · 3 archivos · por la web', ip: null },
  { id: 2, tipo: 'personal', fecha: hace(1500), nombre: 'Carlos Ramos', usuario: 'carlos@garwood.test', modulo: 'Seguridad', accion: 'Inicio de sesión', registro: 'carlos@garwood.test', cambio: '', ip: null },
];
const filtrar = (f: FiltrosActividad): RegistroActividad[] => {
  const q = (f.q ?? '').toLowerCase();
  const modulo = f.modulo && { comercial: 'Comercial', historial: 'Historial', configuracion: 'Configuración', seguridad: 'Seguridad' }[f.modulo];
  return ejemplo
    .filter((r) => (!f.tipo || r.tipo === f.tipo) && (!modulo || r.modulo === modulo) && (!q || Object.values(r).join(' ').toLowerCase().includes(q)))
    .map(({ tipo: _, ...r }) => r);
};
const simulada: AuditoriaApi = {
  listar: async (f) => {
    const registros = filtrar(f);
    return {
      desde: f.desde ?? '', hasta: f.hasta ?? '', truncado: false, total: registros.length, pagina: 1, porPagina: 50, registros,
      opciones: {
        tipos: [{ codigo: 'personal', nombre: 'Personal del taller' }, { codigo: 'clientes', nombre: 'Clientes' }, { codigo: 'sistema', nombre: 'Sistema' }],
        modulos: [{ codigo: 'comercial', nombre: 'Comercial' }, { codigo: 'historial', nombre: 'Historial' }, { codigo: 'configuracion', nombre: 'Configuración' }, { codigo: 'seguridad', nombre: 'Seguridad' }],
      },
    };
  },
  exportar: async (f) => {
    const celda = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const filas = [['Fecha y hora', 'Nombre', 'Correo o usuario', 'Módulo', 'Acción', 'Registro', 'Antes → después'], ...filtrar(f).map((r) => [r.fecha, r.nombre, r.usuario, r.modulo, r.accion, r.registro, r.cambio])];
    guardarArchivo(new Blob(['﻿' + filas.map((x) => x.map(celda).join(',')).join('\r\n')], { type: 'text/csv' }), 'garweb-actividad-ejemplo.csv');
  },
};

export const auditoriaApi: AuditoriaApi = API_URL ? http : simulada;
