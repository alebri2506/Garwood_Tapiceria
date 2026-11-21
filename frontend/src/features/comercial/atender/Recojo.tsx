import { useState } from 'react';
import { Icon } from '../../../shared/ui/Icon';
import { DIAS, MESES, fechaLarga, hoy, motivoNoDisponible } from '../fechas';
import { DIRECCION_RECOJO, HORAS_RECOJO } from './datos';
import type { Atencion, CambioAtencion, RecojoElegido } from './estado';

// Último paso de la atención (A2b · decisiones L): el pedido ya existe y eligió delivery, falta el recojo.
// Se agenda con el cliente en la agenda del camión o, en la visita a domicilio, el administrador se lo lleva.

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const deIso = (s: string) => { const [y, m, d] = s.split('-').map(Number) as [number, number, number]; return new Date(y, m - 1, d); };
/** Lunes de la semana que contiene `d`. */
const lunesDe = (d: Date) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const SEMANAS = 3;

/** Ejemplo: algunas horas ya ocupadas por otros recojos o salidas (en el sistema vendrán de la agenda). */
const ocupada = (d: Date, h: number) => ((d.getDate() * 3 + h * 5 + d.getDate() * h) % 7) <= 1;

/** «sábado 21 de noviembre, de 10:00 a 11:00» (para usar dentro de una frase). */
export const textoRecojo = (r: RecojoElegido) => {
  const h = HORAS_RECOJO.find((x) => x[0] === r.hora)!;
  const f = fechaLarga(deIso(r.fecha));
  return `${f[0]!.toLowerCase()}${f.slice(1)}, de ${h[0]} a ${h[1]}`;
};

/** Hoy no se puede elegir una hora que ya pasó. */
const horaPasada = (d: Date, h: string) => {
  const ahora = new Date();
  if (iso(d) !== iso(ahora)) return false;
  const [hh, mm] = h.split(':').map(Number) as [number, number];
  return hh * 60 + mm <= ahora.getHours() * 60 + ahora.getMinutes();
};

