import { useState } from 'react';
import { DIAS, MESES, hoy, mismoDia, motivoNoDisponible, feriadoDe } from '../fechas';

const INICIALES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
/** Se puede elegir este mes y el siguiente. */
const MESES_VISIBLES = 2;

interface Props {
  value: Date;
  onChange(d: Date): void;
  /** Hasta cuántos días adelante se puede pedir el recojo (parámetro `recojo.dias_anticipacion_max`). */
  diasMax?: number;
}

export function CalendarioRecojo({ value, onChange, diasMax }: Props) {
  const base = hoy();
  const limite = diasMax == null ? null : new Date(base.getFullYear(), base.getMonth(), base.getDate() + diasMax);
  const [desplazamiento, setDesplazamiento] = useState(() =>
    (value.getFullYear() - base.getFullYear()) * 12 + value.getMonth() - base.getMonth(),
  );
  const primero = new Date(base.getFullYear(), base.getMonth() + desplazamiento, 1);
  const diasMes = new Date(primero.getFullYear(), primero.getMonth() + 1, 0).getDate();
  const huecos = (primero.getDay() + 6) % 7; // la semana empieza el lunes

  return (
    <div className="cal2">
      <div className="hd">
        <button type="button" aria-label="Mes anterior" disabled={desplazamiento === 0} onClick={() => setDesplazamiento((m) => m - 1)}>‹</button>
        <b aria-live="polite">{MESES[primero.getMonth()]} {primero.getFullYear()}</b>
        <button type="button" aria-label="Mes siguiente" disabled={desplazamiento === MESES_VISIBLES - 1} onClick={() => setDesplazamiento((m) => m + 1)}>›</button>
      </div>
      <div className="g">
        {INICIALES.map((w, i) => <span key={i} className="w" aria-hidden="true">{w}</span>)}
        {Array.from({ length: huecos }, (_, i) => <span key={`e${i}`} className="d e" />)}
        {Array.from({ length: diasMes }, (_, i) => {
          const d = new Date(primero.getFullYear(), primero.getMonth(), i + 1);
          const motivo = motivoNoDisponible(d) ?? (limite && d > limite ? `Solo hasta ${diasMax} días adelante` : null);
          const on = mismoDia(d, value);
          const cls = ['d', on ? 'on' : motivo ? '' : 'ok', mismoDia(d, base) && 'td', feriadoDe(d) && 'hol'].filter(Boolean).join(' ');
          return (
            <button
              key={i}
              type="button"
              className={cls}
              disabled={Boolean(motivo)}
              aria-pressed={on}
              aria-label={`${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}${motivo ? `, ${motivo}` : ''}`}
              title={motivo ?? undefined}
              onClick={() => onChange(d)}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="lg">
        <span><i style={{ background: 'var(--primary-soft)' }} />Disponible</span>
        <span><i style={{ background: 'var(--primary)' }} />Elegido</span>
        <span>Lunes a sábado · domingos y feriados sin recojos</span>
      </div>
    </div>
  );
}
