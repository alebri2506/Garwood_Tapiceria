import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { Icon } from '../../../shared/ui/Icon';
import { StatusChip } from '../../../shared/ui/StatusChip';
import { TextField } from '../../../shared/ui/TextField';
import { Toast } from '../../../shared/ui/Toast';
import { UploadZone } from '../../../shared/ui/UploadZone';
import { ZELLE } from './datos';
import { conceptoNombre, cuando, dinero, pagosClienteApi, type CuentaPedido } from './pagosApi';
import './pagos.css';

type Metodo = 'tarjeta' | 'banco' | 'zelle' | 'cheque' | 'efectivo';
type Tono = 'warning' | 'success' | 'danger' | 'info' | 'progress';
const TONO: Record<string, Tono> = { Pendiente: 'info', 'Por confirmar': 'warning', Confirmado: 'success', Rechazado: 'danger', Anulado: 'danger' };
const EN_LINEA: { m: Metodo; l: string; s: string }[] = [
  { m: 'tarjeta', l: 'Tarjeta de crédito o débito', s: 'Visa, Mastercard, Amex, Discover' },
  { m: 'banco', l: 'Cuenta bancaria', s: 'Transferencia (ACH) · disponible pronto' },
];
const OTRAS: { m: Metodo; l: string; s: string }[] = [
  { m: 'zelle', l: 'Zelle', s: 'Suba la captura' },
  { m: 'cheque', l: 'Cheque', s: 'En el taller o con foto' },
  { m: 'efectivo', l: 'Efectivo', s: 'Solo en persona' },
];
const mensaje = (e: unknown) => (e instanceof ApiError ? e.message : 'Intente de nuevo en unos minutos.');

/** Una fila de la tabla: un pago real o «lo que falta pagar» (id null). */
interface Fila { id: number | null; concepto: string; monto: number; sub: string; estado: string; motivo?: string | null; reemplazado?: boolean }

/** W5 Pagos del pedido conectado al backend (CU-C12, C13 · decisiones O). */
export function PagosClienteConectada() {
  const [params, setParams] = useSearchParams();
  const codigo = params.get('pedido');
  if (!codigo) {
    return (
      <EmptyState icon="payment" title="Elija un pedido">
        Los pagos se ven desde cada pedido. <Link to="/cliente/pedidos">Ir a Mis pedidos</Link>
      </EmptyState>
    );
  }
  return <Cuenta key={codigo} codigo={codigo} params={params} setParams={setParams} />;
}

