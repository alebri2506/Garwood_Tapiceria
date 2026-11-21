import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { API_URL, ApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { Icon } from '../../../shared/ui/Icon';
import { StatusChip } from '../../../shared/ui/StatusChip';
import { Toast } from '../../../shared/ui/Toast';
import { MESES, fechaCorta, fechaLarga } from '../fechas';
import { TELEFONO_TALLER } from '../pedidos/DetallePedido';
import { GrillaRecojo, deIso, type HoraElegida } from '../atender/GrillaRecojo';
import type { Disponibilidad } from '../atender/atencionApi';
import { MOTIVOS_RECHAZO, miCotizacionApi, type MiCotizacion, type MotivoRechazo, type MuebleCotizado } from './miCotizacionApi';
import { CLAVE_PUBLICA, PagoIncrustado } from './PagoIncrustado';
import './micotizacion.css';

/**
 * W4 Mi cotización (CU-C09, C11, C14): el cliente ve qué haremos, la tela, el traslado, el total y el adelanto, y la
 * responde. Rechazar funciona; aceptar sin adelanto genera el pedido y elige el recojo. «Aceptar y pagar el adelanto»
 * espera la pasarela de pago: se muestra, pero todavía no hace nada (decisión de Alejandro, 15/11).
 */
export function MiCotizacionPage() {
  const [params] = useSearchParams();
  const codigo = params.get('solicitud');
  if (!API_URL) return <EmptyState icon="quote" title="Mi cotización">Esta pantalla necesita la API del taller.</EmptyState>;
  if (!codigo) {
    return <EmptyState icon="quote" title="Elija una cotización">Ábrala desde <Link to="/cliente/pedidos/solicitudes">Mis pedidos › Solicitudes y cotizaciones</Link>.</EmptyState>;
  }
  return <Cotizacion key={codigo} solicitud={codigo} />;
}

const dolares = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const mensaje = (e: unknown, def: string) => (e instanceof ApiError ? e.message : def);
const nombreMueble = (m: MuebleCotizado) => (m.cantidad > 1 ? `${m.tipo} × ${m.cantidad}` : m.tipo);
/** «Chenille Marfil 12 · color 1»: el pattern solo si el nombre no lo trae ya. */
const nombreTela = (t: MuebleCotizado['telas'][number]) =>
  [t.nombre, t.pattern && !t.nombre.includes(t.pattern) && `Pattern ${t.pattern}`, t.numeroColor && `color ${t.numeroColor}`].filter(Boolean).join(' · ');
/** Una tela: el recuadro de su color con el nombre. Varias (por partes): la lista de muestras, cada una con su color. */
function TelasDelMueble({ m }: { m: MuebleCotizado }) {
  if (m.telas.length === 1) {
    const t = m.telas[0]!;
    return (
      <span className="w4-ph tela" style={{ background: t.colorHex ? `linear-gradient(135deg, ${t.colorHex}, color-mix(in srgb, ${t.colorHex} 70%, #fff))` : 'var(--primary)' }}>
        {nombreTela(t)}
      </span>
    );
  }
  return (
    <div className="w4-ph w4-telas">
      <span className="ov">{m.telas.length} telas · una por cada parte</span>
      <ul>
        {m.telas.map((t) => (
          <li key={nombreTela(t)}><i style={{ background: t.colorHex ?? 'var(--surface-sunken)' }} aria-hidden="true" /><span>{nombreTela(t)}</span></li>
        ))}
      </ul>
    </div>
  );
}
const telefono = <a href={`tel:${TELEFONO_TALLER.tel}`}>{TELEFONO_TALLER.texto}</a>;

/** Lo que pasó al volver de la página de pago (Stripe). */
type Retorno = { tipo: 'pagado'; pedido: string | null } | { tipo: 'confirmando' } | { tipo: 'cancelado' } | null;

function Cotizacion({ solicitud }: { solicitud: string }) {
  const [params, setParams] = useSearchParams();
  const [c, setC] = useState<MiCotizacion | null>(null);
  const [error, setError] = useState<{ texto: string; status: number } | null>(null);
  const [retorno, setRetorno] = useState<Retorno>(null);
  const cargar = useCallback(() => {
    miCotizacionApi.ver(solicitud).then(setC).catch((e) => setError({ texto: mensaje(e, 'No pudimos cargar su cotización.'), status: e instanceof ApiError ? e.status : 0 }));
  }, [solicitud]);
  useEffect(cargar, [cargar]);

  // Vuelve de la pasarela: se confirma el cobro sin esperar el aviso de Stripe y se limpia la dirección.
  const pago = params.get('pago');
  const sesion = params.get('sesion');
  useEffect(() => {
    if (!pago) return;
    setParams({ solicitud }, { replace: true });
    if (pago === 'cancelado') { setRetorno({ tipo: 'cancelado' }); return; }
    if (pago !== 'ok' || !sesion) return;
    setRetorno({ tipo: 'confirmando' });
    miCotizacionApi.confirmarPago(solicitud, sesion)
      .then((r) => setRetorno(r.estado === 'registrado' ? { tipo: 'pagado', pedido: r.pedido } : { tipo: 'confirmando' }))
      .catch(() => setRetorno({ tipo: 'confirmando' }))
      .finally(cargar);
  }, [pago, sesion, solicitud, setParams, cargar]);

  if (error) {
    return (
      <EmptyState icon="quote" title={error.status === 404 ? 'Cotización no disponible' : 'No pudimos cargar su cotización'}>
        {error.texto} <Link to="/cliente/pedidos/solicitudes">Volver a Mis pedidos</Link>
      </EmptyState>
    );
  }
  if (!c) return <p className="muted" role="status">Cargando su cotización…</p>;
  return <Vista c={c} recargar={cargar} retorno={retorno} />;
}

function Vista({ c, recargar, retorno }: { c: MiCotizacion; recargar(): void; retorno: Retorno }) {
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState<MotivoRechazo | null>(null);
  const [detalle, setDetalle] = useState('');
  const [nota, setNota] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recienGenerado, setRecienGenerado] = useState(false);
  /** Pago del adelanto abierto dentro de W4 (Stripe incrustado). */
  const [checkout, setCheckout] = useState<string | null>(null);
  // El panel del rechazo queda en la columna izquierda: al abrirlo se lleva a la vista.
  useEffect(() => { if (rechazando) document.getElementById('w4-rech')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [rechazando]);

  const abierta = c.estado === 'Pendiente de respuesta';
  const varios = c.muebles.length > 1;
  const saldo = c.total - c.adelanto;
  const servicio = c.muebles.reduce((t, m) => t + m.precio, 0);
  const conTela = c.muebles.some((m) => m.telas.length);
  const delivery = c.traslado === 'delivery';
  const publicada = c.publicada ? fechaCorta(new Date(c.publicada)) : null;
  const vence = c.vigenciaHasta ? fechaCorta(deIso(c.vigenciaHasta)) : null;
  const uno = c.muebles[0]!;

  /**
   * «Aceptar y pagar el adelanto»: con la clave pública de Stripe el pago se abre DENTRO de W4 (incrustado); sin ella,
   * en la página segura de Stripe. En ambos casos GARWEB no ve los datos de la tarjeta.
   */
  const pagar = async () => {
    setOcupado(true); setError(null);
    try {
      const r = await miCotizacionApi.pagar(c.solicitud, nota.trim() || undefined, Boolean(CLAVE_PUBLICA));
      if (r.clientSecret) { setCheckout(r.clientSecret); setOcupado(false); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      if (r.url) window.location.assign(r.url);
    } catch (e) { setError(mensaje(e, 'No pudimos abrir el pago. Intente de nuevo.')); setOcupado(false); }
  };

  const responder = async (r: Parameters<typeof miCotizacionApi.responder>[1]) => {
    setOcupado(true); setError(null);
    try {
      const res = await miCotizacionApi.responder(c.solicitud, r);
      if (res.pedido) setRecienGenerado(true);
      setRechazando(false);
      recargar();
    } catch (e) { setError(mensaje(e, 'No pudimos guardar su respuesta. Intente de nuevo.')); } finally { setOcupado(false); }
  };

  const hola = varios
    ? `Hola, ${c.nombre}. Esta es la cotización para sus ${c.muebles.length} muebles. Abajo verá qué haremos con cada uno y cuánto cuesta.`
    : `Hola, ${c.nombre}. Esta es la cotización para su ${uno.tipo.toLowerCase()}${uno.telas.length ? ', con la tela que eligió' : ''}.`;
  const comunes = [
    ...(delivery ? [varios ? `Recojo en su casa y entrega de los ${c.muebles.length} muebles en un solo viaje` : `Recojo en su casa y entrega del ${uno.tipo.toLowerCase()} terminado`] : []),
    varios ? 'Revisión de cada mueble al recibirlo, antes de empezar' : 'Revisión del mueble al recibirlo, antes de empezar',
  ];

  // Pagando: solo el panel del pago (nuestro resumen + el formulario de Stripe), sin distraer con el resto.
  if (checkout) {
    return (
      <div className="stack w4-pagina" style={{ gap: 20 }}>
        <div className="whead">
          <div>
            <div className="crumb"><Link to="/cliente/pedidos/solicitudes">Mis pedidos › Solicitudes</Link> › {c.codigo}</div>
            <h1>Pagar el adelanto</h1>
          </div>
        </div>
        <PagoIncrustado c={c} clientSecret={checkout} onVolver={() => setCheckout(null)} />
      </div>
    );
  }

  return (
    <div className="stack w4-pagina" style={{ gap: 20 }}>
      <div className="whead">
        <div>
          <div className="crumb"><Link to="/cliente/pedidos/solicitudes">Mis pedidos › Solicitudes</Link> › {c.codigo}</div>
          <h1>Mi cotización</h1>
        </div>
        <StatusChip status={c.estado} size="lg" />
      </div>

      {abierta && c.diasRestantes != null && (
        <div className="w4-count">
          <Icon name="clock" size={26} />
          <b>{c.diasRestantes}</b>
          <div>
            <b>{c.diasRestantes === 0 ? 'Vence hoy' : c.diasRestantes === 1 ? 'día para responder' : 'días para responder'}</b>
            <small>Válida hasta el {vence}{publicada ? `. Se publicó el ${publicada}.` : '.'}</small>
          </div>
        </div>
      )}

      {c.estado === 'Aceptada' && c.pedido && c.eligeRecojo && (
        <div className="stack" style={{ gap: 12 }}>
          {retorno?.tipo === 'pagado' && <Toast tone="success" title={`Pago aprobado · pedido ${c.pedido.codigo} generado`}>Recibimos su adelanto de {dolares(c.adelanto)} con tarjeta. El recibo le llega por correo. Ahora elija el día del recojo.</Toast>}
          {recienGenerado && <Toast tone="success" title={`Pedido ${c.pedido.codigo} generado`}>No necesita adelanto. Ahora elija el día del recojo.</Toast>}
          <ElegirRecojo c={c} onListo={recargar} />
        </div>
      )}

      <div className="wcols">
        <div className="wl">
          <section className="card stack">
            <p style={{ fontSize: 16, lineHeight: '24px', margin: 0 }}>{hola}</p>
            {!varios && (
              <div className="w4-fotos">
                <span className="w4-ph">{uno.foto ? <img src={uno.foto} alt={`Foto de su ${uno.tipo.toLowerCase()}`} /> : <Icon name="image" size={28} />}</span>
                {uno.telas.length > 0 && <TelasDelMueble m={uno} />}
              </div>
            )}
          </section>

          <section className="card stack" aria-labelledby="w4-trab">
            <h2 id="w4-trab" style={{ fontSize: 18 }}>{varios ? `Trabajos que haremos · ${c.muebles.length} muebles` : 'Trabajos que haremos'}</h2>
            {varios ? (
              <>
                <div className="w4-mlist">
                  {c.muebles.map((m, i) => (
                    <div key={i} className="w4-mcard">
                      <span className="w4-mth">{m.foto ? <img src={m.foto} alt="" /> : <Icon name="sofa" size={28} />}</span>
                      <div className="w4-mbd">
                        <div className="between" style={{ alignItems: 'flex-start', gap: 12 }}>
                          <div style={{ minWidth: 0 }}><span className="ov">Mueble {i + 1}</span><b className="w4-mname">{nombreMueble(m)}</b></div>
                          <b className="w4-mprice">{dolares(m.precio)}</b>
                        </div>
                        {m.telas.length > 0
                          ? <div className="w4-fabs">{m.telas.map((t) => <span key={nombreTela(t)} className="w4-fab"><i style={{ background: t.colorHex ?? 'var(--surface-sunken)' }} />{nombreTela(t)}</span>)}</div>
                          : m.tela && <span className="w4-fab"><i style={{ background: 'var(--surface-sunken)' }} />{m.tela}</span>}
                        <ul className="w4-jobs sm">{(m.trabajos.length ? m.trabajos : [m.servicio]).map((j) => <li key={j}><Icon name="check" size={16} /><span>{j}</span></li>)}</ul>
                      </div>
                    </div>
                  ))}
                </div>
                <span className="ov" style={{ marginTop: 4 }}>Para todo el pedido</span>
                <ul className="w4-jobs">{comunes.map((j) => <li key={j}><Icon name="check" size={18} /><span>{j}</span></li>)}</ul>
              </>
            ) : (
              <ul className="w4-jobs">
                {[...(uno.trabajos.length ? uno.trabajos : [uno.servicio]), ...comunes].map((j) => <li key={j}><Icon name="check" size={18} /><span>{j}</span></li>)}
              </ul>
            )}
            <hr className="stitch" />
            <div className="w4-kvs">
              <div className="kv"><span>Traslado</span><b>{delivery ? 'Recojo y entrega a domicilio' : 'Lo lleva usted al taller'}</b></div>
              {delivery && c.direccion && <div className="kv"><span>Dirección</span><b>{c.direccion}</b></div>}
              {!varios && !uno.telas.length && uno.tela && <div className="kv"><span>Tela</span><b>{uno.tela}</b></div>}
            </div>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>El precio del servicio ya incluye {conTela ? 'tela, ' : ''}materiales y mano de obra.</p>
          </section>

          {c.observaciones.length > 0 && (
            <section className="card stack w4-obs" aria-labelledby="w4-obs">
              <div className="between" style={{ flexWrap: 'wrap' }}><h2 id="w4-obs" style={{ fontSize: 18 }}>Observaciones del taller</h2>{publicada && <span className="muted" style={{ fontSize: 12.5 }}>Taller · {publicada}</span>}</div>
              <ul className="w4-obsl">{c.observaciones.map((o) => <li key={o}><Icon name="info" size={18} /><span>{o}</span></li>)}</ul>
              <span className="muted" style={{ fontSize: 13 }}>¿Dudas? Escríbalas al responder o llámenos al {telefono}.</span>
            </section>
          )}

          {rechazando && abierta && (
            <section className="card stack" aria-labelledby="w4-rech">
              <div className="between"><h2 id="w4-rech" style={{ fontSize: 18 }}>¿Por qué la rechaza?</h2><span className="pill" style={{ background: 'var(--danger-soft)', color: 'var(--danger-ink)' }}>Obligatorio</span></div>
              <div className="w4-chips" role="group" aria-label="Motivo del rechazo">
                {MOTIVOS_RECHAZO.map((m) => <button key={m.id} type="button" aria-pressed={motivo === m.id} onClick={() => setMotivo(m.id)}>{m.l}</button>)}
              </div>
              <div className="gw-field">
                <label className="gw-field-label" htmlFor="w4-com">Comentario <span className="muted">(opcional)</span></label>
                <textarea id="w4-com" className="gw-input gw-textarea" rows={3} maxLength={500} value={detalle} placeholder="Si quiere, cuéntenos más" onChange={(e) => setDetalle(e.target.value)} />
              </div>
              {!motivo && <span className="muted" style={{ fontSize: 13 }}>Elija un motivo para poder confirmar.</span>}
              {error && <Alert tone="danger" title="No se guardó">{error}</Alert>}
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="gw-btn gw-btn-danger" disabled={!motivo || ocupado} onClick={() => motivo && responder({ respuesta: 'rechaza', motivo, comentario: detalle.trim() || undefined })}>{ocupado ? 'Guardando…' : 'Confirmar rechazo'}</button>
                <button type="button" className="gw-btn gw-btn-ghost" onClick={() => setRechazando(false)}>Volver</button>
              </div>
            </section>
          )}
        </div>

        <aside className="wr">
          <section className="card stack w4-tot" style={{ gap: 10 }} aria-label={`Cotización ${c.codigo}`}>
            <div className="between"><span className="ov">Cotización {c.codigo}</span>{vence && abierta && <span className="muted" style={{ fontSize: 12.5 }}>Válida hasta el {vence}</span>}</div>
            {varios
              ? c.muebles.map((m, i) => <div key={i} className="w4-line"><span>{nombreMueble(m)}</span><b>{dolares(m.precio)}</b></div>)
              : <div className="w4-line"><span>Precio del servicio</span><b>{dolares(servicio)}</b></div>}
            {c.transporte > 0 && <div className="w4-line"><span>{varios ? 'Transporte · un solo viaje' : 'Transporte ida y vuelta'}</span><b>{dolares(c.transporte)}</b></div>}
            <hr className="stitch" />
            <div className="w4-big"><span>Total</span><b>{dolares(c.total)}</b></div>
          </section>

          <section className="card stack" style={{ gap: 8 }}>
            <div className="kv"><span>{c.adelanto > 0 ? `Adelanto para generar el pedido · ${c.adelantoPct} %` : 'Adelanto'}</span><b>{c.adelanto > 0 ? dolares(c.adelanto) : 'No se requiere (0 %)'}</b></div>
            <div className="kv"><span>{varios ? 'Saldo al recibir sus muebles' : `Saldo al recibir su ${uno.tipo.toLowerCase()}`}</span><b>{dolares(saldo)}</b></div>
            <p className="muted" style={{ fontSize: 13, lineHeight: '19px', margin: 0 }}>
              {c.adelanto > 0
                ? 'Aún no tiene un pedido cerrado con nosotros. Su pedido se genera cuando el taller confirma el adelanto.'
                : 'Ya tiene pedidos cerrados con nosotros: no pedimos adelanto y su pedido se genera en cuanto acepta.'}
            </p>
          </section>

          {abierta && (
            <>
              <span id="decidir" />
              {varios && (
                <div className="w4-partial"><Icon name="info" size={18} /><span>La cotización se acepta completa. <b>¿Quiere hacer solo algunos muebles?</b> Llámenos al {telefono} y le enviamos una cotización nueva solo con esos.</span></div>
              )}
              <div className="gw-field">
                <label className="gw-field-label" htmlFor="w4-nota">¿Algo que debamos saber? <span className="muted">(opcional)</span></label>
                <textarea id="w4-nota" className="gw-input gw-textarea" rows={2} maxLength={500} value={nota} placeholder="Ej.: prefiero que el recojo sea por la tarde" onChange={(e) => setNota(e.target.value)} />
              </div>
              {error && !rechazando && <Alert tone="danger" title="No se guardó">{error}</Alert>}
              {c.adelanto > 0 ? (
                <>
                  <button type="button" className="gw-btn gw-btn-primary gw-btn-lg gw-btn-block" disabled={ocupado} aria-describedby="w4-pago" onClick={pagar}>
                    {ocupado ? 'Abriendo el pago…' : `Aceptar y pagar el adelanto · ${dolares(c.adelanto)}`}
                  </button>
                  <span id="w4-pago" className="w4-nota"><Icon name="lock" size={13} /> {CLAVE_PUBLICA ? 'Paga aquí mismo con tarjeta de crédito o débito, en el formulario seguro de Stripe.' : 'Se abre la página segura de pago (Stripe) para pagar con tarjeta de crédito o débito.'} GARWEB nunca ve ni guarda los datos de su tarjeta.</span>
                </>
              ) : (
                <button type="button" className="gw-btn gw-btn-primary gw-btn-lg gw-btn-block" disabled={ocupado} onClick={() => responder({ respuesta: 'acepta', comentario: nota.trim() || undefined })}>
                  {ocupado ? 'Generando su pedido…' : 'Aceptar y generar el pedido'}
                </button>
              )}
              <button type="button" className="gw-btn gw-btn-ghost gw-btn-block" onClick={() => { setRechazando(true); setError(null); }}>Rechazar</button>
            </>
          )}

          {retorno?.tipo === 'cancelado' && abierta && (
            <Alert tone="info" title="No se completó el pago">No se cobró nada. Puede intentarlo de nuevo cuando quiera, o llamarnos al {telefono}.</Alert>
          )}
          {retorno?.tipo === 'confirmando' && c.estado !== 'Aceptada' && (
            <Alert tone="info" title="Estamos confirmando su pago">
              La pasarela todavía no nos avisó del cobro. En unos minutos su pedido aparece aquí y le llega por correo. <button type="button" className="gw-btn gw-btn-ghost gw-btn-sm" onClick={recargar}>Actualizar</button>
            </Alert>
          )}
          {c.estado === 'Aceptada: pendiente de adelanto' && (
            <>
              <Alert tone="warning" title="Falta el adelanto">
                Aceptó la cotización. Su pedido se genera cuando pague el adelanto de {dolares(c.adelanto)}: en línea con tarjeta o en el taller.
              </Alert>
              {error && <Alert tone="danger" title="No se pudo abrir el pago">{error}</Alert>}
              <button type="button" className="gw-btn gw-btn-primary gw-btn-lg gw-btn-block" disabled={ocupado} onClick={pagar}>{ocupado ? 'Abriendo el pago…' : `Pagar el adelanto · ${dolares(c.adelanto)}`}</button>
            </>
          )}

          {c.estado === 'Aceptada' && c.pedido && (
            <>
              {!c.eligeRecojo && retorno?.tipo === 'pagado' && <Toast tone="success" title={`Pago aprobado · pedido ${c.pedido.codigo} generado`}>Recibimos su adelanto de {dolares(c.adelanto)} con tarjeta. El recibo le llega por correo.</Toast>}
              {!c.eligeRecojo && recienGenerado && <Toast tone="success" title={`Pedido ${c.pedido.codigo} generado`}>No necesita adelanto.</Toast>}
              {c.eligeRecojo
                ? <span className="muted" style={{ fontSize: 13 }}>Falta un paso: elija arriba el día del recojo.</span>
                : c.pedido.recojo?.tipo === 'agendado' && c.pedido.recojo.fecha
                  ? <Toast tone="success" title="Recojo agendado">Pasamos el {fechaLarga(deIso(c.pedido.recojo.fecha)).toLowerCase()} a las {c.pedido.recojo.hora}. Le recordamos un día antes por correo.</Toast>
                  : !delivery && <Alert tone="info" title="Su pedido está en marcha">Lleve su mueble al taller cuando le quede bien (lunes a sábado).</Alert>}
              <Link className="gw-btn gw-btn-primary gw-btn-lg gw-btn-block" to={`/cliente/pedidos?pedido=${c.pedido.codigo}`}>Ver mi pedido</Link>
            </>
          )}

          {c.estado === 'Rechazada' && (
            <Alert tone="info" title="No aceptó esta cotización">
              {c.respuesta?.motivo ? `Motivo: ${MOTIVOS_RECHAZO.find((m) => m.id === c.respuesta!.motivo)?.l ?? c.respuesta.motivo}. ` : ''}Si cambia de idea, envíe una nueva solicitud o llámenos al {telefono}.
            </Alert>
          )}

          {c.estado === 'Vencida' && (
            <Alert tone="warning" title="Cotización vencida">Los precios pueden haber cambiado. Llámenos al {telefono} y la recalculamos con los precios de hoy.</Alert>
          )}
        </aside>
      </div>

      {abierta && <div className="w4-mbar"><div><span>Total</span><b>{dolares(c.total)}</b></div><a className="gw-btn gw-btn-primary" href="#decidir">Responder</a></div>}
    </div>
  );
}

/** Último paso con delivery: el cliente elige el día y la hora en que pasa el camión (un recojo por hora). */
function ElegirRecojo({ c, onListo }: { c: MiCotizacion; onListo(): void }) {
  const [disp, setDisp] = useState<Disponibilidad | null>(null);
  const [elegido, setElegido] = useState<HoraElegida | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cargar = useCallback(() => { miCotizacionApi.disponibilidad().then(setDisp).catch((e) => setError(mensaje(e, 'No pudimos cargar la agenda del recojo.'))); }, []);
  useEffect(cargar, [cargar]);
  const varios = c.muebles.length > 1;

  const confirmar = async () => {
    if (!elegido) return;
    setOcupado(true); setError(null);
    try { await miCotizacionApi.recojo(c.solicitud, elegido.fecha, elegido.hora); onListo(); } catch (e) { setError(mensaje(e, 'No pudimos guardar el recojo.')); setElegido(null); cargar(); } finally { setOcupado(false); }
  };

  return (
    <section className="card stack w4-rk" aria-labelledby="w4-rk">
      <div>
        <span className="ov">Último paso</span>
        <h2 id="w4-rk" style={{ fontSize: 22 }}>{varios ? '¿Cuándo pasamos por sus muebles?' : '¿Cuándo pasamos por su mueble?'}</h2>
        <span className="muted" style={{ fontSize: 14 }}>Elija el día y la hora en que el camión pasa a recogerlo. Solo se muestran las horas libres del taller.</span>
      </div>
      {error && <Alert tone="danger" title="No se guardó">{error}</Alert>}
      <div className="w4-rkg">
        {!disp ? <p className="muted" role="status">Cargando la agenda del recojo…</p> : <GrillaRecojo disp={disp} elegido={elegido} onElegir={setElegido} />}
        <div className="stack w4-rk-lado">
          <div className="at-vsel">
            <span><small>{elegido ? MESES[deIso(elegido.fecha).getMonth()]!.slice(0, 3) : '—'}</small>{elegido ? deIso(elegido.fecha).getDate() : '?'}</span>
            <div><b>{elegido ? fechaLarga(deIso(elegido.fecha)) : 'Elija un día y una hora'}</b><em>{elegido ? `Recojo · de ${elegido.hora} a ${elegido.fin}` : 'En la agenda de la izquierda'}</em></div>
          </div>
          <dl className="w4-rk-datos">
            {c.direccion && <div><dt><Icon name="map-pin" size={15} /> Dirección</dt><dd>{c.direccion}</dd></div>}
            {disp && <div><dt><Icon name="clock" size={15} /> Duración</dt><dd>Unos {disp.duracionMin} minutos</dd></div>}
            <div><dt><Icon name="truck" size={15} /> La entrega</dt><dd>Se agenda cuando el pedido esté terminado</dd></div>
          </dl>
          <button type="button" className="gw-btn gw-btn-primary gw-btn-lg gw-btn-block" disabled={!elegido || ocupado} onClick={confirmar}>{ocupado ? 'Guardando…' : 'Confirmar día del recojo'}</button>
          <span className="w4-nota">Le llega la confirmación por correo y la ve en su cuenta.</span>
        </div>
      </div>
    </section>
  );
}
