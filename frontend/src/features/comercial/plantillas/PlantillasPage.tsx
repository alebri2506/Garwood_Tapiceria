import { useState } from 'react';
import { TopAdmin } from '../../../app/layout/AdminLayout';
import { Icon } from '../../../shared/ui/Icon';
import { Toast } from '../../../shared/ui/Toast';
import {
  COSTOS, MAQUINAS, MATERIALES, MUEBLES, SERVICIOS, SERVICIOS_CORTOS, copiar, costear, num, plantillasEjemplo, type Actividad, type Plantilla,
} from './datos';
import './plantillas.css';

const dinero = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const cant = (n: number | string) => String(Math.round(num(n) * 100) / 100);
const conSigno = (n: number, f: (x: number) => string) => (n > 0 ? '+' : n < 0 ? '−' : '') + f(Math.abs(n));

/**
 * A16 Plantillas de cotización (CU-C06): una por tipo de mueble y servicio, con sus actividades (horas persona,
 * máquina, horas máquina) y materiales. Al armar una cotización se carga sola. Solo diseño: datos de ejemplo.
 */
export function PlantillasPage() {
  const [T, setT] = useState<Record<string, Plantilla>>(plantillasEjemplo);
  const [clave, setClave] = useState('1|1');
  const [borrador, setBorrador] = useState<Actividad[] | null>(null);
  const [aviso, setAviso] = useState<{ titulo: string; texto: string } | null>(null);

  const [mi, si] = clave.split('|').map(Number) as [number, number];
  const t = T[clave];
  const creando = !t;
  const editando = Boolean(borrador);
  const acts = borrador ?? t?.acts ?? [];
  const c = costear(acts), c0 = t ? costear(t.acts) : null;
  const nombre = `${MUEBLES[mi]} · ${SERVICIOS[si]}`;
  const puedeCrear = acts.some((a) => num(a.h) > 0);

  const elegir = (k: string) => { setClave(k); setBorrador(T[k] ? null : []); setAviso(null); };
  const cambiar = (fn: (d: Actividad[]) => void) => { const d = copiar(borrador ?? []); fn(d); setBorrador(d); };
  /** Marca en verde lo que cambió respecto a la plantilla guardada. */
  const cambio = (i: number, mat?: string) => {
    if (!editando || !t) return false;
    const b = t.acts.find((x) => x.n === acts[i]!.n);
    if (!b) return true;
    if (!mat) return num(b.h) !== num(acts[i]!.h);
    const p = b.mats.find((x) => x.m === mat), a = acts[i]!.mats.find((x) => x.m === mat);
    return !p || num(p.q) !== num(a?.q ?? 0);
  };
  const delta = (a: number, b: number | undefined, f: (x: number) => string) => (editando && !creando && b !== undefined && Math.abs(a - b) > 0.001 ? conSigno(a - b, f) : '');
  const horas = (n: number) => `${cant(n)} h`;

  const guardar = () => {
    const d = copiar(borrador ?? []).map(({ nueva: _n, ...a }) => a);
    setT((x) => ({ ...x, [clave]: { ...(x[clave] ?? { usos: 0 }), acts: d, fecha: 'hoy' } }));
    setBorrador(null);
    setAviso(creando
      ? { titulo: 'Plantilla creada', texto: `${nombre}: desde ahora se carga sola al cotizar este mueble y servicio.` }
      : { titulo: 'Plantilla guardada', texto: `${nombre}: las cotizaciones nuevas usan estos valores. Queda registrado quién y cuándo la cambió.` });
  };

  return (
    <>
      <TopAdmin
        crumb="Comercial › Plantillas"
        titulo="Plantillas de cotización"
        debajo={<p className="muted pt-sub">Una plantilla por <b>tipo de mueble</b> y <b>servicio</b>. Al armar una cotización se carga sola, según lo que pidió el cliente.</p>}
      />
      {aviso && <Toast title={aviso.titulo} onClose={() => setAviso(null)}>{aviso.texto}</Toast>}

      <section className="card stack" style={{ gap: 12 }} aria-labelledby="pt-mx">
        <div className="between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <h2 id="pt-mx" style={{ fontSize: 19 }}>¿Qué combinaciones tienen plantilla?</h2>
          <span className="muted" style={{ fontSize: 13 }}>{Object.keys(T).length} de {MUEBLES.length * SERVICIOS.length} · <span style={{ color: 'var(--success-ink)' }}>■</span> con plantilla (precio sugerido) · + crear</span>
        </div>
        <div className="pt-scroll">
          <table className="pt-mx">
            <thead><tr><th>Tipo de mueble</th>{SERVICIOS_CORTOS.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {MUEBLES.map((m, mIdx) => (
                <tr key={m}>
                  <td className="pt-mn">{m}</td>
                  {SERVICIOS.map((s, sIdx) => {
                    const k = `${mIdx}|${sIdx}`, x = T[k], on = k === clave;
                    return (
                      <td key={s}>
                        <button type="button" className={`pt-cx${x ? ' pt-have' : ' pt-none'}${on ? ' pt-on' : ''}`} aria-pressed={on}
                          aria-label={`${m} · ${s}${x ? ' · tiene plantilla' : ' · sin plantilla'}`} onClick={() => elegir(k)}>
                          {x ? dinero(costear(x.acts).sugerido) : on ? 'Creando…' : '+'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>«Otro mueble de interior» no tiene plantilla: se cotiza agregando las actividades a mano.</p>
      </section>

      <section className="card stack" style={{ gap: 18 }} aria-labelledby="pt-tit">
        <div className="pt-hd">
          <div>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <h2 id="pt-tit">{creando ? `Nueva plantilla · ${nombre}` : nombre}</h2>
              <span className={creando || editando ? 'pt-chip pt-dr' : 'pt-chip pt-ok'}>{creando ? 'Sin crear' : editando ? 'Editando' : 'Activa'}</span>
            </div>
            <p className="pt-meta">{creando ? 'Todavía no hay plantilla para esta combinación. Las cotizaciones de este caso se arman a mano hasta que la cree.' : `Usada en ${t!.usos} cotizaciones · última edición ${t!.fecha} por Administrador`}</p>
          </div>
          <div className="row">
            {!creando && !editando && <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" onClick={() => { setBorrador(copiar(t!.acts)); setAviso(null); }}>Editar</button>}
            {!creando && editando && <><button type="button" className="gw-btn gw-btn-ghost gw-btn-sm" onClick={() => setBorrador(null)}>Cancelar</button><button type="button" className="gw-btn gw-btn-primary gw-btn-sm" onClick={guardar}>Guardar cambios</button></>}
            {creando && <button type="button" className="gw-btn gw-btn-primary gw-btn-sm" disabled={!puedeCrear} onClick={guardar}>Crear plantilla</button>}
          </div>
        </div>

        {creando && (
          <div className="pt-from">
            <span className="gw-field-label">¿Desde dónde empieza?</span>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" onClick={() => setBorrador([])}>En blanco</button>
              <span className="muted" style={{ fontSize: 13 }}>o copiar de</span>
              <select className="pt-sel pt-sel-full" style={{ maxWidth: 320 }} aria-label="Copiar de otra plantilla" value="" onChange={(e) => { const x = T[e.target.value]; if (x) setBorrador(copiar(x.acts)); }}>
                <option value="">Elegir una plantilla parecida…</option>
                {Object.keys(T).map((k) => { const [a, b] = k.split('|').map(Number) as [number, number]; return <option key={k} value={k}>{MUEBLES[a]} · {SERVICIOS[b]}</option>; })}
              </select>
            </div>
            {!puedeCrear && <span className="pt-hint">Para crearla: al menos una actividad con horas.</span>}
          </div>
        )}
        {editando && <p className="pt-ednote">{creando ? 'Agregue las actividades con sus horas y materiales.' : 'Los cambios se marcan en verde. Se aplican a las cotizaciones nuevas; las ya enviadas no cambian.'}</p>}

        <div className="pt-sum">
          <div className="pt-st"><span>Horas persona</span><b>{horas(c.h)}</b><small>{delta(c.h, c0?.h, horas)}</small></div>
          <div className="pt-st"><span>Costo</span><b>{dinero(c.costo)}</b><small>{delta(c.costo, c0?.costo, dinero)}</small></div>
          <div className="pt-st pt-pr"><span>Precio sugerido</span><b>{dinero(c.sugerido)}</b><small>{delta(c.sugerido, c0?.sugerido, dinero)}</small></div>
          <div className="pt-brk">
            <span>Materiales <b>{dinero(c.mat)}</b></span><span>Mano de obra <b>{dinero(c.mano)}</b></span><span>Maquinaria <b>{dinero(c.maq)}</b></span><span>Costos fijos <b>{dinero(c.fijos)}</b></span>
            <span style={{ marginLeft: 'auto' }}>Precios del Catálogo · margen {Math.round(COSTOS.margen * 100)} % sobre el costo</span>
          </div>
        </div>

        <div className="pt-scroll">
          <table className={editando ? 't pt-te' : 't pt-tv'}>
            <thead><tr><th style={{ width: '28%' }}>Actividad</th><th className="r" style={{ width: 96 }}>Horas persona</th><th>Máquina</th><th className="r" style={{ width: 96 }}>Horas máq.</th>{!editando && <th>Materiales (cantidad)</th>}{editando && <th style={{ width: 44 }} />}</tr></thead>
            <tbody>
              {acts.map((a, i) => (
                <FilaActividad key={i} a={a} i={i} editando={editando} cambio={cambio} cambiar={cambiar} />
              ))}
            </tbody>
          </table>
        </div>
        {acts.length === 0 && <div className="pt-empty">Sin actividades todavía. Agregue la primera o copie una plantilla parecida.</div>}
        <div className="between" style={{ flexWrap: 'wrap', fontSize: 14 }}>
          <span className="muted">{acts.length} actividades · total {horas(c.h)}</span>
          {editando && <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" onClick={() => cambiar((d) => { d.push({ n: 'Nueva actividad', h: 1, m: '—', hm: 0, mats: [], nueva: true }); })}>+ Agregar actividad</button>}
        </div>
        <p className="audit" style={{ margin: 0 }}>La tela de la plantilla es solo una referencia: en la cotización se escriben las yardas reales. Grapas, hilo y pegamento van como materiales de la actividad que los usa.</p>
      </section>
    </>
  );
}

interface PropsFila {
  a: Actividad; i: number; editando: boolean;
  cambio(i: number, mat?: string): boolean;
  cambiar(fn: (d: Actividad[]) => void): void;
}

/** Una actividad: en vista, sus datos y materiales; al editar, campos y la fila de materiales debajo. */
function FilaActividad({ a, i, editando, cambio, cambiar }: PropsFila) {
  if (!editando) {
    return (
      <tr>
        <td><b>{a.n}</b></td>
        <td className="r"><span className="num">{cant(a.h)}</span></td>
        <td><span className={a.m === '—' ? 'muted' : undefined}>{a.m === '—' ? 'Sin máquina' : a.m}</span></td>
        <td className="r"><span className="num">{num(a.hm) ? cant(a.hm) : '—'}</span></td>
        <td><div className="pt-mats">{a.mats.length === 0 ? <span className="muted">—</span> : a.mats.map((m) => <span key={m.m} className="pt-mat">{m.m} · {cant(m.q)} {MATERIALES[m.m]?.[1] ?? ''}</span>)}</div></td>
      </tr>
    );
  }
  return (
    <>
      <tr>
        <td><input className="pt-cell pt-nm" value={a.n} aria-label="Nombre de la actividad" onChange={(e) => cambiar((d) => { d[i]!.n = e.target.value; })} /></td>
        <td className="r"><input className={cambio(i) ? 'pt-cell pt-chg' : 'pt-cell'} inputMode="decimal" value={String(a.h)} aria-label="Horas persona" onChange={(e) => cambiar((d) => { d[i]!.h = e.target.value; })} /></td>
        <td>
          {a.nueva
            ? <select className="pt-sel pt-sel-full" aria-label="Máquina" value={a.m} onChange={(e) => cambiar((d) => { d[i]!.m = e.target.value; })}>
                {Object.keys(MAQUINAS).map((m) => <option key={m} value={m}>{m === '—' ? 'Sin máquina' : m}</option>)}
              </select>
            : <span className={a.m === '—' ? 'muted' : undefined}>{a.m === '—' ? 'Sin máquina' : a.m}</span>}
        </td>
        <td className="r"><input className="pt-cell" inputMode="decimal" value={String(a.hm)} aria-label="Horas máquina" onChange={(e) => cambiar((d) => { d[i]!.hm = e.target.value; })} /></td>
        <td><button type="button" className="pt-x" aria-label={`Quitar la actividad ${a.n}`} onClick={() => cambiar((d) => { d.splice(i, 1); })}><Icon name="x" size={16} /></button></td>
      </tr>
      <tr className="pt-sub">
        <td colSpan={5}>
          <span className="pt-ml">Materiales</span>
          <div className="pt-mats">
            {a.mats.map((m, j) => (
              <span key={m.m} className="pt-mq">{m.m}
                <input className={cambio(i, m.m) ? 'pt-qi pt-chg' : 'pt-qi'} inputMode="decimal" value={String(m.q)} aria-label={`Cantidad de ${m.m}`} onChange={(e) => cambiar((d) => { d[i]!.mats[j]!.q = e.target.value; })} />
                <i>{MATERIALES[m.m]?.[1] ?? ''}</i>
                <button type="button" className="pt-xs" aria-label={`Quitar ${m.m}`} onClick={() => cambiar((d) => { d[i]!.mats.splice(j, 1); })}><Icon name="x" size={14} /></button>
              </span>
            ))}
            <select className="pt-sel" aria-label="Agregar material" value="" onChange={(e) => { const v = e.target.value; if (v) cambiar((d) => { if (!d[i]!.mats.some((x) => x.m === v)) d[i]!.mats.push({ m: v, q: 1 }); }); }}>
              <option value="">+ Material</option>
              {Object.keys(MATERIALES).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </td>
      </tr>
    </>
  );
}
