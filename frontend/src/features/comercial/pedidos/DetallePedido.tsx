import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '../../../shared/ui/Alert';
import { Icon } from '../../../shared/ui/Icon';
import { StatusChip } from '../../../shared/ui/StatusChip';
import { TextField } from '../../../shared/ui/TextField';
import type { PedidoEnCurso } from './datos';
import { AvisoSiguiente } from './TarjetaPedido';

const METODOS = ['Tarjeta', 'Cuenta bancaria', 'Zelle', 'Cheque', 'Efectivo'];
const TELEFONO_TALLER = { texto: '(908) 555-0110', tel: '9085550110' };

type Cancelacion = 'no' | 'abierta' | 'enviada';

/** Ficha de un pedido en curso: etapas, avance, datos, cuenta, entrega y cancelación (CU-C15). */
export function DetallePedido({ pedido: p, volver }: { pedido: PedidoEnCurso; volver?: { n: number; ir(): void } }) {
  const [cancelacion, setCancelacion] = useState<Cancelacion>('no');
  const [motivo, setMotivo] = useState('');
  const [errorMotivo, setErrorMotivo] = useState('');
  const enPausa = cancelacion === 'enviada';
  const c = p.cancelacion;

  const enviar = () => {
    if (!motivo.trim()) { setErrorMotivo('Cuéntenos el motivo para que el taller pueda revisarlo.'); return; }
    setCancelacion('enviada');
  };

  return (
    <>
      {volver && (
        <button type="button" className="gw-btn gw-btn-ghost gw-btn-sm" style={{ alignSelf: 'flex-start' }} onClick={volver.ir}>
          ← Todos mis pedidos en curso ({volver.n})
        </button>
      )}
      <section className="hero" aria-label={`Pedido ${p.id}`}>
        <div className="between" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="row" style={{ gap: 14 }}>
            <span className={`thumb ${p.thumb}`} style={{ width: 64, height: 64, borderRadius: 16 }}><Icon name={p.icono} size={28} /></span>
            <div><h2>{p.titulo}</h2><span className="muted" style={{ fontSize: 14 }}>{p.descripcion}</span></div>
          </div>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <StatusChip status={enPausa ? 'En pausa' : p.estado} size="lg" />
            <div className="amt"><small>Entrega estimada</small><b style={{ fontSize: 20 }}>{p.entregaEstimada}</b></div>
          </div>
        </div>
        <ol className="etapas" style={{ '--etapas': p.etapas.length } as CSSProperties} aria-label="Etapas del pedido">
          {p.etapas.map((s, i) => {
            const hecho = i < p.etapaActual;
            return (
              <li key={s.l} className={hecho ? 'st d' : i === p.etapaActual ? 'st c' : 'st'} aria-current={i === p.etapaActual ? 'step' : undefined}>
                <i aria-hidden="true">{hecho ? '✓' : i + 1}</i><b>{s.l}</b><small>{s.d}</small>
              </li>
            );
          })}
        </ol>
        <AvisoSiguiente
          aviso={enPausa
            ? { quien: 'you', icono: 'pause', texto: 'Su pedido está en pausa mientras el taller revisa la solicitud de cancelación.' }
            : p.siguiente}
        />
      </section>

      <div className="cols">
        <div className="stack" style={{ gap: 16 }}>
          <div className="card stack">
            <div className="between"><h3>Qué estamos haciendo</h3><span className="muted" style={{ fontSize: 13 }}>actualizado {p.trabajo.actualizado}</span></div>
            <p style={{ fontSize: 15, lineHeight: '23px' }}>{p.trabajo.texto}</p>
            <div className="gw-progress" role="progressbar" aria-label="Avance del trabajo" aria-valuemin={0} aria-valuemax={p.trabajo.total} aria-valuenow={p.trabajo.hechos}>
              <span className="gw-progress-fill" style={{ width: `${(p.trabajo.hechos / p.trabajo.total) * 100}%` }} />
            </div>
            <span className="muted" style={{ fontSize: 13 }}>{p.trabajo.pie}</span>
          </div>
          <div className="card stack">
            <h3>Su mueble en el taller</h3>
            <div className="ph2" aria-hidden="true"><span className="thumb b" /><span className="thumb" /><span className="thumb c" /></div>
            <small className="muted">{p.fotos}</small>
          </div>
          <div className="card stack">
            <h3>Datos del pedido</h3>
            <dl className="kvs">
              {p.datos.map((d) => (
                <div key={d.l}>
                  <dt>{d.l}</dt>
                  <dd style={d.ok ? { color: 'var(--success-ink)' } : undefined}>{d.a ? <Link to={d.a}>{d.v}</Link> : d.v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <aside className="stack" style={{ gap: 16 }}>
          <div className="card acct">
            <span className="ov">Su cuenta</span>
            <div className="row2"><span>Total</span><b className="num">{p.cuenta.total}</b></div>
            {p.cuenta.pagos.map((x) => (
              <div key={x.l} className="row2"><span>{x.l}</span><b className="num" style={{ color: 'var(--success-ink)' }}>{x.v}</b></div>
            ))}
            <div className="row2 saldo"><b>Saldo pendiente</b><b className="num">{p.cuenta.saldo}</b></div>
            <small className="muted">Puede pagarlo antes de la entrega o al recibir su pedido con:</small>
            <div className="meth">{METODOS.map((m) => <span key={m}>{m}</span>)}</div>
            <Link className="gw-btn gw-btn-primary gw-btn-block" to="/cliente/pagos">Pagar saldo y ver recibos</Link>
          </div>

          <div className="card stack" style={{ gap: 10 }}>
            <div className="between">
              <span className="ov">Fecha y hora de la entrega</span>
              {p.entrega.asignada
                ? <StatusChip status="Asignada" tone="warning" />
                : <span className="pill" style={{ whiteSpace: 'nowrap' }}>Aún no disponible</span>}
            </div>
            <p style={{ fontSize: 14, lineHeight: '21px' }}>{p.entrega.texto}</p>
            {p.entrega.pasos && (
              <ol className="muted" style={{ fontSize: 13, lineHeight: '20px', paddingLeft: 18, margin: 0 }}>
                {p.entrega.pasos.map((x) => <li key={x}>{x}</li>)}
              </ol>
            )}
            {p.entrega.accion && (
              <Link
                className={p.entrega.accion.tipo === 'primary' ? 'gw-btn gw-btn-primary gw-btn-block' : 'gw-btn gw-btn-ghost gw-btn-sm'}
                to={p.entrega.accion.a}
              >
                {p.entrega.accion.texto}
              </Link>
            )}
          </div>

          <div className="card stack" style={{ gap: 8 }}>
            <span className="ov">¿Necesita algo?</span>
            <a href={`tel:${TELEFONO_TALLER.tel}`} style={{ fontWeight: 600, fontSize: 14 }}>Llamar al taller · {TELEFONO_TALLER.texto}</a>
            {cancelacion === 'no' && (
              <button type="button" className="gw-btn gw-btn-ghost gw-btn-block lnk-danger" onClick={() => setCancelacion('abierta')}>
                Solicitar cancelación
              </button>
            )}
          </div>

          {cancelacion === 'abierta' && (
            <div className="card stack cancel-card">
              <h3>Solicitar cancelación</h3>
              {c ? (
                <>
                  <p className="muted" style={{ fontSize: 13.5, lineHeight: '20px' }}>{c.explicacion}</p>
                  {c.lineas.map((x) => <div key={x.l} className="ln2"><span className="muted">{x.l}</span><b className="num">{x.v}</b></div>)}
                  <hr className="stitch" />
                  <div className="ln2"><b>Cargo estimado</b><b className="num">{c.cargo}</b></div>
                  <div className="ln2"><span className="muted">Adelanto pagado</span><b className="num">{c.adelanto}</b></div>
                  <div className="ln2"><b>{c.resultado.l}</b><b className="num" style={{ color: 'var(--warning-ink)' }}>{c.resultado.v}</b></div>
                </>
              ) : (
                <p className="muted" style={{ fontSize: 13.5, lineHeight: '20px' }}>
                  Se cobra solo lo hecho hasta hoy (horas, materiales comprados para su pedido y traslados) y se le devuelve el resto.
                  El taller calcula el monto y lo confirma con usted.
                </p>
              )}
              <TextField
                label="¿Por qué quiere cancelar?"
                required
                value={motivo}
                error={errorMotivo}
                onChange={(e) => { setMotivo(e.target.value); setErrorMotivo(''); }}
              />
              <button type="button" className="gw-btn gw-btn-danger gw-btn-block" onClick={enviar}>Enviar solicitud</button>
              <button type="button" className="gw-btn gw-btn-ghost gw-btn-block" onClick={() => setCancelacion('no')}>Seguir con mi pedido</button>
            </div>
          )}
          {enPausa && (
            <Alert tone="warning" title="Solicitud de cancelación enviada">
              El taller revisará el cargo{c ? ` estimado (${c.cargo})` : ''}, lo confirmará o ajustará con usted y le avisará el monto final.
              Su pedido queda en pausa mientras tanto.
            </Alert>
          )}
        </aside>
      </div>
    </>
  );
}