function Cuenta({ codigo, params, setParams }: { codigo: string; params: URLSearchParams; setParams: ReturnType<typeof useSearchParams>[1] }) {
  const [cuenta, setCuenta] = useState<CuentaPedido | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<number | null | undefined>(undefined);
  const [metodo, setMetodo] = useState<Metodo>('tarjeta');
  const [archivos, setArchivos] = useState<File[]>([]);
  const [referencia, setReferencia] = useState('');
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ t: string; txt: string; tono?: 'success' | 'info' } | null>(null);
  const retorno = useRef(false);

  const recargar = useCallback(() => pagosClienteApi.cuenta(codigo).then((c) => { setCuenta(c); setError(null); }).catch((e) => setError(mensaje(e))), [codigo]);

  // Al volver de la pasarela (?pago=ok&sesion=… o ?pago=cancelado): se confirma el cobro sin esperar el aviso de Stripe.
  useEffect(() => {
    if (retorno.current) return;
    retorno.current = true;
    const pago = params.get('pago');
    const sesion = params.get('sesion');
    const limpiar = () => setParams({ pedido: codigo }, { replace: true });
    if (pago === 'ok' && sesion) {
      pagosClienteApi.confirmarEnLinea(codigo, sesion)
        .then((r) => setAviso(r.estado === 'registrado'
          ? { t: 'Pago aprobado', txt: `Su pago con tarjeta quedó confirmado${r.recibo ? ` · recibo ${r.recibo}` : ''}. Le llega la constancia por correo.` }
          : { t: 'Pago en revisión', txt: 'La pasarela aún no confirma el cobro. Se actualizará solo en unos minutos.', tono: 'info' }))
        .catch((e) => setAviso({ t: 'No pudimos revisar el pago', txt: mensaje(e), tono: 'info' }))
        .finally(() => { limpiar(); void recargar(); });
    } else {
      if (pago === 'cancelado') { setAviso({ t: 'Pago cancelado', txt: 'No se cobró nada. Puede intentarlo de nuevo cuando quiera.', tono: 'info' }); limpiar(); }
      void recargar();
    }
  }, [codigo, params, setParams, recargar]);

  if (error && !cuenta) return <Alert tone="danger" title="No pudimos cargar los pagos">{error}</Alert>;
  if (!cuenta) return <p className="muted" role="status">Cargando los pagos…</p>;

  const filas: Fila[] = [
    ...cuenta.pagos.map((p) => ({
      id: p.id, concepto: conceptoNombre(p.concepto) + (p.reemplazaA ? ' · nuevo comprobante' : ''), monto: p.monto,
      sub: `${p.enLinea ? 'Tarjeta en línea' : p.metodoNombre} · ${cuando(p.fechaRevision ?? p.fecha)}${p.recibo ? ` · ${p.recibo}` : ''}`,
      estado: p.estado, motivo: p.motivo, reemplazado: p.reemplazado,
    })),
    ...(cuenta.disponible > 0 ? [{ id: null, concepto: cuenta.faltaAdelanto ? 'Adelanto' : 'Saldo', monto: cuenta.disponible, sub: 'Antes de la entrega o al recibir', estado: 'Pendiente' }] : []),
  ];
  // Al entrar: lo que falta pagar o un pago rechazado sin reemplazar.
  const porPagar = filas.findIndex((f) => f.estado === 'Pendiente' || (f.estado === 'Rechazado' && !f.reemplazado));
  const idx = sel === undefined ? Math.max(0, porPagar) : Math.max(0, filas.findIndex((f) => f.id === sel));
  const actual = filas[idx];
  const rechazado = actual?.estado === 'Rechazado' && !actual.reemplazado;
  const puedePagar = Boolean(actual) && cuenta.puedePagar && (actual!.estado === 'Pendiente' || rechazado);
  const monto = actual ? Math.min(actual.monto, cuenta.disponible) : 0;
  const proximo = cuenta.saldo <= 0 ? 'Nada por pagar' : cuenta.porConfirmar > 0 && cuenta.disponible <= 0 ? 'En revisión del taller' : `${cuenta.faltaAdelanto ? 'Adelanto' : 'Saldo'} · ${dinero(cuenta.disponible)}`;

  const elegir = (m: Metodo) => { setMetodo(m); setErrorForm(null); };
  const pagarConTarjeta = () => {
    setOcupado(true);
    pagosClienteApi.pagarEnLinea(codigo)
      .then(({ url }) => { window.location.href = url; })
      .catch((e) => { setErrorForm(mensaje(e)); setOcupado(false); });
  };
  const informar = () => {
    if (metodo !== 'zelle' && metodo !== 'cheque') return;
    if (metodo === 'zelle' && archivos.length === 0) { setErrorForm('Suba la captura del envío por Zelle.'); return; }
    setOcupado(true);
    pagosClienteApi.informar(codigo, { metodo, monto, detalle: referencia.trim() || undefined, reemplaza: rechazado ? actual!.id! : undefined }, archivos[0])
      .then(async (r) => {
        setAviso({ t: 'Pago informado', txt: 'Quedó «Por confirmar». Le avisaremos cuando el taller lo revise, normalmente el mismo día.' });
        setArchivos([]); setReferencia(''); setErrorForm(null);
        await recargar();
        setSel(r.id);
      })
      .catch((e) => setErrorForm(e instanceof ApiError ? e.errores.comprobante ?? e.errores.monto ?? e.message : mensaje(e)))
      .finally(() => setOcupado(false));
  };
  const metodoBoton = (x: { m: Metodo; l: string; s: string }, deshabilitado = false) => (
    <button key={x.m} type="button" className={metodo === x.m ? 'w5-pm on' : 'w5-pm'} aria-pressed={metodo === x.m} disabled={deshabilitado} onClick={() => elegir(x.m)}>
      <b>{x.l}</b><small>{x.s}</small>
    </button>
  );
  const titulo = `${rechazado ? 'Volver a pagar el' : 'Pagar el'} ${actual?.concepto.toLowerCase() ?? 'saldo'}`;

  return (
    <>
      <div className="whead">
        <div>
          <div className="crumb">{cuenta.pedido} · {cuenta.titulo}</div>
          <h1>Pagos del pedido</h1>
        </div>
        <Link className="gw-btn gw-btn-secondary gw-btn-sm" to={`/cliente/pedidos?pedido=${cuenta.pedido}`}>← Volver a mi pedido</Link>
      </div>

      {aviso && <Toast tone={aviso.tono} title={aviso.t} onClose={() => setAviso(null)}>{aviso.txt}</Toast>}

      <div className="w5-sum">
        <div><span>TOTAL</span><b>{dinero(cuenta.total)}</b></div>
        <div><span>PAGADO</span><b>{dinero(cuenta.pagado)}</b></div>
        <div><span>SALDO</span><b className="w5-saldo">{dinero(cuenta.saldo)}</b></div>
        <div><span>PRÓXIMO PAGO</span><b className="w5-prox">{proximo}</b></div>
      </div>

      <div className="wcols">
        <div className="wl">
          <div className="tbl-box">
            <table className="t">
              <thead><tr><th>Concepto</th><th>Método y fecha</th><th className="r">Monto</th><th>Estado</th></tr></thead>
              <tbody>
                {filas.map((p, k) => (
                  <tr key={p.id ?? 'pendiente'} className={k === idx ? 'w5-row sel' : 'w5-row'} onClick={() => setSel(p.id)}>
                    <td>
                      <button type="button" className="w5-link" aria-pressed={k === idx} onClick={(e) => { e.stopPropagation(); setSel(p.id); }}><b>{p.concepto}</b></button>
                      {p.motivo && <div className="w5-motivo">Motivo: {p.motivo}{p.reemplazado ? ' · reemplazado' : ''}</div>}
                    </td>
                    <td className="muted">{p.sub}</td>
                    <td className="r"><b>{dinero(p.monto)}</b></td>
                    <td><StatusChip status={p.estado} tone={TONO[p.estado] ?? 'info'} /></td>
                  </tr>
                ))}
                {filas.length === 0 && <tr><td colSpan={4} className="muted">Este pedido no tiene pagos.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="card stack" style={{ gap: 10 }}>
            <div className="between"><b style={{ fontSize: 16 }}>Recibos y comprobante</b><span className="muted" style={{ fontSize: 13 }}>Se emiten al confirmar cada pago</span></div>
            {cuenta.recibos.map((r) => (
              <div key={r.codigo} className="between w5-rec">
                <div className="row" style={{ gap: 10 }}><Icon name="clipboard" size={20} /><div><b>Recibo {r.codigo}</b><div className="muted" style={{ fontSize: 13 }}>{conceptoNombre(r.concepto)} · {dinero(r.monto)} · {cuando(r.fecha)}</div></div></div>
                <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" disabled title="El PDF estará disponible pronto">Descargar PDF</button>
              </div>
            ))}
            {cuenta.recibos.length === 0 && <span className="muted" style={{ fontSize: 13.5 }}>Aún no hay pagos confirmados.</span>}
            <div className="between" style={{ padding: '8px 0' }}>
              <div className="row" style={{ gap: 10 }}><Icon name="lock" size={20} /><div><b>Comprobante final</b><div className="muted" style={{ fontSize: 13 }}>Se emite cuando el saldo llega a $0 · reúne todos los pagos</div></div></div>
              {cuenta.saldo > 0 ? <span className="pill">Saldo {dinero(cuenta.saldo)}</span> : <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" disabled title="El PDF estará disponible pronto">Descargar PDF</button>}
            </div>
          </div>
        </div>

        <aside className="wr">
          {puedePagar && actual && (
            <div className="card stack w5-form">
              <div className="between"><h2 style={{ fontSize: 18 }}>{titulo}</h2><b className="num w5-monto">{dinero(monto)}</b></div>
              <div className="w5-sec">Pagar en línea <em>se confirma al instante</em></div>
              <div className="w5-grid">{EN_LINEA.map((x) => metodoBoton(x, x.m === 'banco' || (x.m === 'tarjeta' && !cuenta.pagoEnLinea)))}</div>
              <div className="w5-sec" style={{ marginTop: 4 }}>Otras formas de pago</div>
              <div className="w5-grid w5-three">{OTRAS.map((x) => metodoBoton(x))}</div>

              <div className="w5-detail">
                {metodo === 'tarjeta' && (
                  <>
                    <div className="w5-lock"><Icon name="lock" size={16} /><span>
                      Se abre la página segura de pago y el pago queda confirmado en cuanto la tarjeta lo aprueba.
                      {' '}GARWEB nunca ve ni guarda los datos de su tarjeta: los maneja la pasarela de pago.
                    </span></div>
                    {errorForm && <p className="gw-field-error" role="alert">{errorForm}</p>}
                    <button type="button" className="gw-btn gw-btn-primary gw-btn-lg gw-btn-block" disabled={ocupado || !cuenta.pagoEnLinea} onClick={pagarConTarjeta}>
                      {ocupado ? 'Abriendo la página de pago…' : `Pagar ${dinero(cuenta.disponible)} con tarjeta`}
                    </button>
                    {!cuenta.pagoEnLinea && <span className="muted" style={{ fontSize: 12.5 }}>El pago en línea no está disponible por ahora. Use Zelle, cheque o pague en el taller.</span>}
                  </>
                )}
                {(metodo === 'zelle' || metodo === 'cheque') && (
                  <>
                    {metodo === 'zelle' ? (
                      <>
                        <div className="kv"><span>Zelle</span><b>{ZELLE.destino}</b></div>
                        <div className="kv"><span>A nombre de</span><b>{ZELLE.titular}</b></div>
                        <div className="kv"><span>Concepto</span><b>{cuenta.pedido}</b></div>
                      </>
                    ) : (
                      <>
                        <div className="kv"><span>Páguese a</span><b>{ZELLE.titular}</b></div>
                        <div className="kv"><span>Monto</span><b>{dinero(monto)}</b></div>
                        <span style={{ fontSize: 13.5, lineHeight: '20px' }}>Entréguelo en el taller o al conductor. Si lo envía, suba una foto del cheque firmado.</span>
                      </>
                    )}
                    <UploadZone title={metodo === 'zelle' ? 'Suba la captura del envío' : 'Foto del cheque (opcional)'} hint="JPG, PNG o PDF de hasta 5 MB"
                      accept="image/jpeg,image/png,application/pdf" files={archivos} onChange={(f) => { setArchivos(f.slice(-1)); setErrorForm(null); }} />
                    <TextField label={metodo === 'zelle' ? 'Código de confirmación de Zelle' : 'N.º de cheque y banco'} optional maxLength={120} value={referencia} onChange={(e) => setReferencia(e.target.value)} />
                    {errorForm && <p className="gw-field-error" role="alert">{errorForm}</p>}
                    <button type="button" className="gw-btn gw-btn-primary gw-btn-lg gw-btn-block" disabled={ocupado} onClick={informar}>
                      {ocupado ? 'Enviando…' : metodo === 'zelle' ? 'Informar pago por Zelle' : 'Informar pago con cheque'}
                    </button>
                    <span className="muted" style={{ fontSize: 12.5 }}>El taller lo confirma, normalmente el mismo día.</span>
                  </>
                )}
                {metodo === 'efectivo' && (
                  <>
                    <span style={{ fontSize: 13.5, lineHeight: '20px' }}>Pague en efectivo en el taller (lun a sáb) o al conductor cuando le entreguemos. Le damos un recibo y el pago queda registrado al momento.</span>
                    <div className="kv"><span>Taller</span><b>Garwood, NJ · lun–sáb</b></div>
                  </>
                )}
              </div>
            </div>
          )}

          {actual && !puedePagar && actual.estado === 'Rechazado' && actual.reemplazado && (
            <div className="card stack"><b>Comprobante reemplazado</b><p className="muted" style={{ fontSize: 14 }}>Este comprobante fue rechazado y usted subió uno nuevo.</p></div>
          )}
          {actual && !puedePagar && actual.estado === 'Confirmado' && (
            <div className="card stack"><b>{actual.concepto} confirmado</b><p className="muted" style={{ fontSize: 14 }}>{actual.sub} · {dinero(actual.monto)}. Su recibo está en «Recibos y comprobante».</p></div>
          )}
          {actual && !puedePagar && actual.estado === 'Por confirmar' && (
            <div className="card stack"><b>Esperando la confirmación del taller</b><p className="muted" style={{ fontSize: 14 }}>Le avisaremos aquí y por correo cuando lo revise.</p></div>
          )}
          {actual && !puedePagar && actual.estado === 'Anulado' && (
            <div className="card stack"><b>Pago anulado</b><p className="muted" style={{ fontSize: 14 }}>{actual.motivo ? `Motivo: ${actual.motivo}. ` : ''}Si tiene dudas, llámenos.</p></div>
          )}
          {cuenta.saldo <= 0 && (
            <div className="card stack"><b>Pedido pagado por completo</b><p className="muted" style={{ fontSize: 14 }}>No tiene nada por pagar. Gracias.</p></div>
          )}
        </aside>
      </div>
    </>
  );
}
