import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { TopAdmin } from '../../../app/layout/AdminLayout';
import { Alert } from '../../../shared/ui/Alert';
import { OrderTimeline } from '../../../shared/ui/OrderTimeline';
import { StatusChip } from '../../../shared/ui/StatusChip';
import { TextField } from '../../../shared/ui/TextField';
import { Toast } from '../../../shared/ui/Toast';
import { FICHA, PEDIDOS } from './datos';
import './pedidosAdmin.css';

/**
 * A6b Ficha del pedido (C15, C16): cotización y versiones, pagos y saldo, avance de producción, despacho y actividad.
 * Solo diseño: los datos son de ejemplo (PED-0076); los demás pedidos toman su encabezado de la lista.
 */
export function FichaPedidoPage() {
  const { codigo = 'PED-0076' } = useParams();
  const fila = PEDIDOS.find((p) => p.codigo === codigo) ?? PEDIDOS.find((p) => p.codigo === 'PED-0076')!;
  const [fecha, setFecha] = useState<'cerrada' | 'abierta' | 'guardada'>('cerrada');
  const [nuevaFecha, setNuevaFecha] = useState('2026-10-23');
  const [motivoFecha, setMotivoFecha] = useState('La clienta pidió entregarlo el sábado');
  const [cancelar, setCancelar] = useState<'cerrada' | 'abierta' | 'hecha'>('cerrada');
  const [acordado, setAcordado] = useState(FICHA.cancelacion.acordado);
  const [motivo, setMotivo] = useState('Cliente se muda; se acuerda cubrir con el adelanto');
  const p = FICHA.produccion;
  const estado = cancelar === 'hecha' ? 'Cancelado' : fila.estado;

  return (
    <>
      <TopAdmin
        crumb={<><Link to="/admin/pedidos">Comercial › Pedidos</Link> › {fila.codigo} · {FICHA.fechaHoy}</>}
        titulo={<span className="row" style={{ flexWrap: 'wrap', gap: 10 }}>{fila.mueble} · {fila.codigo}<StatusChip status={estado} /></span>}
        debajo={
          <div className="muted pd-sub">
            <Link to="/admin/clientes">{fila.cliente}</Link> · {FICHA.telefono} · {FICHA.direccion} · {FICHA.traslado} · <b style={{ color: 'var(--ink)' }}>saldo total del cliente: {FICHA.saldoCliente}</b> ({FICHA.pedidosAbiertos} pedido abierto)
          </div>
        }
      />

      <div className="pd-actbar">
        <span className="ov" style={{ marginRight: 6 }}>Acciones según el estado</span>
        <Link className="gw-btn gw-btn-secondary gw-btn-sm" to="/admin/pagos">Registrar pago</Link>
        <Link className="gw-btn gw-btn-secondary gw-btn-sm" to="/admin/cotizaciones/cotizar?modo=v2">Crear V2 (daño oculto)</Link>
        <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" onClick={() => setFecha('abierta')}>Cambiar fecha para terminar</button>
        <button type="button" className="gw-btn gw-btn-danger gw-btn-sm" disabled={cancelar === 'hecha'} onClick={() => setCancelar('abierta')}>Cancelar pedido</button>
      </div>

      {fecha === 'abierta' && (
        <section className="card stack" style={{ border: '2px solid var(--primary)', gap: 12 }} aria-labelledby="pd-fecha">
          <div className="between" style={{ flexWrap: 'wrap' }}><h2 id="pd-fecha" style={{ fontSize: 17 }}>Cambiar fecha para terminar</h2><span className="muted" style={{ fontSize: 13 }}>Actual: {FICHA.terminarPara} (plazo estándar de {FICHA.plazoEstandar} días)</span></div>
          <div className="grid2" style={{ gap: 14 }}>
            <label className="stack" style={{ gap: 4 }}><span className="gw-field-label">Nueva fecha</span><input className="gw-input" type="date" value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} style={{ minHeight: 42 }} /></label>
            <TextField label="Motivo" required value={motivoFecha} onChange={(e) => setMotivoFecha(e.target.value)} error={motivoFecha.trim() ? undefined : 'Escriba el motivo del cambio'} />
          </div>
          <div className="row">
            <button type="button" className="gw-btn gw-btn-primary" disabled={!motivoFecha.trim() || !nuevaFecha} onClick={() => setFecha('guardada')}>Guardar fecha</button>
            <button type="button" className="gw-btn gw-btn-ghost" onClick={() => setFecha('cerrada')}>Cancelar</button>
          </div>
          <p className="audit" style={{ margin: 0 }}>Solo para excepciones. Queda en la actividad del pedido y en la auditoría.</p>
        </section>
      )}
      {fecha === 'guardada' && <Toast title="Fecha cambiada" onClose={() => setFecha('cerrada')}>{fila.codigo} debe terminar el {new Date(`${nuevaFecha}T12:00:00`).toLocaleDateString('es-US', { weekday: 'short', day: 'numeric', month: 'short' })}. Motivo registrado.</Toast>}

      <div className="card" style={{ padding: 20 }}>
        <OrderTimeline current={cancelar === 'hecha' ? 0 : FICHA.etapaCiclo} dates={FICHA.fechasCiclo} paused={fila.estado === 'En pausa'} />
      </div>

      {cancelar === 'abierta' && (
        <section className="card stack" style={{ border: '2px solid var(--error-500)' }} aria-labelledby="pd-cancel">
          <div className="between"><h2 id="pd-cancel" style={{ fontSize: 18 }}>Cancelar pedido</h2><StatusChip status="No es automática" tone="warning" /></div>
          <div className="grid2" style={{ gap: 20 }}>
            <div className="stack" style={{ gap: 8 }}>
              <span className="ov">Cargo calculado por el sistema</span>
              {FICHA.cancelacion.lineas.map(([l, v]) => <div key={l} className="kv"><span>{l}</span><b>{v}</b></div>)}
              <hr className="stitch" />
              <div className="kv"><span><b style={{ color: 'var(--ink)' }}>Cargo calculado</b></span><b>{FICHA.cancelacion.cargo}</b></div>
              <div className="kv"><span>Adelanto pagado</span><b>{FICHA.cancelacion.adelanto}</b></div>
            </div>
            <div className="stack" style={{ gap: 10 }}>
              <span className="ov">Lo que se acuerda con el cliente</span>
              <TextField label="Cargo acordado ($)" inputMode="decimal" value={acordado} onChange={(e) => setAcordado(e.target.value)} hint="Puede negociarse; queda la diferencia y quién la aprobó" />
              <TextField label="Motivo de la cancelación y del acuerdo" required value={motivo} onChange={(e) => setMotivo(e.target.value)} error={motivo.trim() ? undefined : 'Escriba el motivo'} />
              <div className="kv"><span>Resultado</span><b>Sin cobro adicional · sin devolución</b></div>
              <div className="row">
                <button type="button" className="gw-btn gw-btn-danger" style={{ flex: 1 }} disabled={!motivo.trim()} onClick={() => setCancelar('hecha')}>Confirmar cancelación</button>
                <button type="button" className="gw-btn gw-btn-ghost" onClick={() => setCancelar('cerrada')}>Volver</button>
              </div>
              <p className="audit">Si el adelanto supera el cargo, se emite la devolución por la diferencia y queda registrada.</p>
            </div>
          </div>
        </section>
      )}
      {cancelar === 'hecha' && (
        <Alert tone="danger" title="Pedido cancelado (ejemplo)">Cargo acordado ${acordado} cubierto con el adelanto. La tela queda como stock a precio de compra. Registrado por Administrador · 13 oct, 12:10.</Alert>
      )}

      <div className="grid2">
        <section className="card pd-sec" aria-labelledby="pd-cot">
          <div className="between"><h2 id="pd-cot" style={{ fontSize: 17 }}>Cotización y versiones</h2><Link to="/admin/cotizaciones/cotizar" className="pd-lnk">Abrir</Link></div>
          {FICHA.versiones.map((v) => (
            <div key={v.codigo} className="pd-ver"><div><b>{v.codigo}</b><div className="muted" style={{ fontSize: 13 }}>{v.detalle}</div></div><div className="row"><b className="num">{v.total}</b><StatusChip status={v.estado} /></div></div>
          ))}
          <div className="pd-ver pd-ver-v2"><div><b>V2</b><div className="muted" style={{ fontSize: 13 }}>Se crea solo si producción reporta daño oculto</div></div><Link className="gw-btn gw-btn-ghost gw-btn-sm" to="/admin/cotizaciones/cotizar?modo=v2">Crear V2</Link></div>
          <div className="kv"><span>Precio sugerido · propuesto</span><b>{FICHA.precios.sugerido} · {FICHA.precios.propuesto}</b></div>
          <div className="kv"><span>Transporte</span><b>{FICHA.precios.transporte}</b></div>
        </section>

        <section className="card pd-sec" aria-labelledby="pd-pag">
          <div className="between"><h2 id="pd-pag" style={{ fontSize: 17 }}>Pagos y saldo</h2><Link to="/admin/pagos" className="pd-lnk">Registrar pago</Link></div>
          <div className="pd-tot">
            <div><span className="ov">Total</span><b className="num">{FICHA.pagos.total}</b></div>
            <div><span className="ov">Pagado</span><b className="num" style={{ color: 'var(--success-ink)' }}>{FICHA.pagos.pagado}</b></div>
            <div><span className="ov">Saldo</span><b className="num" style={{ color: 'var(--warning-ink)' }}>{FICHA.pagos.saldo}</b></div>
          </div>
          {FICHA.movPagos.map((m) => <div key={m.cuando} className="pd-mov"><span>{m.cuando}</span><span>{m.texto}</span><StatusChip status={m.estado} tone={m.estado === 'Pendiente' ? 'neutral' : undefined} /></div>)}
        </section>

        <section className="card pd-sec" aria-labelledby="pd-prod">
          <div className="between"><h2 id="pd-prod" style={{ fontSize: 17 }}>Avance de producción</h2><Link to="/taller" className="pd-lnk">Ver orden</Link></div>
          <div className="kv"><span>Terminar para</span><b>{FICHA.terminarPara} · quedan {p.quedan} días <span style={{ color: 'var(--success-ink)' }} aria-hidden="true">●</span></b></div>
          <div className="kv"><span>{p.tela}</span><b style={{ color: 'var(--success-ink)' }}>{p.telaEstado}</b></div>
          <div className="stack" style={{ gap: 6 }}>
            <div className="between" style={{ fontSize: 13 }}><span className="muted">Actividades ✓</span><b className="num">{p.actividades} · {p.avance} %</b></div>
            <div className="gw-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.avance} aria-label="Avance de producción"><span className="gw-progress-fill" style={{ width: `${p.avance}%` }} /></div>
          </div>
          <div className="kv"><span>Horas reales / estimadas</span><b>{p.horas}</b></div>
          {p.movimientos.map((m) => (
            <div key={m.cuando} className="pd-mov"><span>{m.cuando}</span><span>{m.texto}</span>{m.marca === 'plan' ? <span className="muted">plan</span> : <StatusChip status={m.marca} tone="warning" />}</div>
          ))}
        </section>

        <section className="card pd-sec" aria-labelledby="pd-desp">
          <div className="between"><h2 id="pd-desp" style={{ fontSize: 17 }}>Despacho</h2><Link to="/admin/salidas" className="pd-lnk">Salidas</Link></div>
          {FICHA.despacho.map((d) => <div key={d.cuando} className="pd-mov"><span>{d.cuando}</span><span>{d.texto}</span><StatusChip status={d.estado} tone={d.estado === 'Realizada' ? 'success' : 'neutral'} /></div>)}
          <div className="kv"><span>Lista de empaque</span><b>se genera al cerrar la orden (A11)</b></div>
        </section>
      </div>

      <section className="card pd-sec" aria-labelledby="pd-act">
        <div className="between"><h2 id="pd-act" style={{ fontSize: 17 }}>Actividad del pedido</h2><Link to="/admin/usuarios" className="pd-lnk">Auditoría completa</Link></div>
        {FICHA.actividad.map((a) => <div key={a.cuando} className="pd-mov"><span>{a.cuando}</span><span>{a.texto}</span><StatusChip status={a.chip} tone={a.tono} /></div>)}
      </section>
      <p className="audit">Cada acción de esta ficha queda en la auditoría con usuario, fecha y hora (A20).</p>
    </>
  );
}
