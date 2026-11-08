import type { CSSProperties } from 'react';
import { Icon } from './Icon';

/**
 * Pasos de un asistente con barra de avance (Garweb.WizardSteps).
 * Con `onStep`, los pasos ya hechos se pueden tocar para volver a ellos.
 */
export function WizardSteps({ steps, current, onStep }: { steps: string[]; current: number; onStep?(i: number): void }) {
  const pct = steps.length > 1 ? Math.round((current / (steps.length - 1)) * 100) : 100;
  return (
    <div className="gw-wizard">
      <div className="gw-wizard-head">
        <span className="gw-overline">Paso {current + 1} de {steps.length}</span>
        <span className="gw-wizard-title">{steps[current]}</span>
      </div>
      <div className="gw-progress" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={current + 1} aria-label="Avance de la solicitud">
        <span className="gw-progress-fill" style={{ width: `${Math.max(pct, 6)}%` }} />
      </div>
      <ol className="gw-wizard-steps" style={{ '--n': steps.length } as CSSProperties}>
        {steps.map((s, i) => {
          const estado = i < current ? 'done' : i === current ? 'current' : 'todo';
          const contenido = (
            <>
              <span className="gw-wizard-num gw-num">{estado === 'done' ? <Icon name="check" size={14} strokeWidth={2.5} /> : i + 1}</span>
              <span className="gw-wizard-label">{s}</span>
            </>
          );
          return (
            <li key={s} className={`is-${estado}`} aria-current={estado === 'current' ? 'step' : undefined}>
              {estado === 'done' && onStep
                ? <button type="button" className="gw-wizard-btn" title="Volver a este paso" aria-label={`Volver al paso ${i + 1}: ${s}`} onClick={() => onStep(i)}>{contenido}</button>
                : contenido}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
