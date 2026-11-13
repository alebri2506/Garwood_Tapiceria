import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { Icon } from '../../../shared/ui/Icon';
import { Aviso, CabeceraInventario, Lateral, Pasos, cantidad, momento, num } from './comunes';
import { inventarioApi, type FiltroMovimientos, type FilaStock, type Movimiento, type PedidoEnProceso } from './inventarioApi';

// A8c Movimientos (kardex · CU-A09): entradas, salidas y ajustes con fecha, hora y quién. «Corregir stock» para lo que
// no se registró solo (las compras entran con «Llegó» en Reponer).

const TIPO: Record<Movimiento['tipo'], [string, string]> = { entrada: ['Entrada', 't-in'], salida: ['Salida', 't-out'], ajuste: ['Ajuste', 't-adj'], conteo: ['Conteo', 't-cnt'] };
const FILTROS: [string, string][] = [['', 'Todos los tipos'], ['entrada', 'Entradas'], ['salida', 'Salidas'], ['ajuste', 'Ajustes']];
const MOTIVOS = { sale: ['Retiro para un pedido', 'Se dañó', 'Llegó menos de lo pedido', 'Otro'], entra: ['Sobró de un pedido', 'Había más de lo registrado', 'Otro'] };
const CON_PEDIDO = ['Retiro para un pedido', 'Sobró de un pedido'];

