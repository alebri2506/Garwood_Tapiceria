import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

interface EmptyStateProps {
  icon?: IconName;
  title: string;
  children?: ReactNode;
}

export function EmptyState({ icon = 'info', title, children }: EmptyStateProps) {
  return (
    <div className="gw-empty" role="status">
      <span className="gw-empty-icon"><Icon name={icon} size={28} /></span>
      <strong className="gw-empty-title">{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}
