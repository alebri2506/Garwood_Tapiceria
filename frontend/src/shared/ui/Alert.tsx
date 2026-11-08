import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const TONE_ICON: Record<Tone, IconName> = { info: 'info', success: 'check', warning: 'alert', danger: 'alert' };

interface AlertProps {
  tone?: Tone;
  title?: string;
  compact?: boolean;
  children?: ReactNode;
}

export function Alert({ tone = 'info', title, compact, children }: AlertProps) {
  return (
    <div
      className={['gw-alert', `gw-alert-${tone}`, compact && 'is-compact'].filter(Boolean).join(' ')}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <span className="gw-alert-icon"><Icon name={TONE_ICON[tone]} size={20} /></span>
      <div className="gw-alert-body">
        {title && <strong className="gw-alert-title">{title}</strong>}
        {children && <div className="gw-alert-text">{children}</div>}
      </div>
    </div>
  );
}
