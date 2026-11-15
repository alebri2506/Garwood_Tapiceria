import { useCallback, useEffect, useState } from 'react';
import { TopAdmin } from '../../../app/layout/AdminLayout';
import { ApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { Icon } from '../../../shared/ui/Icon';
import { Toast } from '../../../shared/ui/Toast';
import { copiar, num } from './datos';
import { costearCon, plantillasApi, type ActividadApi, type CatalogoPlantillas, type Costeo, type DetallePlantilla } from './plantillasApi';
import './plantillas.css';

const dinero = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const cant = (n: number | string) => String(Math.round(num(n) * 100) / 100);
const conSigno = (n: number, f: (x: number) => string) => (n > 0 ? '+' : n < 0 ? '−' : '') + f(Math.abs(n));
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`; };

/** Lo que se edita: los números pueden estar a medio escribir ("1,"). */
interface ActividadBorrador {
  nombre: string; horasPersona: number | string; maquinaId: number | null; horasMaquina: number | string;
  materiales: { materialId: number; cantidad: number | string }[];
  nueva?: boolean;
}
const aBorrador = (a: ActividadApi[]): ActividadBorrador[] => copiar(a);
const aApi = (a: ActividadBorrador[]): ActividadApi[] => a.map((x) => ({
  nombre: x.nombre.trim(), horasPersona: num(x.horasPersona), maquinaId: x.maquinaId, horasMaquina: x.maquinaId ? num(x.horasMaquina) : 0,
  materiales: x.materiales.map((m) => ({ materialId: m.materialId, cantidad: num(m.cantidad) })),
}));
const claveDe = (tipoMuebleId: number, servicio: string) => `${tipoMuebleId}|${servicio}`;

/**
 * A16 Plantillas de cotización (CU-C06): una por tipo de mueble y servicio, con sus actividades (horas persona, máquina,
 * horas máquina) y materiales. Al armar una cotización se carga sola. Guardar cambios crea una versión nueva.
 */
export function PlantillasPage() {
  const [cat, setCat] = useState<CatalogoPlantillas | null>(null);
  const [clave, setClave] = useState<string | null>(null);
  const [det, setDet] = useState<DetallePlantilla | null>(null);
  const [borrador, setBorrador] = useState<ActividadBorrador[] | null>(null);
  const [aviso, setAviso] = useState<{ titulo: string; texto: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargarCatalogo = useCallback(() => plantillasApi.catalogo().then((c) => {
    setCat(c);
    // Abre la primera combinación con plantilla (como el diseño, que abre una ya creada).
    setClave((k) => k ?? (c.plantillas[0] ? claveDe(c.plantillas[0].tipoMuebleId, c.plantillas[0].servicio) : claveDe(c.tiposMueble[0]!.id, c.servicios[0]!.codigo)));
  }).catch((e) => setError(e instanceof ApiError ? e.message : 'No pudimos cargar las plantillas.')), []);
  useEffect(() => { cargarCatalogo(); }, [cargarCatalogo]);

  const resumen = cat && clave ? cat.plantillas.find((p) => claveDe(p.tipoMuebleId, p.servicio) === clave) : undefined;
  useEffect(() => {
    if (!resumen) { setDet(null); return; }
    if (det?.id === resumen.id) return;
    plantillasApi.detalle(resumen.id).then(setDet).catch((e) => setError(e instanceof ApiError ? e.message : 'No pudimos abrir la plantilla.'));
  }, [resumen?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !cat) return <Alert tone="danger" title="No pudimos cargar las plantillas">{error}</Alert>;
  if (!cat || !clave) return <p className="muted" role="status">Cargando plantillas…</p>;

  const [tipoTxt, servicio] = clave.split('|') as [string, string];
  const tipoMuebleId = Number(tipoTxt);
  const creando = !resumen;
  const cargando = !creando && det?.id !== resumen.id;
  const editando = Boolean(borrador);
  const acts: ActividadBorrador[] = borrador ?? (det && !creando ? det.actividades : []);
  const actsApi = aApi(acts);
  const c: Costeo = costearCon(cat, actsApi);
  const c0 = !creando && det ? costearCon(cat, det.actividades) : null;
  const nombre = `${cat.tiposMueble.find((t) => t.id === tipoMuebleId)?.nombre ?? ''} · ${cat.servicios.find((s) => s.codigo === servicio)?.nombre ?? ''}`;
  const puedeCrear = actsApi.some((a) => a.horasPersona > 0);
  const nombreMaterial = (id: number) => cat.materiales.find((m) => m.id === id)?.nombre ?? 'Material';
  const unidadMaterial = (id: number) => cat.materiales.find((m) => m.id === id)?.unidad ?? '';
  const nombreMaquina = (id: number | null) => {
    if (id == null) return 'Sin máquina';
    const m = cat.maquinas.find((x) => x.id === id);
    return m ? (m.activo ? m.nombre : m.nombre + ' (desactivada)') : 'Máquina';
  };

  const elegir = (k: string) => { setClave(k); setBorrador(cat.plantillas.some((p) => claveDe(p.tipoMuebleId, p.servicio) === k) ? null : []); setAviso(null); setError(null); };
  const cambiar = (fn: (d: ActividadBorrador[]) => void) => { const d = copiar(borrador ?? []); fn(d); setBorrador(d); };
  /** Marca en verde lo que cambió respecto a la versión guardada. */
  const cambio = (i: number, materialId?: number) => {
    if (!editando || creando || !det) return false;
    const b = det.actividades.find((x) => x.nombre === acts[i]!.nombre);
    if (!b) return true;
    if (materialId === undefined) return num(b.horasPersona) !== num(acts[i]!.horasPersona);
    const p = b.materiales.find((x) => x.materialId === materialId), a = acts[i]!.materiales.find((x) => x.materialId === materialId);
    return !p || num(p.cantidad) !== num(a?.cantidad ?? 0);
  };
  const delta = (a: number, b: number | undefined, f: (x: number) => string) => (editando && !creando && b !== undefined && Math.abs(a - b) > 0.001 ? conSigno(a - b, f) : '');
  const horas = (n: number) => `${cant(n)} h`;

  const copiarDe = async (k: string) => {
    const p = cat.plantillas.find((x) => claveDe(x.tipoMuebleId, x.servicio) === k);
    if (!p) return;
    try { setBorrador(aBorrador((await plantillasApi.detalle(p.id)).actividades)); } catch (e) { setError(e instanceof ApiError ? e.message : 'No pudimos copiar esa plantilla.'); }
  };

  const guardar = async () => {
    if (!borrador) return;
    setGuardando(true);
    setError(null);
    try {
      const r = creando ? await plantillasApi.crear(tipoMuebleId, servicio, actsApi) : await plantillasApi.guardar(det!.id, actsApi);
      setDet(r);
      setBorrador(null);
      await cargarCatalogo();
      setAviso(creando
        ? { titulo: 'Plantilla creada', texto: `${nombre}: desde ahora se carga sola al cotizar este mueble y servicio.` }
        : r.sinCambios
          ? { titulo: 'No había cambios', texto: 'La plantilla quedó igual.' }
          : { titulo: 'Plantilla guardada', texto: `${nombre}: las cotizaciones nuevas usan estos valores (versión ${r.version}). Queda registrado quién y cuándo la cambió.` });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos guardar la plantilla. Intente de nuevo.');
      if (e instanceof ApiError && e.status === 409) cargarCatalogo();
    } finally {
      setGuardando(false);
    }
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
          <span className="muted" style={{ fontSize: 13 }}>{cat.plantillas.length} de {cat.tiposMueble.length * cat.servicios.length} · <span style={{ color: 'var(--success-ink)' }}>■</span> con plantilla (precio sugerido, sin tela) · + crear</span>
        </div>
        <div className="pt-scroll">
          <table className="pt-mx">
            <thead><tr><th>Tipo de mueble</th>{cat.servicios.map((s) => <th key={s.codigo}>{s.corto}</th>)}</tr></thead>
            <tbody>
              {cat.tiposMueble.map((m) => (
                <tr key={m.id}>
                  <td className="pt-mn">{m.nombre}</td>
                  {cat.servicios.map((s) => {
                    const k = claveDe(m.id, s.codigo), x = cat.plantillas.find((p) => p.tipoMuebleId === m.id && p.servicio === s.codigo), on = k === clave;
                    return (
                      <td key={s.codigo}>
                        <button type="button" className={`pt-cx${x ? ' pt-have' : ' pt-none'}${on ? ' pt-on' : ''}`} aria-pressed={on}
                          aria-label={`${m.nombre} · ${s.nombre}${x ? ' · tiene plantilla' : ' · sin plantilla'}`} onClick={() => elegir(k)}>
                          {x ? dinero(x.sugerido) : on ? 'Creando…' : '+'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card stack" style={{ gap: 18 }} aria-labelledby="pt-tit">
        <div className="pt-hd">
          <div>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <h2 id="pt-tit">{creando ? `Nueva plantilla · ${nombre}` : nombre}</h2>
              <span className={creando || editando ? 'pt-chip pt-dr' : 'pt-chip pt-ok'}>{creando ? 'Sin crear' : editando ? 'Editando' : 'Activa'}</span>
            </div>
            <p className="pt-meta">
              {creando
                ? 'Todavía no hay plantilla para esta combinación. Las cotizaciones de este caso se arman a mano hasta que la cree.'
                : det && !cargando ? `Usada en ${det.usos} cotizaciones · versión ${det.version} · última edición ${fechaCorta(det.fecha)} por ${det.editadoPor}` : 'Cargando…'}
            </p>
          </div>
          <div className="row">
            {!creando && !editando && <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" disabled={cargando} onClick={() => { setBorrador(aBorrador(det!.actividades)); setAviso(null); }}>Editar</button>}
            {!creando && editando && <><button type="button" className="gw-btn gw-btn-ghost gw-btn-sm" onClick={() => { setBorrador(null); setError(null); }}>Cancelar</button><button type="button" className="gw-btn gw-btn-primary gw-btn-sm" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button></>}
            {creando && <button type="button" className="gw-btn gw-btn-primary gw-btn-sm" disabled={!puedeCrear || guardando} onClick={guardar}>{guardando ? 'Creando…' : 'Crear plantilla'}</button>}
          </div>
        </div>
        {error && <Alert tone="danger" title="No se pudo guardar" compact>{error}</Alert>}

        {creando && (
          <div className="pt-from">
            <span className="gw-field-label">¿Desde dónde empieza?</span>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" onClick={() => setBorrador([])}>En blanco</button>
              <span className="muted" style={{ fontSize: 13 }}>o copiar de</span>
              <select className="pt-sel pt-sel-full" style={{ maxWidth: 320 }} aria-label="Copiar de otra plantilla" value="" onChange={(e) => copiarDe(e.target.value)}>
                <option value="">Elegir una plantilla parecida…</option>
                {cat.plantillas.map((p) => (
                  <option key={p.id} value={claveDe(p.tipoMuebleId, p.servicio)}>{cat.tiposMueble.find((t) => t.id === p.tipoMuebleId)?.nombre} · {cat.servicios.find((s) => s.codigo === p.servicio)?.nombre}</option>
                ))}
              </select>
            </div>
            {!puedeCrear && <span className="pt-hint">Para crearla: al menos una actividad con horas.</span>}
          </div>
        )}
        {editando && <p className="pt-ednote">{creando ? 'Agregue las actividades con sus horas y materiales.' : 'Los cambios se marcan en verde. Se aplican a las cotizaciones nuevas; las ya enviadas no cambian.'}</p>}

        <div className="pt-sum">
          <div className="pt-st"><span>Horas persona</span><b>{horas(c.horas)}</b><small>{delta(c.horas, c0?.horas, horas)}</small></div>
          <div className="pt-st"><span>Costo</span><b>{dinero(c.costo)}</b><small>{delta(c.costo, c0?.costo, dinero)}</small></div>
          <div className="pt-st pt-pr"><span>Precio sugerido</span><b>{dinero(c.sugerido)}</b><small>{delta(c.sugerido, c0?.sugerido, dinero)}</small></div>
          <div className="pt-brk">
            <span>Materiales <b>{dinero(c.materiales)}</b></span><span>Mano de obra <b>{dinero(c.manoObra)}</b></span><span>Maquinaria <b>{dinero(c.maquinaria)}</b></span><span>Costos fijos <b>{dinero(c.fijos)}</b></span>
            <span style={{ marginLeft: 'auto' }}>Precios del Inventario · sin tela (se agrega en la cotización) · margen {cant(cat.costos.margenPct)} % sobre el costo</span>
          </div>
        </div>

        <div className="pt-scroll">
          <table className={editando ? 't pt-te' : 't pt-tv'}>
            <thead><tr><th style={{ width: '28%' }}>Actividad</th><th className="r" style={{ width: 96 }}>Horas persona</th><th>Máquina</th><th className="r" style={{ width: 96 }}>Horas máq.</th>{!editando && <th>Materiales (cantidad)</th>}{editando && <th style={{ width: 44 }} />}</tr></thead>
            <tbody>
              {acts.map((a, i) => (
                <FilaActividad key={i} a={a} i={i} editando={editando} cat={cat} cambio={cambio} cambiar={cambiar}
                  nombreMaterial={nombreMaterial} unidadMaterial={unidadMaterial} nombreMaquina={nombreMaquina} />
              ))}
            </tbody>
          </table>
        </div>
        {acts.length === 0 && <div className="pt-empty">{cargando ? 'Cargando…' : 'Sin actividades todavía. Agregue la primera o copie una plantilla parecida.'}</div>}
        <div className="between" style={{ flexWrap: 'wrap', fontSize: 14 }}>
          <span className="muted">{acts.length} actividades · total {horas(c.horas)}</span>
          {editando && <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" onClick={() => cambiar((d) => { d.push({ nombre: 'Nueva actividad', horasPersona: 1, maquinaId: null, horasMaquina: 0, materiales: [], nueva: true }); })}>+ Agregar actividad</button>}
        </div>
        <p className="audit" style={{ margin: 0 }}>La tela no va en la plantilla: la elige el cliente y se agrega en la cotización. Los materiales salen del stock del Inventario; grapas, hilo y pegamento van como materiales de la actividad que los usa.</p>
      </section>
    </>
  );
}

interface PropsFila {
  a: ActividadBorrador; i: number; editando: boolean; cat: CatalogoPlantillas;
  cambio(i: number, materialId?: number): boolean;
  cambiar(fn: (d: ActividadBorrador[]) => void): void;
  nombreMaterial(id: number): string;
  unidadMaterial(id: number): string;
  nombreMaquina(id: number | null): string;
}

/** Una actividad: en vista, sus datos y materiales; al editar, campos y la fila de materiales debajo. */
function FilaActividad({ a, i, editando, cat, cambio, cambiar, nombreMaterial, unidadMaterial, nombreMaquina }: PropsFila) {
  if (!editando) {
    return (
      <tr>
        <td><b>{a.nombre}</b></td>
        <td className="r"><span className="num">{cant(a.horasPersona)}</span></td>
        <td><span className={a.maquinaId == null ? 'muted' : undefined}>{nombreMaquina(a.maquinaId)}</span></td>
        <td className="r"><span className="num">{num(a.horasMaquina) ? cant(a.horasMaquina) : '—'}</span></td>
        <td><div className="pt-mats">{a.materiales.length === 0 ? <span className="muted">—</span> : a.materiales.map((m) => <span key={String(m.materialId)} className="pt-mat">{nombreMaterial(m.materialId)} · {cant(m.cantidad)} {unidadMaterial(m.materialId)}</span>)}</div></td>
      </tr>
    );
  }
  // Materiales que aún se pueden agregar a esta actividad (la tela de referencia y los del Inventario).
  // Solo materiales de stock del Inventario: la tela la elige el cliente y se agrega en la cotización.
  const disponibles = cat.materiales.filter((m) => !a.materiales.some((x) => x.materialId === m.id));
  return (
    <>
      <tr>
        <td><input className="pt-cell pt-nm" value={a.nombre} maxLength={80} aria-label="Nombre de la actividad" onChange={(e) => cambiar((d) => { d[i]!.nombre = e.target.value; })} /></td>
        <td className="r"><input className={cambio(i) ? 'pt-cell pt-chg' : 'pt-cell'} inputMode="decimal" value={String(a.horasPersona)} aria-label="Horas persona" onChange={(e) => cambiar((d) => { d[i]!.horasPersona = e.target.value; })} /></td>
        <td>
          {a.nueva
            ? <select className="pt-sel pt-sel-full" aria-label="Máquina" value={a.maquinaId ?? ''} onChange={(e) => cambiar((d) => { d[i]!.maquinaId = e.target.value ? Number(e.target.value) : null; if (!e.target.value) d[i]!.horasMaquina = 0; })}>
                <option value="">Sin máquina</option>
                {cat.maquinas.filter((m) => m.activo).map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            : <span className={a.maquinaId == null ? 'muted' : undefined}>{nombreMaquina(a.maquinaId)}</span>}
        </td>
        <td className="r"><input className="pt-cell" inputMode="decimal" value={String(a.horasMaquina)} disabled={a.maquinaId == null} aria-label="Horas máquina" onChange={(e) => cambiar((d) => { d[i]!.horasMaquina = e.target.value; })} /></td>
        <td><button type="button" className="pt-x" aria-label={`Quitar la actividad ${a.nombre}`} onClick={() => cambiar((d) => { d.splice(i, 1); })}><Icon name="x" size={16} /></button></td>
      </tr>
      <tr className="pt-sub">
        <td colSpan={5}>
          <span className="pt-ml">Materiales</span>
          <div className="pt-mats">
            {a.materiales.map((m, j) => (
              <span key={String(m.materialId)} className="pt-mq">{nombreMaterial(m.materialId)}
                <input className={cambio(i, m.materialId) ? 'pt-qi pt-chg' : 'pt-qi'} inputMode="decimal" value={String(m.cantidad)} aria-label={`Cantidad de ${nombreMaterial(m.materialId)}`} onChange={(e) => cambiar((d) => { d[i]!.materiales[j]!.cantidad = e.target.value; })} />
                <i>{unidadMaterial(m.materialId)}</i>
                <button type="button" className="pt-xs" aria-label={`Quitar ${nombreMaterial(m.materialId)}`} onClick={() => cambiar((d) => { d[i]!.materiales.splice(j, 1); })}><Icon name="x" size={14} /></button>
              </span>
            ))}
            {disponibles.length > 0 && (
              <select className="pt-sel" aria-label="Agregar material" value="" onChange={(e) => { const v = e.target.value; if (v) cambiar((d) => { d[i]!.materiales.push({ materialId: Number(v), cantidad: 1 }); }); }}>
                <option value="">+ Material</option>
                {disponibles.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            )}
            {cat.materiales.length === 0 && <span className="muted" style={{ fontSize: 12 }}>No hay materiales en el Inventario</span>}
          </div>
        </td>
      </tr>
    </>
  );
}
