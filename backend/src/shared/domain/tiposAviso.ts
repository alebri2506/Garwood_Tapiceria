// RG-05 y decisiones-recientes.md E.3: qué avisos al cliente llegan SIEMPRE por correo y cuáles puede apagar en W10.
// En la campana (W11) el cliente ve todos; esta clasificación solo decide el correo.
// Cada aviso al cliente debe estar en una de las dos listas: `avisoAlCliente` solo acepta estos tipos, así que un tipo
// nuevo sin clasificar no compila.

/**
 * Obligatorios: no se pueden apagar ("sin ellos el conductor podría llegar y no encontrar a nadie").
 * Cuando existan los módulos de despacho y producción se agregan aquí recojo, entrega, retiro en el taller y daño oculto.
 */
export const AVISOS_OBLIGATORIOS = [
  // Citas y visitas (incluye sus recordatorios).
  'cita_programada',
  'cita_reprogramada',
  'cita_inasistencia',
  'cita_recordatorio',
  // Cierre de la solicitud.
  'solicitud_vencida',
  'solicitud_descartada',
  // Seguridad de la cuenta (E.1.4 y E.4.1).
  'contrasena_cambiada',
  'correo_cambio_solicitado',
] as const;

/** Informativos: llegan por correo solo si el cliente deja encendido "Avance del pedido, cotización y pagos por correo". */
export const AVISOS_INFORMATIVOS = ['solicitud_registrada', 'fotos_recibidas'] as const;

export type TipoAvisoCliente = (typeof AVISOS_OBLIGATORIOS)[number] | (typeof AVISOS_INFORMATIVOS)[number];

export const esAvisoObligatorio = (tipo: string) => (AVISOS_OBLIGATORIOS as readonly string[]).includes(tipo);

/** Lo que W10 muestra como "Siempre activos · correo y notificación" (E.3.1). */
export const OBLIGATORIOS_EN_PERFIL = ['Citas y visitas', 'Recojo del mueble en su casa', 'Entrega del pedido', 'Retiro en el taller', 'Daño oculto (V2)'];

/**
 * ¿Se le manda correo? Obligatorio: siempre (si tiene correo). Informativo: solo si no lo apagó.
 * "Novedades del taller" todavía no envía nada (E.3.3).
 */
export function correoPermitido(tipo: TipoAvisoCliente, preferencias: { email: string | null; aceptaAvisosCorreo: boolean }) {
  if (!preferencias.email) return false;
  return esAvisoObligatorio(tipo) || preferencias.aceptaAvisosCorreo;
}
