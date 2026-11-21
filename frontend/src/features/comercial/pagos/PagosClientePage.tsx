import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { API_URL } from '../../../shared/api/http';
import { Icon } from '../../../shared/ui/Icon';
import { PagosClienteConectada } from './PagosClienteConectada';
import { StatusChip } from '../../../shared/ui/StatusChip';
import { Toast } from '../../../shared/ui/Toast';
import { UploadZone } from '../../../shared/ui/UploadZone';
import { CUENTAS_CLIENTE, ZELLE, dinero, type EstadoPagoCliente, type PagoCliente } from './datos';
import './pagos.css';

type Metodo = 'tarjeta' | 'banco' | 'zelle' | 'cheque' | 'efectivo';
/** Lo que el cliente hizo con un pago en esta visita (solo diseño: no se guarda). */
type Resultado = 'tarjeta' | 'banco' | 'zelle' | 'cheque' | 'efectivo';

const EN_LINEA: { m: Metodo; l: string; s: string }[] = [
  { m: 'tarjeta', l: 'Tarjeta de crédito o débito', s: 'Visa, Mastercard, Amex, Discover' },
  { m: 'banco', l: 'Cuenta bancaria', s: 'Transferencia (ACH) · 2 a 3 días hábiles' },
];
const OTRAS: { m: Metodo; l: string; s: string }[] = [
  { m: 'zelle', l: 'Zelle', s: 'Suba la captura' },
  { m: 'cheque', l: 'Cheque', s: 'En el taller o con foto' },
  { m: 'efectivo', l: 'Efectivo', s: 'Solo en persona' },
];
const BANCOS = ['Chase', 'Bank of America', 'Wells Fargo', 'TD Bank'];
const TONO: Record<EstadoPagoCliente, 'warning' | 'success' | 'danger' | 'info' | 'progress'> = {
  Pendiente: 'info', 'Por confirmar': 'warning', Confirmado: 'success', Rechazado: 'danger', 'En proceso': 'progress',
};

/** El pago con lo que el cliente hizo en esta visita. */
function conResultado(p: PagoCliente, r: Resultado | undefined): PagoCliente {
  if (!r) return p;
  if (r === 'tarjeta') return { ...p, estado: 'Confirmado', sub: 'Tarjeta en línea · hoy', motivo: undefined };
  if (r === 'banco') return { ...p, estado: 'En proceso', sub: 'Cuenta bancaria (ACH) · hoy', motivo: undefined };
  if (r === 'efectivo') return { ...p, estado: 'Pendiente', sub: 'Efectivo · al entregar', motivo: undefined };
  return { ...p, estado: 'Por confirmar', sub: `${r === 'cheque' ? 'Cheque' : 'Zelle'} · hoy`, motivo: undefined };
}

/**
 * W5 Pagos del pedido (CU-C12, C13 · diseño del 14/11): el total, lo pagado y el saldo; pagar en línea por la pasarela
 * (se confirma sola) o informar un pago por Zelle o cheque (el taller lo confirma); recibos y comprobante final.
 * El cliente nunca ve costos ni márgenes (RG-08). Sin backend se ve este ejemplo del diseño; con backend,
 * PagosClienteConectada.
 */
export function PagosClientePage() {
  return API_URL ? <PagosClienteConectada /> : <PagosClienteEjemplo />;
}

