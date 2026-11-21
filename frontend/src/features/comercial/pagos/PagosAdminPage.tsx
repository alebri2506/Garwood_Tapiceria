import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { TopAdmin } from '../../../app/layout/AdminLayout';
import { API_URL } from '../../../shared/api/http';
import { PagosAdminConectada } from './PagosAdminConectada';
import { Icon, type IconName } from '../../../shared/ui/Icon';
import { POR_PAGINA, Paginacion } from '../../../shared/ui/Paginacion';
import { StatusChip } from '../../../shared/ui/StatusChip';
import { TextField } from '../../../shared/ui/TextField';
import { Toast } from '../../../shared/ui/Toast';
import {
  AYUDA_POR_METODO, COBROS_CONDUCTOR, CONFIRMADOS, METODOS_MANUALES, PEDIDOS_COBRO, REFERENCIA_POR_METODO, SALDO_CERRADO, dinero,
  type PagoConfirmado, type PagoHecho,
} from './datos';
import './pagos.css';

type Tono = 'warning' | 'danger' | 'success' | 'info';
type Modo = 'abierto' | 'rechazado' | 'confirmado';
const NOTAS = [
  'Cobros que el conductor registró en la entrega. Confirme cuando él le entregue el dinero o el cheque en el taller.',
  'Los pagos por pasarela entran solos y ya confirmados. Los manuales los registra usted con «+ Registrar pago manual».',
  'Lo que cada cliente aún no ha pagado. Saldo = total − pagos confirmados. Los cobros que el conductor ya hizo no se repiten aquí: están en «Por confirmar».',
];

/** Una fila de la lista, sea cual sea la pestaña. */
interface Fila {
  key: string; ped: string; cli: string; col2: string; col3: string; origen?: { texto: string; pasarela: boolean };
  monto: string; estado: string; tono: Tono;
}

/**
 * A5 Pagos (CU-C12 · diseño del 14/11): cobros del conductor por confirmar, pagos confirmados (pasarela y manuales) y
 * saldos pendientes. El Administrador registra los pagos manuales, que quedan confirmados al guardar.
 * Sin backend (VITE_API_URL vacío) se ve este ejemplo del diseño; con backend, PagosAdminConectada.
 */
export function PagosAdminPage() {
  return API_URL ? <PagosAdminConectada /> : <PagosAdminEjemplo />;
}

