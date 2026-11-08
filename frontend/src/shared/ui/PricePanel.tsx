import { useId, type ReactNode } from 'react';
import { Alert } from './Alert';
import { Icon } from './Icon';

export interface Parte { label: string; value: number }

const dolares = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

function Dona({ partes }: { partes: Parte[] }) {
  const total = partes.reduce((a, p) => a + p.value, 0) || 1;
  const R = 52, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <svg className="gw-donut" viewBox="0 0 140 140" width={140} height={140} aria-hidden="true">
      <circle cx={70} cy={70} r={R} fill="none" className="gw-donut-track" strokeWidth={18} />
      {partes.map((p, i) => {
        const len = Math.max((p.value / total) * C - 2, 0);
        const el = <circle key={p.label} cx={70} cy={70} r={R} fill="none" strokeWidth={18} className={`gw-chart-${i + 1}`} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)" />;
        acc += (p.value / total) * C;
        return el;
      })}
      <text x={70} y={66} textAnchor="middle" className="gw-donut-cap">SUGERIDO</text>
      <text x={70} y={86} textAnchor="middle" className="gw-donut-val">{dolares(total)}</text>
    </svg>
  );
}

interface Props {
  /** Desglose del precio sugerido (RG-08: solo lo ve el administrador). */
  desglose: Parte[];
  propuesto: number;
  onPropuesto(v: number): void;
  motivo: string;
  onMotivo(v: string): void;
  transporte: number;
  sugerencia?: ReactNode;
  children?: ReactNode;
}

/** Precio sugerido (calculado, no editable) y precio propuesto (editable, con motivo opcional): CU-C08, PricePanel del sistema GARWEB. */
export function PricePanel({ desglose, propuesto, onPropuesto, motivo, onMotivo, transporte, sugerencia, children }: Props) {
  const id = useId();
  const sugerido = desglose.reduce((a, p) => a + p.value, 0);
  const dif = sugerido ? ((propuesto - sugerido) / sugerido) * 100 : 0;
  const tono = Math.abs(dif) < 0.05 ? 'neutral' : dif < 0 ? 'warning' : 'success';
  return (
    <aside className="gw-price" aria-label="Precio de la cotización">
      <div className="gw-price-sug">
        <div className="gw-price-sug-head">
          <span className="gw-overline">Precio sugerido</span>
          <span className="gw-locked"><Icon name="lock" size={14} />Calculado · no editable</span>
        </div>
        <div className="gw-price-donut">
          <Dona partes={desglose} />
          <ul className="gw-legend">
            {desglose.map((p, i) => (
              <li key={p.label}><span className={`gw-legend-sw gw-chart-bg-${i + 1}`} /><span>{p.label}</span><strong>{dolares(p.value)}</strong></li>
            ))}
          </ul>
        </div>
      </div>
      <div className="gw-price-prop">
        <label className="gw-field-label" htmlFor={`${id}-p`}>Precio propuesto</label>
        <div className="gw-input-wrap gw-input-xl">
          <span className="gw-input-prefix">$</span>
          <input
            id={`${id}-p`}
            className="gw-input num"
            inputMode="decimal"
            value={propuesto}
            onChange={(e) => { const v = parseFloat(e.target.value.replace(/[^0-9.]/g, '')); onPropuesto(Number.isNaN(v) ? 0 : v); }}
          />
          <span className={`gw-chip gw-tone-${tono} num`} aria-label={`Diferencia con el sugerido: ${dif.toFixed(1)} %`}>
            {dif > 0 ? '+' : dif < 0 ? '−' : ''}{Math.abs(dif).toFixed(1)} %
          </span>
        </div>
        <label className="gw-field-label" htmlFor={`${id}-m`}>Motivo del cambio <span className="gw-optional">(opcional)</span></label>
        <input id={`${id}-m`} className="gw-input" value={motivo} placeholder="Ej.: retazo disponible" onChange={(e) => onMotivo(e.target.value)} />
      </div>
      <dl className="gw-price-sum">
        <div><dt>Servicio</dt><dd>{dolares(propuesto)}</dd></div>
        <div><dt>Transporte ida y vuelta</dt><dd>{dolares(transporte)}</dd></div>
        <div className="gw-price-total"><dt>Total para el cliente</dt><dd>{dolares(propuesto + transporte)}</dd></div>
      </dl>
      {sugerencia && <Alert tone="info" title="Sugerencia del sistema" compact>{sugerencia}</Alert>}
      {children}
    </aside>
  );
}
