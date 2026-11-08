import { useMemo, useState } from 'react';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { Icon } from '../../../shared/ui/Icon';
import { DIAS, MESES, fechaLarga, hoy, mismoDia } from '../fechas';
import { lunesDe, mismoTurno, sumarDias, textoTurnoCorto, type Turno } from './agenda';
import type { DiaLocal } from './citasApi';

type Vista = 'dia' | 'semana' | 'mes';
const VISTAS: [Vista, string][] = [['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes']];
const CABECERA_MES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

interface Props {
  /** Disponibilidad que devuelve la API: un día por fecha, con sus turnos libres u ocupados. */
  dias: DiaLocal[];
  duracionMin: number;
  elegido: Turno | null;
  onElegir(t: Turno): void;
}

const capital = (s: string) => s[0]!.toUpperCase() + s.slice(1);
export const isoDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fechaDe = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y!, m! - 1, d!); };

/** Calendario de turnos con vistas Día / Semana / Mes (CU-C04), con la ocupación real de la agenda. */
export function Agendador({ dias, duracionMin, elegido, onElegir }: Props) {
  const porFecha = useMemo(() => new Map(dias.map((d) => [d.fecha, d])), [dias]);
  const turnos = dias[0]?.turnos.map((t) => t.hora) ?? [];
  const primerTarde = Math.max(0, turnos.findIndex((h) => h >= '12:00'));
  const inicio = lunesDe(hoy());
  const fin = dias.length ? fechaDe(dias[dias.length - 1]!.fecha) : hoy();

  const dia = (d: Date) => porFecha.get(isoDe(d));
  const cerrado = (d: Date) => d.getDay() === 0 || Boolean(dia(d)?.cerrado);
  const libre = (d: Date, hora: string) => Boolean(dia(d)?.turnos.find((t) => t.hora === hora)?.libre);
  const libres = (d: Date) => dia(d)?.turnos.filter((t) => t.libre).length ?? 0;
  const primero = useMemo<Turno | null>(() => {
    for (const d of dias) {
      const t = d.turnos.find((x) => x.libre);
      if (t) return { fecha: fechaDe(d.fecha), hora: t.hora };
    }
    return null;
  }, [dias]);

  // En el celular arranca en la vista Día, que cabe sin desplazarse de lado.
  const [vista, setVista] = useState<Vista>(() => (window.innerWidth < 640 ? 'dia' : 'semana'));
  const [foco, setFoco] = useState<Date>(() => primero?.fecha ?? hoy());

  const lunes = lunesDe(foco);
  const semana = Array.from({ length: 6 }, (_, i) => sumarDias(lunes, i)); // lunes a sábado

  const irA = (d: Date, v: Vista = vista) => {
    setFoco(d.getDay() === 0 ? sumarDias(d, 1) : d);
    setVista(v);
  };
  const mover = (dir: 1 | -1) => {
    if (vista === 'mes') return irA(new Date(foco.getFullYear(), foco.getMonth() + dir, 1));
    if (vista === 'semana') return irA(sumarDias(foco, 7 * dir));
    let d = sumarDias(foco, dir);
    if (d.getDay() === 0) d = sumarDias(d, dir); // el día salta los domingos
    irA(d);
  };
  const puedeAtras = vista === 'mes'
    ? foco.getFullYear() * 12 + foco.getMonth() > inicio.getFullYear() * 12 + inicio.getMonth()
    : vista === 'semana' ? lunes > inicio : sumarDias(foco, -1) >= hoy();
  const puedeAdelante = vista === 'mes'
    ? foco.getFullYear() * 12 + foco.getMonth() < fin.getFullYear() * 12 + fin.getMonth()
    : vista === 'semana' ? sumarDias(lunes, 7) <= fin : sumarDias(foco, 1) <= fin;
  const nombre = vista === 'mes' ? 'Mes' : vista === 'semana' ? 'Semana' : 'Día';

  const sabado = semana[5]!;
  const titulo = vista === 'mes'
    ? `${capital(MESES[foco.getMonth()]!)} ${foco.getFullYear()}`
    : vista === 'semana'
      ? `Semana del ${lunes.getDate()}${lunes.getMonth() !== sabado.getMonth() ? ` de ${MESES[lunes.getMonth()]}` : ''} al ${sabado.getDate()} de ${MESES[sabado.getMonth()]}`
      : fechaLarga(foco);

  const grupos = [
    { titulo: `Mañana · ${turnos[0] ?? ''} – 12:00`, turnos: turnos.slice(0, primerTarde) },
    { titulo: `Tarde · ${turnos[primerTarde] ?? ''} – 17:00`, turnos: turnos.slice(primerTarde) },
  ];

  return (
    <div className="card stack sched">
      <div className="tools">
        <div className="vseg" role="group" aria-label="Vista del calendario">
          {VISTAS.map(([v, l]) => (
            <button key={v} type="button" aria-pressed={vista === v} className={vista === v ? 'on' : undefined} onClick={() => setVista(v)}>{l}</button>
          ))}
        </div>
        <div className="navr">
          <button type="button" className="nb" aria-label={`${nombre} anterior`} disabled={!puedeAtras} onClick={() => mover(-1)}>‹</button>
          <button type="button" className="nb hoy" onClick={() => irA(hoy())}>Hoy</button>
          <button type="button" className="nb" aria-label={`${nombre} siguiente`} disabled={!puedeAdelante} onClick={() => mover(1)}>›</button>
        </div>
      </div>

      <div className="between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <h2 className="w3-h2" aria-live="polite">{titulo}</h2>
        {primero && (
          <button type="button" className="quick" onClick={() => { onElegir(primero); irA(primero.fecha, 'dia'); }}>
            <Icon name="clock" size={16} />Primer turno libre: <b>{textoTurnoCorto(primero)}</b>
          </button>
        )}
      </div>

      {vista === 'mes' && (
        <>
          <div className="mgrid">
            {CABECERA_MES.map((w) => <span key={w} className="mh">{w}</span>)}
            {(() => {
              const p = new Date(foco.getFullYear(), foco.getMonth(), 1);
              const huecos = (p.getDay() + 6) % 7;
              const n = new Date(foco.getFullYear(), foco.getMonth() + 1, 0).getDate();
              return [
                ...Array.from({ length: huecos }, (_, i) => <span key={`h${i}`} className="mc out" />),
                ...Array.from({ length: n }, (_, i) => {
                  const d = new Date(foco.getFullYear(), foco.getMonth(), i + 1);
                  const pasado = d < hoy() || d > fin;
                  const c = libres(d);
                  const tipo = pasado ? 'past' : cerrado(d) ? 'closed' : c === 0 ? 'none' : c <= 3 ? 'few' : 'many';
                  const texto = pasado ? '' : cerrado(d) ? 'Cerrado' : c === 0 ? 'Sin turnos' : `${c} libres`;
                  const cls = ['mc', tipo, mismoDia(d, hoy()) && 'today', elegido && mismoDia(elegido.fecha, d) && 'sel'].filter(Boolean).join(' ');
                  return (
                    <button key={i} type="button" className={cls} disabled={pasado || c === 0} onClick={() => irA(d, 'dia')} aria-label={`${DIAS[d.getDay()]} ${i + 1}${texto ? `, ${texto}` : ''}`}>
                      <b>{i + 1}</b><span>{texto}</span>
                    </button>
                  );
                }),
              ];
            })()}
          </div>
          <p className="hint">Toque un día con turnos libres para ver sus horarios.</p>
        </>
      )}

      {vista === 'semana' && (
        <div className="wscroll">
          <div className="wgrid">
            <span />
            {semana.map((d) => {
              const c = libres(d);
              const pasado = d < hoy();
              return (
                <button key={d.toISOString()} type="button" className={['wh', mismoDia(d, hoy()) && 'today', !c && 'closed'].filter(Boolean).join(' ')} onClick={() => irA(d, 'dia')}>
                  <small>{DIAS[d.getDay()]!.slice(0, 3)}</small>
                  <b>{d.getDate()}</b>
                  <em>{pasado ? 'pasado' : cerrado(d) ? 'cerrado' : c ? `${c} libres` : 'sin turnos'}</em>
                </button>
              );
            })}
            {turnos.map((hora, j) => (
              <FilaSemana key={hora} hora={hora} almuerzo={j === primerTarde && j > 0} semana={semana} libre={libre} elegido={elegido} onElegir={onElegir} />
            ))}
          </div>
        </div>
      )}

      {vista === 'dia' && (
        libres(foco) === 0 ? (
          <EmptyState icon="calendar" title={cerrado(foco) ? 'El taller está cerrado este día' : 'No hay turnos este día'}>
            Pruebe el día siguiente o use “Primer turno libre”.
          </EmptyState>
        ) : (
          <div className="dgroups">
            {grupos.filter((g) => g.turnos.length).map((g) => (
              <div key={g.titulo} className="dg">
                <span className="ov">{g.titulo}</span>
                <div className="dchips">
                  {g.turnos.map((hora) => {
                    const ok = libre(foco, hora);
                    const sel = mismoTurno(elegido, foco, hora);
                    return (
                      <button key={hora} type="button" className={['dc', !ok && 'busy', sel && 'sel'].filter(Boolean).join(' ')} disabled={!ok} aria-pressed={sel}
                        aria-label={`${ok ? 'Elegir' : 'Ocupado'} ${hora}`} onClick={() => onElegir({ fecha: foco, hora })}>
                        {hora}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      <div className="legend">
        <span><i className="lf" />Libre</span>
        <span><i className="ls" />Elegido</span>
        <span><i className="lo" />Ocupado o cerrado</span>
        <span className="muted">Turnos de {duracionMin} min · un cliente por turno · lunes a sábado</span>
      </div>
    </div>
  );
}

function FilaSemana({ hora, almuerzo, semana, libre, elegido, onElegir }: { hora: string; almuerzo: boolean; semana: Date[]; libre(d: Date, h: string): boolean; elegido: Turno | null; onElegir(t: Turno): void }) {
  return (
    <>
      {almuerzo && <span className="wl2">Almuerzo · 12:00 – 15:00</span>}
      <span className="wt">{hora}</span>
      {semana.map((d) => {
        const ok = libre(d, hora);
        const sel = mismoTurno(elegido, d, hora);
        return (
          <button key={d.toISOString()} type="button" className={['sl', !ok && 'busy', sel && 'sel'].filter(Boolean).join(' ')} disabled={!ok} aria-pressed={sel}
            aria-label={`${ok ? 'Elegir' : 'Ocupado'} ${DIAS[d.getDay()]} ${d.getDate()} a las ${hora}`} onClick={() => onElegir({ fecha: d, hora })}>
            {ok ? hora : ''}
          </button>
        );
      })}
    </>
  );
}
