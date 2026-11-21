import { useMemo, useState } from 'react';
import { DIAS, MESES } from '../fechas';
import type { DiaVisita, Disponibilidad } from './citasApi';

export interface HoraElegida { fecha: string; hora: string }

const fechaDe = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y!, m! - 1, d!); };
const isoDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const finDe = (hora: string, min: number) => { const t = +hora.slice(0, 2) * 60 + +hora.slice(3, 5) + min; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const hora12 = (h: string) => `${+h.slice(0, 2)}:${h.slice(3, 5)}`;

/**
 * W3b · visita a domicilio por día y hora (diseño del 13/11): semana de lunes a sábado, una fila por hora de 1 hora.
 * Las horas salen de la agenda del administrador: «Ocup.» si ya hay una cita, otra visita o un bloqueo.
 */
export function VisitaPorHora({ dispo, valor, onElegir }: { dispo: Disponibilidad<DiaVisita>; valor: HoraElegida | null; onElegir(v: HoraElegida): void }) {
  const horas = dispo.horas ?? dispo.dias.find((d) => d.horas.length)?.horas.map((h) => h.hora) ?? [];
  // Semanas de lunes a sábado desde la semana del primer día disponible (los días que no vienen salen cerrados).
  const semanas = useMemo(() => {
    const porFecha = new Map(dispo.dias.map((d) => [d.fecha, d]));
    const primero = fechaDe(dispo.dias[0]?.fecha ?? isoDe(new Date()));
    const lunes = new Date(primero); lunes.setDate(primero.getDate() - ((primero.getDay() + 6) % 7));
    const ultimo = fechaDe(dispo.dias[dispo.dias.length - 1]?.fecha ?? isoDe(primero));
    const out: (DiaVisita & { fuera: boolean })[][] = [];
    for (const d = new Date(lunes); d <= ultimo; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 1) out.push([]);
      if (d.getDay() === 0) continue;
      const f = isoDe(d);
      const dia = porFecha.get(f);
      out[out.length - 1]!.push(dia ? { ...dia, fuera: false } : { fecha: f, cerrado: 'No disponible', horas: [], fuera: true });
    }
    return out.filter((s) => s.some((d) => !d.fuera));
  }, [dispo]);
  const [semana, setSemana] = useState(() => Math.max(0, valor ? semanas.findIndex((s) => s.some((d) => d.fecha === valor.fecha)) : 0));

  const dias = semanas[semana] ?? [];
  const primero = dias[0] ? fechaDe(dias[0].fecha) : new Date(), ultimo = dias[dias.length - 1] ? fechaDe(dias[dias.length - 1]!.fecha) : new Date();
  const titulo = `Semana del ${primero.getDate()}${primero.getMonth() !== ultimo.getMonth() ? ` ${MESES[primero.getMonth()]!.slice(0, 3)}` : ''} al ${ultimo.getDate()} ${MESES[ultimo.getMonth()]!.slice(0, 3)}`;
  // El mediodía: entre la última hora de la mañana y la primera de la tarde.
  const corte = horas.findIndex((h, i) => i > 0 && +h.slice(0, 2) - +horas[i - 1]!.slice(0, 2) > 1);
  const sel = valor ? fechaDe(valor.fecha) : null;

  return (
    <div className="w3v-pick">
      <div className="w3v-mag">
        <div className="w3v-hd">
          <button type="button" aria-label="Semana anterior" disabled={semana === 0} onClick={() => setSemana((s) => s - 1)}>‹</button>
          <b aria-live="polite">{titulo}</b>
          <button type="button" aria-label="Semana siguiente" disabled={semana >= semanas.length - 1} onClick={() => setSemana((s) => s + 1)}>›</button>
        </div>
        <div className="w3v-mg" role="group" aria-label="Día y hora de la visita">
          <span />
          {dias.map((d) => {
            const f = fechaDe(d.fecha);
            return <span key={d.fecha} className={d.cerrado ? 'w3v-dh x' : 'w3v-dh'} title={typeof d.cerrado === 'string' ? d.cerrado : undefined}><small>{DIAS[f.getDay()]!.slice(0, 3)}</small>{f.getDate()}</span>;
          })}
          {horas.map((hora, i) => (
            <div key={hora} style={{ display: 'contents' }}>
              {i === corte && <span className="w3v-lun">{finDe(horas[i - 1]!, dispo.duracionMin)} – {hora} · cerrado al mediodía</span>}
              <span className="w3v-hr">{hora12(hora)}</span>
              {dias.map((d) => {
                const h = d.horas.find((x) => x.hora === hora);
                const libre = !d.cerrado && Boolean(h?.libre);
                const on = valor?.fecha === d.fecha && valor.hora === hora;
                const f = fechaDe(d.fecha);
                const motivo = typeof d.cerrado === 'string' ? d.cerrado : h?.motivo ?? (d.cerrado ? 'Cerrado' : null);
                return (
                  <button key={d.fecha} type="button" className={on ? 'w3v-sl on' : d.cerrado ? 'w3v-sl no' : libre ? 'w3v-sl' : 'w3v-sl busy'} disabled={!libre} aria-pressed={on}
                    aria-label={`${DIAS[f.getDay()]} ${f.getDate()} de ${MESES[f.getMonth()]} a las ${hora12(hora)}${libre ? '' : `, ${(motivo ?? 'no disponible').toLowerCase()}`}`}
                    title={libre ? undefined : motivo ?? undefined}
                    onClick={() => onElegir({ fecha: d.fecha, hora })}>
                    {on ? '✓' : d.cerrado ? '' : libre ? hora12(hora) : 'Ocup.'}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="w3v-lg">
          <span><i style={{ background: 'var(--surface)', border: '1.5px solid #BFDBFE' }} />Libre</span>
          <span><i style={{ background: 'var(--primary)' }} />Elegida</span>
          <span><i style={{ background: 'var(--surface-sunken)' }} />Ocupada</span>
          <span>Domingos y feriados sin visitas</span>
        </div>
      </div>
      <div className="w3v-sel">
        {sel && valor ? (
          <div className="w3v-big">
            <span><small>{MESES[sel.getMonth()]!.slice(0, 3)}</small>{sel.getDate()}</span>
            <div><b>{DIAS[sel.getDay()]![0]!.toUpperCase() + DIAS[sel.getDay()]!.slice(1)} {sel.getDate()} de {MESES[sel.getMonth()]}</b><em>Visita · {hora12(valor.hora)} a {hora12(finDe(valor.hora, dispo.duracionMin))}</em></div>
          </div>
        ) : (
          <div className="w3v-big"><span><small>—</small>?</span><div><b>Elija un día y una hora</b><em>En la agenda de la izquierda</em></div></div>
        )}
        <span className="muted" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
          El administrador del taller llega a su casa a la hora que elija (puede variar unos 15 minutos por el tráfico). La visita dura aprox. {dispo.duracionMin >= 60 && dispo.duracionMin % 60 === 0 ? `${dispo.duracionMin / 60} hora${dispo.duracionMin > 60 ? 's' : ''}` : `${dispo.duracionMin} minutos`} y no tiene costo.
        </span>
      </div>
    </div>
  );
}
