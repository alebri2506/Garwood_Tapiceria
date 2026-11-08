import type { Serie } from './datos';

const dolares = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;

// Área del trazado en el viewBox 0–100 (como en el prototipo).
const X0 = 2, X1 = 98, ARRIBA = 4, ABAJO = 98;

/** Curva suave (Catmull-Rom → Bézier) entre los puntos [desde, hasta]. */
function curva(P: { px: number; py: number }[], desde: number, hasta: number) {
  const n = P.length;
  const limitar = (y: number) => Math.min(ABAJO, Math.max(ARRIBA - 2, y));
  let d = `M${P[desde]!.px.toFixed(2)} ${P[desde]!.py.toFixed(2)}`;
  for (let i = desde; i < hasta; i++) {
    const a = P[i]!, b = P[i + 1]!, pa = P[Math.max(0, i - 1)]!, pb = P[Math.min(n - 1, i + 2)]!;
    const t = 1 / 6;
    d += ` C${(a.px + (b.px - pa.px) * t).toFixed(2)} ${limitar(a.py + (b.py - pa.py) * t).toFixed(2)}`
      + ` ${(b.px - (pb.px - a.px) * t).toFixed(2)} ${limitar(b.py - (pb.py - a.py) * t).toFixed(2)}`
      + ` ${b.px.toFixed(2)} ${b.py.toFixed(2)}`;
  }
  return d;
}

/** Margen bruto día a día o de los últimos 12 meses, con el pico marcado y el detalle al pasar el mouse. */
export function GraficoMargen({ serie, titulo }: { serie: Serie; titulo: string }) {
  const { puntos, lo, hi, proyeccion } = serie;
  const n = puntos.length;
  const P = puntos.map((p, i) => ({ ...p, px: X0 + ((X1 - X0) * i) / (n - 1), py: ABAJO - ((p.v - lo) / (hi - lo)) * (ABAJO - ARRIBA) }));
  const ultimo = proyeccion ? n - 2 : n - 1;
  const linea = curva(P, 0, ultimo);
  const area = `${linea} L${P[ultimo]!.px.toFixed(2)} ${ABAJO} L${P[0]!.px.toFixed(2)} ${ABAJO} Z`;
  const paso = (X1 - X0) / (n - 1);
  const pico = P.slice(0, ultimo + 1).reduce((m, p) => (p.v > m.v ? p : m));
  const total = P.slice(0, ultimo + 1).reduce((s, p) => s + p.v, 0);
  const descripcion = proyeccion
    ? `${titulo}: pico en ${pico.t} con ${dolares(pico.v)}, octubre proyectado en ${dolares(P[n - 1]!.v)}`
    : `${titulo}: suma ${dolares(total)}, pico el ${pico.t} con ${dolares(pico.v)}`;

  return (
    <div className="p-chart">
      <h3>{titulo}</h3>
      <div className="p-plot" role="img" aria-label={descripcion}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="gwTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2563EB" stopOpacity=".22" />
              <stop offset="1" stopColor="#2563EB" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#gwTrendFill)" />
          <path d={linea} fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {proyeccion && (
            <path d={curva(P, n - 2, n - 1)} fill="none" stroke="#2563EB" strokeWidth="2.5" strokeDasharray="5 6" strokeLinecap="round" opacity=".55" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        <span className="peak" style={{ left: `${pico.px}%`, top: `${pico.py}%` }} aria-hidden="true" />
        <span className="pk" style={{ left: `${pico.px}%`, top: `${pico.py}%` }} aria-hidden="true">{dolares(pico.v)}</span>
        {P.map((p) => (
          <div key={p.t} className="hit" style={{ left: `${p.px - paso / 2}%`, width: `${paso}%` }} aria-hidden="true">
            <span className="guide" />
            <span className="pt" style={{ top: `calc(${p.py}% + 30px)` }} />
            <span className={p.px > 85 ? 'tip r' : p.px < 15 ? 'tip l' : 'tip'} style={{ top: `calc(${p.py}% + 30px)` }}>
              <b>{dolares(p.v)}</b>{p.t}<br />{p.n}
            </span>
          </div>
        ))}
      </div>
      <div className="p-xl" aria-hidden="true">
        {P.map((p, i) => <span key={p.t} className={i === n - 1 ? 'now' : undefined} style={{ left: `${p.px}%` }}>{p.x}</span>)}
      </div>
      <div className="p-cap">
        {serie.nota} · Margen bruto = lo cobrado de los pedidos cerrados − materiales reales − transporte. No descuenta sueldos ni alquiler.
      </div>
    </div>
  );
}
