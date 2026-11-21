import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { TopAdmin } from '../../../app/layout/AdminLayout';
import { ApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { Icon, type IconName } from '../../../shared/ui/Icon';
import { POR_PAGINA, Paginacion } from '../../../shared/ui/Paginacion';
import { StatusChip } from '../../../shared/ui/StatusChip';
import { TextField } from '../../../shared/ui/TextField';
import { Toast } from '../../../shared/ui/Toast';
import { AYUDA_POR_METODO, METODOS_MANUALES, REFERENCIA_POR_METODO } from './datos';
import {
  conceptoNombre, cuando, dinero, pagosAdminApi, type MetodoApi, type PagoAdmin, type ResumenPagos, type SaldoPendiente,
} from './pagosApi';
import './pagos.css';

type Tono = 'warning' | 'danger' | 'success' | 'info';
/** Mismo orden que METODOS_MANUALES (Efectivo, Cheque, Zelle, Transferencia, Tarjeta). */
const METODO_API: MetodoApi[] = ['efectivo', 'cheque', 'zelle', 'transferencia', 'tarjeta'];
const NOTAS = [
  'Pagos por Zelle o cheque que informó el cliente (con su comprobante) y cobros del conductor. Confirme cuando el dinero llegue, o rechace con el motivo.',
  'Los pagos por pasarela entran solos y ya confirmados. Los manuales los registra usted con «+ Registrar pago manual».',
  'Lo que cada cliente aún no ha pagado. Saldo = total − pagos confirmados. Los pedidos con un pago por confirmar no se repiten aquí: están en «Por confirmar».',
];
const mensaje = (e: unknown) => (e instanceof ApiError ? e.message : 'Intente de nuevo en unos minutos.');

interface Fila { key: string; ped: string; cli: string; col2: string; col3: string; origen?: { texto: string; pasarela: boolean }; monto: string; estado: string; tono: Tono }
/** `fijo`: se abrió desde la fila de un pedido, así que el pago ya es de ese pedido (no se elige). */
interface Registro { clave: string; fijo: boolean; monto: string; met: number; ref: string; error?: string }
const claveSaldo = (s: SaldoPendiente) => s.pedido ?? `COT:${s.cotizacion}`;

/** A5 Pagos conectado al backend (CU-C12, C13 · decisiones O). */
export function PagosAdminConectada() {
  const [tab, setTab] = useState(0);
  const [sel, setSel] = useState(0);
  const [filtro, setFiltro] = useState(0);
  const [porPagina, setPorPagina] = useState(0);
  const [pagina, setPagina] = useState(0);
  const [resumen, setResumen] = useState<ResumenPagos | null>(null);
  const [porConfirmar, setPorConfirmar] = useState<PagoAdmin[]>([]);
  const [confirmados, setConfirmados] = useState<PagoAdmin[]>([]);
  const [saldos, setSaldos] = useState<SaldoPendiente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [motivo, setMotivo] = useState<{ id: number; tipo: 'rechazar' | 'anular'; texto: string; error?: string } | null>(null);
  const [registro, setRegistro] = useState<Registro | null>(null);
  const [toast, setToast] = useState<{ t: string; txt: string; tono?: 'success' | 'info' } | null>(null);

  const recargar = useCallback(async () => {
    try {
      const origen = filtro === 1 ? 'pasarela' : filtro === 2 ? 'manual' : undefined;
      const [r, pc, cf, sd] = await Promise.all([pagosAdminApi.resumen(), pagosAdminApi.porConfirmar(), pagosAdminApi.confirmados(origen), pagosAdminApi.saldos()]);
      setResumen(r); setPorConfirmar(pc); setConfirmados(cf); setSaldos(sd); setError(null);
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setCargando(false);
    }
  }, [filtro]);
  useEffect(() => { void recargar(); }, [recargar]);

  // Cerrar el panel de registro con Escape.
  useEffect(() => {
    if (!registro) return;
    const cerrar = (e: KeyboardEvent) => { if (e.key === 'Escape') setRegistro(null); };
    window.addEventListener('keydown', cerrar);
    return () => window.removeEventListener('keydown', cerrar);
  }, [registro]);

  const lista = tab === 0 ? porConfirmar.length : tab === 1 ? confirmados.length : saldos.length;
  const tam = POR_PAGINA[porPagina]!;
  const paginas = Math.max(1, Math.ceil(lista / tam));
  const pag = Math.min(pagina, paginas - 1);
  const desde = pag * tam;
  const visibles = <T,>(xs: T[]) => xs.slice(desde, desde + tam);

  const filas: Fila[] = tab === 0
    ? visibles(porConfirmar).map((p) => ({
        key: String(p.id), ped: p.pedido ?? p.cotizacion, cli: p.cliente, col2: conceptoNombre(p.concepto), col3: p.metodoNombre,
        origen: { texto: p.origenNombre, pasarela: false }, monto: dinero(p.monto), estado: 'Por confirmar', tono: 'warning',
      }))
    : tab === 1
      ? visibles(confirmados).map((p) => ({
          key: String(p.id), ped: p.pedido ?? p.cotizacion, cli: p.cliente, col2: conceptoNombre(p.concepto), col3: p.pasarela ? `${p.metodoNombre} en línea` : p.metodoNombre,
          origen: { texto: p.origenNombre, pasarela: p.pasarela }, monto: dinero(p.monto), estado: p.estado, tono: p.estado === 'Anulado' ? 'danger' : 'success',
        }))
      : visibles(saldos).map((s) => ({
          key: claveSaldo(s), ped: s.pedido ?? s.cotizacion ?? '', cli: s.cliente, col2: `${dinero(s.total)} · pagado ${dinero(s.pagado)}`, col3: s.estadoPedido,
          monto: dinero(s.debe), estado: s.faltaAdelanto ? 'Falta adelanto' : 'Saldo pendiente', tono: s.faltaAdelanto ? 'danger' : 'info',
        }));
  const i = Math.max(0, Math.min(sel, filas.length - 1));
  const actual = filas[i];

  const cambiarTab = (t: number) => { setTab(t); setSel(0); setPagina(0); setMotivo(null); };

  // ---------------------------------------------------------------- Acciones
  const accion = async (fn: () => Promise<void>) => {
    setOcupado(true);
    try { await fn(); await recargar(); } catch (e) { setToast({ t: 'No se guardó', txt: mensaje(e), tono: 'info' }); } finally { setOcupado(false); }
  };
  const confirmar = (p: PagoAdmin) => accion(async () => {
    const r = await pagosAdminApi.confirmar(p.id);
    setMotivo(null); setSel(0);
    setToast({ t: 'Pago confirmado', txt: `Se emitió el recibo ${r.recibo}. El saldo de ${r.pedido} quedó en ${dinero(r.saldo)}.` });
  });
  const enviarMotivo = () => {
    if (!motivo) return;
    if (motivo.texto.trim().length < 3) { setMotivo({ ...motivo, error: `Escriba el motivo ${motivo.tipo === 'rechazar' ? 'del rechazo' : 'de la anulación'}.` }); return; }
    void accion(async () => {
      if (motivo.tipo === 'rechazar') {
        await pagosAdminApi.rechazar(motivo.id, motivo.texto.trim());
        setToast({ t: 'Pago rechazado', txt: 'Quedó registrado el motivo y se le avisó al cliente para que suba otro comprobante.' });
        setSel(0);
      } else {
        const r = await pagosAdminApi.anular(motivo.id, motivo.texto.trim());
        setToast({ t: 'Pago anulado', txt: `Quedó registrado quién lo anuló y por qué. El saldo del pedido volvió a ${dinero(r.saldo ?? 0)}.` });
      }
      setMotivo(null);
    });
  };
  const verComprobante = (id: number) => accion(async () => {
    const { url } = await pagosAdminApi.comprobante(id);
    window.open(url, '_blank', 'noopener');
  });

  const abrirRegistro = (clave?: string) => {
    const s = saldos.find((x) => claveSaldo(x) === clave) ?? saldos[0];
    if (s) setRegistro({ clave: claveSaldo(s), fijo: Boolean(clave), monto: s.debe.toFixed(2), met: 0, ref: '' });
  };
  const sReg = registro ? saldos.find((x) => claveSaldo(x) === registro.clave) ?? null : null;
  const montoReg = registro ? Number(registro.monto) : 0;
  const tope = sReg ? (sReg.pedido ? sReg.disponible : sReg.total) : 0;
  const guardarRegistro = () => {
    if (!registro || !sReg) return;
    if (!registro.monto.trim() || Number.isNaN(montoReg) || montoReg <= 0) { setRegistro({ ...registro, error: 'Escriba el monto recibido.' }); return; }
    if (montoReg > tope + 0.005) { setRegistro({ ...registro, error: `No puede ser mayor que lo que debe (${dinero(tope)}).` }); return; }
    if (!sReg.pedido && montoReg + 0.005 < sReg.adelanto) { setRegistro({ ...registro, error: `Para generar el pedido debe cubrir el adelanto (${dinero(sReg.adelanto)}).` }); return; }
    setOcupado(true);
    pagosAdminApi.registrar({
      ...(sReg.pedido ? { pedido: sReg.pedido } : { cotizacion: sReg.cotizacion! }),
      monto: Math.round(montoReg * 100) / 100, metodo: METODO_API[registro.met]!, detalle: registro.ref.trim() || undefined,
    })
      .then(async (r) => {
        setToast({ t: 'Pago registrado y confirmado', txt: `${r.pedido} · recibo ${r.recibo}.${r.pedidoNuevo ? ' Se generó el pedido.' : ''} El saldo quedó en ${dinero(r.saldo)}.` });
        setRegistro(null);
        await recargar();
      })
      .catch((e) => setRegistro((x) => (x ? { ...x, error: e instanceof ApiError ? e.errores.monto ?? e.message : mensaje(e) } : x)))
      .finally(() => setOcupado(false));
  };

  const indicadores: { cls: string; icono: IconName; l: string; v: string; s: string }[] = resumen ? [
    { cls: 'pa-kp pa-w', icono: 'clock', l: 'Por confirmar', v: dinero(resumen.porConfirmar.monto), s: `${resumen.porConfirmar.cantidad} ${resumen.porConfirmar.cantidad === 1 ? 'pago por revisar' : 'pagos por revisar'}` },
    { cls: 'pa-kp pa-o', icono: 'check', l: 'Cobrado hoy', v: dinero(resumen.cobradoHoy.monto), s: `${resumen.cobradoHoy.cantidad} pagos · pasarela y manuales` },
    { cls: 'pa-kp pa-b', icono: 'payment', l: 'Saldo por cobrar', v: dinero(resumen.saldoPorCobrar.monto), s: `${resumen.saldoPorCobrar.cantidad} con saldo pendiente` },
  ] : [];
  const cabecera = tab === 2 ? ['Total · pagado', 'Estado del pedido', 'Le falta'] : ['Concepto', 'Método', 'Monto'];
  const fichaDe = (ped: string | null) => (ped ? <Link className="gw-btn gw-btn-ghost gw-btn-sm pa-self" to={`/admin/pedidos/${ped}`}>Ver ficha del pedido</Link> : null);

  return (
    <>
      <TopAdmin crumb="Comercial › Pagos" titulo="Pagos">
        <button type="button" className="gw-btn gw-btn-primary" onClick={() => abrirRegistro()} disabled={saldos.length === 0}>+ Registrar pago manual</button>
      </TopAdmin>

      {error && <Alert tone="danger" title="No pudimos cargar los pagos">{error}</Alert>}
      <div className="pa-kp3">
        {indicadores.map((k) => (
          <div key={k.l} className={k.cls}>
            <i aria-hidden="true"><Icon name={k.icono} size={20} /></i>
            <div><span>{k.l}</span><b>{k.v}</b><small>{k.s}</small></div>
          </div>
        ))}
      </div>

      {toast && <Toast tone={toast.tono} title={toast.t} onClose={() => setToast(null)}>{toast.txt}</Toast>}

      <div className="pa-pl">
        <div className="stack" style={{ gap: 12 }}>
          <div className="pa-tabs" role="tablist" aria-label="Pagos">
            {([['Por confirmar', porConfirmar.length], ['Confirmados', confirmados.length], ['Saldos pendientes', saldos.length]] as const).map(([l, n], t) => (
              <button key={l} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'on' : undefined} onClick={() => cambiarTab(t)}>{l}<em>{n}</em></button>
            ))}
          </div>
          {tab === 1 && (
            <div className="pa-fch" role="group" aria-label="Origen del pago">
              {['Todos', 'Pasarela', 'Manuales'].map((l, f) => (
                <button key={l} type="button" aria-pressed={filtro === f} className={filtro === f ? 'on' : undefined} onClick={() => { setFiltro(f); setSel(0); setPagina(0); }}>{l}</button>
              ))}
            </div>
          )}

          <div className="pa-lst">
            <div className="pa-lh" aria-hidden="true"><span>Pedido · cliente</span><span>{cabecera[0]}</span><span>{cabecera[1]}</span><span className="pa-am">{cabecera[2]}</span><span className="pa-stc">Estado</span></div>
            {filas.map((f, k) => (
              <button key={f.key} type="button" className={k === i ? 'pa-lr on' : 'pa-lr'} aria-pressed={k === i} onClick={() => { setSel(k); setMotivo(null); }}>
                <span><b>{f.ped}</b><small>{f.cli}</small></span>
                <span className="pa-c2">{f.col2}</span>
                <span className="pa-c3"><span style={{ display: 'block' }}>{f.col3}</span>{f.origen && <span className={f.origen.pasarela ? 'pa-og pa-pw' : 'pa-og'}>{f.origen.texto}</span>}</span>
                <span className="pa-am">{f.monto}</span>
                <span className="pa-stc"><StatusChip status={f.estado} tone={f.tono} /></span>
              </button>
            ))}
            {filas.length === 0 && <p className="pa-nota pa-vacio">{cargando ? 'Cargando…' : tab === 0 ? 'No hay pagos por confirmar.' : tab === 1 ? 'No hay pagos con este filtro.' : 'Ningún pedido tiene saldo pendiente.'}</p>}
            <Paginacion total={lista} pagina={pag} porPagina={tam} onPagina={(n) => { setPagina(n); setSel(0); }} onPorPagina={(n) => { setPorPagina(POR_PAGINA.indexOf(n)); setPagina(0); setSel(0); }} />
            <p className="pa-nota">{NOTAS[tab]}</p>
          </div>
        </div>

        <aside className="pa-dp" aria-label="Detalle del pago">
          {!actual ? <p className="pa-hint">Elija un pago de la lista para ver el detalle.</p> : tab === 0 ? (() => {
            const p = porConfirmar.find((x) => String(x.id) === actual.key)!;
            const despues = p.cuentaPedido ? Math.max(0, p.cuentaPedido.saldo - p.monto) : null;
            return (
              <>
                <Cabecera ov={`${p.origenNombre === 'Cliente' ? 'Informado por el cliente' : 'Cobro en la entrega'} · por confirmar`} ped={p.pedido ?? p.cotizacion} cli={p.cliente} estado={actual.estado} tono={actual.tono} />
                <div><span className="muted" style={{ fontSize: 13 }}>{conceptoNombre(p.concepto)}</span><div className="pa-big">{dinero(p.monto)}</div></div>
                <Datos kv={[
                  ['Método', p.metodoNombre], ['Referencia', p.detalle ?? '—'],
                  ['Registrado por', `${p.registradoPor.nombre ?? '—'} (${p.registradoPor.rol})`], ['Cuándo', cuando(p.fecha)],
                  ...(p.reemplazaA ? [['Reemplaza', 'Un comprobante que se rechazó antes']] as [string, string][] : []),
                ]} />
                {p.comprobante && (
                  <button type="button" className="pa-rcp" onClick={() => verComprobante(p.id)} disabled={ocupado}>
                    <span aria-hidden="true"><Icon name="image" size={20} /></span>
                    <span><b>Ver comprobante</b><small>{p.metodo === 'zelle' ? 'Captura del envío por Zelle' : 'Foto del cheque'} · se abre en otra pestaña</small></span>
                  </button>
                )}
                {despues != null && <div className="pa-prev"><span>Saldo del pedido al confirmar</span><b>{dinero(despues)}</b></div>}
                {motivo?.id === p.id && (
                  <TextField label="Motivo del rechazo" required autoFocus placeholder="Ej.: no se lee el monto de la captura" value={motivo.texto} error={motivo.error}
                    onChange={(e) => setMotivo({ ...motivo, texto: e.target.value, error: undefined })} />
                )}
                <div className="row pa-acc">
                  <button type="button" className="gw-btn gw-btn-primary" style={{ flex: 2 }} disabled={ocupado} onClick={() => confirmar(p)}>Confirmar: recibí el dinero</button>
                  <button type="button" className="gw-btn gw-btn-secondary" style={{ flex: 1 }} disabled={ocupado} onClick={() => (motivo?.id === p.id ? enviarMotivo() : setMotivo({ id: p.id, tipo: 'rechazar', texto: '' }))}>
                    {motivo?.id === p.id ? 'Enviar rechazo' : 'Rechazar'}
                  </button>
                </div>
                {fichaDe(p.pedido)}
              </>
            );
          })() : tab === 1 ? (() => {
            const p = confirmados.find((x) => String(x.id) === actual.key)!;
            const anulado = p.estado === 'Anulado';
            return (
              <>
                <Cabecera ov={p.pasarela ? 'Pago por pasarela' : 'Pago manual'} ped={p.pedido ?? p.cotizacion} cli={p.cliente} estado={actual.estado} tono={actual.tono} />
                <div><span className="muted" style={{ fontSize: 13 }}>{conceptoNombre(p.concepto)}</span><div className="pa-big">{dinero(p.monto)}</div></div>
                <Datos kv={[
                  ['Método', p.pasarela ? `${p.metodoNombre} en línea` : p.metodoNombre],
                  ['Confirmado por', p.pasarela ? 'Pasarela · confirmado al instante' : p.revision?.por ?? p.registradoPor.nombre ?? '—'],
                  ['Cuándo', cuando(p.revision?.fecha ?? p.fecha)],
                  ...(p.detalle ? [['Referencia', p.detalle]] as [string, string][] : []),
                  ...(p.cuentaPedido ? [['Saldo del pedido ahora', dinero(p.cuentaPedido.saldo)]] as [string, string][] : []),
                  ...(anulado && p.anulacion ? [['Anulado por', `${p.anulacion.por ?? '—'} · ${cuando(p.anulacion.fecha)}`], ['Motivo de la anulación', p.anulacion.motivo ?? '']] as [string, string][] : []),
                ]} />
                {p.recibo && (
                  <div className="pa-rcp">
                    <span aria-hidden="true"><Icon name="clipboard" size={20} /></span>
                    <span><b>Recibo {p.recibo}</b><small>El cliente lo ve en su cuenta · el PDF estará disponible pronto</small></span>
                  </div>
                )}
                {!p.pasarela && !anulado && (motivo?.id === p.id ? (
                  <div className="stack" style={{ gap: 8 }}>
                    <TextField label="Motivo de la anulación" required autoFocus placeholder="Ej.: el banco devolvió el cheque" value={motivo.texto} error={motivo.error}
                      onChange={(e) => setMotivo({ ...motivo, texto: e.target.value, error: undefined })} />
                    <div className="row pa-acc">
                      <button type="button" className="gw-btn gw-btn-danger gw-btn-sm" disabled={ocupado} onClick={enviarMotivo}>Anular pago</button>
                      <button type="button" className="gw-btn gw-btn-ghost gw-btn-sm" onClick={() => setMotivo(null)}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="pa-adj pa-self" onClick={() => setMotivo({ id: p.id, tipo: 'anular', texto: '' })}>Anular este pago (con motivo)</button>
                ))}
                {fichaDe(p.pedido)}
              </>
            );
          })() : (() => {
            const s = saldos.find((x) => claveSaldo(x) === actual.key)!;
            const pct = s.total > 0 ? Math.round((s.pagado / s.total) * 100) : 0;
            return (
              <>
                <Cabecera ov={s.pedido ? 'Saldo del pedido' : 'Cotización aceptada · sin pedido aún'} ped={s.pedido ?? s.cotizacion ?? ''} cli={s.cliente} estado={actual.estado} tono={actual.tono} />
                <div><span className="muted" style={{ fontSize: 13 }}>{s.faltaAdelanto ? 'Le falta pagar del adelanto' : 'Le falta pagar'}</span><div className="pa-big">{dinero(s.debe)}</div></div>
                <Datos kv={[
                  ['Total', dinero(s.total)], ['Pagado', dinero(s.pagado)], ['Saldo', dinero(s.saldo)], ['Estado', s.estadoPedido],
                  ...(s.faltaAdelanto ? [['Adelanto pedido', `${dinero(s.adelanto)} (${s.total > 0 ? Math.round((s.adelanto / s.total) * 100) : 0} %)`]] as [string, string][] : []),
                ]} />
                <div className="pa-bar" role="progressbar" aria-label="Porcentaje pagado" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
                <span className="muted" style={{ fontSize: 12.5, marginTop: -6 }}>Pagado {pct} % del total</span>
                <span className="ov">Pagos confirmados</span>
                <div className="pa-hist">
                  {s.pagos.length ? s.pagos.map((h, k) => (
                    <div key={k}><span>{conceptoNombre(h.concepto)} · {h.origen === 'pasarela' ? 'pasarela' : h.metodo}<br /><small>{cuando(h.fecha)}{h.recibo ? ` · ${h.recibo}` : ''}</small></span><b>{dinero(h.monto)}</b></div>
                  )) : <div><span>Aún no hay pagos<br /><small>{s.pedido ? 'Adelanto 0 %: paga al final' : 'Con el adelanto se genera el pedido'}</small></span><b>—</b></div>}
                </div>
                <button type="button" className="gw-btn gw-btn-primary gw-btn-block" onClick={() => abrirRegistro(claveSaldo(s))}>{s.pedido ? 'Registrar pago de este pedido' : 'Registrar el adelanto'}</button>
                {fichaDe(s.pedido)}
              </>
            );
          })()}
        </aside>
      </div>

      {registro && sReg && createPortal(
        <>
          <div className="pa-dim" aria-hidden="true" onClick={() => setRegistro(null)} />
          <aside className="pa-drw" role="dialog" aria-modal="true" aria-labelledby="pa-reg-t">
            <div className="pa-drh">
              <div><h2 id="pa-reg-t">Registrar pago manual</h2><p>Para lo que el cliente pagó en persona o fuera de la pasarela. Queda confirmado al guardar y se emite el recibo.</p></div>
              <button type="button" className="pa-xb" aria-label="Cerrar" onClick={() => setRegistro(null)}><Icon name="x" size={18} /></button>
            </div>
            <div className="pa-drb">
              {registro.fijo ? (
                // Abierto desde la fila: el pago queda asociado a ese pedido, sin elegirlo de nuevo.
                <div className="pa-fijo">
                  <span className="ov">{sReg.pedido ? 'Pago del pedido' : 'Adelanto de la cotización'}</span>
                  <b>{sReg.pedido ?? sReg.cotizacion} · {sReg.cliente}</b>
                  <small>Total {dinero(sReg.total)} · pagado {dinero(sReg.pagado)} · debe {dinero(sReg.debe)} {sReg.faltaAdelanto ? '(adelanto)' : '(saldo)'} · {sReg.estadoPedido}{!sReg.pedido ? ' · con el adelanto se genera el pedido' : ''}</small>
                </div>
              ) : (
                <label className="stack" style={{ gap: 6 }}>
                  <span className="gw-field-label">Pedido</span>
                  <select className="pa-sel" value={registro.clave} onChange={(e) => {
                    const s = saldos.find((x) => claveSaldo(x) === e.target.value)!;
                    setRegistro({ ...registro, clave: claveSaldo(s), monto: s.debe.toFixed(2), error: undefined });
                  }}>
                    {saldos.map((s) => <option key={claveSaldo(s)} value={claveSaldo(s)}>{`${s.pedido ?? `${s.cotizacion} (sin pedido)`} · ${s.cliente} · debe ${dinero(s.debe)} ${s.faltaAdelanto ? '(adelanto)' : '(saldo)'}`}</option>)}
                  </select>
                  <small className="muted" style={{ fontSize: 12.5 }}>Total {dinero(sReg.total)} · pagado {dinero(sReg.pagado)} · {sReg.estadoPedido}{!sReg.pedido ? ' · con el adelanto se genera el pedido' : ''}</small>
                </label>
              )}
              <div className="grid2" style={{ gap: 12 }}>
                <TextField label="Monto recibido" prefix="$" inputMode="decimal" value={registro.monto} error={registro.error}
                  onChange={(e) => setRegistro({ ...registro, monto: e.target.value, error: undefined })} />
                <TextField label="Concepto" value={sReg.faltaAdelanto ? 'Adelanto' : 'Saldo'} readOnly hint="Según lo que debe" />
              </div>
              <div className="stack" style={{ gap: 6 }}>
                <span className="gw-field-label" id="pa-met">Método</span>
                <div className="pa-mch" role="group" aria-labelledby="pa-met">
                  {METODOS_MANUALES.map((m, k) => (
                    <button key={m} type="button" aria-pressed={registro.met === k} className={registro.met === k ? 'on' : undefined} onClick={() => setRegistro({ ...registro, met: k })}>{m}</button>
                  ))}
                </div>
              </div>
              <p className="pa-hint">{AYUDA_POR_METODO[registro.met]}</p>
              <TextField label="Referencia" optional maxLength={120} placeholder={REFERENCIA_POR_METODO[registro.met]} value={registro.ref} onChange={(e) => setRegistro({ ...registro, ref: e.target.value })} />
              <div className="pa-prev"><span>Saldo después de este pago</span><b>{dinero(Math.max(0, sReg.saldo - (Number.isNaN(montoReg) ? 0 : montoReg)))}</b></div>
            </div>
            <div className="pa-drf">
              <button type="button" className="gw-btn gw-btn-primary" style={{ flex: 1 }} disabled={ocupado} onClick={guardarRegistro}>{ocupado ? 'Guardando…' : 'Guardar pago'}</button>
              <button type="button" className="gw-btn gw-btn-ghost" onClick={() => setRegistro(null)}>Cancelar</button>
            </div>
          </aside>
        </>,
        document.body,
      )}
    </>
  );
}

function Cabecera({ ov, ped, cli, estado, tono }: { ov: string; ped: string; cli: string; estado: string; tono: Tono }) {
  return (
    <div className="between" style={{ alignItems: 'flex-start', gap: 10 }}>
      <div><span className="ov">{ov}</span><h2>{ped} · {cli}</h2></div>
      <StatusChip status={estado} tone={tono} />
    </div>
  );
}

function Datos({ kv }: { kv: [string, string][] }) {
  return <dl className="pa-kv">{kv.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}
