import type { ReactNode } from 'react';
import { Icon } from './Icon';

interface ToastProps {
  tone?: 'success' | 'info';
  title: string;
  children?: ReactNode;
  onClose?(): void;
}

/** Aviso breve sobre fondo oscuro (Garweb.Toast). */
export function Toast({ tone = 'success', title, children, onClose }: ToastProps) {
  return (
    <div className={`gw-toast gw-toast-${tone}`} role="status">
      <span className="gw-toast-icon"><Icon name={tone === 'success' ? 'check' : 'info'} size={18} strokeWidth={2.25} /></span>
      <div>
        <strong>{title}</strong>
        {children && <span>{children}</span>}
      </div>
      {onClose && (
        <button type="button" className="gw-toast-x" aria-label="Cerrar" onClick={onClose}><Icon name="x" size={16} /></button>
      )}
    </div>
  );
}
