import { apiFetch } from '../../../shared/api/http';
import type { EntradaCotizacion } from '../cotizaciones/cotizacionesApi';

// A2b Atender la cita o la visita a domicilio (decisiones L): datos de la atención, traslado, respuesta y recojo.
// La cotización se arma con la API de A4 (cotizacionesApi). Solo con backend (VITE_API_URL).

export interface Atencion {
  solicitud: { codigo: string; estado: string; telaOpcion: string; traslado: 'delivery' | 'propio' | null; direccionId: number | null };
  cliente: { nombre: string; telefono: string | null; email: string | null };
  cita: { id: number; tipo: 'local' | 'domicilio'; estado: string; fecha: string; hora: string | null; franja: string | null; direccion: string | null } | null;
  /** Lo que pidió el cliente, mueble por mueble, con sus fotos y videos (paso 1). */
  muebles: { id: number; titulo: string; servicio: string; medidas: string | null; medios: { nombre: string; tipo: string; url: string | null }[] }[];
  direcciones: { id: number; etiqueta: string | null; texto: string; ciudad: string | null; principal: boolean }[];
  cotizacion: { codigo: string; estado: string; total: number; adelanto: number } | null;
  pedido: { codigo: string; estado: string; recojo: { tipo: 'agendado' | 'en_visita'; estado: string; fecha: string | null; hora: string | null } | null } | null;
}
export type DireccionTraslado = { tipo: 'guardada'; id: number } | { tipo: 'nueva'; texto: string; referencia?: string; guardar: boolean };
export type MetodoPago = 'efectivo' | 'tarjeta' | 'zelle' | 'cheque';
export interface Respuesta {
  cotizacion: EntradaCotizacion;
  respuesta: 'acepta' | 'pensara' | 'rechaza';
  pagaAhora?: boolean;
  metodo?: MetodoPago;
  motivo?: string;
}
export interface ResultadoRespuesta { cotizacion: string; estado: string; total: number; adelanto: number; vigenciaHasta: string; pedido: string | null; recojoPendiente: boolean }
export interface Disponibilidad { duracionMin: number; dias: { fecha: string; horas: { inicio: string; fin: string; estado: 'libre' | 'ocupada' | 'pasada' | 'cerrada' }[] }[] }

export const atencionApi = {
  datos: (s: string): Promise<Atencion> => apiFetch(`/admin/atencion/${encodeURIComponent(s)}`),
  /** CU-C04/C05: la visita se realizó (empieza la atención) o no se encontró al cliente. */
  resultado: (citaId: number, resultado: 'atendida' | 'no_asistio'): Promise<{ cita: string; puedeReprogramar: boolean }> =>
    apiFetch(`/citas/${citaId}/resultado`, { method: 'POST', body: JSON.stringify({ resultado }) }),
  traslado: (s: string, traslado: 'delivery' | 'propio', direccion?: DireccionTraslado): Promise<Atencion> =>
    apiFetch(`/admin/atencion/${encodeURIComponent(s)}/traslado`, { method: 'PUT', body: JSON.stringify({ traslado, direccion }) }),
  responder: (s: string, r: Respuesta): Promise<ResultadoRespuesta> =>
    apiFetch(`/admin/atencion/${encodeURIComponent(s)}/respuesta`, { method: 'POST', body: JSON.stringify(r) }),
  disponibilidad: (): Promise<Disponibilidad> => apiFetch('/admin/atencion/recojos/disponibilidad'),
  recojo: (pedido: string, r: { tipo: 'agendado'; fecha: string; hora: string } | { tipo: 'en_visita' }): Promise<Atencion> =>
    apiFetch(`/admin/atencion/pedidos/${encodeURIComponent(pedido)}/recojo`, { method: 'POST', body: JSON.stringify(r) }),
};
