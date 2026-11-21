// Módulo de Pagos (A5 y W5 · decisiones O): lo que devuelve el backend. Saldo = total − pagos confirmados (calculado en
// el servidor). El cliente nunca recibe costos internos (RG-08).
import { apiFetch } from '../../../shared/api/http';
import { DIAS, MESES } from '../fechas';

export type MetodoApi = 'efectivo' | 'cheque' | 'zelle' | 'transferencia' | 'tarjeta';

export interface CuentaResumen { total: number; pagado: number; porConfirmar: number; saldo: number }

export interface PagoAdmin {
  id: number;
  pedido: string | null;
  estadoPedido: string | null;
  cotizacion: string;
  solicitud: string | null;
  cliente: string;
  concepto: 'adelanto' | 'saldo';
  monto: number;
  metodo: MetodoApi;
  metodoNombre: string;
  origen: string;
  origenNombre: string;
  pasarela: boolean;
  estado: 'Por confirmar' | 'Confirmado' | 'Rechazado' | 'Anulado';
  detalle: string | null;
  referencia: string | null;
  recibo: string | null;
  comprobante: boolean;
  fecha: string;
  registradoPor: { nombre: string | null; rol: string };
  revision: { por: string | null; fecha: string; motivo: string | null } | null;
  anulacion: { por: string | null; fecha: string; motivo: string | null } | null;
  reemplazaA: number | null;
  reemplazadoPor: number | null;
  cuentaPedido: CuentaResumen | null;
}

export interface SaldoPendiente extends CuentaResumen {
  /** null: cotización aceptada que espera su adelanto (el pedido nace al pagarlo). */
  pedido: string | null;
  cotizacion: string | null;
  solicitud: string | null;
  cliente: string;
  estadoPedido: string;
  adelanto: number;
  disponible: number;
  faltaAdelanto: boolean;
  /** Lo que falta: el adelanto (si no lo completó) o el saldo. */
  debe: number;
  pagos: { concepto: string; metodo: MetodoApi; origen: string; monto: number; fecha: string; recibo: string | null }[];
}

export interface ResumenPagos {
  porConfirmar: { cantidad: number; monto: number };
  cobradoHoy: { cantidad: number; monto: number };
  saldoPorCobrar: { cantidad: number; monto: number };
}

export interface PagoClienteApi {
  id: number;
  concepto: 'adelanto' | 'saldo';
  monto: number;
  metodo: MetodoApi;
  metodoNombre: string;
  enLinea: boolean;
  estado: 'Por confirmar' | 'Confirmado' | 'Rechazado' | 'Anulado';
  fecha: string;
  fechaRevision: string | null;
  detalle: string | null;
  recibo: string | null;
  comprobante: boolean;
  motivo: string | null;
  reemplazado: boolean;
  reemplazaA: number | null;
}

export interface CuentaPedido extends CuentaResumen {
  pedido: string;
  titulo: string;
  estadoPedido: string;
  cotizacion: string | null;
  adelanto: number;
  disponible: number;
  faltaAdelanto: boolean;
  pagos: PagoClienteApi[];
  recibos: { codigo: string; concepto: string; monto: number; fecha: string }[];
  puedePagar: boolean;
  pagoEnLinea: boolean;
}

export const dinero = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const conceptoNombre = (c: string) => (c === 'adelanto' ? 'Adelanto' : 'Saldo');

/** «hoy 08:52», «ayer 16:20» o «mar 6 oct». */
export function cuando(iso: string) {
  const f = new Date(iso);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dia = new Date(f); dia.setHours(0, 0, 0, 0);
  const dias = Math.round((hoy.getTime() - dia.getTime()) / 86_400_000);
  const hora = f.toLocaleTimeString('es-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (dias === 0) return `hoy ${hora}`;
  if (dias === 1) return `ayer ${hora}`;
  return `${DIAS[f.getDay()]!.slice(0, 3)} ${f.getDate()} ${MESES[f.getMonth()]!.slice(0, 3)}`;
}

const admin = '/admin/pagos';
const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const pagosAdminApi = {
  resumen: () => apiFetch<ResumenPagos>(`${admin}/resumen`),
  porConfirmar: () => apiFetch<PagoAdmin[]>(`${admin}/por-confirmar`),
  confirmados: (origen?: 'pasarela' | 'manual') => apiFetch<PagoAdmin[]>(`${admin}/confirmados${origen ? `?origen=${origen}` : ''}`),
  saldos: () => apiFetch<SaldoPendiente[]>(`${admin}/saldos`),
  registrar: (e: { pedido?: string; cotizacion?: string; monto: number; metodo: MetodoApi; detalle?: string }) =>
    apiFetch<{ id: number; recibo: string; pedido: string; saldo: number; pedidoNuevo: boolean }>(admin, json(e)),
  confirmar: (id: number) => apiFetch<{ recibo: string; pedido: string; saldo: number }>(`${admin}/${id}/confirmar`, { method: 'POST' }),
  rechazar: (id: number, motivo: string) => apiFetch<{ pedido: string | null }>(`${admin}/${id}/rechazar`, json({ motivo })),
  anular: (id: number, motivo: string) => apiFetch<{ pedido: string | null; saldo: number | null }>(`${admin}/${id}/anular`, json({ motivo })),
  comprobante: (id: number) => apiFetch<{ url: string; mime: string | null }>(`${admin}/${id}/comprobante`),
};

const pedido = (codigo: string) => `/solicitudes/pedidos/${encodeURIComponent(codigo)}/pagos`;

export const pagosClienteApi = {
  cuenta: (codigo: string) => apiFetch<CuentaPedido>(pedido(codigo)),
  /** Zelle (captura obligatoria) o cheque (foto opcional): queda «Por confirmar». */
  informar: (codigo: string, datos: { metodo: 'zelle' | 'cheque'; monto: number; detalle?: string; reemplaza?: number }, comprobante?: File) => {
    const fd = new FormData();
    fd.append('datos', JSON.stringify(datos));
    if (comprobante) fd.append('comprobante', comprobante, comprobante.name);
    return apiFetch<{ id: number; estado: string }>(`${pedido(codigo)}/informar`, { method: 'POST', body: fd });
  },
  /** Abre la página segura de Stripe por lo que debe. */
  pagarEnLinea: (codigo: string) => apiFetch<{ url: string }>(`${pedido(codigo)}/en-linea`, { method: 'POST' }),
  confirmarEnLinea: (codigo: string, sesion: string) =>
    apiFetch<{ estado: 'registrado' | 'pendiente'; recibo: string | null }>(`${pedido(codigo)}/en-linea/confirmar`, json({ sesion })),
};
