import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

type Tono = 'neutral' | 'info' | 'progress' | 'warning' | 'success' | 'danger';

// RG-09: un solo ciclo de estados, el mismo color en todas las pantallas (mapa de Garweb.StatusChip).
const TONO_POR_ESTADO: Record<string, Tono> = {
  'Borrador': 'neutral', 'En espera de cita': 'info', 'Pendiente de respuesta': 'info', 'Aceptada: pendiente de adelanto': 'warning',
  'Aceptada': 'success', 'Rechazada': 'danger', 'Vencida': 'neutral',
  'Generado': 'info', 'Esperando mueble': 'warning', 'Esperando material': 'warning', 'Listo para producir': 'info', 'Planificado': 'info',
  'En producción': 'progress', 'En pausa': 'warning', 'Terminado': 'success', 'En reparto': 'progress', 'Listo para retiro': 'success',
  'Entregado': 'success', 'Cerrado': 'neutral', 'Archivado': 'neutral', 'Cancelado': 'danger',
  'Por confirmar': 'warning', 'Confirmado': 'success',
  'Programada': 'info', 'Atendida': 'success', 'No asistió': 'danger', 'Cancelada': 'danger',
};
const ICONO: Record<Tono, IconName> = { neutral: 'info', info: 'clock', progress: 'loader', warning: 'alert', success: 'check', danger: 'x' };

interface StatusChipProps {
  status: ReactNode;
  tone?: Tono;
  size?: 'md' | 'lg';
}

/** Estado con texto, color e ícono (Garweb.StatusChip): nunca solo color. */
export function StatusChip({ status, tone, size = 'md' }: StatusChipProps) {
  const t = tone ?? (typeof status === 'string' ? TONO_POR_ESTADO[status] : undefined) ?? 'neutral';
  return (
    <span className={`gw-chip gw-tone-${t}${size === 'lg' ? ' gw-chip-lg' : ''}`}>
      <span className="gw-chip-dot" aria-hidden="true" />
      <Icon name={ICONO[t]} size={size === 'lg' ? 16 : 14} />
      <span>{status}</span>
    </span>
  );
}
