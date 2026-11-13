import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { Icon } from '../../../shared/ui/Icon';
import { normalizar } from '../../../shared/texto';
import { Aviso, CabeceraInventario, ESTADO, Lateral, cantidad, diaCorto, dinero, fechaLarga, momento, num } from './comunes';
import { inventarioApi, type DatosMaterial, type FichaMaterial, type FilaStock, type OpcionesInventario, type Stock } from './inventarioApi';

// A15 Stock (CU-A01, A02, A09): cuánto hay, cuánto está reservado, qué está bajo el mínimo y para cuánto alcanza.

type Filtro = 'todos' | 'alerta' | 'pedido';
const FILTROS: [Filtro, string, (m: FilaStock) => boolean][] = [
  ['todos', 'Todos', () => true],
  ['alerta', 'Requieren atención', (m) => m.estado !== 'ok'],
  ['pedido', 'Pedidos', (m) => m.estado === 'pedido'],
];

/** «Carlos retiró 1 plancha de Espuma HD 2" para PED-0076». */
function frase(u: NonNullable<Stock['ultimoMovimiento']>) {
  const q = `${num(Math.abs(u.cantidad))} ${u.unidad}`;
  if (u.motivo.startsWith('Retiro')) return `${u.quien} retiró ${q} de ${u.material}${u.pedido ? ` para ${u.pedido}` : ''}`;
  if (u.motivo === 'Compra recibida') return `llegaron ${q} de ${u.material}`;
  if (u.motivo.startsWith('Conteo') || u.motivo.startsWith('Ajuste')) return `conteo de ${u.material}`;
  return `${u.motivo.toLowerCase()} · ${u.material} ${u.cantidad > 0 ? '+' : '−'}${q}`;
}

