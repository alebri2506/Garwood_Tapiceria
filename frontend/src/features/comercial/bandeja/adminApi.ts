import { API_URL, ApiError, apiFetch } from '../../../shared/api/http';
import { SOLICITUDES_SIMULADAS, type DireccionGuardada, type SolicitudCliente, type SolicitudCreada, type SolicitudEnvio } from '../solicitud/solicitudApi';

// A3 Solicitudes · lo que el Administrador pide a la API (CU-C01 por el taller y CU-C02 bandeja).

export const ESTADOS_SOLICITUD = ['Nueva', 'En espera de cita', 'Atendida', 'Cotizada', 'Vencida', 'Descartada'] as const;

export interface FilaBandeja {
  codigo: string; estado: string; canal: string; fecha: string; dias: number; atrasada: boolean;
  cliente: string; ciudad: string | null; muebles: string[]; archivos: number;
  tela: SolicitudEnvio['tela']; esperaFotos: boolean; tieneCita: boolean;
}
export interface Bandeja { diasAtraso: number; conteo: Record<string, number>; solicitudes: FilaBandeja[]; motivosDescarte: string[] }

export interface FichaAdmin extends SolicitudCliente {
  cliente: { id: number; nombre: string; tipoPersona: string; email: string | null; telefono: string; tieneCuenta: boolean };
  registradaPor: string;
  puedeDescartarse: boolean;
  historial: { accion: string; fecha: string; quien: string }[];
}

export interface ClienteBuscado {
  id: number; nombre: string; tipoPersona: string; email: string | null; telefono: string; ciudad: string | null; solicitudes: number;
  direcciones: DireccionGuardada[];
}

export interface ClienteNuevoEnvio { tipoPersona: 'persona' | 'empresa'; nombres: string; apellidos: string; razonSocial?: string; documento?: string; telefono: string; email?: string }

export interface RegistroAdmin {
  cliente: { id: number } | { nuevo: ClienteNuevoEnvio };
  canal: 'telefono' | 'local' | 'correo' | 'mensaje';
  esperaFotos: boolean;
  avisar: boolean;
  solicitud: SolicitudEnvio;
}

export interface AdminSolicitudesApi {
  bandeja(): Promise<Bandeja>;
  ficha(codigo: string): Promise<FichaAdmin>;
  descartar(codigo: string, motivo: string): Promise<FichaAdmin>;
  buscarClientes(q: string): Promise<ClienteBuscado[]>;
  registrar(datos: RegistroAdmin, fotos: File[][]): Promise<SolicitudCreada & { esperaFotos: boolean; cuentaCreada: boolean }>;
  resultadoCita(id: number, resultado: 'atendida' | 'no_asistio'): Promise<void>;
}

const httpApi: AdminSolicitudesApi = {
  bandeja: () => apiFetch('/admin/solicitudes'),
  ficha: (codigo) => apiFetch(`/admin/solicitudes/${encodeURIComponent(codigo)}`),
  descartar: (codigo, motivo) => apiFetch(`/admin/solicitudes/${encodeURIComponent(codigo)}/descartar`, { method: 'POST', body: JSON.stringify({ motivo }) }),
  buscarClientes: (q) => apiFetch(`/admin/clientes?q=${encodeURIComponent(q)}`),
  registrar: (datos, fotos) => {
    const fd = new FormData();
    fd.append('datos', JSON.stringify(datos));
    fotos.forEach((archivos, i) => archivos.forEach((a) => fd.append(`mueble_${i}`, a, a.name)));
    return apiFetch('/admin/solicitudes', { method: 'POST', body: fd });
  },
  resultadoCita: async (id, resultado) => { await apiFetch(`/citas/${id}/resultado`, { method: 'POST', body: JSON.stringify({ resultado }) }); },
};

