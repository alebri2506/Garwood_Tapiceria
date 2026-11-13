import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { Icon } from '../../../shared/ui/Icon';
import { normalizar } from '../../../shared/texto';
import { Aviso, CabeceraInventario, Lateral, dinero, enUnidadTela, fechaLarga } from './comunes';
import { inventarioApi, type DatosTela, type OpcionesInventario, type Tela } from './inventarioApi';

// A15b Telas (muestrario · CU-A01): la copia digital de los libros de muestras. Sin cantidades: la tela se encarga por pedido.

const COLOR_MUESTRA: Record<string, string> = {
  Azul: '#2F4E8C', Gris: '#8A8D93', Beige: '#E3D6BF', Verde: '#4E6B4F', Café: '#6B4A33', Rojo: '#B3261E', Negro: '#1F1F22', Blanco: '#F4F1EA', Amarillo: '#D4A72C',
};

export function TelasPage() {
  const [telas, setTelas] = useState<Tela[] | null>(null);
  const [unidad, setUnidad] = useState('yd');
  const [opciones, setOpciones] = useState<OpcionesInventario | null>(null);
  const [porReponer, setPorReponer] = useState<number>();
  const [error, setError] = useState<string | null>(null);
  const [tipo, setTipo] = useState('');
  const [color, setColor] = useState('');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Tela | null>(null);
  const [form, setForm] = useState<'nueva' | 'editar' | null>(null);
  const [aviso, setAviso] = useState<{ t: string; b: string } | null>(null);
  const u = enUnidadTela(unidad);

  const cargar = useCallback(() => inventarioApi.telas().then((r) => { setTelas(r.telas); setUnidad(r.unidadTelas); }).catch((e) => setError(e instanceof ApiError ? e.message : 'No pudimos cargar las telas.')), []);
  useEffect(() => {
    cargar();
    inventarioApi.opciones().then(setOpciones).catch(() => undefined);
    inventarioApi.stock().then((s) => setPorReponer(s.porReponer)).catch(() => undefined);
  }, [cargar]);

  const visibles = useMemo(() => {
    const texto = normalizar(q.trim());
    return (telas ?? [])
      .filter((t) => (!tipo || t.tipo === tipo) && (!color || t.color === color) && (!texto || normalizar(`${t.nombre} ${t.pattern ?? ''} ${t.numeroColor ?? ''} ${t.libro ?? ''}`).includes(texto)))
      .sort((a, b) => Number(!a.activa) - Number(!b.activa));
  }, [telas, tipo, color, q]);
  const tipos = opciones?.tiposTela ?? [...new Set((telas ?? []).map((t) => t.tipo).filter(Boolean) as string[])];
  const colores = opciones?.coloresTela ?? [];
  const cerrar = useCallback(() => { setSel(null); setForm(null); }, []);
  const modelo = (t: Tela) => `${t.tipo ?? 'Tela'} · Pattern ${t.pattern ?? '—'} · color ${t.numeroColor ?? '—'}`;

  const cambiarOferta = async (t: Tela) => {
    try {
      await inventarioApi.ofertaTela(t.id, !t.activa);
      setAviso(t.activa ? { t: 'Tela descontinuada', b: 'Ya no aparece al cotizar ni en la web; las cotizaciones anteriores la conservan.' } : { t: 'Tela disponible otra vez', b: 'Queda con usuario, fecha y hora.' });
      cerrar();
      cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos cambiar la tela.');
    }
  };

  return (
    <div className="iv iv-telas">
      <CabeceraInventario seccion="Telas (muestrario)" porReponer={porReponer} />
      {aviso && <Aviso titulo={aviso.t} onClose={() => setAviso(null)}> {aviso.b}</Aviso>}
      {error && <Alert tone="danger" title="No se pudo completar" compact>{error}</Alert>}

      <div className="tb">
        <label className="sq"><Icon name="search" size={18} /><input type="search" placeholder="Buscar tela, modelo o color" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar tela" /></label>
        <button type="button" className="gw-btn gw-btn-primary" style={{ marginLeft: 'auto' }} onClick={() => { setSel(null); setForm('nueva'); }}>+ Nueva tela</button>
      </div>
      <div className="fbx">
        <div className="frow"><span className="fl2">Tipo de tela</span>
          <div className="chf" role="group" aria-label="Tipo de tela">
            <button type="button" className={!tipo ? 'on' : ''} aria-pressed={!tipo} onClick={() => setTipo('')}>Todos</button>
            {tipos.map((x) => <button key={x} type="button" className={tipo === x ? 'on' : ''} aria-pressed={tipo === x} onClick={() => setTipo(tipo === x ? '' : x)}>{x}</button>)}
          </div>
        </div>
        {colores.length > 0 && (
          <div className="frow"><span className="fl2">Color</span>
            <div className="cols" role="group" aria-label="Color">
              {colores.map((c) => <button key={c} type="button" className={`cb${color === c ? ' on' : ''}`} aria-pressed={color === c} onClick={() => setColor(color === c ? '' : c)}><i style={{ background: COLOR_MUESTRA[c] ?? '#ccc' }} />{c}</button>)}
            </div>
          </div>
        )}
        <span className="cnt3">{visibles.length} de {telas?.length ?? 0} telas · <button type="button" className="lk3" onClick={() => { setTipo(''); setColor(''); setQ(''); }}>Limpiar filtros</button></span>
      </div>

      {!telas && !error && <p className="muted" role="status">Cargando telas…</p>}
      <div className="mg">
        {visibles.map((t) => (
          <button key={t.id} type="button" className={`mc${t.activa ? '' : ' off'}`} onClick={() => { setSel(t); setForm(null); }}>
            <div className="ph" style={{ background: t.colorHex ?? '#8A8D93' }}>{!t.activa && <span className="dtag">Descontinuada</span>}</div>
            <div className="bd"><b>{t.nombre}</b><small>{modelo(t)}</small><small>{t.libro ?? 'Sin libro'}</small></div>
            <div className="ft"><strong>{dinero(u.precio(t.precio))} / {u.abrev}</strong><small className="muted">{!t.activa ? 'Ya no se ofrece' : t.enWeb ? 'En la web' : 'Solo en el taller'}</small></div>
          </button>
        ))}
      </div>
      {telas && visibles.length === 0 && <div className="card"><p className="muted" style={{ margin: 0 }}>No hay telas con ese filtro.</p></div>}

      {sel && !form && (
        <Lateral etiqueta="Tela" titulo={sel.nombre} sub={`${modelo(sel)} · ${sel.libro ?? 'Sin libro'}`} onClose={cerrar}
          pie={<><button type="button" className="gw-btn gw-btn-ghost" onClick={() => cambiarOferta(sel)}>{sel.activa ? 'Marcar como descontinuada' : 'Volver a ofrecer'}</button><button type="button" className="gw-btn gw-btn-secondary" onClick={() => setForm('editar')}>Editar tela</button></>}>
          <div className="ph2" style={{ background: sel.colorHex ?? '#8A8D93' }} />
          <div className="kv">
            <div><span>Precio por {u.abrev === 'm' ? 'metro' : 'yarda'}</span><b>{dinero(u.precio(sel.precio))} · desde el {fechaLarga(sel.fechaPrecio)}</b></div>
            <div><span>Proveedor · tarda</span><b>{sel.proveedor ? `${sel.proveedor.nombre} · ${sel.proveedor.tarda}` : '—'}</b></div>
            <div><span>En la web</span><b>{sel.enWeb ? 'Sí, el cliente la ve al pedir cotización' : 'No, solo se muestra en el taller'}</b></div>
            <div><span>Estado</span><b>{sel.activa ? 'Disponible en el libro' : 'Descontinuada: ya no se ofrece'}</b></div>
          </div>
          <div className="stack" style={{ gap: 2 }}>
            <span className="lbl">Usada en</span>
            {sel.usos.map((x) => <div key={x.pedido} className="li"><b>{x.pedido} · {x.cliente}</b><span>{x.detalle}</span></div>)}
            {sel.usos.length === 0 && <div className="li"><b>Sin pedidos recientes</b><span /></div>}
          </div>
        </Lateral>
      )}
      {form && opciones && (
        <FormTela nueva={form === 'nueva'} tela={form === 'editar' ? sel : null} opciones={opciones} unidad={u.abrev} onClose={form === 'editar' && sel ? () => setForm(null) : cerrar}
          onGuardada={() => { setAviso(form === 'nueva' ? { t: 'Tela registrada', b: 'Ya se puede elegir al cotizar.' } : { t: 'Tela actualizada', b: 'Queda con usuario, fecha y hora.' }); cerrar(); cargar(); }} />
      )}
    </div>
  );
}

