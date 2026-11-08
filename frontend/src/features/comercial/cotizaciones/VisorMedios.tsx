import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MEDIOS_MUEBLE, type Medio } from './datos';

/** Dibujo de ejemplo en lugar de la foto real (vendrá de Supabase Storage). */
function Sofa({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 70" aria-hidden="true">
      <path d="M14 30c0-8 6-14 14-14h64c8 0 14 6 14 14v6H14z" fill="currentColor" opacity=".55" />
      <rect x="4" y="32" width="18" height="24" rx="7" fill="currentColor" opacity=".8" />
      <rect x="98" y="32" width="18" height="24" rx="7" fill="currentColor" opacity=".8" />
      <rect x="20" y="38" width="80" height="16" rx="5" fill="currentColor" opacity=".7" />
      <rect x="12" y="54" width="96" height="6" rx="3" fill="currentColor" opacity=".9" />
      <rect x="18" y="60" width="5" height="7" rx="1.5" fill="currentColor" />
      <rect x="97" y="60" width="5" height="7" rx="1.5" fill="currentColor" />
    </svg>
  );
}

const Play = () => (
  <span className="co-play" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg></span>
);

const FILTROS: { etiqueta: string; origen: Medio['origen'] | null }[] = [
  { etiqueta: 'Todos', origen: null },
  { etiqueta: 'Del cliente', origen: 'cliente' },
  { etiqueta: 'De la cita', origen: 'cita' },
];

/** Fotos y videos del mueble: los que envió el cliente y los de la cita, con visor a pantalla completa. */
export function FotosMueble() {
  const [filtro, setFiltro] = useState(0);
  const [elegido, setElegido] = useState(MEDIOS_MUEBLE[0]!.nombre);
  const [abierto, setAbierto] = useState(false);
  const grande = useRef<HTMLButtonElement>(null);

  const origen = FILTROS[filtro]!.origen;
  const visibles = MEDIOS_MUEBLE.filter((m) => !origen || m.origen === origen);
  const pos = Math.max(0, visibles.findIndex((m) => m.nombre === elegido));
  const actual = visibles[pos]!;
  const mover = (d: number) => setElegido(visibles[(pos + d + visibles.length) % visibles.length]!.nombre);
  const cerrar = () => { setAbierto(false); grande.current?.focus(); };

  return (
    <section className="card stack" style={{ padding: 20 }} aria-labelledby="co-fotos">
      <div className="co-mhd">
        <div>
          <h2 id="co-fotos" style={{ fontSize: 20 }}>Fotos y videos del mueble</h2>
          <p className="muted" style={{ fontSize: 13 }}>Lo que envió el cliente y lo que se tomó en la cita. Haga clic para verlo en grande.</p>
        </div>
        <div className="co-fchips" role="group" aria-label="Origen">
          {FILTROS.map((f, i) => (
            <button key={f.etiqueta} type="button" className="co-fchip" aria-pressed={filtro === i} onClick={() => setFiltro(i)}>
              {f.etiqueta}<em>{MEDIOS_MUEBLE.filter((m) => !f.origen || m.origen === f.origen).length}</em>
            </button>
          ))}
        </div>
      </div>
      <div className="co-mgrid">
        <button ref={grande} type="button" className="co-mbig" style={{ background: actual.fondo }} aria-label={`Ver ${actual.nombre} en grande`} onClick={() => setAbierto(true)}>
          <Sofa className="co-sofa" />
          {actual.duracion && <Play />}
          <span className="co-exp">Ampliar</span>
          <span className="co-cap"><span><b>{actual.nombre}</b><small>{actual.tipo} · {actual.detalle}</small></span><small>{pos + 1} de {visibles.length}</small></span>
        </button>
        <div className="co-mthumbs">
          {visibles.map((m) => (
            <button key={m.nombre} type="button" className="co-mt" style={{ background: m.fondo }} aria-label={`${m.tipo} ${m.nombre}`} aria-pressed={m === actual} onClick={() => setElegido(m.nombre)}>
              <Sofa className="co-sofa" />
              <span className="co-src">{m.origen === 'cliente' ? 'Cliente' : 'Cita'}</span>
              {m.duracion && <span className="co-dur">▶ {m.duracion}</span>}
            </button>
          ))}
        </div>
      </div>
      {abierto && <Visor medio={actual} posicion={`${pos + 1} de ${visibles.length}`} onMover={mover} onCerrar={cerrar} />}
    </section>
  );
}

function Visor({ medio, posicion, onMover, onCerrar }: { medio: Medio; posicion: string; onMover(d: number): void; onCerrar(): void }) {
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    caja.current?.querySelector<HTMLElement>('button')?.focus();
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = antes; };
  }, []);

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onCerrar();
    if (e.key === 'ArrowLeft') onMover(-1);
    if (e.key === 'ArrowRight') onMover(1);
    if (e.key === 'Tab') {
      // El foco no sale del visor mientras está abierto.
      const botones = caja.current!.querySelectorAll<HTMLElement>('button');
      const primero = botones[0]!, ultimo = botones[botones.length - 1]!;
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    }
  };

  return createPortal(
    <div ref={caja} className="co-lb" role="dialog" aria-modal="true" aria-label="Visor de fotos y videos" onKeyDown={teclas}>
      <div className="co-lb-bar">
        <div><b>{medio.nombre}</b><small>{medio.tipo} · {medio.detalle} · {posicion}</small></div>
        <button type="button" className="co-lb-btn" onClick={onCerrar}>Cerrar ✕</button>
      </div>
      <div className="co-lb-stage">
        <button type="button" className="co-lb-nav" aria-label="Anterior" onClick={() => onMover(-1)}>‹</button>
        <div className="co-lb-media" style={{ background: medio.fondo }}>
          <Sofa className="co-sofa" />
          {medio.duracion && <><Play /><span className="co-dur">▶ {medio.duracion}</span></>}
        </div>
        <button type="button" className="co-lb-nav" aria-label="Siguiente" onClick={() => onMover(1)}>›</button>
      </div>
    </div>,
    document.body,
  );
}
