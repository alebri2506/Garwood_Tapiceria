import { apiFetch } from '../../../shared/api/http';
import type { Disponibilidad } from '../atender/atencionApi';

// W4 Mi cotización: lo que el cliente ve de su cotización (sin el sugerido ni el desglose de costos, RG-08) y su respuesta.

export interface MuebleCotizado {
  tipo: string;
  cantidad: number;
  servicio: string;
  /** Lo que se hará (sin horas, máquinas ni costos). */
  trabajos: string[];
  telas: { nombre: string; pattern: string | null; numeroColor: string | null; colorHex: string | null }[];
  /** Sin tela del taller: «Lo brinda usted» o «No lleva tela». */
  tela: string | null;
  precio: number;
  foto: string | null;
}

export interface MiCotizacion {
  solicitud: string;
  codigo: string;
  /** Pendiente de respuesta · Aceptada: pendiente de adelanto · Aceptada · Rechazada · Vencida */
  estado: string;
  nombre: string;
  publicada: string | null;
  vigenciaHasta: string | null;
  diasRestantes: number | null;
  muebles: MuebleCotizado[];
  transporte: number;
  total: number;
  adelanto: number;
  adelantoPct: number;
  traslado: 'delivery' | 'propio' | null;
  direccion: string | null;
  observaciones: string[];
  respuesta: { fecha: string; medio: string | null; motivo: string | null } | null;
  pedido: { codigo: string; recojo: { tipo: string; fecha: string | null; hora: string | null } | null } | null;
  eligeRecojo: boolean;
}

export const MOTIVOS_RECHAZO = [
  { id: 'Precio', l: 'Precio' }, { id: 'Plazo de entrega', l: 'Plazo de entrega' },
  { id: 'Elegirá otro taller', l: 'Elegí otro taller' }, { id: 'Otro motivo', l: 'Otro motivo' },
] as const;
export type MotivoRechazo = (typeof MOTIVOS_RECHAZO)[number]['id'];

export type RespuestaCliente = { respuesta: 'rechaza'; motivo: MotivoRechazo; comentario?: string } | { respuesta: 'acepta'; comentario?: string };

const base = (s: string) => `/solicitudes/${encodeURIComponent(s)}`;

export const miCotizacionApi = {
  ver: (solicitud: string) => apiFetch<MiCotizacion>(`${base(solicitud)}/cotizacion`),
  responder: (solicitud: string, r: RespuestaCliente) =>
    apiFetch<{ cotizacion: string; estado: string; pedido: string | null; eligeRecojo: boolean }>(`${base(solicitud)}/cotizacion/respuesta`, { method: 'POST', body: JSON.stringify(r) }),
  /** «Aceptar y pagar el adelanto»: devuelve la página segura de la pasarela (Stripe) a la que se redirige. */
  /** `incrustado`: devuelve el clientSecret para mostrar el pago dentro de W4; si no, la página de Stripe (`url`). */
  pagar: (solicitud: string, comentario?: string, incrustado = false) =>
    apiFetch<{ url: string | null; clientSecret: string | null }>(`${base(solicitud)}/cotizacion/pago`, { method: 'POST', body: JSON.stringify({ comentario, incrustado }) }),
  /** Al volver de la pasarela: confirma el cobro (si se pagó, ya hay pedido). */
  confirmarPago: (solicitud: string, sesion: string) =>
    apiFetch<{ estado: 'registrado' | 'pendiente'; pedido: string | null }>(`${base(solicitud)}/cotizacion/pago/confirmar`, { method: 'POST', body: JSON.stringify({ sesion }) }),
  disponibilidad: () => apiFetch<Disponibilidad>('/solicitudes/recojos/disponibilidad'),
  recojo: (solicitud: string, fecha: string, hora: string) =>
    apiFetch<{ pedido: string; fecha: string; hora: string }>(`${base(solicitud)}/recojo`, { method: 'POST', body: JSON.stringify({ fecha, hora }) }),
};