const isoNY = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
const sumar = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function rapidos() {
  const hoy = isoNY();
  const dow = new Date(`${hoy}T12:00:00Z`).getUTCDay();
  const lunes = sumar(hoy, -((dow + 6) % 7));
  return [['Hoy', hoy, hoy], ['Esta semana', lunes, hoy], ['Semana pasada', sumar(lunes, -7), sumar(lunes, -1)], ['Este mes', `${hoy.slice(0, 8)}01`, hoy]] as const;
}
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fd = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`;

export function MovimientosPage() {
  const [params, setParams] = useSearchParams();
  const [stock, setStock] = useState<FilaStock[]>([]);
  const [porReponer, setPorReponer] = useState<number>();
  const [lista, setLista] = useState<{ total: number; movimientos: Movimiento[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cal, setCal] = useState(false);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [aviso, setAviso] = useState(false);

  const materialId = Number(params.get('material')) || undefined;
  const filtro: FiltroMovimientos = { materialId, tipo: (params.get('tipo') || undefined) as FiltroMovimientos['tipo'], desde: params.get('desde') || undefined, hasta: params.get('hasta') || undefined };
  const clave = params.toString();
  const poner = (cambios: Record<string, string | undefined>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) { if (v) p.set(k, v); else p.delete(k); }
    setParams(p, { replace: true });
  };

  const cargarStock = useCallback(() => inventarioApi.stock().then((s) => { setStock(s.materiales); setPorReponer(s.porReponer); }).catch(() => undefined), []);
  const cargar = useCallback(() => {
    inventarioApi.movimientos(filtro).then(setLista).catch((e) => setError(e instanceof ApiError ? e.message : 'No pudimos cargar los movimientos.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  useEffect(() => { cargarStock(); }, [cargarStock]);
  useEffect(() => { cargar(); }, [cargar]);

  const uno = stock.find((m) => m.id === materialId);
  const hay = Boolean(materialId || filtro.tipo || filtro.desde || filtro.hasta);
  const etiquetaFechas = !filtro.desde && !filtro.hasta ? 'Todas las fechas' : `${filtro.desde ? fd(filtro.desde) : 'inicio'} – ${filtro.hasta ? fd(filtro.hasta) : 'hoy'}`;

  return (
    <div className="iv iv-mov">
      <CabeceraInventario seccion="Movimientos" porReponer={porReponer} />
      {aviso && <Aviso titulo="Stock corregido" onClose={() => setAviso(false)}> Quedó en Movimientos con su motivo, usuario, fecha y hora.</Aviso>}
      {error && <Alert tone="danger" title="No se pudo completar" compact>{error}</Alert>}

      <div className="tb">
        <select className="selm" aria-label="Material" value={materialId ?? ''} onChange={(e) => poner({ material: e.target.value || undefined })}>
          <option value="">Todos los materiales</option>
          {stock.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
        <select className="selm sm" aria-label="Tipo de movimiento" value={filtro.tipo ?? ''} onChange={(e) => poner({ tipo: e.target.value || undefined })}>
          {FILTROS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <div className="dwrap">
          <button type="button" className={`dbtn${filtro.desde || filtro.hasta ? ' on' : ''}`} aria-expanded={cal} onClick={() => setCal(!cal)}><Icon name="calendar" size={18} /><span>{etiquetaFechas}</span></button>
          {cal && (
            <>
              <div className="ovl" onClick={() => setCal(false)} aria-hidden="true" />
              <div className="dpop" role="dialog" aria-label="Elegir fechas">
                <span className="lbl">Rápido</span>
                <div className="qk">{rapidos().map(([l, a, b]) => <button key={l} type="button" className={filtro.desde === a && filtro.hasta === b ? 'on' : ''} onClick={() => { poner({ desde: a, hasta: b }); setCal(false); }}>{l}</button>)}</div>
                <span className="lbl">O elija un rango</span>
                <div className="f2">
                  <label className="fl">Desde<input type="date" value={filtro.desde ?? ''} max={isoNY()} onChange={(e) => poner({ desde: e.target.value || undefined })} /></label>
                  <label className="fl">Hasta<input type="date" value={filtro.hasta ?? ''} max={isoNY()} onChange={(e) => poner({ hasta: e.target.value || undefined })} /></label>
                </div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <button type="button" className="gw-btn gw-btn-ghost gw-btn-sm" onClick={() => { poner({ desde: undefined, hasta: undefined }); setCal(false); }}>Todas las fechas</button>
                  <button type="button" className="gw-btn gw-btn-primary gw-btn-sm" onClick={() => setCal(false)}>Aplicar</button>
                </div>
              </div>
            </>
          )}
        </div>
        {hay && <button type="button" className="clr" onClick={() => setParams(new URLSearchParams(), { replace: true })}><Icon name="x" size={16} />Quitar filtros</button>}
        <button type="button" className="gw-btn gw-btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => setCorrigiendo(true)}>Corregir stock</button>
      </div>

      {uno && (
        <div className="n4">
          <div><small>En el estante</small><b>{cantidad(uno.fisico, uno.unidad)}</b></div>
          <div><small>Reservado</small><b>{num(uno.reservado)}</b></div>
          <div><small>Disponible</small><b>{num(uno.disponible)}</b></div>
          <div><small>Consumo promedio</small><b>{num(uno.consumoSemanal)} / semana</b></div>
        </div>
      )}

      {!lista && !error && <p className="muted" role="status">Cargando movimientos…</p>}
      {lista && (
        <div className="tw">
          <table className="kd">
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Material</th><th>Pedido</th><th>Detalle</th><th>Quién</th><th className="r">Entra</th><th className="r">Sale</th>{uno && <th className="r">Saldo</th>}</tr></thead>
            <tbody>
              {lista.movimientos.map((m) => {
                const t = momento(m.fecha);
                return (
                  <tr key={m.id}>
                    <td>{t.dia}<small>{t.hora}</small></td>
                    <td><span className="ty"><i className={TIPO[m.tipo][1]} />{TIPO[m.tipo][0]}</span></td>
                    <td>{m.material}</td>
                    <td>{m.pedido ? <Link className="ped" to="/admin/pedidos">{m.pedido}</Link> : <span className="muted">—</span>}</td>
                    <td>{m.motivo}{m.detalle ? ` · ${m.detalle}` : ''}</td>
                    <td>{m.quien}</td>
                    <td className="r in">{m.cantidad > 0 ? `+${cantidad(m.cantidad, m.unidad)}` : ''}</td>
                    <td className="r out">{m.cantidad < 0 ? `−${cantidad(-m.cantidad, m.unidad)}` : ''}</td>
                    {uno && <td className="r sal">{num(m.saldo)}</td>}
                  </tr>
                );
              })}
              {lista.movimientos.length === 0 && <tr><td colSpan={uno ? 9 : 8} className="vacio">No hay movimientos con esos filtros.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {lista && !uno && lista.total > lista.movimientos.length && <p className="why" style={{ marginTop: -6 }}>Se muestran los {lista.movimientos.length} más recientes de {lista.total}. Elija un material para ver su historia completa.</p>}
      <p className="why">Elija un material para ver su <b>kardex</b> con el saldo después de cada movimiento. Las entradas vienen de «Llegó» (Reponer) y las salidas del taller; si algo no se registró, se corrige con «Corregir stock».</p>

      {corrigiendo && (
        <CorregirStock materiales={stock} inicial={materialId} onClose={() => setCorrigiendo(false)}
          onGuardado={() => { setCorrigiendo(false); setAviso(true); cargar(); cargarStock(); }} />
      )}
    </div>
  );
}

function CorregirStock({ materiales, inicial, onClose, onGuardado }: { materiales: FilaStock[]; inicial?: number; onClose(): void; onGuardado(): void }) {
  const [materialId, setMaterialId] = useState(inicial ?? materiales[0]?.id ?? 0);
  const [sentido, setSentido] = useState<'sale' | 'entra'>('sale');
  const [qty, setQty] = useState(1);
  const [motivo, setMotivo] = useState('');
  const [otro, setOtro] = useState('');
  const [pq, setPq] = useState('');
  const [pedidos, setPedidos] = useState<PedidoEnProceso[]>([]);
  const [pedido, setPedido] = useState<PedidoEnProceso | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const m = materiales.find((x) => x.id === materialId);
  const conPedido = CON_PEDIDO.includes(motivo);

  useEffect(() => {
    if (!conPedido) return;
    const t = setTimeout(() => inventarioApi.pedidosEnProceso(pq).then((r) => setPedidos(r.pedidos)).catch(() => setPedidos([])), 250);
    return () => clearTimeout(t);
  }, [pq, conPedido]);

  const despues = m ? num(m.fisico + (sentido === 'entra' ? qty : -qty)) : 0;
  const bloqueado = !m || despues < 0 || !motivo || qty <= 0 || (motivo === 'Otro' && !otro.trim()) || (conPedido && !pedido);
  const visibles = useMemo(() => pedidos.slice(0, 5), [pedidos]);

  const registrar = async () => {
    if (bloqueado || !m) return;
    setGuardando(true);
    setError(null);
    try {
      await inventarioApi.corregir({ materialId: m.id, sentido, cantidad: qty, motivo, ...(motivo === 'Otro' ? { otroMotivo: otro.trim() } : {}), ...(pedido && conPedido ? { pedidoId: pedido.id } : {}) });
      onGuardado();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos registrar la corrección.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Lateral etiqueta="Corregir stock" titulo="Corregir stock" sub="Para lo que no se registró solo. Las compras entran con «Llegó» en Reponer." onClose={onClose}
      pie={<><button type="button" className="gw-btn gw-btn-ghost" onClick={onClose}>Cancelar</button><button type="button" className="gw-btn gw-btn-primary" disabled={bloqueado || guardando} onClick={registrar}>{guardando ? 'Registrando…' : 'Registrar'}</button></>}>
      {error && <Alert tone="danger" title="No se registró" compact>{error}</Alert>}
      <label className="fl">Material
        <select value={materialId} onChange={(e) => setMaterialId(Number(e.target.value))}>{materiales.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
      </label>
      <div className="stack" style={{ gap: 6 }}><span className="fl">¿Sale o entra al almacén?</span>
        <div className="seg2b" role="radiogroup" aria-label="Sale o entra">
          <button type="button" role="radio" aria-checked={sentido === 'sale'} className={sentido === 'sale' ? 'on' : ''} onClick={() => { setSentido('sale'); setMotivo(''); }}>− Sale</button>
          <button type="button" role="radio" aria-checked={sentido === 'entra'} className={sentido === 'entra' ? 'on' : ''} onClick={() => { setSentido('entra'); setMotivo(''); }}>+ Entra</button>
        </div>
      </div>
      <div className="stack" style={{ gap: 6 }}><span className="fl">Cantidad</span><Pasos valor={qty} unidad={m?.unidad ?? ''} min={1} etiqueta="cantidad" onChange={setQty} /></div>
      <div className="stack" style={{ gap: 6 }}><span className="fl">Motivo</span>
        <div className="chips2" role="radiogroup" aria-label="Motivo">
          {MOTIVOS[sentido].map((x) => <button key={x} type="button" role="radio" aria-checked={motivo === x} className={motivo === x ? 'on' : ''} onClick={() => setMotivo(x)}>{x}</button>)}
        </div>
        {motivo === 'Otro' && <input className="otro" placeholder="Escriba el motivo" value={otro} maxLength={120} onChange={(e) => setOtro(e.target.value)} aria-label="Motivo" />}
      </div>
      {conPedido && (
        <div className="stack" style={{ gap: 6 }}><span className="fl">Pedido</span>
          {pedido ? (
            <div className="pch"><div><b>{pedido.codigo}</b><small>{pedido.cliente} · {pedido.descripcion} · {pedido.estado}</small></div><button type="button" className="lkd" onClick={() => { setPedido(null); setPq(''); }}>Cambiar</button></div>
          ) : (
            <>
              <label className="psq"><Icon name="search" size={18} /><input type="search" placeholder="Buscar por código o cliente" value={pq} onChange={(e) => setPq(e.target.value)} aria-label="Buscar pedido" /></label>
              <div className="plist">
                {visibles.map((p) => <button key={p.id} type="button" onClick={() => setPedido(p)}><b>{p.codigo}</b><span>{p.cliente} · {p.descripcion}</span></button>)}
                {pedidos.length === 0 && <p className="hint4" style={{ padding: '10px 12px' }}>No hay pedidos en proceso{pq ? ` con «${pq}»` : ''}.</p>}
              </div>
              <small className="hint4">{pedidos.length > 5 ? `Se muestran 5 de ${pedidos.length} · escriba para afinar` : `${pedidos.length} ${pedidos.length === 1 ? 'pedido en proceso' : 'pedidos en proceso'} en el taller`}</small>
            </>
          )}
        </div>
      )}
      {m && <div className={`prev${despues < 0 ? ' bad' : ''}`}><span>En el estante</span><b>{cantidad(m.fisico, m.unidad)}</b><span>→ quedará</span><b>{cantidad(despues, m.unidad)}</b></div>}
      {despues < 0 && <p className="errx">No puede salir más de lo que hay en el estante.</p>}
    </Lateral>
  );
}
