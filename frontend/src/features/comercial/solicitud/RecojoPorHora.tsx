import { useEffect, useState } from 'react';
import { ApiError } from '../../../shared/api/http';
import { DIAS, MESES } from '../fechas';
import { solicitudApi, type DisponibilidadRecojo } from './solicitudApi';

export interface RecojoElegido { fecha: string; hora: string; hasta: string }

const dia = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y!, m! - 1, d!); };

/**
 * W2 · recojo preferido por hora (diseño del 11/11): semana de lunes a sábado, una fila por hora de 1 hora.
 * Las horas salen de la agenda del taller: «Ocup.» si ya hay una cita, una visita, otro recojo o un bloqueo.
 */
export function RecojoPorHora({ valor, onChange }: { valor: RecojoElegido | null; onChange(r: RecojoElegido): void }) {
  const [dispo, setDispo] = useState<DisponibilidadRecojo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [semana, setSemana] = useState(0);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    setError(null);
    solicitudApi.recojoDisponibilidad()
      .then((d) => {
        if (!vigente) return;
        setDispo(d);
        // Abre en la semana de lo ya elegido.
        const i = valor ? d.dias.findIndex((x) => x.fecha === valor.fecha) : -1;
        if (i >= 0) setSemana(Math.floor(i / 6));
      })
      .catch((e) => vigente && setError(e instanceof ApiError ? e.message : 'No pudimos cargar las horas de recojo.'));
    return () => { vigente = false; };
  }, [intento]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="mag"><p className="muted" role="alert" style={{ fontSize: 13 }}>{error} <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" onClick={() => setIntento((x) => x + 1)}>Reintentar</button></p></div>;
  if (!dispo) return <div className="mag"><p className="muted" role="status" style={{ fontSize: 13 }}>Cargando horas libres…</p></div>;

  const dias = dispo.dias.slice(semana * 6, semana * 6 + 6);
  const primero = dia(dias[0]!.fecha), ultimo = dia(dias[dias.length - 1]!.fecha);
  const titulo = `Semana del ${primero.getDate()}${primero.getMonth() !== ultimo.getMonth() ? ` ${MESES[primero.getMonth()]!.slice(0, 3)}` : ''} al ${ultimo.getDate()} ${MESES[ultimo.getMonth()]!.slice(0, 3)}`;
  // El mediodía: entre la última hora de la mañana y la primera de la tarde.
  const corte = dispo.horas.findIndex((h, i) => i > 0 && +h.slice(0, 2) - +dispo.horas[i - 1]!.slice(0, 2) > 1);

  return (
    <div className="mag">
      <div className="hd">
        <button type="button" aria-label="Semana anterior" disabled={semana === 0} onClick={() => setSemana((s) => s - 1)}>‹</button>
        <b aria-live="polite">{titulo}</b>
        <button type="button" aria-label="Semana siguiente" disabled={semana >= dispo.semanas - 1} onClick={() => setSemana((s) => s + 1)}>›</button>
      </div>
      <div className="mg" role="group" aria-label="Hora de recojo">
        <span className="c0" />
        {dias.map((d) => {
          const f = dia(d.fecha);
          return <span key={d.fecha} className={d.cerrado ? 'dh x' : 'dh'} title={d.cerrado ?? undefined}><small>{DIAS[f.getDay()]!.slice(0, 3)}</small>{f.getDate()}</span>;
        })}
        {dispo.horas.map((hora, i) => (
          <div key={hora} style={{ display: 'contents' }}>
            {i === corte && <span className="lun">{dispo.horas[i - 1] ? `${dias[0]!.horas[i - 1]!.hasta} – ${hora}` : ''} · cerrado al mediodía</span>}
            <span className="hr">{hora}</span>
            {dias.map((d) => {
              const h = d.horas[i]!;
              const on = valor?.fecha === d.fecha && valor.hora === hora;
              const f = dia(d.fecha);
              const cls = on ? 'sl on' : d.cerrado ? 'sl no' : h.libre ? 'sl' : 'sl busy';
              return (
                <button key={d.fecha} type="button" className={cls} disabled={!h.libre} aria-pressed={on}
                  aria-label={`${DIAS[f.getDay()]} ${f.getDate()} de ${MESES[f.getMonth()]} a las ${hora}${!h.libre ? `, ${d.cerrado ?? h.motivo ?? 'no disponible'}` : ''}`}
                  title={d.cerrado ?? h.motivo ?? undefined}
                  onClick={() => onChange({ fecha: d.fecha, hora, hasta: h.hasta })}>
                  {on ? '✓' : d.cerrado ? '' : h.libre ? hora : 'Ocup.'}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="lg">
        <span><i style={{ background: 'var(--surface)', border: '1.5px solid #BFDBFE' }} />Libre</span>
        <span><i style={{ background: 'var(--primary)' }} />Elegida</span>
        <span><i style={{ background: 'var(--surface-sunken)' }} />Ocupada</span>
        <span>Domingos y feriados sin recojos</span>
      </div>
    </div>
  );
}