export function StockPage() {
  const [stock, setStock] = useState<Stock | null>(null);
  const [opciones, setOpciones] = useState<OpcionesInventario | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [q, setQ] = useState('');
  const [ficha, setFicha] = useState<FichaMaterial | null>(null);
  const [form, setForm] = useState<'nuevo' | 'editar' | null>(null);
  const [aviso, setAviso] = useState<{ t: string; b: string } | null>(null);

  const cargar = useCallback(() => inventarioApi.stock().then(setStock).catch((e) => setError(e instanceof ApiError ? e.message : 'No pudimos cargar el inventario.')), []);
  useEffect(() => {
    cargar();
    inventarioApi.opciones().then(setOpciones).catch(() => undefined);
  }, [cargar]);

  const filas = useMemo(() => {
    if (!stock) return [];
    const texto = normalizar(q.trim());
    const pasa = FILTROS.find((f) => f[0] === filtro)![2];
    return stock.materiales
      .filter((m) => pasa(m) && (!texto || normalizar(`${m.nombre} ${m.proveedor ?? ''}`).includes(texto)))
      .sort((a, b) => Number(b.estado !== 'ok') - Number(a.estado !== 'ok'));
  }, [stock, filtro, q]);

  const abrir = (id: number) => inventarioApi.material(id).then((f) => { setFicha(f); setForm(null); }).catch((e) => setError(e instanceof ApiError ? e.message : 'No pudimos abrir el material.'));
  const cerrar = useCallback(() => { setFicha(null); setForm(null); }, []);
  const u = stock?.ultimoMovimiento;
  const alDia = u ? <>Al día · último movimiento <b>{momento(u.fecha).dia} {momento(u.fecha).hora}</b> · {frase(u)}</> : 'Todavía no hay movimientos';

  return (
    <div className="iv iv-stock">
      <CabeceraInventario seccion="Stock" porReponer={stock?.porReponer} alDia={alDia} />
      {aviso && <Aviso titulo={aviso.t} onClose={() => setAviso(null)}> {aviso.b}</Aviso>}
      {error && <Alert tone="danger" title="No se pudo completar" compact>{error}</Alert>}

      <div className="tb">
        <div className="chf" role="group" aria-label="Filtrar materiales">
          {FILTROS.map(([id, texto, pasa]) => (
            <button key={id} type="button" className={filtro === id ? 'on' : ''} aria-pressed={filtro === id} onClick={() => setFiltro(id)}>
              {texto}<i>{stock?.materiales.filter(pasa).length ?? 0}</i>
            </button>
          ))}
        </div>
        <label className="sq" style={{ marginLeft: 'auto' }}>
          <Icon name="search" size={18} />
          <input type="search" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar material o proveedor" />
        </label>
        <button type="button" className="gw-btn gw-btn-primary" onClick={() => { setFicha(null); setForm('nuevo'); }}>+ Nuevo material</button>
      </div>

      {!stock && !error && <p className="muted" role="status">Cargando inventario…</p>}
      {stock && (
        <div className="tw">
          <table className="st">
            <thead><tr><th>Material</th><th className="r">En el estante</th><th className="r">Reservado</th><th className="r">Disponible</th><th className="r">Mínimo</th><th>Alcanza para</th><th>Estado</th></tr></thead>
            <tbody>
              {filas.map((m) => (
                <tr key={m.id} onClick={() => abrir(m.id)} onKeyDown={(e) => { if (e.key === 'Enter') abrir(m.id); }} tabIndex={0} aria-label={`Abrir ${m.nombre}`}>
                  <td><b>{m.nombre}</b><small>{m.proveedor ?? 'Sin proveedor'}</small></td>
                  <td className="r">{cantidad(m.fisico, m.unidad)}</td>
                  <td className="r">{m.reservado ? num(m.reservado) : '—'}</td>
                  <td className="r"><span className={m.disponible < 0 ? 'big c-bad' : m.estado === 'bajo' ? 'big c-warn' : 'big'}>{cantidad(m.disponible, m.unidad)}</span></td>
                  <td className="r">{num(m.minimo)}</td>
                  <td>{m.alcanza}</td>
                  <td>
                    <span className={ESTADO[m.estado][1]}>{ESTADO[m.estado][0]}</span>
                    {m.estado === 'pedido' && <small>llegan {cantidad(m.porLlegar, m.unidad)} · {diaCorto(m.llegaEl)}</small>}
                    {m.estado === 'falta' && m.reservadoPara.length > 0 && <small>para {m.reservadoPara.join(', ')}</small>}
                  </td>
                </tr>
              ))}
              {filas.length === 0 && <tr><td colSpan={7} className="vacio">No hay materiales con ese filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <p className="why"><b>Disponible</b> = en el estante − reservado para pedidos. Las telas no tienen stock: se eligen en el <Link to="/admin/inventario/telas">muestrario</Link> y se encargan por pedido en <Link to="/admin/inventario/reponer">Reponer</Link>.</p>

      {ficha && !form && (
        <Lateral etiqueta="Ficha del material" titulo={ficha.nombre} sub={`Se mide en ${ficha.unidad}`} onClose={cerrar}
          pie={<><button type="button" className="gw-btn gw-btn-ghost" onClick={cerrar}>Cerrar</button><button type="button" className="gw-btn gw-btn-secondary" onClick={() => setForm('editar')}>Editar ficha</button></>}>
          <div className="n3">
            <div><small>En el estante</small><b>{num(ficha.fisico)}</b></div>
            <div><small>Reservado</small><b>{num(ficha.reservado)}</b></div>
            <div className="hl"><small>Disponible</small><b className={ficha.disponible < 0 ? 'c-bad' : ''}>{num(ficha.disponible)}</b></div>
          </div>
          <div className="kv">
            <div><span>Unidad</span><b>{ficha.unidad}</b></div>
            <div><span>Mínimo</span><b>{cantidad(ficha.minimo, ficha.unidad)}</b></div>
            <div><span>Consumo promedio</span><b>{cantidad(ficha.consumoSemanal, ficha.unidad)} por semana</b></div>
            <div><span>Proveedor · tarda</span><b>{ficha.proveedor ? `${ficha.proveedor.nombre} · ${ficha.proveedor.tarda}` : '—'}</b></div>
            <div><span>Precio</span><b>{dinero(ficha.precio)} · desde el {fechaLarga(ficha.fechaPrecio)}</b></div>
            {ficha.ubicacion && <div><span>Dónde está</span><b>{ficha.ubicacion}</b></div>}
          </div>
          <div className="stack" style={{ gap: 2 }}>
            <div className="between"><span className="lbl">Últimos movimientos</span><Link to={`/admin/inventario/movimientos?material=${ficha.id}`} style={{ fontSize: 13, fontWeight: 700 }}>Ver todos</Link></div>
            {ficha.movimientos.map((m, i) => (
              <div key={i} className="mv"><span>{momento(m.fecha).dia} · {m.motivo}{m.pedido ? ` · ${m.pedido}` : ''} · {m.quien}</span><b>{m.cantidad > 0 ? '+' : m.cantidad < 0 ? '−' : ''}{m.cantidad ? num(Math.abs(m.cantidad)) : '—'}</b></div>
            ))}
            {ficha.movimientos.length === 0 && <p className="hint">Sin movimientos todavía.</p>}
          </div>
        </Lateral>
      )}

      {form && opciones && (
        <FormMaterial
          nuevo={form === 'nuevo'} ficha={form === 'editar' ? ficha : null} opciones={opciones} onClose={form === 'editar' && ficha ? () => setForm(null) : cerrar}
          onGuardado={(f) => {
            setAviso(form === 'nuevo' ? { t: 'Registrado con 0', b: 'Su primera cantidad entra con «Llegó» o con el conteo.' } : { t: 'Ficha actualizada', b: 'Queda con usuario, fecha y hora.' });
            setFicha(form === 'editar' ? f : null);
            setForm(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function FormMaterial({ nuevo, ficha, opciones, onClose, onGuardado }: { nuevo: boolean; ficha: FichaMaterial | null; opciones: OpcionesInventario; onClose(): void; onGuardado(f: FichaMaterial): void }) {
  const provs = opciones.proveedores.filter((p) => p.tipo === 'stock');
  const [d, setD] = useState({
    nombre: ficha?.nombre ?? '', categoria: ficha?.categoria ?? '', unidad: ficha?.unidad ?? '', proveedorId: ficha?.proveedor?.id ? String(ficha.proveedor.id) : '',
    minimo: ficha ? String(num(ficha.minimo)) : '', precio: ficha ? ficha.precio.toFixed(2) : '', ubicacion: ficha?.ubicacion ?? '',
  });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof typeof d) => (e: { target: { value: string } }) => setD((x) => ({ ...x, [k]: e.target.value }));
  const prov = provs.find((p) => String(p.id) === d.proveedorId);
  const unidadFija = !nuevo && ficha?.tieneMovimientos;

  const guardar = async () => {
    const e: Record<string, string> = {};
    if (!d.nombre.trim()) e.nombre = 'Escriba el nombre.';
    if (nuevo && !d.categoria) e.categoria = 'Elija el tipo de material.';
    if (!d.unidad) e.unidad = 'Elija la unidad de medida.';
    if (!d.proveedorId) e.proveedorId = 'Elija el proveedor.';
    const minimo = Number(d.minimo.replace(',', '.') || 0), precio = Number(d.precio.replace(/[$,\s]/g, '') || 0);
    if (Number.isNaN(minimo) || minimo < 0) e.minimo = 'Escriba un número.';
    if (Number.isNaN(precio) || precio < 0) e.precio = 'Escriba un precio válido.';
    setErrores(e);
    if (Object.keys(e).length) return;
    const datos: DatosMaterial = { nombre: d.nombre.trim(), ...(nuevo ? { categoria: d.categoria } : {}), ...(unidadFija ? {} : { unidad: d.unidad }), proveedorId: Number(d.proveedorId), minimo, precio, ubicacion: d.ubicacion.trim() || null };
    setGuardando(true);
    try {
      onGuardado(nuevo ? await inventarioApi.crearMaterial(datos) : await inventarioApi.editarMaterial(ficha!.id, datos));
    } catch (err) {
      setErrores(err instanceof ApiError ? { ...err.errores, general: err.message } : { general: 'No pudimos guardar. Intente de nuevo.' });
    } finally {
      setGuardando(false);
    }
  };
  const campo = (k: string) => `fl${errores[k] ? ' inv' : ''}`;
  const err = (k: string) => (errores[k] ? <small className="err">{errores[k]}</small> : null);

  return (
    <Lateral etiqueta={nuevo ? 'Nuevo material' : 'Editar ficha'} titulo={nuevo ? 'Nuevo material' : 'Editar ficha'} sub={nuevo ? 'Solo lo necesario para controlarlo y reponerlo' : 'El cambio de precio queda con su fecha'} onClose={onClose}
      pie={<><button type="button" className="gw-btn gw-btn-ghost" onClick={onClose}>Cancelar</button><button type="button" className="gw-btn gw-btn-primary" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : nuevo ? 'Registrar' : 'Guardar cambios'}</button></>}>
      {errores.general && <Alert tone="danger" title="No se guardó" compact>{errores.general}</Alert>}
      <label className={campo('nombre')}>Nombre<input value={d.nombre} onChange={set('nombre')} maxLength={80} placeholder="Ej.: Espuma HD 3&quot;" />{err('nombre')}</label>
      {nuevo && (
        <label className={campo('categoria')}>Tipo de material
          <select value={d.categoria} onChange={set('categoria')}><option value="">Elegir…</option>{opciones.categorias.map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}</select>
          <small>Con esto se agrupa en el conteo de inventario.</small>{err('categoria')}
        </label>
      )}
      {unidadFija ? (
        <div className="fl">Unidad de medida<div className="ro">{opciones.unidades.find((x) => x.valor === d.unidad)?.etiqueta ?? d.unidad}<small>No se puede cambiar: el material ya tiene movimientos</small></div></div>
      ) : (
        <label className={campo('unidad')}>Unidad de medida
          <select value={d.unidad} onChange={set('unidad')}><option value="">Elegir unidad…</option>{opciones.unidades.map((x) => <option key={x.valor} value={x.valor}>{x.etiqueta}</option>)}</select>
          <small>Con esta unidad se cuenta, se reserva, se retira y se compra. No se puede cambiar después del primer movimiento.</small>{err('unidad')}
        </label>
      )}
      <label className={campo('proveedorId')}>Proveedor
        <select value={d.proveedorId} onChange={set('proveedorId')}><option value="">Elegir proveedor…</option>{provs.map((p) => <option key={p.id} value={p.id}>{p.nombre} · tarda {p.tarda}</option>)}</select>
        <small>{prov ? `Tarda ${prov.tarda} (dato del proveedor). ` : 'El tiempo de entrega es del proveedor, no del material. '}<Link className="lk2" to="/admin/inventario/proveedores">Ver o agregar proveedores</Link></small>{err('proveedorId')}
      </label>
      <div className="f2">
        <label className={campo('minimo')}>Mínimo<input inputMode="decimal" value={d.minimo} onChange={set('minimo')} placeholder="0" />{err('minimo')}</label>
        <label className={campo('precio')}>Precio por unidad<input inputMode="decimal" value={d.precio} onChange={set('precio')} placeholder="$0.00" />{err('precio')}</label>
      </div>
      <label className="fl">Dónde está (opcional)<input value={d.ubicacion} onChange={set('ubicacion')} maxLength={30} placeholder="Ej.: Estante A1" /></label>
      {nuevo && <p className="hint">Entra con <b>0</b>. Su primera cantidad llega al marcar «Llegó» en Reponer o con el conteo de inventario.</p>}
    </Lateral>
  );
}