function PagosClienteEjemplo() {
  const [params] = useSearchParams();
  const cuenta = CUENTAS_CLIENTE.find((c) => c.pedido === params.get('pedido')) ?? CUENTAS_CLIENTE[0]!;
  const [resultados, setResultados] = useState<Record<string, Resultado>>({});
  const [metodo, setMetodo] = useState<Metodo>('tarjeta');
  const [archivos, setArchivos] = useState<File[]>([]);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [pasarela, setPasarela] = useState(false);
  const [banco, setBanco] = useState(0);

  const pagos = cuenta.pagos.map((p) => conResultado(p, resultados[`${cuenta.pedido}|${p.id}`]));
  // Al entrar: el primer pago que falta pagar (pendiente o rechazado sin reemplazar).
  const porPagar = pagos.findIndex((p) => (p.estado === 'Pendiente' || p.estado === 'Rechazado') && !p.reemplazado);
  const [sel, setSel] = useState(Math.max(0, porPagar));
  useEffect(() => { setSel(Math.max(0, cuenta.pagos.findIndex((p) => (p.estado === 'Pendiente' || p.estado === 'Rechazado') && !p.reemplazado))); }, [cuenta]);

  const actual = pagos[Math.min(sel, pagos.length - 1)]!;
  const clave = `${cuenta.pedido}|${actual.id}`;
  const hecho = resultados[clave];
  const pagado = pagos.filter((p) => p.estado === 'Confirmado' && !p.reemplazado).reduce((a, p) => a + p.monto, 0);
  const saldo = cuenta.total - pagado;
  const puedePagar = !hecho && (actual.estado === 'Pendiente' || actual.estado === 'Rechazado') && !actual.reemplazado;
  const enLinea = metodo === 'tarjeta' || metodo === 'banco';

  const terminar = (r: Resultado) => {
    setResultados({ ...resultados, [clave]: r });
    setArchivos([]);
    setErrorArchivo(null);
    setPasarela(false);
  };
  const informar = () => {
    if (metodo === 'zelle' && archivos.length === 0) { setErrorArchivo('Suba la captura del envío por Zelle.'); return; }
    terminar(metodo === 'cheque' ? 'cheque' : 'zelle');
  };
  const elegir = (m: Metodo) => { setMetodo(m); setErrorArchivo(null); };

  // Cerrar la pasarela con Escape.
  useEffect(() => {
    if (!pasarela) return;
    const cerrar = (e: KeyboardEvent) => { if (e.key === 'Escape') setPasarela(false); };
    window.addEventListener('keydown', cerrar);
    return () => window.removeEventListener('keydown', cerrar);
  }, [pasarela]);

  const titulo = `${actual.estado === 'Rechazado' ? 'Volver a pagar el' : 'Pagar el'} ${actual.concepto.toLowerCase()}`;
  const monto = dinero(actual.monto);
  const metodoBoton = (x: { m: Metodo; l: string; s: string }) => (
    <button key={x.m} type="button" className={metodo === x.m ? 'w5-pm on' : 'w5-pm'} aria-pressed={metodo === x.m} onClick={() => elegir(x.m)}>
      <b>{x.l}</b><small>{x.s}</small>
    </button>
  );

  return (
    <>
      <div className="whead">
        <div>
          <div className="crumb">{cuenta.pedido} · {cuenta.titulo}</div>
          <h1>Pagos del pedido</h1>
        </div>
        <Link className="gw-btn gw-btn-secondary gw-btn-sm" to={`/cliente/pedidos?pedido=${cuenta.pedido}`}>← Volver a mi pedido</Link>
      </div>

      <div className="w5-sum">
        <div><span>TOTAL</span><b>{dinero(cuenta.total)}</b></div>
        <div><span>PAGADO</span><b>{dinero(pagado)}</b></div>
        <div><span>SALDO</span><b className="w5-saldo">{dinero(saldo)}</b></div>
        <div><span>PRÓXIMO PAGO</span><b className="w5-prox">{saldo > 0 ? cuenta.proximo : 'Nada por pagar'}</b></div>
      </div>

      <div className="wcols">
        <div className="wl">
          <div className="tbl-box">
            <table className="t">
              <thead><tr><th>Concepto</th><th>Método y fecha</th><th className="r">Monto</th><th>Estado</th></tr></thead>
              <tbody>
                {pagos.map((p, k) => (
                  <tr key={p.id} className={k === sel ? 'w5-row sel' : 'w5-row'} onClick={() => setSel(k)}>
                    <td>
                      <button type="button" className="w5-link" aria-pressed={k === sel} onClick={(e) => { e.stopPropagation(); setSel(k); }}><b>{p.concepto}</b></button>
                      {p.motivo && <div className="w5-motivo">Motivo: {p.motivo}</div>}
                    </td>
                    <td className="muted">{p.sub}</td>
                    <td className="r"><b>{dinero(p.monto)}</b></td>
                    <td><StatusChip status={p.estado} tone={TONO[p.estado]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card stack" style={{ gap: 10 }}>
            <div className="between"><b style={{ fontSize: 16 }}>Recibos y comprobante</b><span className="muted" style={{ fontSize: 13 }}>Se emiten al confirmar cada pago</span></div>
            {cuenta.recibos.map((r) => (
              <div key={r.codigo} className="between w5-rec">
                <div className="row" style={{ gap: 10 }}><Icon name="clipboard" size={20} /><div><b>Recibo {r.codigo}</b><div className="muted" style={{ fontSize: 13 }}>{r.texto}</div></div></div>
                <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" disabled title="Disponible cuando esté el backend de Pagos">Descargar PDF</button>
              </div>
            ))}
            <div className="between" style={{ padding: '8px 0' }}>
              <div className="row" style={{ gap: 10 }}><Icon name="lock" size={20} /><div><b>Comprobante final</b><div className="muted" style={{ fontSize: 13 }}>Se emite cuando el saldo llega a $0 · reúne todos los pagos</div></div></div>
              {saldo > 0 ? <span className="pill">Saldo {dinero(saldo)}</span> : <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" disabled>Descargar PDF</button>}
            </div>
          </div>

          <div className="card row" style={{ gap: 12, alignItems: 'flex-start' }}>
            <Icon name="payment" size={22} />
            <div>
              <b>Cinco formas de pagar</b>
              <p className="muted" style={{ fontSize: 14, lineHeight: '21px', margin: '4px 0 0' }}>
                En línea con tarjeta o cuenta bancaria: se confirma solo, sin subir nada. Por Zelle o cheque: suba la captura o foto y el taller lo confirma.
                En efectivo o con tarjeta en persona: en el taller o al conductor cuando le entreguemos.
              </p>
            </div>
          </div>
        </div>

        <aside className="wr">
          {puedePagar && (
            <div className="card stack w5-form">
              <div className="between"><h2 style={{ fontSize: 18 }}>{titulo}</h2><b className="num w5-monto">{monto}</b></div>
              <div className="w5-sec">Pagar en línea <em>se confirma al instante</em></div>
              <div className="w5-grid">{EN_LINEA.map(metodoBoton)}</div>
              <div className="w5-sec" style={{ marginTop: 4 }}>Otras formas de pago</div>
              <div className="w5-grid w5-three">{OTRAS.map(metodoBoton)}</div>

              <div className="w5-detail">
                {enLinea && (
                  <>
                    <div className="w5-lock"><Icon name="lock" size={16} /><span>
                      {metodo === 'tarjeta'
                        ? 'Se abre la página segura de pago y el pago queda confirmado en cuanto la tarjeta lo aprueba.'
                        : 'Se abre la página segura de pago para autorizar el débito desde su cuenta. Su banco lo procesa en 2 a 3 días hábiles.'}
                      {' '}GARWEB nunca ve ni guarda los datos de su tarjeta o cuenta: los maneja la pasarela de pago.
                    </span></div>
                    <button type="button" className="gw-btn gw-btn-primary gw-btn-lg gw-btn-block" onClick={() => setPasarela(true)}>
                      {metodo === 'tarjeta' ? `Pagar ${monto} con tarjeta` : `Pagar ${monto} desde mi banco`}
                    </button>
                  </>
                )}
                {metodo === 'zelle' && (
                  <>
                    <div className="kv"><span>Zelle</span><b>{ZELLE.destino}</b></div>
                    <div className="kv"><span>A nombre de</span><b>{ZELLE.titular}</b></div>
                    <div className="kv"><span>Concepto</span><b>{cuenta.pedido}</b></div>
                    <UploadZone title="Suba la captura del envío" hint="JPG, PNG o PDF de hasta 5 MB" accept="image/jpeg,image/png,application/pdf" files={archivos} onChange={(f) => { setArchivos(f); setErrorArchivo(null); }} />
                    {errorArchivo && <p className="gw-field-error" role="alert">{errorArchivo}</p>}
                    <button type="button" className="gw-btn gw-btn-primary gw-btn-lg gw-btn-block" onClick={informar}>Informar pago por Zelle</button>
                    <span className="muted" style={{ fontSize: 12.5 }}>El taller lo confirma, normalmente el mismo día.</span>
                  </>
                )}
                {metodo === 'cheque' && (
                  <>
                    <div className="kv"><span>Páguese a</span><b>{ZELLE.titular}</b></div>
                    <div className="kv"><span>Monto</span><b>{monto}</b></div>
                    <span style={{ fontSize: 13.5, lineHeight: '20px' }}>Entréguelo en el taller o al conductor. Si lo envía, suba una foto del cheque firmado.</span>
                    <UploadZone title="Foto del cheque (opcional)" hint="Frente del cheque" accept="image/jpeg,image/png,application/pdf" files={archivos} onChange={setArchivos} />
                    <button type="button" className="gw-btn gw-btn-primary gw-btn-lg gw-btn-block" onClick={informar}>Informar pago con cheque</button>
                  </>
                )}
                {metodo === 'efectivo' && (
                  <>
                    <span style={{ fontSize: 13.5, lineHeight: '20px' }}>Pague en efectivo en el taller (lun a sáb) o al conductor cuando le entreguemos. Le damos un recibo y el pago queda registrado al momento.</span>
                    <div className="kv"><span>Taller</span><b>Garwood, NJ · lun–sáb</b></div>
                    <button type="button" className="gw-btn gw-btn-secondary gw-btn-lg gw-btn-block" onClick={() => terminar('efectivo')}>Pagaré en efectivo</button>
                  </>
                )}
              </div>
            </div>
          )}

          {(hecho === 'zelle' || hecho === 'cheque') && <Toast title="Pago informado">Quedó «Por confirmar». Le avisaremos cuando el taller lo revise.</Toast>}
          {hecho === 'efectivo' && <Toast tone="info" title="Pagará en efectivo">Entréguelo en el taller o al conductor el día de la entrega. Le damos un recibo al momento.</Toast>}
          {hecho === 'tarjeta' && (
            <div className="card stack"><b>{actual.concepto} pagado con tarjeta</b><p className="muted" style={{ fontSize: 14 }}>Aprobado por la pasarela hoy. {saldo === 0 ? 'Su saldo quedó en $0 y ya puede descargar el comprobante final.' : `Su saldo quedó en ${dinero(saldo)}.`}</p></div>
          )}
          {hecho === 'banco' && (
            <div className="card stack"><b>Débito bancario en proceso</b><p className="muted" style={{ fontSize: 14 }}>Su banco tarda 2 a 3 días hábiles. Cuando la pasarela lo confirme, el pago pasa a «Confirmado» solo.</p></div>
          )}
          {!hecho && actual.reemplazado && (
            <div className="card stack"><b>Comprobante reemplazado</b><p className="muted" style={{ fontSize: 14 }}>Este comprobante fue rechazado y usted subió uno nuevo, que ya fue confirmado.</p></div>
          )}
          {!hecho && actual.estado === 'Confirmado' && (
            <div className="card stack"><b>{actual.concepto} confirmado</b><p className="muted" style={{ fontSize: 14 }}>{actual.sub} · {dinero(actual.monto)}. Su recibo está en «Recibos y comprobante».</p></div>
          )}
          {!hecho && actual.estado === 'Por confirmar' && (
            <div className="card stack"><b>Esperando la confirmación del taller</b><p className="muted" style={{ fontSize: 14 }}>Le avisaremos cuando lo revise.</p></div>
          )}
        </aside>
      </div>

      {pasarela && createPortal(
        <div className="w5-dim" onClick={(e) => { if (e.target === e.currentTarget) setPasarela(false); }}>
          <div className="w5-co" role="dialog" aria-modal="true" aria-labelledby="w5-co-t">
            <div className="w5-co-h">
              <div><b id="w5-co-t">Pago seguro · Garwood LLC</b><small>{metodo === 'tarjeta' ? 'Tarjeta' : 'Cuenta bancaria (ACH)'} · {monto}</small></div>
              <button type="button" className="w5-co-x" aria-label="Cerrar" onClick={() => setPasarela(false)}><Icon name="x" size={18} /></button>
            </div>
            <div className="w5-co-b">
              <p className="w5-demo">Vista de ejemplo: aquí se abre la página de la pasarela de pago, que todavía no está conectada.</p>
              {metodo === 'tarjeta' ? (
                <>
                  <div className="w5-co-f"><span>Número de tarjeta</span><span className="w5-in">•••• •••• •••• ••••</span></div>
                  <div className="w5-co-2"><div className="w5-co-f"><span>Vence</span><span className="w5-in">MM / AA</span></div><div className="w5-co-f"><span>CVC</span><span className="w5-in">•••</span></div></div>
                  <div className="w5-co-f"><span>Nombre en la tarjeta</span><span className="w5-in">—</span></div>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 13.5 }}>Elija su banco e inicie sesión para autorizar el débito.</span>
                  {BANCOS.map((b, k) => (
                    <button key={b} type="button" className={k === banco ? 'w5-bank on' : 'w5-bank'} aria-pressed={k === banco} onClick={() => setBanco(k)}>
                      <span>{b}</span><span className="muted" style={{ fontSize: 12.5 }}>{k === banco ? 'Cuenta corriente' : ''}</span>
                    </button>
                  ))}
                </>
              )}
              <div className="w5-lock"><Icon name="lock" size={16} /><span>Página de la pasarela de pago. Sus datos no pasan por GARWEB.</span></div>
              <button type="button" className="gw-btn gw-btn-primary gw-btn-lg gw-btn-block" onClick={() => terminar(metodo === 'tarjeta' ? 'tarjeta' : 'banco')}>Pagar {monto}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
