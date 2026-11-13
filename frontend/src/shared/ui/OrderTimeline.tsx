import { Icon } from './Icon';

/** RG-09: el ciclo de estados del pedido, el mismo en todas las pantallas. */
export const CICLO_PEDIDO = ['Generado', 'Esperando mueble / material', 'Listo para producir', 'En producción', 'Terminado', 'En reparto / retiro', 'Entregado', 'Cerrado'];

/** Línea de tiempo del pedido (Garweb.OrderTimeline): etapas hechas, la actual (o en pausa) y las que faltan. */
export function OrderTimeline({ steps = CICLO_PEDIDO, current, dates = [], paused = false }: { steps?: string[]; current: string | number; dates?: string[]; paused?: boolean }) {
  const actual = typeof current === 'number' ? current : Math.max(0, steps.indexOf(current));
  return (
    <ol className="gw-timeline is-horizontal" aria-label="Línea de tiempo del pedido">
      {steps.map((s, i) => {
        const estado = i < actual ? 'done' : i === actual ? (paused ? 'paused' : 'current') : 'todo';
        return (
          <li key={s} className={`gw-tl-step is-${estado}`} aria-current={i === actual ? 'step' : undefined}>
            <span className="gw-tl-node">{estado === 'done' ? <Icon name="check" size={14} strokeWidth={2.5} /> : null}</span>
            <span className="gw-tl-text">
              <span className="gw-tl-label">{i === actual && paused ? 'En pausa' : s}</span>
              {dates[i] && <span className="gw-tl-date gw-num">{dates[i]}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
