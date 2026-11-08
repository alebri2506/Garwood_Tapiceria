import { Icon, type IconName } from './Icon';

type Tono = 'info' | 'success' | 'warning' | 'danger';

interface KpiTileProps {
  label: string;
  value: string;
  unit?: string;
  goal?: string;
  baseline?: string;
  /** Avance hacia la meta, de 0 a 1. */
  progress?: number;
  tone?: Tono;
  icon?: IconName;
  trend?: string;
  trendIcon?: IconName;
  highlight?: boolean;
}

/** Indicador del panel: valor, meta, cómo era antes y qué conviene hacer (KpiTile del sistema GARWEB). */
export function KpiTile({ label, value, unit, goal, baseline, progress, tone = 'info', icon, trend, trendIcon = 'trending-up', highlight }: KpiTileProps) {
  return (
    <div className={highlight ? 'gw-kpi gw-kpi-hl' : 'gw-kpi'}>
      <div className="gw-kpi-top">
        <span className="gw-kpi-label">{label}</span>
        {icon && <span className="gw-kpi-icon"><Icon name={icon} size={18} /></span>}
      </div>
      <div className="gw-kpi-value num">{value}{unit && <small> {unit}</small>}</div>
      {progress != null && (
        <div className="gw-progress gw-progress-sm" role="progressbar" aria-label={`Avance hacia la meta: ${label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <span className={`gw-progress-fill gw-fill-${tone}`} style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      <div className="gw-kpi-foot">
        {goal && <span className="gw-kpi-goal">Meta: <strong className="num">{goal}</strong></span>}
        {baseline && <span className="num">Antes: {baseline}</span>}
      </div>
      {trend && <div className={`gw-kpi-trend gw-tone-text-${tone}`}><Icon name={trendIcon} size={16} />{trend}</div>}
    </div>
  );
}