function PagosAdminEjemplo() {
  const [tab, setTab] = useState(0);
  const [sel, setSel] = useState(0);
  const [filtro, setFiltro] = useState(0);
  const [porPagina, setPorPagina] = useState(0);
  const [pagina, setPagina] = useState(0);
  const [modo, setModo] = useState<Record<string, Modo>>({});
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [rechazando, setRechazando] = useState<{ id: string; motivo: string; error?: string } | null>(null);
  const [extras, setExtras] = useState<Record<string, PagoHecho[]>>({});
  const [registrados, setRegistrados] = useState<PagoConfirmado[]>([]);
  const [anulados, setAnulados] = useState<Record<string, string>>({});
  const [anulando, setAnulando] = useState<{ id: string; motivo: string; error?: string } | null>(null);
  const [registro, setRegistro] = useState<{ ped: string; monto: string; met: number; ref: string; error?: string } | null>(null);
  const [toast, setToast] = useState<{ t: string; txt: string } | null>(null);
  const modoDe = (id: string) => modo[id] ?? 'abierto';

  // Cada pedido con sus pagos de hoy: los del ejemplo, los registrados aquí y el cobro del conductor ya confirmado.
  const pedidos = PEDIDOS_COBRO.map((p) => {
    const cobro = COBROS_CONDUCTOR.find((c) => c.id === p.cobro);
    let pagos = [...p.pagos, ...(extras[p.ped] ?? [])];
    if (cobro && modoDe(cobro.id) === 'confirmado') pagos.push({ l: `Saldo · ${cobro.met.toLowerCase()} (conductor)`, s: 'hoy', v: cobro.amt, id: cobro.id });
    pagos = pagos.filter((x) => !x.id || !anulados[x.id]);
    const pagado = pagos.reduce((a, x) => a + x.v, 0);
    const saldo = p.total - pagado;
    const faltaAdelanto = Boolean(p.adelanto) && pagado === 0;
    const enRevision = Boolean(cobro) && modoDe(cobro!.id) === 'abierto';
    const rechazado = Boolean(cobro) && modoDe(cobro!.id) === 'rechazado';
    return {
      ...p, pagos, pagado, saldo, enRevision, debe: faltaAdelanto ? p.adelanto! : saldo,
      estado: faltaAdelanto ? 'Falta adelanto' : 'Saldo pendiente', tono: (faltaAdelanto ? 'danger' : 'info') as Tono,
      est: rechazado ? `${p.est} · cobro rechazado` : p.est,
    };
  });
  const saldoDe = (ped: string) => pedidos.find((p) => p.ped === ped)?.saldo ?? SALDO_CERRADO[ped] ?? 0;
  // Un pedido con un cobro «Por confirmar» no se repite en Saldos: el dinero ya se cobró, solo falta verificarlo.
  const saldos = pedidos.filter((p) => p.saldo > 0 && !p.enRevision);

  const porConfirmar = COBROS_CONDUCTOR.filter((c) => modoDe(c.id) !== 'confirmado');
  const conductorConfirmados: PagoConfirmado[] = COBROS_CONDUCTOR.filter((c) => modoDe(c.id) === 'confirmado').map((c, i) => ({
    id: c.id, ped: c.ped, cli: c.cli, con: c.con, met: c.met, pasarela: false, amt: c.amt, when: 'hoy', who: 'Administrador · recibió el dinero del conductor', rec: `REC-013${2 + i}`,
  }));
  const todosConfirmados = [...registrados, ...conductorConfirmados, ...CONFIRMADOS];
  const confirmados = todosConfirmados.filter((r) => filtro === 0 || (filtro === 1 ? r.pasarela : !r.pasarela));

  const lista = tab === 0 ? porConfirmar.length : tab === 1 ? confirmados.length : saldos.length;
  const tam = POR_PAGINA[porPagina]!;
  const paginas = Math.max(1, Math.ceil(lista / tam));
  const pag = Math.min(pagina, paginas - 1);
  const desde = pag * tam;
  const visibles = <T,>(xs: T[]) => xs.slice(desde, desde + tam);

  const filas: Fila[] = tab === 0
    ? visibles(porConfirmar).map((c) => ({
        key: c.id, ped: c.ped, cli: c.cli, col2: c.con, col3: c.met, origen: { texto: 'Conductor', pasarela: false }, monto: dinero(c.amt),
        estado: modoDe(c.id) === 'rechazado' ? 'Rechazado' : 'Por confirmar', tono: modoDe(c.id) === 'rechazado' ? 'danger' : 'warning',
      }))
    : tab === 1
      ? visibles(confirmados).map((r) => ({
          key: r.id, ped: r.ped, cli: r.cli, col2: r.con, col3: r.met, origen: { texto: r.pasarela ? 'Pasarela' : 'Manual', pasarela: r.pasarela }, monto: dinero(r.amt),
          estado: anulados[r.id] ? 'Anulado' : 'Confirmado', tono: anulados[r.id] ? 'danger' : 'success',
        }))
      : visibles(saldos).map((p) => ({
          key: p.ped, ped: p.ped, cli: p.cli, col2: `${dinero(p.total)} · pagado ${dinero(p.pagado)}`, col3: p.est, monto: dinero(p.saldo), estado: p.estado, tono: p.tono,
        }));
  const i = Math.max(0, Math.min(sel, filas.length - 1));
  const actual = filas[i];

  // Cerrar el panel de registro con Escape.
  useEffect(() => {
    if (!registro) return;
    const cerrar = (e: KeyboardEvent) => { if (e.key === 'Escape') setRegistro(null); };
    window.addEventListener('keydown', cerrar);
    return () => window.removeEventListener('keydown', cerrar);
  }, [registro]);

  const cambiarTab = (t: number) => { setTab(t); setSel(0); setPagina(0); setRechazando(null); setAnulando(null); };

  // ---------------------------------------------------------------- Acciones
  const confirmarCobro = (id: string) => {
    setModo({ ...modo, [id]: 'confirmado' });
    setRechazando(null);
    setSel(0);
    setToast({ t: 'Cobro confirmado', txt: 'Se emitió el recibo y el saldo del pedido quedó en $0.' });
  };
  const enviarRechazo = () => {
    if (!rechazando) return;
    if (!rechazando.motivo.trim()) { setRechazando({ ...rechazando, error: 'Escriba el motivo del rechazo.' }); return; }
    setModo({ ...modo, [rechazando.id]: 'rechazado' });
    setMotivos({ ...motivos, [rechazando.id]: rechazando.motivo.trim() });
    setRechazando(null);
    setToast({ t: 'Cobro rechazado', txt: 'Quedó registrado el motivo. El pedido vuelve a «Saldos pendientes».' });
  };
  const enviarAnulacion = () => {
    if (!anulando) return;
    if (!anulando.motivo.trim()) { setAnulando({ ...anulando, error: 'Escriba el motivo de la anulación.' }); return; }
    setAnulados({ ...anulados, [anulando.id]: anulando.motivo.trim() });
    setAnulando(null);
    setToast({ t: 'Pago anulado', txt: 'Quedó registrado quién lo anuló y por qué. El saldo del pedido volvió a subir.' });
  };

  const disponibles = pedidos.filter((p) => !p.enRevision && p.debe > 0);
  const abrirRegistro = (ped?: string) => {
    const p = disponibles.find((x) => x.ped === ped) ?? disponibles[0];
    if (p) setRegistro({ ped: p.ped, monto: p.debe.toFixed(2), met: 0, ref: '' });
  };
  const pedReg = registro ? pedidos.find((p) => p.ped === registro.ped)! : null;
  const montoReg = registro ? Number(registro.monto) : 0;
  const guardarRegistro = () => {
    if (!registro || !pedReg) return;
    if (!registro.monto.trim() || Number.isNaN(montoReg) || montoReg <= 0) { setRegistro({ ...registro, error: 'Escriba el monto recibido.' }); return; }
    if (montoReg > pedReg.saldo) { setRegistro({ ...registro, error: `No puede ser mayor que lo que debe el pedido (${dinero(pedReg.saldo)}).` }); return; }
    const met = METODOS_MANUALES[registro.met]!;
    const id = `m${Date.now()}`;
    const concepto = pedReg.adelanto && pedReg.pagado === 0 ? 'Adelanto 40 %' : 'Saldo';
    setExtras({ ...extras, [pedReg.ped]: [...(extras[pedReg.ped] ?? []), { l: `Pago manual · ${met.toLowerCase()}`, s: 'hoy, ahora', v: montoReg, id }] });
    setRegistrados([{ id, ped: pedReg.ped, cli: pedReg.cli, con: concepto, met, pasarela: false, amt: montoReg, when: 'hoy, ahora', who: 'Administrador · en el local', rec: `REC-0${134 + registrados.length}` }, ...registrados]);
    setToast({ t: 'Pago registrado y confirmado', txt: `${pedReg.ped} · pago en ${met.toLowerCase()}. Se emitió el recibo y el saldo quedó en ${dinero(pedReg.saldo - montoReg)}.` });
    setRegistro(null);
    cambiarTab(2);
  };

  // ---------------------------------------------------------------- Indicadores
  const pendientes = porConfirmar.filter((c) => modoDe(c.id) === 'abierto');
  const hoy = todosConfirmados.filter((r) => r.when.startsWith('hoy') && !anulados[r.id]);
  const suma = (xs: { amt: number }[]) => xs.reduce((a, r) => a + r.amt, 0);
  const indicadores: { cls: string; icono: IconName; l: string; v: string; s: string }[] = [
    { cls: 'pa-kp pa-w', icono: 'clock', l: 'Por confirmar', v: dinero(suma(pendientes)), s: `${pendientes.length} ${pendientes.length === 1 ? 'cobro del conductor' : 'cobros del conductor'}` },
    { cls: 'pa-kp pa-o', icono: 'check', l: 'Cobrado hoy', v: dinero(suma(hoy)), s: `${hoy.length} pagos · pasarela y manuales` },
    { cls: 'pa-kp pa-b', icono: 'payment', l: 'Saldo por cobrar', v: dinero(saldos.reduce((a, p) => a + p.saldo, 0)), s: `${saldos.length} pedidos con saldo pendiente` },
  ];
  const cabecera = tab === 2 ? ['Total · pagado', 'Estado del pedido', 'Le falta'] : ['Concepto', 'Método', 'Monto'];

  return (
    <>
      <TopAdmin crumb="Comercial › Pagos" titulo="Pagos">
        <button type="button" className="gw-btn gw-btn-primary" onClick={() => abrirRegistro()} disabled={disponibles.length === 0}>+ Registrar pago manual</button>
      </TopAdmin>

      <div className="pa-kp3">
        {indicadores.map((k) => (
          <div key={k.l} className={k.cls}>
            <i aria-hidden="true"><Icon name={k.icono} size={20} /></i>
            <div><span>{k.l}</span><b>{k.v}</b><small>{k.s}</small></div>
          </div>
        ))}
      </div>

      {toast && <Toast title={toast.t} onClose={() => setToast(null)}>{toast.txt}</Toast>}

      <div className="pa-pl">
        <div className="stack" style={{ gap: 12 }}>
          <div className="pa-tabs" role="tablist" aria-label="Pagos">
            {([['Por confirmar', pendientes.length], ['Confirmados', todosConfirmados.length], ['Saldos pendientes', saldos.length]] as const).map(([l, n], t) => (
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
              <button key={f.key} type="button" className={k === i ? 'pa-lr on' : 'pa-lr'} aria-pressed={k === i} onClick={() => { setSel(k); setRechazando(null); setAnulando(null); }}>
                <span><b>{f.ped}</b><small>{f.cli}</small></span>
                <span className="pa-c2">{f.col2}</span>
                <span className="pa-c3"><span style={{ display: 'block' }}>{f.col3}</span>{f.origen && <span className={f.origen.pasarela ? 'pa-og pa-pw' : 'pa-og'}>{f.origen.texto}</span>}</span>
                <span className="pa-am">{f.monto}</span>
                <span className="pa-stc"><StatusChip status={f.estado} tone={f.tono} /></span>
              </button>
            ))}
            {filas.length === 0 && <p className="pa-nota pa-vacio">{tab === 0 ? 'No hay cobros por confirmar.' : tab === 1 ? 'No hay pagos con este filtro.' : 'Ningún pedido tiene saldo pendiente.'}</p>}
            <Paginacion total={lista} pagina={pag} porPagina={tam} onPagina={(n) => { setPagina(n); setSel(0); }} onPorPagina={(n) => { setPorPagina(POR_PAGINA.indexOf(n)); setPagina(0); setSel(0); }} />
            <p className="pa-nota">{NOTAS[tab]}</p>
          </div>
        </div>

        <aside className="pa-dp" aria-label="Detalle del pago">
          {!actual ? <p className="pa-hint">Elija un pago de la lista para ver el detalle.</p> : tab === 0 ? (() => {
            const c = porConfirmar.find((x) => x.id === actual.key)!;
            const rech = modoDe(c.id) === 'rechazado';
            return (
              <>
                <Cabecera ov="Cobro en la entrega · por confirmar" ped={c.ped} cli={c.cli} estado={actual.estado} tono={actual.tono} />
                <div><span className="muted" style={{ fontSize: 13 }}>{c.con}</span><div className="pa-big">{dinero(c.amt)}</div></div>
                <Datos kv={[['Método', c.met], ['Referencia', c.ref], ['Registrado por', 'Conductor'], ['Cuándo', c.when], ...(rech ? [['Motivo del rechazo', motivos[c.id] ?? '']] as [string, string][] : [])]} />
                {!rech && (
                  <>
                    <div className="pa-prev"><span>Saldo del pedido al confirmar</span><b>{dinero(saldoDe(c.ped) - c.amt)}</b></div>
                    {rechazando?.id === c.id && (
                      <TextField label="Motivo del rechazo" required autoFocus placeholder="Ej.: el cheque no tiene fondos" value={rechazando.motivo} error={rechazando.error}
                        onChange={(e) => setRechazando({ id: c.id, motivo: e.target.value })} />
                    )}
                    <div className="row pa-acc">
                      <button type="button" className="gw-btn gw-btn-primary" style={{ flex: 2 }} onClick={() => confirmarCobro(c.id)}>Confirmar: recibí el dinero</button>
                      <button type="button" className="gw-btn gw-btn-secondary" style={{ flex: 1 }} onClick={() => (rechazando?.id === c.id ? enviarRechazo() : setRechazando({ id: c.id, motivo: '' }))}>
                        {rechazando?.id === c.id ? 'Enviar rechazo' : 'Rechazar'}
                      </button>
                    </div>
                  </>
                )}
                <Link className="gw-btn gw-btn-ghost gw-btn-sm pa-self" to={`/admin/pedidos/${c.ped}`}>Ver ficha del pedido</Link>
              </>
            );
          })() : tab === 1 ? (() => {
            const r = todosConfirmados.find((x) => x.id === actual.key)!;
            const anulado = anulados[r.id];
            return (
              <>
                <Cabecera ov={r.pasarela ? 'Pago por pasarela' : 'Pago manual'} ped={r.ped} cli={r.cli} estado={actual.estado} tono={actual.tono} />
                <div><span className="muted" style={{ fontSize: 13 }}>{r.con}</span><div className="pa-big">{dinero(r.amt)}</div></div>
                <Datos kv={[
                  ['Método', r.met], ['Confirmado por', r.who], ['Cuándo', r.when],
                  ...(r.comision ? [['Comisión de la pasarela', r.comision], ['Neto para el taller', r.neto!]] as [string, string][] : []),
                  ['Saldo del pedido ahora', dinero(saldoDe(r.ped) + (anulado && !pedidos.some((p) => p.ped === r.ped) ? r.amt : 0))],
                  ...(anulado ? [['Motivo de la anulación', anulado]] as [string, string][] : []),
                ]} />
                <a className="pa-rcp" href="#" onClick={(e) => e.preventDefault()}>
                  <span aria-hidden="true"><Icon name="clipboard" size={20} /></span>
                  <span><b>Recibo {r.rec}</b><small>Recibo enviado al cliente por correo y en su cuenta · PDF</small></span>
                </a>
                {!r.pasarela && !anulado && (anulando?.id === r.id ? (
                  <div className="stack" style={{ gap: 8 }}>
                    <TextField label="Motivo de la anulación" required autoFocus placeholder="Ej.: el banco devolvió el cheque" value={anulando.motivo} error={anulando.error}
                      onChange={(e) => setAnulando({ id: r.id, motivo: e.target.value })} />
                    <div className="row pa-acc">
                      <button type="button" className="gw-btn gw-btn-danger gw-btn-sm" onClick={enviarAnulacion}>Anular pago</button>
                      <button type="button" className="gw-btn gw-btn-ghost gw-btn-sm" onClick={() => setAnulando(null)}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="pa-adj pa-self" onClick={() => setAnulando({ id: r.id, motivo: '' })}>Anular este pago (con motivo)</button>
                ))}
                <Link className="gw-btn gw-btn-ghost gw-btn-sm pa-self" to={`/admin/pedidos/${r.ped}`}>Ver ficha del pedido</Link>
              </>
            );
          })() : (() => {
            const p = saldos.find((x) => x.ped === actual.key)!;
            const pct = Math.round((p.pagado / p.total) * 100);
            return (
              <>
                <Cabecera ov="Saldo del pedido" ped={p.ped} cli={p.cli} estado={p.estado} tono={p.tono} />
                <div><span className="muted" style={{ fontSize: 13 }}>Le falta pagar</span><div className="pa-big">{dinero(p.saldo)}</div></div>
                <Datos kv={[['Total del pedido', dinero(p.total)], ['Pagado', dinero(p.pagado)], ['Estado del pedido', p.est], ...(p.adelanto && p.pagado === 0 ? [['Adelanto pedido', `${dinero(p.adelanto)} (40 %)`]] as [string, string][] : [])]} />
                <div className="pa-bar" role="progressbar" aria-label="Porcentaje pagado" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
                <span className="muted" style={{ fontSize: 12.5, marginTop: -6 }}>Pagado {pct} % del total</span>
                <span className="ov">Pagos de este pedido</span>
                <div className="pa-hist">
                  {p.pagos.length ? p.pagos.map((h, k) => <div key={k}><span>{h.l}<br /><small>{h.s}</small></span><b>{dinero(h.v)}</b></div>)
                    : <div><span>Aún no hay pagos<br /><small>{p.adelanto ? 'Paga el adelanto por la pasarela o en el taller' : 'Adelanto 0 %: paga al final'}</small></span><b>—</b></div>}
                </div>
                <button type="button" className="gw-btn gw-btn-primary gw-btn-block" onClick={() => abrirRegistro(p.ped)}>Registrar pago de este pedido</button>
                <Link className="gw-btn gw-btn-ghost gw-btn-sm pa-self" to={`/admin/pedidos/${p.ped}`}>Ver ficha del pedido</Link>
              </>
            );
          })()}
        </aside>
      </div>

      {registro && pedReg && createPortal(
        <>
          <div className="pa-dim" aria-hidden="true" onClick={() => setRegistro(null)} />
          <aside className="pa-drw" role="dialog" aria-modal="true" aria-labelledby="pa-reg-t">
            <div className="pa-drh">
              <div><h2 id="pa-reg-t">Registrar pago manual</h2><p>Para lo que el cliente pagó en persona o fuera de la pasarela. Queda confirmado al guardar.</p></div>
              <button type="button" className="pa-xb" aria-label="Cerrar" onClick={() => setRegistro(null)}><Icon name="x" size={18} /></button>
            </div>
            <div className="pa-drb">
              <label className="stack" style={{ gap: 6 }}>
                <span className="gw-field-label">Pedido</span>
                <select className="pa-sel" value={registro.ped} onChange={(e) => {
                  const p = pedidos.find((x) => x.ped === e.target.value)!;
                  setRegistro({ ...registro, ped: p.ped, monto: p.debe.toFixed(2), error: undefined });
                }}>
                  {disponibles.map((p) => <option key={p.ped} value={p.ped}>{`${p.ped} · ${p.cli} · debe ${dinero(p.debe)} ${p.adelanto && p.pagado === 0 ? '(adelanto)' : '(saldo)'}`}</option>)}
                </select>
                <small className="muted" style={{ fontSize: 12.5 }}>Total {dinero(pedReg.total)} · pagado {dinero(pedReg.pagado)} · {pedReg.est}</small>
              </label>
              <div className="grid2" style={{ gap: 12 }}>
                <TextField label="Monto recibido" prefix="$" inputMode="decimal" value={registro.monto} error={registro.error}
                  onChange={(e) => setRegistro({ ...registro, monto: e.target.value, error: undefined })} />
                <TextField label="Concepto" value={pedReg.adelanto && pedReg.pagado === 0 ? 'Adelanto 40 %' : 'Saldo'} readOnly hint="Según lo que debe el pedido" />
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
              <TextField label="Referencia" optional placeholder={REFERENCIA_POR_METODO[registro.met]} value={registro.ref} onChange={(e) => setRegistro({ ...registro, ref: e.target.value })} />
              <div className="pa-prev"><span>Saldo del pedido después de este pago</span><b>{dinero(Math.max(0, pedReg.saldo - (Number.isNaN(montoReg) ? 0 : montoReg)))}</b></div>
            </div>
            <div className="pa-drf">
              <button type="button" className="gw-btn gw-btn-primary" style={{ flex: 1 }} onClick={guardarRegistro}>Guardar pago</button>
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
