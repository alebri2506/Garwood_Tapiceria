import { useState } from 'react';
import { DIAS, MESES } from '../fechas';
import type { Disponibilidad } from './atencionApi';
import './atender.css';

// Agenda del camión para elegir el recojo (lunes a sábado, una hora por recojo). La usan A2b (con el cliente presente)
// y W4 (el cliente desde su cuenta). Abre en la primera semana con horas libres; lo pasado o sin recojos sale «—».

export interface HoraElegida { fecha: string; hora: string; fin: string }
export const deIso = (s: string) => { const [y, m, d] = s.split('-').map(Number) as [number, number, number]; return new Date(y, m - 1, d); };

export function GrillaRecojo({ disp, elegido, onElegir }: { disp: Disponibilidad; elegido: HoraElegida | null; onElegir(x: HoraElegida): void }) {
  const [semana, setSemana] = useState(0);
  const lunesDe = (iso: string) => { const l = deIso(iso); l.setDate(l.getDate() - ((l.getDay() + 6) % 7)); return l.toDateString(); };
  const semanas: Disponibilidad['dias'][] = [];
  for (const d of disp.dias) {
    const ultima = semanas[semanas.length - 1];
    if (ultima && lunesDe(ultima[0]!.fecha) === lunesDe(d.fecha)) ultima.push(d); else semanas.push([d]);
  }
  const primeraLibre = Math.max(0, semanas.findIndex((w) => w.some((d) => d.horas.some((h) => h.estado === 'libre'))));
  const sem = semanas[Math.min(semana + primeraLibre, semanas.length - 1)] ?? [];
  const horas = [...new Set(sem.flatMap((d) => d.horas.map((h) => h.inicio)))].sort();

  return (
    <div className="at-vmag">
      <div className="at-vhd">
        <button type="button" aria-label="Semana anterior" disabled={semana + primeraLibre <= 0} onClick={() => setSemana(semana - 1)}>‹</button>
        <b>{sem.length ? `Semana del ${deIso(sem[0]!.fecha).getDate()} al ${deIso(sem[sem.length - 1]!.fecha).getDate()} ${MESES[deIso(sem[sem.length - 1]!.fecha).getMonth()]!.slice(0, 3)}` : 'Sin fechas'}</b>
        <button type="button" aria-label="Semana siguiente" disabled={semana + primeraLibre >= semanas.length - 1} onClick={() => setSemana(semana + 1)}>›</button>
      </div>
      <div className="at-vmg" style={{ gridTemplateColumns: `44px repeat(${sem.length}, minmax(0, 1fr))` }} role="grid" aria-label="Horas libres para el recojo">
        <span />
        {sem.map((d) => <span key={d.fecha} className="at-vdh"><small>{DIAS[deIso(d.fecha).getDay()]!.slice(0, 3)}</small>{deIso(d.fecha).getDate()}</span>)}
        {horas.map((h, i) => (
          <FilaHora key={h} h={h} sem={sem} elegido={elegido} onElegir={onElegir} mediodia={i > 0 && horas[i - 1]! < '12:00' && h >= '12:00'} />
        ))}
      </div>
      <div className="at-vlg">
        <span><i style={{ background: 'var(--surface)', border: '1.5px solid #BFDBFE' }} />Libre</span>
        <span><i style={{ background: 'var(--primary)' }} />Elegida</span>
        <span><i style={{ background: 'var(--surface-sunken)' }} />Ocupada · «—» ya pasó o sin recojos</span>
      </div>
    </div>
  );
}

function FilaHora({ h, sem, elegido, onElegir, mediodia }: { h: string; sem: Disponibilidad['dias']; elegido: HoraElegida | null; onElegir(x: HoraElegida): void; mediodia: boolean }) {
  return (
    <>
      {mediodia && <span className="at-vlun">Cerrado al mediodía</span>}
      <span className="at-vhr">{h.replace(/^0/, '')}</span>
      {sem.map((d) => {
        const x = d.horas.find((y) => y.inicio === h);
        const libre = x?.estado === 'libre';
        const on = elegido?.fecha === d.fecha && elegido.hora === h;
        return (
          <button key={d.fecha} type="button" className={on ? 'at-vsl on' : libre ? 'at-vsl' : 'at-vsl at-busy'} disabled={!libre} aria-pressed={on}
            aria-label={`${DIAS[deIso(d.fecha).getDay()]} ${deIso(d.fecha).getDate()} a las ${h}${libre ? '' : ` · ${x?.estado ?? 'sin recojos'}`}`}
            onClick={() => x && onElegir({ fecha: d.fecha, hora: h, fin: x.fin })}>
            {on ? '✓' : libre ? h.replace(/^0/, '') : x?.estado === 'ocupada' ? 'Ocup.' : '—'}
          </button>
        );
      })}
    </>
  );
}
