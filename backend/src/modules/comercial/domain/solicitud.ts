// Reglas de la solicitud de cotización (CU-C01). Sin Express ni Prisma: se prueban solas.

export const SERVICIOS = [
  { codigo: 'retapizado', nombre: 'Retapizado completo', requiereTela: true },
  { codigo: 'retapizado_espuma', nombre: 'Retapizado + cambio de espuma', requiereTela: true },
  { codigo: 'espuma', nombre: 'Solo cambio de espuma', requiereTela: false },
  { codigo: 'estructura', nombre: 'Reparación de estructura', requiereTela: false },
  { codigo: 'fabricacion', nombre: 'Fabricación a medida (desde una foto)', requiereTela: true },
] as const;
export type Servicio = (typeof SERVICIOS)[number]['codigo'];
export const CODIGOS_SERVICIO = SERVICIOS.map((s) => s.codigo) as [Servicio, ...Servicio[]];

/** El capitoneado y los canales llevan más horas: solo en fabricación a medida. */
export const ACABADOS = [
  { codigo: 'liso', nombre: 'Liso', detalle: 'Tela lisa, sin costuras extra' },
  { codigo: 'capitoneado', nombre: 'Capitoneado', detalle: 'Con botones hundidos · más trabajo' },
  { codigo: 'canales', nombre: 'Con canales', detalle: 'Costuras en franjas · más trabajo' },
] as const;
export type Acabado = (typeof ACABADOS)[number]['codigo'];
export const CODIGOS_ACABADO = ACABADOS.map((a) => a.codigo) as [Acabado, ...Acabado[]];

/** trae: la trae el cliente · catalogo: la elige en línea · local: cita en el taller · domicilio: visita · sin: no lleva tela. */
export const OPCIONES_TELA = ['trae', 'catalogo', 'local', 'domicilio', 'sin'] as const;
export type OpcionTela = (typeof OPCIONES_TELA)[number];

export const TRASLADOS = ['delivery', 'propio'] as const;

export const FRANJAS = ['manana', 'tarde'] as const;
export type Franja = (typeof FRANJAS)[number];

export const ESTADOS_SOLICITUD = ['Nueva', 'En espera de cita', 'Atendida', 'Cotizada', 'Vencida', 'Descartada'] as const;
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];

export const necesitaCita = (tela: OpcionTela) => tela === 'local' || tela === 'domicilio';
export const sinTelaPermitido = (servicio: Servicio) => !SERVICIOS.find((s) => s.codigo === servicio)!.requiereTela;

/** Con cita (en el local o en su casa) espera el turno; si no, el taller la cotiza con las fotos. */
/**
 * A3 Solicitudes y cotizaciones: cada solicitud avanza por 4 etapas (una pestaña cada una).
 * «Cotizada» queda «Esperando al cliente» hasta que existan los estados de la cotización (A4).
 * Si ya generó su pedido (CU-C14, código PED-0000 propio), queda en «Cerradas · Aceptada → pedido».
 */
export const ETAPAS = ['Cita / visita', 'Por cotizar', 'Esperando al cliente', 'Cerradas'] as const;
export type Etapa = (typeof ETAPAS)[number];
export function etapaDe(estado: string, pedido?: string | null): Etapa {
  if (pedido) return 'Cerradas';
  if (estado === 'En espera de cita') return 'Cita / visita';
  if (estado === 'Nueva' || estado === 'Atendida') return 'Por cotizar';
  if (estado === 'Cotizada') return 'Esperando al cliente';
  return 'Cerradas';
}
/** Cómo se muestra el estado: la visita a domicilio espera «visita», no «cita». */
export const estadoVisible = (estado: string, telaOpcion: string, pedido?: string | null) =>
  pedido ? `Aceptada → pedido ${pedido}` : estado === 'En espera de cita' && telaOpcion === 'domicilio' ? 'En espera de visita' : estado === 'Cotizada' ? 'Esperando respuesta' : estado;

/** Estados en que la hora de recojo preferida sigue reservada en la agenda (hasta que se acepte o se cierre). */
export const RESERVAN_RECOJO = ['Nueva', 'Atendida', 'Cotizada'];

export const estadoInicial = (tela: OpcionTela): EstadoSolicitud => (necesitaCita(tela) ? 'En espera de cita' : 'Nueva');

/** Qué sigue para el cliente después de enviarla. */
export function siguientePaso(tela: OpcionTela): 'cita' | 'visita' | 'cotizacion' {
  if (tela === 'local') return 'cita';
  if (tela === 'domicilio') return 'visita';
  return 'cotizacion';
}

/** Un mueble nuevo no se recoge: solo hay fecha de recojo si al menos un mueble se retapiza o repara. */
export const hayRecojo = (servicios: Servicio[]) => servicios.some((s) => s !== 'fabricacion');

export const codigoSolicitud = (id: number) => `SOL-${String(id).padStart(4, '0')}`;