// ---------------------------------------------------------------- API simulada (sin VITE_API_URL)
const MOTIVOS = ['El cliente no respondió', 'Trabajo que no hacemos', 'Solicitud duplicada', 'El cliente desistió', 'Otro motivo'];
const CLIENTES: ClienteBuscado[] = [
  { id: 1, nombre: 'Laura Méndez', tipoPersona: 'persona', email: 'laura.mendez@correo.com', telefono: '+19735550142', ciudad: 'Montclair', solicitudes: 2,
    direcciones: [{ id: 1, etiqueta: 'Casa', direccion: '48 Park St, Montclair, NJ 07042', referencia: null, ciudad: 'Montclair', latitud: 40.8223, longitud: -74.2146 }] },
  { id: 2, nombre: 'Mark Ellison', tipoPersona: 'persona', email: 'mark.ellison@correo.com', telefono: '+19735550177', ciudad: 'Bloomfield', solicitudes: 1, direcciones: [] },
];
const fichaDe = (s: SolicitudCliente): FichaAdmin => ({
  ...s, cliente: { id: 1, nombre: 'Laura Méndez', tipoPersona: 'persona', email: 'laura.mendez@correo.com', telefono: '+19735550142', tieneCuenta: true },
  registradaPor: s.canal === 'web' ? 'el cliente' : 'admin', puedeDescartarse: ['Nueva', 'En espera de cita', 'Atendida'].includes(s.estado),
  historial: [{ accion: 'solicitud_registrada', fecha: s.fecha, quien: s.canal === 'web' ? 'Cliente' : 'admin' }],
});
const buscar = (codigo: string) => {
  const s = SOLICITUDES_SIMULADAS.find((x) => x.codigo === codigo);
  if (!s) throw new ApiError('No encontramos esa solicitud.', 404);
  return s;
};
const mockApi: AdminSolicitudesApi = {
  bandeja: async () => ({
    diasAtraso: 2, motivosDescarte: MOTIVOS,
    conteo: SOLICITUDES_SIMULADAS.reduce<Record<string, number>>((a, s) => ({ ...a, [s.estado]: (a[s.estado] ?? 0) + 1 }), {}),
    solicitudes: SOLICITUDES_SIMULADAS.map((s) => ({
      codigo: s.codigo, estado: s.estado, canal: s.canal, fecha: s.fecha, dias: 0, atrasada: false, cliente: 'Laura Méndez', ciudad: 'Montclair',
      muebles: s.muebles.map((m) => `${m.cantidad > 1 ? `${m.cantidad} × ` : ''}${m.tipo}`), archivos: s.muebles.reduce((t, m) => t + m.archivos.length, 0),
      tela: s.tela, esperaFotos: s.esperaFotos, tieneCita: s.cita?.estado === 'Programada',
    })),
  }),
  ficha: async (codigo) => fichaDe(buscar(codigo)),
  descartar: async (codigo, motivo) => {
    const s = buscar(codigo);
    Object.assign(s, { estado: 'Descartada', motivoDescarte: motivo });
    return fichaDe(s);
  },
  buscarClientes: async (q) => CLIENTES.filter((c) => `${c.nombre} ${c.email} ${c.telefono}`.toLowerCase().includes(q.toLowerCase())),
  registrar: async (datos) => {
    const codigo = `SOL-${String(90 + SOLICITUDES_SIMULADAS.length).padStart(4, '0')}`;
    const cita = datos.solicitud.tela === 'local' || datos.solicitud.tela === 'domicilio';
    SOLICITUDES_SIMULADAS.unshift({ ...SOLICITUDES_SIMULADAS[0]!, codigo, canal: datos.canal, estado: cita ? 'En espera de cita' : 'Nueva', esperaFotos: datos.esperaFotos, tela: datos.solicitud.tela, cita: null });
    return { codigo, estado: cita ? 'En espera de cita' : 'Nueva', siguiente: cita ? 'cita' : 'cotizacion', cita: null, esperaFotos: datos.esperaFotos, cuentaCreada: 'nuevo' in datos.cliente && Boolean(datos.cliente.nuevo.email) };
  },
  resultadoCita: async () => {},
};

export const adminSolicitudesApi: AdminSolicitudesApi = API_URL ? httpApi : mockApi;
