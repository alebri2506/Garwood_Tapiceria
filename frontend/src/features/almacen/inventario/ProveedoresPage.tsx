import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { Icon } from '../../../shared/ui/Icon';
import { normalizar } from '../../../shared/texto';
import { Aviso, CabeceraInventario, ESTADO, Lateral, diaCorto, dinero } from './comunes';
import { inventarioApi, type DatosProveedor, type Proveedor } from './inventarioApi';

// A8p Proveedores (CU-A03): a quién se le compra, cómo se le pide y cuánto tarda (sirve para saber si llega a tiempo).

const CANAL = { telefono: 'Teléfono', whatsapp: 'WhatsApp' } as const;

export function ProveedoresPage() {
  const [lista, setLista] = useState<Proveedor[] | null>(null);
  const [porReponer, setPorReponer] = useState<number>();
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState('');
  const [sel, setSel] = useState<Proveedor | null>(null);
  const [form, setForm] = useState<'nuevo' | 'editar' | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(() => inventarioApi.proveedores().then((r) => setLista(r.proveedores)).catch((e) => setError(e instanceof ApiError ? e.message : 'No pudimos cargar los proveedores.')), []);
  useEffect(() => {
    cargar();
    inventarioApi.stock().then((s) => setPorReponer(s.porReponer)).catch(() => undefined);
  }, [cargar]);

  const visibles = useMemo(() => {
    const texto = normalizar(q.trim());
    return (lista ?? []).filter((p) => (!tipo || p.tipo === tipo) && (!texto || normalizar(p.nombre).includes(texto)));
  }, [lista, q, tipo]);
  const cerrar = useCallback(() => { setSel(null); setForm(null); }, []);

  return (
    <div className="iv iv-prov">
      <CabeceraInventario seccion="Proveedores" porReponer={porReponer} />
      {aviso && <Aviso titulo={aviso} onClose={() => setAviso(null)}> Ya se puede elegir al registrar o editar un material.</Aviso>}
      {error && <Alert tone="danger" title="No se pudo completar" compact>{error}</Alert>}

      <div className="tb">
        <label className="sqp"><Icon name="search" size={18} /><input type="search" placeholder="Buscar proveedor por nombre" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar proveedor" /></label>
        <select className="selp" aria-label="Tipo de compra" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Todos los tipos</option><option value="stock">Materiales de stock</option><option value="telas">Telas bajo pedido</option>
        </select>
        {(q || tipo) && <button type="button" className="clrp" onClick={() => { setQ(''); setTipo(''); }}>Quitar filtros</button>}
        <span className="hint">{visibles.length} de {lista?.length ?? 0} proveedores</span>
        <button type="button" className="gw-btn gw-btn-primary" style={{ marginLeft: 'auto' }} onClick={() => { setSel(null); setForm('nuevo'); }}>+ Nuevo proveedor</button>
      </div>

      {!lista && !error && <p className="muted" role="status">Cargando proveedores…</p>}
      {lista && (
        <div className="tw">
          <table className="pt">
            <thead><tr><th>Proveedor</th><th>Cómo se le pide</th><th>Tarda en llegar</th><th>Pendiente</th></tr></thead>
            <tbody>
              {visibles.map((p) => (
                <tr key={p.id} tabIndex={0} onClick={() => { setSel(p); setForm(null); }} onKeyDown={(e) => { if (e.key === 'Enter') { setSel(p); setForm(null); } }} aria-label={`Abrir ${p.nombre}`}>
                  <td><b>{p.nombre}</b><small>{p.tipo === 'telas' ? 'Telas bajo pedido' : 'Materiales de stock'}</small></td>
                  <td>{CANAL[p.canal]}<small>{p.contacto}</small></td>
                  <td>{p.tarda}</td>
                  <td>{p.pendiente ? <span className={p.tipo === 'telas' ? 'tag bad' : 'tag warn'}>{p.pendiente}</span> : <span className="tag ok">Al día</span>}</td>
                </tr>
              ))}
              {visibles.length === 0 && <tr><td colSpan={4} className="vacio">No hay proveedores con ese filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {sel && !form && (
        <Lateral etiqueta="Proveedor" titulo={sel.nombre} sub={`${CANAL[sel.canal]} · ${sel.contacto} · tarda ${sel.tarda}`} onClose={cerrar}
          pie={<><button type="button" className="gw-btn gw-btn-ghost" onClick={cerrar}>Cerrar</button><button type="button" className="gw-btn gw-btn-secondary" onClick={() => setForm('editar')}>Editar proveedor</button></>}>
          <div className="stack" style={{ gap: 2 }}>
            <span className="lbl">{sel.tipo === 'telas' ? 'Telas del muestrario' : 'Materiales que se le compran'}</span>
            {sel.materiales.map((m) => (
              <div key={m.id} className="li"><div><b>{m.nombre}</b><small>{dinero(m.precio)} / {m.unidad}</small></div>{m.estado && <span className="r">{ESTADO[m.estado][0]}</span>}</div>
            ))}
            {sel.materiales.length === 0 && <p className="hint">Todavía no tiene materiales asignados.</p>}
          </div>
          <div className="stack" style={{ gap: 2 }}>
            <span className="lbl">Últimas compras</span>
            {sel.compras.map((c) => (
              <div key={c.codigo} className="li">
                <div><b>{c.detalle}</b><small>{c.codigo} · pedido {diaCorto(c.fechaPedido)} · {c.fechaLlegada ? `llegó ${diaCorto(c.fechaLlegada)}` : `llega ${diaCorto(c.fechaEstimada)}`}</small></div>
                <span className={c.estado === 'Llegó' ? 'tag ok' : 'tag info'}>{c.estado}</span>
              </div>
            ))}
            {sel.compras.length === 0 && <p className="hint">Sin compras todavía.</p>}
          </div>
        </Lateral>
      )}
      {form && (
        <FormProveedor proveedor={form === 'editar' ? sel : null} onClose={form === 'editar' && sel ? () => setForm(null) : cerrar}
          onGuardado={() => { setAviso(form === 'nuevo' ? 'Proveedor registrado.' : 'Proveedor actualizado.'); cerrar(); cargar(); }} />
      )}
    </div>
  );
}

function FormProveedor({ proveedor, onClose, onGuardado }: { proveedor: Proveedor | null; onClose(): void; onGuardado(): void }) {
  const [d, setD] = useState({
    nombre: proveedor?.nombre ?? '', canal: proveedor?.canal ?? 'whatsapp', contacto: proveedor?.contacto ?? '',
    diasMin: proveedor ? String(proveedor.diasMin) : '', diasMax: proveedor ? String(proveedor.diasMax) : '', tipo: proveedor?.tipo ?? 'stock',
  });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof typeof d) => (e: { target: { value: string } }) => setD((x) => ({ ...x, [k]: e.target.value }));

  const guardar = async () => {
    const e: Record<string, string> = {};
    if (!d.nombre.trim()) e.nombre = 'Escriba el nombre.';
    if (!d.contacto.trim()) e.contacto = 'Escriba el teléfono o WhatsApp.';
    const a = Number(d.diasMin), b = Number(d.diasMax);
    if (d.diasMin === '' || !Number.isInteger(a) || a < 0) e.diasMin = 'Escriba días enteros.';
    if (d.diasMax === '' || !Number.isInteger(b) || b < 0) e.diasMax = 'Escriba días enteros.';
    else if (b < a) e.diasMax = '«Hasta» debe ser igual o mayor que «desde».';
    setErrores(e);
    if (Object.keys(e).length) return;
    const datos: DatosProveedor = { nombre: d.nombre.trim(), canal: d.canal as DatosProveedor['canal'], contacto: d.contacto.trim(), diasMin: a, diasMax: b, tipo: d.tipo as DatosProveedor['tipo'] };
    setGuardando(true);
    try {
      if (proveedor) await inventarioApi.editarProveedor(proveedor.id, datos);
      else await inventarioApi.crearProveedor(datos);
      onGuardado();
    } catch (err) {
      setErrores(err instanceof ApiError ? { ...err.errores, general: err.message } : { general: 'No pudimos guardar. Intente de nuevo.' });
    } finally {
      setGuardando(false);
    }
  };
  const campo = (k: string) => `fl${errores[k] ? ' inv' : ''}`;
  const err = (k: string) => (errores[k] ? <small className="err">{errores[k]}</small> : null);

  return (
    <Lateral etiqueta={proveedor ? 'Editar proveedor' : 'Nuevo proveedor'} titulo={proveedor ? 'Editar proveedor' : 'Nuevo proveedor'} sub="Solo lo necesario para pedirle y saber cuándo llega" onClose={onClose}
      pie={<><button type="button" className="gw-btn gw-btn-ghost" onClick={onClose}>Cancelar</button><button type="button" className="gw-btn gw-btn-primary" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : proveedor ? 'Guardar cambios' : 'Registrar proveedor'}</button></>}>
      {errores.general && <Alert tone="danger" title="No se guardó" compact>{errores.general}</Alert>}
      <label className={campo('nombre')}>Nombre<input value={d.nombre} onChange={set('nombre')} maxLength={80} placeholder="Ej.: Distribuidora de rellenos" />{err('nombre')}</label>
      <div className="stack" style={{ gap: 6 }}><span className="fl">Cómo se le pide</span>
        <div className="chan" role="radiogroup" aria-label="Cómo se le pide">
          {(['telefono', 'whatsapp'] as const).map((c) => <button key={c} type="button" role="radio" aria-checked={d.canal === c} className={d.canal === c ? 'on' : ''} onClick={() => setD((x) => ({ ...x, canal: c }))}>{CANAL[c]}</button>)}
        </div>
      </div>
      <label className={campo('contacto')}>{d.canal === 'whatsapp' ? 'Número de WhatsApp' : 'Teléfono'}<input value={d.contacto} onChange={set('contacto')} maxLength={40} inputMode="tel" placeholder="(000) 000-0000" />{err('contacto')}</label>
      <div className="f2">
        <label className={campo('diasMin')}>Tarda en llegar · desde<input inputMode="numeric" value={d.diasMin} onChange={set('diasMin')} placeholder="3" /><small>días</small>{err('diasMin')}</label>
        <label className={campo('diasMax')}>hasta<input inputMode="numeric" value={d.diasMax} onChange={set('diasMax')} placeholder="5" /><small>días</small>{err('diasMax')}</label>
      </div>
      <div className="stack" style={{ gap: 6 }}><span className="fl">¿Qué le compra?</span>
        <div className="seg" role="radiogroup" aria-label="Qué le compra">
          <button type="button" role="radio" aria-checked={d.tipo === 'stock'} className={d.tipo === 'stock' ? 'on' : ''} onClick={() => setD((x) => ({ ...x, tipo: 'stock' }))}>Materiales de stock<small>Espuma, rellenos, insumos</small></button>
          <button type="button" role="radio" aria-checked={d.tipo === 'telas'} className={d.tipo === 'telas' ? 'on' : ''} onClick={() => setD((x) => ({ ...x, tipo: 'telas' }))}>Telas bajo pedido<small>Libros de muestras</small></button>
        </div>
        {errores.tipo && <small className="err">{errores.tipo}</small>}
      </div>
      <p className="hint">El <b>tiempo de entrega</b> sirve para saber si una compra llegará a tiempo para un pedido.</p>
    </Lateral>
  );
}