export function PasoRecojo({ a, set }: { a: Atencion; set(c: CambioAtencion): void }) {
  const [semana, setSemana] = useState(0);
  const enCasa = a.lugar === 'domicilio';
  const opciones = [
    { id: 'agendar' as const, titulo: 'Agendar el recojo', sub: 'Elegir con ella el día y la hora en que pasa el camión', icono: 'calendar' as const },
    ...(enCasa ? [{ id: 'llevar' as const, titulo: 'Me lo llevo ahora', sub: 'Cabe en el vehículo: se registra el recojo en esta visita', icono: 'truck' as const }] : []),
  ];
  // La agenda abre en la semana del primer día que todavía tiene horas libres (un sábado por la tarde, la siguiente).
  const primero = hoy();
  while (motivoNoDisponible(primero) || HORAS_RECOJO.every(([h], hi) => horaPasada(primero, h) || ocupada(primero, hi))) primero.setDate(primero.getDate() + 1);
  const lunes = lunesDe(primero);
  lunes.setDate(lunes.getDate() + semana * 7);
  const dias = [0, 1, 2, 3, 4, 5].map((i) => { const d = new Date(lunes); d.setDate(d.getDate() + i); return d; });
  const elegido = a.recojoElegido;

  return (
    <section className="card stack at-rk" aria-labelledby="at-rk">
      <div>
        <span className="ov">Último paso · con la clienta</span>
        <h3 id="at-rk" style={{ fontSize: 18, margin: '2px 0 0' }}>¿Cuándo recogemos el sofá?</h3>
        <span className="muted" style={{ fontSize: 13 }}>Eligió delivery y el pedido ya está generado: falta el recojo. La entrega se agenda cuando el pedido esté terminado.</span>
      </div>

      {opciones.length > 1 && (
        <div className="opts" role="radiogroup" aria-label="Cómo se hace el recojo">
          {opciones.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={a.recojo === o.id} className={a.recojo === o.id ? 'opt on' : 'opt'} onClick={() => set({ recojo: o.id })}>
              <span className="ic"><Icon name={o.icono} /></span><span><b>{o.titulo}</b><small>{o.sub}</small></span>
            </button>
          ))}
        </div>
      )}

      {a.recojo === 'llevar' && enCasa ? (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="gw-btn gw-btn-primary" onClick={() => set({ recojoHecho: 'llevado' })}>Registrar recojo y llevármelo</button>
          <span className="muted" style={{ fontSize: 12.5, flex: '1 1 280px' }}>
            Queda como recojo hecho, sin agendar camión; el transporte cotizado no cambia (este viaje es el recojo y falta la entrega).
            Las piezas y las fotos de llegada se registran al recibirlo en el taller.
          </span>
        </div>
      ) : (
        <>
          <span className="muted" style={{ fontSize: 13, marginTop: -4 }}>{DIRECCION_RECOJO} · el recojo ocupa 1 hora de la agenda del camión</span>
          <div className="at-rkg">
            <div className="at-vmag">
              <div className="at-vhd">
                <button type="button" aria-label="Semana anterior" disabled={semana === 0} onClick={() => setSemana(semana - 1)}>‹</button>
                <b>Semana del {dias[0]!.getDate()} al {dias[5]!.getDate()} {MESES[dias[5]!.getMonth()]!.slice(0, 3)}</b>
                <button type="button" aria-label="Semana siguiente" disabled={semana >= SEMANAS - 1} onClick={() => setSemana(semana + 1)}>›</button>
              </div>
              <div className="at-vmg" role="grid" aria-label="Horas libres para el recojo">
                <span />
                {dias.map((d) => <span key={iso(d)} className="at-vdh"><small>{DIAS[d.getDay()]!.slice(0, 3)}</small>{d.getDate()}</span>)}
                {HORAS_RECOJO.map(([h], hi) => (
                  <Fila key={h} h={h} hi={hi} dias={dias} elegido={elegido} onElegir={(r) => set({ recojoElegido: r })} />
                ))}
              </div>
              <div className="at-vlg">
                <span><i style={{ background: 'var(--surface)', border: '1.5px solid #BFDBFE' }} />Libre</span>
                <span><i style={{ background: 'var(--primary)' }} />Elegida</span>
                <span><i style={{ background: 'var(--surface-sunken)' }} />Ocupada (otro recojo o salida) · «—» ya pasó, domingo o feriado</span>
              </div>
            </div>
            <div className="stack" style={{ gap: 12 }}>
              <div className="at-vsel">
                <span><small>{elegido ? MESES[deIso(elegido.fecha).getMonth()]!.slice(0, 3) : '—'}</small>{elegido ? deIso(elegido.fecha).getDate() : '?'}</span>
                <div><b>{elegido ? fechaLarga(deIso(elegido.fecha)) : 'Elija un día y una hora'}</b><em>{elegido ? `Recojo · ${textoRecojo(elegido).split(', ')[1]}` : 'En la agenda de la izquierda'}</em></div>
              </div>
              <span className="muted" style={{ fontSize: 12.5, lineHeight: 1.45 }}>Muéstrele a la clienta las horas libres y elija con ella. Le llega la confirmación por correo y la ve en su cuenta; puede cambiarla hasta 24 h antes.</span>
              <button type="button" className="gw-btn gw-btn-primary gw-btn-block" disabled={!elegido} onClick={() => set({ recojoHecho: 'agendado' })}>Confirmar día del recojo</button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function Fila({ h, hi, dias, elegido, onElegir }: { h: string; hi: number; dias: Date[]; elegido: RecojoElegido | null; onElegir(r: RecojoElegido): void }) {
  return (
    <>
      {hi === 3 && <span className="at-vlun">12:00 – 15:00 · cerrado al mediodía</span>}
      <span className="at-vhr">{h}</span>
      {dias.map((d) => {
        const motivo = motivoNoDisponible(d) ?? (horaPasada(d, h) ? 'Hora pasada' : null);
        const libre = !motivo && !ocupada(d, hi);
        const on = elegido?.fecha === iso(d) && elegido.hora === h;
        return (
          <button key={iso(d)} type="button" className={on ? 'at-vsl on' : libre ? 'at-vsl' : 'at-vsl at-busy'} disabled={!libre} aria-pressed={on}
            aria-label={`${DIAS[d.getDay()]} ${d.getDate()} a las ${h}${libre ? '' : ` · ${motivo ?? 'ocupada'}`}`} title={motivo ?? undefined}
            onClick={() => onElegir({ fecha: iso(d), hora: h })}>
            {on ? '✓' : libre ? h : motivo ? '—' : 'Ocup.'}
          </button>
        );
      })}
    </>
  );
}