function FormTela({ nueva, tela, opciones, unidad, onClose, onGuardada }: { nueva: boolean; tela: Tela | null; opciones: OpcionesInventario; unidad: string; onClose(): void; onGuardada(): void }) {
  const provs = opciones.proveedores.filter((p) => p.tipo === 'telas');
  const u = enUnidadTela(unidad);
  const [d, setD] = useState({
    proveedorId: String(tela?.proveedor?.id ?? provs[0]?.id ?? ''), tipo: tela?.tipo ?? '', color: tela?.color ?? '', pattern: tela?.pattern ?? '', numeroColor: tela?.numeroColor ?? '',
    precio: tela ? u.precio(tela.precio).toFixed(2) : '', nombre: tela?.nombre ?? '', libro: tela?.libro ?? '', enWeb: tela?.enWeb ?? true,
  });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof typeof d) => (e: { target: { value: string } }) => setD((x) => ({ ...x, [k]: e.target.value }));

  const guardar = async () => {
    const e: Record<string, string> = {};
    if (!d.proveedorId) e.proveedorId = 'Elija el proveedor.';
    if (!d.tipo) e.tipo = 'Elija el tipo de tela.';
    if (!d.color) e.color = 'Elija el color.';
    if (!d.pattern.trim()) e.pattern = 'Escriba el modelo.';
    if (!d.numeroColor.trim()) e.numeroColor = 'Escriba el número de color.';
    const precio = Number(d.precio.replace(/[$,\s]/g, ''));
    if (!precio || precio <= 0) e.precio = 'Escriba el precio.';
    setErrores(e);
    if (Object.keys(e).length) return;
    // El precio se guarda siempre por yarda (A14 solo cambia cómo se muestra).
    const porYarda = Math.round((unidad === 'm' ? precio * 0.9144 : precio) * 100) / 100;
    const datos: DatosTela = {
      proveedorId: Number(d.proveedorId), tipo: d.tipo, color: d.color, pattern: d.pattern.trim(), numeroColor: d.numeroColor.trim(), precio: porYarda, enWeb: d.enWeb,
      nombre: nueva ? d.nombre.trim() || null : d.nombre.trim() || null, libro: d.libro.trim() || null, colorHex: tela?.colorHex ? undefined : COLOR_MUESTRA[d.color] ?? null,
    };
    setGuardando(true);
    try {
      if (nueva) await inventarioApi.crearTela(datos);
      else await inventarioApi.editarTela(tela!.id, datos);
      onGuardada();
    } catch (err) {
      setErrores(err instanceof ApiError ? { ...err.errores, general: err.message } : { general: 'No pudimos guardar. Intente de nuevo.' });
    } finally {
      setGuardando(false);
    }
  };
  const campo = (k: string) => `fl${errores[k] ? ' inv' : ''}`;
  const err = (k: string) => (errores[k] ? <small className="err">{errores[k]}</small> : null);

  return (
    <Lateral etiqueta={nueva ? 'Nueva tela' : 'Editar tela'} titulo={nueva ? 'Nueva tela' : 'Editar tela'} sub="Lo que dice el libro de muestras" onClose={onClose}
      pie={<><button type="button" className="gw-btn gw-btn-ghost" onClick={onClose}>Cancelar</button><button type="button" className="gw-btn gw-btn-primary" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : nueva ? 'Registrar tela' : 'Guardar cambios'}</button></>}>
      {errores.general && <Alert tone="danger" title="No se guardó" compact>{errores.general}</Alert>}
      <span className="lbl">Datos para pedirla y cotizarla</span>
      <label className={campo('proveedorId')}>Proveedor *
        <select value={d.proveedorId} onChange={set('proveedorId')}>{provs.map((p) => <option key={p.id} value={p.id}>{p.nombre} · tarda {p.tarda}</option>)}</select>{err('proveedorId')}
      </label>
      <div className="f2">
        <label className={campo('tipo')}>Tipo de tela *<select value={d.tipo} onChange={set('tipo')}><option value="">Elegir…</option>{opciones.tiposTela.map((x) => <option key={x}>{x}</option>)}</select>{err('tipo')}</label>
        <label className={campo('color')}>Color para buscar *<select value={d.color} onChange={set('color')}><option value="">Elegir…</option>{opciones.coloresTela.map((x) => <option key={x}>{x}</option>)}</select>{err('color')}</label>
      </div>
      <div className="f2">
        <label className={campo('pattern')}>Modelo (Pattern) *<input value={d.pattern} onChange={set('pattern')} maxLength={20} placeholder="214" />{err('pattern')}</label>
        <label className={campo('numeroColor')}>Número de color *<input value={d.numeroColor} onChange={set('numeroColor')} maxLength={10} placeholder="3" />{err('numeroColor')}</label>
      </div>
      <p className="hint" style={{ marginTop: -8 }}>Con el modelo y el número de color se le pide la tela al proveedor.</p>
      <label className={campo('precio')}>Precio por {unidad === 'm' ? 'metro' : 'yarda'} *<input inputMode="decimal" value={d.precio} onChange={set('precio')} placeholder="$0.00" />
        <small>El que da el proveedor. Al cambiarlo queda con su fecha; las cotizaciones ya enviadas no cambian.</small>{err('precio')}
      </label>
      <div className="swr">
        <span>Mostrar al cliente en «Telas en línea»<small className="swh">El cliente la ve al pedir su cotización desde la web</small></span>
        <button type="button" role="switch" aria-checked={d.enWeb} className={`sx${d.enWeb ? ' on' : ''}`} onClick={() => setD((x) => ({ ...x, enWeb: !x.enWeb }))} aria-label="Mostrar en la web" />
      </div>
      <span className="lbl" style={{ marginTop: 4 }}>Opcional</span>
      <label className="fl">Nombre de la tela<input value={d.nombre} onChange={set('nombre')} maxLength={80} placeholder="Ej.: Velvet Navy" />
        <small>Si lo deja vacío se arma solo: «{d.tipo || 'Terciopelo'} · Pattern {d.pattern || '214'} · color {d.numeroColor || '3'}».</small>
      </label>
      <label className="fl">Libro de muestras<input value={d.libro} onChange={set('libro')} maxLength={60} placeholder="Ej.: Libro Velvet 2026" /><small>Para encontrar el libro físico en el showroom.</small></label>
    </Lateral>
  );
}
