import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TopAdmin } from '../../../app/layout/AdminLayout';
import { ApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { Icon } from '../../../shared/ui/Icon';
import { TextField } from '../../../shared/ui/TextField';
import { Contador } from '../solicitud/Contador';
import { DIAS, MESES, fechaLarga } from '../fechas';
import { Armar, type ArmadoEnVisita } from '../cotizaciones/ModoArmar';
import { FotosMueble } from '../cotizaciones/VisorMedios';
import { cotizacionesApi, type Armado, type EntradaCotizacion } from '../cotizaciones/cotizacionesApi';
import type { Medio } from '../cotizaciones/datos';
import { PASOS, SIGUIENTE, TEXTOS } from './datos';
import { atencionApi, type Atencion, type Disponibilidad, type MetodoPago, type ResultadoRespuesta } from './atencionApi';
import '../cotizaciones/cotizaciones.css';

// A2b Atender la cita o la visita a domicilio conectada a la API (decisiones L). La cotización se arma con A4.

const dolares = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;
const deIso = (s: string) => { const [y, m, d] = s.split('-').map(Number) as [number, number, number]; return new Date(y, m - 1, d); };
const minuscula = (s: string) => `${s[0]!.toLowerCase()}${s.slice(1)}`;
const mensaje = (e: unknown, def: string) => (e instanceof ApiError ? e.message : def);
const METODOS: { id: MetodoPago; l: string; frase: string }[] = [
  { id: 'efectivo', l: 'Efectivo', frase: 'en efectivo' }, { id: 'tarjeta', l: 'Tarjeta', frase: 'con tarjeta' },
  { id: 'zelle', l: 'Zelle', frase: 'por Zelle' }, { id: 'cheque', l: 'Cheque', frase: 'con cheque' },
];
const MOTIVOS = ['Precio', 'Plazo de entrega', 'Elegirá otro taller', 'Otro motivo'];

/** La cotización con las telas elegidas en la visita, a partir de lo que trae «armar» (para guardar el borrador). */
function entradaDesde(a: Armado, telas: Record<number, { materialId: number; yardas: number }[]>): EntradaCotizacion {
  return {
    muebles: a.muebles.map((m) => ({
      solicitudMuebleId: m.solicitudMuebleId,
      actividades: m.actividades.map((x) => ({ nombre: x.nombre, horasPersona: x.horasPersona, maquinaId: x.maquinaId, horasMaquina: x.horasMaquina, materiales: x.materiales.map((y) => ({ materialId: y.materialId, cantidad: y.cantidad })) })),
      telas: m.tela.eligeAqui ? (telas[m.solicitudMuebleId] ?? []) : m.tela.telas.map((t) => ({ materialId: t.materialId, yardas: t.yardas })),
      propuesto: m.propuesto, motivo: m.motivo, revisado: m.revisado,
    })),
    transporte: a.transporte.manual ? { manual: true, monto: a.transporte.monto, motivo: a.transporte.motivo } : { manual: false },
    adelanto: a.condiciones.adelanto,
    observaciones: a.observaciones,
  };
}

export function AtencionConectada({ codigo }: { codigo: string }) {
  const navigate = useNavigate();
  const [at, setAt] = useState<Atencion | null>(null);
  const [armado, setArmado] = useState<Armado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paso, setPaso] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const titulo = useRef<HTMLHeadingElement>(null);

  const cargarArmado = useCallback(async () => {
    try { setArmado(await cotizacionesApi.armar(codigo)); } catch (e) { setAviso(mensaje(e, 'No pudimos cargar la cotización.')); }
  }, [codigo]);
  const cargar = useCallback(async () => {
    setError(null);
    try {
      const d = await atencionApi.datos(codigo);
      setAt(d);
      // La cotización se arma cuando la visita ya se está atendiendo (la solicitud dejó de esperar su cita).
      if (d.solicitud.estado !== 'En espera de cita') await cargarArmado();
      if (d.cotizacion && d.cotizacion.estado !== 'Borrador') setPaso(4);
    } catch (e) { setError(mensaje(e, 'No pudimos abrir la atención.')); }
  }, [codigo, cargarArmado]);
  useEffect(() => { void cargar(); }, [cargar]);

  if (error) return <Alert tone="danger" title="No pudimos abrir la atención">{error} <Link to="/admin/agenda">Volver a la agenda</Link></Alert>;
  if (!at) return <p className="muted" role="status">Cargando la atención…</p>;

  const lugar = at.cita?.tipo ?? (at.solicitud.telaOpcion === 'domicilio' ? 'domicilio' : 'local');
  const t = TEXTOS[lugar];
  const cuando = at.cita ? `${minuscula(fechaLarga(deIso(at.cita.fecha)))}${at.cita.hora ? `, ${at.cita.hora}` : at.cita.franja ? `, por la ${at.cita.franja === 'manana' ? 'mañana' : 'tarde'}` : ''}` : '';
  const ir = (n: number) => { setPaso(n); window.scrollTo({ top: 0 }); titulo.current?.focus(); };
  const publicada = Boolean(at.cotizacion && at.cotizacion.estado !== 'Borrador');

  /** «Empezar»: la visita se está realizando (CU-C05) y la solicitud queda lista para cotizar. */
  const empezar = async () => {
    setOcupado(true);
    try {
      if (at.cita?.estado === 'Programada') await atencionApi.resultado(at.cita.id, 'atendida');
      await cargar();
      ir(1);
    } catch (e) { setAviso(mensaje(e, 'No pudimos empezar la atención.')); } finally { setOcupado(false); }
  };

  return (
    <>
      <TopAdmin
        crumb={<><Link to="/admin/agenda">Agenda</Link> › {lugar === 'domicilio' ? 'Atender visita' : 'Atender cita'} · {at.cliente.nombre}{cuando ? ` · ${cuando}` : ''}{at.cita?.direccion ? ` · ${at.cita.direccion}` : ''}</>}
        titulo={<span ref={titulo} tabIndex={-1} style={{ outline: 'none' }}>{t.titulo}</span>}
      />
      {aviso && <Alert tone="danger" title="No se pudo completar">{aviso}</Alert>}

      <nav className="at-stp" aria-label="Pasos de la atención">
        {PASOS.map((l, i) => {
          const habilitado = i === 0 || (armado != null && !publicada) || (publicada && i === 4);
          return (
            <button key={l} type="button" disabled={!habilitado} className={i === paso ? 'at-st at-on' : i < paso ? 'at-st at-done' : 'at-st'} aria-current={i === paso ? 'step' : undefined} onClick={() => ir(i)}>
              <b aria-hidden="true">{i < paso ? '✓' : i + 1}</b><span>{l}</span>
            </button>
          );
        })}
      </nav>

      {paso === 0 && <PasoRevisar at={at} lugar={lugar} onEmpezar={empezar} ocupado={ocupado} onNoEstaba={async () => {
        if (!at.cita) return;
        try { await atencionApi.resultado(at.cita.id, 'no_asistio'); navigate('/admin/agenda'); } catch (e) { setAviso(mensaje(e, 'No pudimos registrar la inasistencia.')); }
      }} />}
      {paso === 1 && armado && <PasoTelas armado={armado} codigo={codigo} onListo={async () => { await cargarArmado(); ir(2); }} onAtras={() => ir(0)} />}
      {paso === 2 && <PasoTraslado at={at} codigo={codigo} onListo={async (d) => { setAt(d); await cargarArmado(); ir(3); }} onAtras={() => ir(1)} />}
      {paso >= 3 && armado && !publicada && (
        <PasoCotizacionYRespuesta key={`${armado.cotizacion.codigo}|${armado.transporte.calculado}`} armado={armado} at={at} codigo={codigo} paso={paso} lugar={lugar}
          onPaso={ir} onRecargar={cargarArmado} onRespondido={cargar} />
      )}
      {paso === 4 && publicada && <Cierre at={at} lugar={lugar} onCambio={setAt} />}
    </>
  );
}

// ---------------------------------------------------------------- Paso 1 · Recibir y revisar
function PasoRevisar({ at, lugar, onEmpezar, onNoEstaba, ocupado }: { at: Atencion; lugar: 'local' | 'domicilio'; onEmpezar(): void; onNoEstaba(): void; ocupado: boolean }) {
  const [confirmar, setConfirmar] = useState(false);
  const t = TEXTOS[lugar];
  const tela = at.solicitud.telaOpcion === 'trae' ? 'La trae el cliente' : at.solicitud.telaOpcion === 'sin' ? 'No lleva tela' : at.solicitud.telaOpcion === 'catalogo' ? 'La eligió en línea' : t.tela;
  return (
    <div className="split">
      <div className="wide">
        <section className="card stack" aria-labelledby="at-p1">
          <h2 id="at-p1" style={{ fontSize: 20 }}>Lo que pidió {at.cliente.nombre}</h2>
          <p className="muted" style={{ fontSize: 14 }}>Revíselo con el cliente antes de empezar.</p>
          {at.muebles.map((m, i) => {
            const medios: Medio[] = m.medios.map((x) => ({ nombre: x.nombre, origen: 'cliente', tipo: x.tipo === 'video' ? 'Video' : 'Foto', detalle: 'Enviado por el cliente', fondo: 'linear-gradient(135deg,#1E3A8A,#0B1B3A)', url: x.url }));
            return (
              <div key={m.id} className="stack" style={{ gap: 10 }}>
                <dl className="at-facts">
                  <div><dt>{at.muebles.length > 1 ? `Mueble ${i + 1}` : 'Mueble'}</dt><dd>{m.titulo}</dd></div>
                  <div><dt>Servicio</dt><dd>{m.servicio}</dd></div>
                  <div><dt>Tela</dt><dd>{tela}</dd></div>
                  <div><dt>Medidas</dt><dd>{m.medidas ?? 'No indicó'}</dd></div>
                </dl>
                {medios.length > 0 ? <FotosMueble medios={medios} titulo={`Fotos y videos · ${m.titulo.toLowerCase()}`} /> : <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>No envió fotos de este mueble.</p>}
              </div>
            );
          })}
        </section>
        <div className="between at-foot">
          {confirmar ? (
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13.5 }}>{lugar === 'domicilio' ? '¿No había nadie en casa?' : '¿El cliente no vino?'} Se registra la inasistencia y se le avisa.</span>
              <button type="button" className="gw-btn gw-btn-danger gw-btn-sm" onClick={onNoEstaba}>Sí, registrar</button>
              <button type="button" className="gw-btn gw-btn-ghost gw-btn-sm" onClick={() => setConfirmar(false)}>Cancelar</button>
            </div>
          ) : (
            <button type="button" className="gw-btn gw-btn-ghost" style={{ color: 'var(--danger-ink)' }} disabled={!at.cita || at.cita.estado !== 'Programada'} onClick={() => setConfirmar(true)}>{t.noAsistio}</button>
          )}
          <button type="button" className="gw-btn gw-btn-primary gw-btn-lg" disabled={ocupado} onClick={onEmpezar}>{ocupado ? 'Empezando…' : SIGUIENTE[0]}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Paso 2 · Telas (del muestrario, con las yardas que mide el taller)
function PasoTelas({ armado, codigo, onListo, onAtras }: { armado: Armado; codigo: string; onListo(): Promise<void>; onAtras(): void }) {
  const [telas, setTelas] = useState<Record<number, { materialId: number; yardas: number }[]>>(() =>
    Object.fromEntries(armado.muebles.map((m) => [m.solicitudMuebleId, m.tela.eligeAqui ? m.tela.telas.map((t) => ({ materialId: t.materialId, yardas: t.yardas || 1 })) : []])));
  const [actual, setActual] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const muestrario = armado.muestrario ?? [];
  const m = armado.muebles[Math.min(actual, armado.muebles.length - 1)]!;
  const sel = telas[m.solicitudMuebleId] ?? [];
  const cambiar = (lista: { materialId: number; yardas: number }[]) => setTelas((x) => ({ ...x, [m.solicitudMuebleId]: lista }));
  const alternar = (id: number) => cambiar(sel.some((x) => x.materialId === id) ? sel.filter((x) => x.materialId !== id) : [...sel, { materialId: id, yardas: 1 }]);
  const guardar = async () => {
    setGuardando(true); setError(null);
    try { await cotizacionesApi.guardar(codigo, entradaDesde(armado, telas)); await onListo(); } catch (e) { setError(mensaje(e, 'No pudimos guardar las telas.')); } finally { setGuardando(false); }
  };
  return (
    <div className="split">
      <div className="wide">
        <section className="card stack" aria-labelledby="at-p2">
          <h2 id="at-p2" style={{ fontSize: 20 }}>Telas que elige</h2>
          {armado.muebles.length > 1 && (
            <div className="co-mtabs" role="group" aria-label="Mueble">
              {armado.muebles.map((x, i) => (
                <button key={x.solicitudMuebleId} type="button" className="co-mtab" aria-pressed={i === actual} onClick={() => setActual(i)}>
                  <b>{x.clave}</b><span>{x.titulo}</span><em style={{ fontSize: 13 }}>{x.tela.eligeAqui ? `${(telas[x.solicitudMuebleId] ?? []).length} tela(s)` : x.tela.nota}</em>
                </button>
              ))}
            </div>
          )}
          {!m.tela.eligeAqui ? (
            <div className="at-nota"><Icon name="info" size={18} /><span>{m.titulo}: <b>{m.tela.nota}</b>. No hay que elegir tela aquí.</span></div>
          ) : (
            <>
              {sel.length > 0 && (
                <div className="stack" style={{ gap: 8 }}>
                  {sel.map((x) => {
                    const tela = muestrario.find((y) => y.id === x.materialId);
                    return (
                      <div key={x.materialId} className="ydrow at-una">
                        <div><b>{tela?.nombre ?? 'Tela'}</b><small>{tela?.precio != null ? `Costo $${tela.precio}/yd · solo lo ve usted` : 'Sin precio en Inventario'}</small></div>
                        <Contador valor={x.yardas} unidad="yd" etiqueta={`yardas de ${tela?.nombre ?? 'tela'}`} onChange={(v) => cambiar(sel.map((y) => (y.materialId === x.materialId ? { ...y, yardas: v } : y)))} />
                      </div>
                    );
                  })}
                </div>
              )}
              <span className="gw-field-label">{sel.length ? 'Toque otra tela para agregarla o la misma para quitarla' : `Tela para ${m.titulo.toLowerCase()} · las yardas las mide el taller`}</span>
              {muestrario.length === 0 ? <p className="muted">No hay telas activas en el muestrario. Cárguelas en Inventario › Telas.</p> : (
                <div className="sw at-sw">
                  {muestrario.map((x) => {
                    const on = sel.some((y) => y.materialId === x.id);
                    return (
                      <button key={x.id} type="button" aria-pressed={on} className={on ? 'on' : undefined} onClick={() => alternar(x.id)}>
                        <span className="tex" style={{ background: x.colorHex ?? '#94A3B8' }}><span className="ck"><Icon name="check" size={13} strokeWidth={3} /></span></span>
                        <span className="cap"><b>{x.nombre}</b><small>{x.precio != null ? `Costo $${x.precio}/yd` : 'Sin precio'}{x.libro ? ` · ${x.libro}` : ''}</small></span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
          {error && <Alert tone="danger" title="No se guardó">{error}</Alert>}
        </section>
        <div className="between at-foot">
          <button type="button" className="gw-btn gw-btn-ghost" onClick={onAtras}>Atrás</button>
          <button type="button" className="gw-btn gw-btn-primary gw-btn-lg" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : SIGUIENTE[1]}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Paso 3 · Traslado
function PasoTraslado({ at, codigo, onListo, onAtras }: { at: Atencion; codigo: string; onListo(d: Atencion): Promise<void>; onAtras(): void }) {
  const [traslado, setTraslado] = useState<'delivery' | 'propio'>(at.solicitud.traslado ?? 'delivery');
  const [dirId, setDirId] = useState<number | null>(at.solicitud.direccionId ?? at.direcciones[0]?.id ?? null);
  const [nueva, setNueva] = useState(at.direcciones.length === 0);
  const [texto, setTexto] = useState('');
  const [referencia, setReferencia] = useState('');
  const [guardar, setGuardar] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seguir = async () => {
    setOcupado(true); setError(null);
    try {
      const direccion = traslado === 'propio' ? undefined : nueva ? { tipo: 'nueva' as const, texto, referencia: referencia || undefined, guardar } : dirId ? { tipo: 'guardada' as const, id: dirId } : undefined;
      await onListo(await atencionApi.traslado(codigo, traslado, direccion));
    } catch (e) { setError(mensaje(e, 'No pudimos guardar el traslado.')); } finally { setOcupado(false); }
  };
  return (
    <div className="split">
      <div className="wide">
        <section className="card stack" aria-labelledby="at-p3">
          <h2 id="at-p3" style={{ fontSize: 20 }}>¿Cómo llega el mueble al taller?</h2>
          <div className="opts" role="radiogroup" aria-label="Traslado">
            {([['delivery', 'Delivery (recojo y entrega)', 'Ida y vuelta, un solo costo: se calcula solo con la distancia', 'truck'], ['propio', 'Lo lleva y lo recoge el cliente', 'Sin costo de traslado', 'map-pin']] as const).map(([id, tt, sub, ic]) => (
              <button key={id} type="button" role="radio" aria-checked={traslado === id} className={traslado === id ? 'opt on' : 'opt'} onClick={() => setTraslado(id)}>
                <span className="ic"><Icon name={ic} /></span><span><b>{tt}</b><small>{sub}</small></span>
              </button>
            ))}
          </div>
          {traslado === 'delivery' && (
            <>
              {!nueva ? (
                <label className="gw-field">
                  <span className="gw-field-label">Dirección de recojo y entrega</span>
                  <select className="gw-input" value={dirId ?? ''} onChange={(e) => setDirId(Number(e.target.value))}>
                    {at.direcciones.map((d) => <option key={d.id} value={d.id}>{d.etiqueta ? `${d.etiqueta} · ` : ''}{d.texto}</option>)}
                  </select>
                </label>
              ) : (
                <>
                  <TextField label="Dirección nueva" placeholder="Calle, número, ciudad, estado y código postal" value={texto} onChange={(e) => setTexto(e.target.value)} />
                  <TextField label="Depto., piso o referencia" optional value={referencia} onChange={(e) => setReferencia(e.target.value)} />
                  <label className="row" style={{ fontSize: 14, gap: 8 }}><input type="checkbox" checked={guardar} onChange={(e) => setGuardar(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />Guardarla en el perfil del cliente</label>
                </>
              )}
              {at.direcciones.length > 0 && (
                <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setNueva(!nueva)}>{nueva ? 'Usar una dirección guardada' : '+ Usar una dirección nueva'}</button>
              )}
              <div className="at-nota"><Icon name="calendar" size={18} /><span><b>El día del recojo se elige después del adelanto.</b> Si el cliente acepta y paga hoy, lo eligen juntos al final. Si paga después, lo elige desde su cuenta.</span></div>
            </>
          )}
          {error && <Alert tone="danger" title="No se guardó">{error}</Alert>}
        </section>
        <div className="between at-foot">
          <button type="button" className="gw-btn gw-btn-ghost" onClick={onAtras}>Atrás</button>
          <button type="button" className="gw-btn gw-btn-primary gw-btn-lg" disabled={ocupado || (traslado === 'delivery' && (nueva ? texto.trim().length < 5 : !dirId))} onClick={seguir}>{ocupado ? 'Guardando…' : SIGUIENTE[2]}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Pasos 4 y 5 · Cotización (A4) y respuesta del cliente
function PasoCotizacionYRespuesta({ armado, at, codigo, paso, lugar, onPaso, onRecargar, onRespondido }: {
  armado: Armado; at: Atencion; codigo: string; paso: number; lugar: 'local' | 'domicilio';
  onPaso(n: number): void; onRecargar(): Promise<void>; onRespondido(): Promise<void>;
}) {
  const [cot, setCot] = useState<ArmadoEnVisita | null>(null);
  const [respuesta, setRespuesta] = useState<'acepta' | 'pensara' | 'rechaza'>('acepta');
  const [pagaAhora, setPagaAhora] = useState(true);
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo');
  const [motivo, setMotivo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<{ m: string; errores: string[] } | null>(null);
  const [resultado, setResultado] = useState<ResultadoRespuesta | null>(null);
  const sinAdelanto = (cot?.adelanto ?? 0) === 0;
  const pct = armado.condiciones.adelanto != null || !cot ? null : armado.condiciones.adelantoPct;

  const enviar = async () => {
    if (!cot) return;
    setEnviando(true); setError(null);
    try {
      const r = await atencionApi.responder(codigo, { cotizacion: cot.entrada, respuesta, pagaAhora: respuesta === 'acepta' ? pagaAhora : undefined, metodo: respuesta === 'acepta' && pagaAhora && !sinAdelanto ? metodo : undefined, motivo: respuesta === 'rechaza' ? motivo ?? undefined : undefined });
      setResultado(r);
      await onRespondido();
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('No pudimos registrar la respuesta.', 0);
      setError({ m: err.message, errores: Object.values(err.errores) });
    } finally { setEnviando(false); }
  };

  return (
    <>
      {/* La cotización queda montada en el paso 5: así no se pierde lo editado. */}
      <div hidden={paso !== 3}>
        <Armar armado={armado} onRecargar={() => { void onRecargar(); }} onResponder={() => undefined} enVisita={setCot} />
        <div className="between at-foot">
          <button type="button" className="gw-btn gw-btn-ghost" onClick={() => onPaso(2)}>Atrás</button>
          <button type="button" className="gw-btn gw-btn-primary gw-btn-lg" disabled={!cot?.lista} onClick={() => onPaso(4)}>{SIGUIENTE[3]}</button>
        </div>
        {!cot?.lista && <p className="audit" style={{ textAlign: 'right' }}>Complete la revisión de la cotización para mostrársela al cliente.</p>}
      </div>

      {paso === 4 && cot && (
        <div className="split">
          <div className="wide">
            <section className="card stack" aria-labelledby="at-p5">
              <h2 id="at-p5" style={{ fontSize: 20 }}>¿Qué decide el cliente?</h2>
              <div className="at-opts3" role="radiogroup" aria-label="Respuesta del cliente">
                {([['acepta', 'Acepta ahora', 'Se genera la orden; el adelanto lo paga ahora o después', 'check'], ['pensara', 'Lo pensará', `Se publica en su cuenta con vigencia de ${armado.condiciones.vigenciaDias} días`, 'clock'], ['rechaza', 'No acepta', 'Con motivo obligatorio', 'x']] as const).map(([id, tt, sub, ic]) => (
                  <button key={id} type="button" role="radio" aria-checked={respuesta === id} className={respuesta === id ? 'opt on' : 'opt'} onClick={() => setRespuesta(id)}>
                    <span className="ic"><Icon name={ic} /></span><span><b>{tt}</b><small>{sub}</small></span>
                  </button>
                ))}
              </div>

              {respuesta === 'acepta' && (
                <div className="at-paybox">
                  <div className="at-pay-hd">
                    <div><span className="ov">{TEXTOS[lugar].adelanto}{pct != null ? ` · ${pct} %` : ''}</span><b className="at-bigv">{dolares(cot.adelanto)}</b></div>
                    <div className="at-pay-tot"><span>Total <b>{dolares(cot.total)}</b></span><span>Saldo al entregar <b>{dolares(cot.total - cot.adelanto)}</b></span></div>
                  </div>
                  {sinAdelanto ? (
                    <div className="at-nota"><Icon name="info" size={18} /><span>Cliente con pedidos cerrados: <b>adelanto 0 %</b>. El pedido se genera ahora, sin cobrar nada.</span></div>
                  ) : (
                    <>
                      <span className="gw-field-label" id="at-cuando">¿Cuándo paga el adelanto?</span>
                      <div className="at-pay-op" role="radiogroup" aria-labelledby="at-cuando">
                        <button type="button" role="radio" aria-checked={pagaAhora} className={pagaAhora ? 'opt on' : 'opt'} onClick={() => setPagaAhora(true)}>
                          <span className="ic"><Icon name="payment" /></span><span><b>Paga ahora</b><small>Se genera el pedido{at.solicitud.traslado === 'delivery' ? ' y definen el recojo' : ''} en este momento</small></span>
                        </button>
                        <button type="button" role="radio" aria-checked={!pagaAhora} className={!pagaAhora ? 'opt on' : 'opt'} onClick={() => setPagaAhora(false)}>
                          <span className="ic"><Icon name="clock" /></span><span><b>Paga después</b><small>Lo paga luego desde su cuenta; el pedido se genera al confirmarse</small></span>
                        </button>
                      </div>
                      {pagaAhora ? (
                        <>
                          <span className="gw-field-label" id="at-medio">Medio de pago</span>
                          <div className="at-chips" role="radiogroup" aria-labelledby="at-medio">
                            {METODOS.map((x) => <button key={x.id} type="button" role="radio" aria-checked={metodo === x.id} className="at-chip" onClick={() => setMetodo(x.id)}>{x.l}</button>)}
                          </div>
                        </>
                      ) : (
                        <div className="at-nota"><Icon name="info" size={18} /><span>Cuando pague el adelanto <b>se genera su pedido</b>{at.solicitud.traslado === 'delivery' ? ' y elige desde su cuenta el día del recojo.' : '.'}</span></div>
                      )}
                    </>
                  )}
                  <button type="button" className="gw-btn gw-btn-primary gw-btn-lg" disabled={enviando} onClick={enviar}>
                    {enviando ? 'Registrando…' : sinAdelanto ? 'Generar orden (adelanto 0 %)' : pagaAhora ? `Generar orden y cobrar ${dolares(cot.adelanto)} ${METODOS.find((x) => x.id === metodo)!.frase}` : 'Registrar la aceptación · paga después'}
                  </button>
                </div>
              )}
              {respuesta === 'pensara' && (
                <button type="button" className="gw-btn gw-btn-primary" style={{ alignSelf: 'flex-start' }} disabled={enviando} onClick={enviar}>{enviando ? 'Publicando…' : 'Publicar la cotización en su cuenta'}</button>
              )}
              {respuesta === 'rechaza' && (
                <>
                  <span className="gw-field-label" id="at-mot">Motivo (obligatorio)</span>
                  <div className="at-chips" role="radiogroup" aria-labelledby="at-mot">
                    {MOTIVOS.map((x) => <button key={x} type="button" role="radio" aria-checked={motivo === x} className="at-chip" onClick={() => setMotivo(x)}>{x}</button>)}
                  </div>
                  <button type="button" className="gw-btn gw-btn-danger" style={{ alignSelf: 'flex-start' }} disabled={!motivo || enviando} onClick={enviar}>{enviando ? 'Registrando…' : 'Registrar rechazo'}</button>
                </>
              )}
              {error && (
                <Alert tone="danger" title="No se registró">
                  {error.m}{error.errores.length > 1 && <ul className="co-errs">{error.errores.map((x) => <li key={x}>{x}</li>)}</ul>}
                </Alert>
              )}
              {resultado && <p className="muted" role="status">Registrado: {resultado.estado}.</p>}
            </section>
            <div className="between at-foot"><button type="button" className="gw-btn gw-btn-ghost" onClick={() => onPaso(3)}>Atrás</button></div>
          </div>
          <aside className="aside">
            <section className="card at-sum" aria-label="Lo que se lleva el cliente">
              <span className="ov">Lo que se lleva el cliente</span>
              <div className="kv"><span>{armado.muebles.length > 1 ? 'Muebles' : 'Mueble'}</span><b>{cot.descripcion}</b></div>
              <div className="kv"><span>Traslado</span><b>{at.solicitud.traslado === 'delivery' ? 'Delivery · recojo al generar el pedido' : 'Lo lleva el cliente'}</b></div>
              <hr className="stitch" />
              <div className="kv"><span>Total</span><b className="at-bigv">{dolares(cot.total)}</b></div>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Después de la respuesta: el resultado y el recojo
function Cierre({ at, lugar, onCambio }: { at: Atencion; lugar: 'local' | 'domicilio'; onCambio(a: Atencion): void }) {
  const c = at.cotizacion!;
  const p = at.pedido;
  const pideRecojo = Boolean(p) && at.solicitud.traslado === 'delivery' && !p!.recojo;
  const titulo = p ? `Pedido ${p.codigo} generado` : c.estado === 'Aceptada: pendiente de adelanto' ? `Cotización ${c.codigo} aceptada · adelanto pendiente` : c.estado === 'Rechazada' ? `Cotización ${c.codigo} rechazada` : `Cotización ${c.codigo} publicada en su cuenta`;
  const texto = p ? `Total ${dolares(c.total)}${c.adelanto > 0 ? ` · adelanto ${dolares(c.adelanto)} cobrado` : ' · sin adelanto'}. El cliente recibió por correo y en su cuenta la constancia de lo que aceptó.${pideRecojo ? ' Ahora definan juntos el recojo.' : ''}`
    : c.estado === 'Aceptada: pendiente de adelanto' ? `Cuando pague el adelanto de ${dolares(c.adelanto)} se genera su pedido${at.solicitud.traslado === 'delivery' ? ' y elige desde su cuenta el día del recojo' : ''}.`
      : c.estado === 'Rechazada' ? 'La solicitud se cerró como Rechazada. Se conserva para el historial.'
        : `Total ${dolares(c.total)}. Le llegó por correo y la puede aceptar o rechazar desde su cuenta mientras esté vigente.`;
  return (
    <div className="split">
      <div className="wide">
        <section className="card stack">
          <div className={c.estado === 'Rechazada' ? 'at-okbox at-okbox-n' : 'at-okbox'} role="status">
            <Icon name={c.estado === 'Rechazada' ? 'x' : 'check'} size={22} />
            <div><b>{titulo}</b><small>{texto}</small></div>
          </div>
          {pideRecojo && <RecojoConectado pedido={p!.codigo} enCasa={lugar === 'domicilio'} onListo={onCambio} />}
          {p?.recojo && (
            <div className="at-okbox" role="status">
              <Icon name="truck" size={22} />
              <div>
                <b>{p.recojo.tipo === 'en_visita' ? 'Mueble recogido en la visita' : 'Recojo agendado'}</b>
                <small>{p.recojo.tipo === 'en_visita'
                  ? `El pedido ${p.codigo} sigue «Esperando mueble» hasta que el taller lo recibe.`
                  : `Pasamos el ${minuscula(fechaLarga(deIso(p.recojo.fecha!)))} a las ${p.recojo.hora}. El cliente recibió la confirmación por correo y en su cuenta.`}</small>
              </div>
            </div>
          )}
          {!pideRecojo && (
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {p && <Link className="gw-btn gw-btn-primary" to="/admin/pedidos">Ver en el Planning</Link>}
              <Link className="gw-btn gw-btn-ghost" to="/admin/agenda">Volver a la agenda</Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** Último paso (decisiones L): agendar el recojo en una hora libre real, o llevárselo en la visita a domicilio. */
function RecojoConectado({ pedido, enCasa, onListo }: { pedido: string; enCasa: boolean; onListo(a: Atencion): void }) {
  const [disp, setDisp] = useState<Disponibilidad | null>(null);
  const [opcion, setOpcion] = useState<'agendar' | 'llevar'>('agendar');
  const [semana, setSemana] = useState(0);
  const [elegido, setElegido] = useState<{ fecha: string; hora: string; fin: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cargar = useCallback(() => { atencionApi.disponibilidad().then(setDisp).catch((e) => setError(mensaje(e, 'No pudimos cargar la agenda del recojo.'))); }, []);
  useEffect(cargar, [cargar]);

  // Semanas de lunes a sábado; abre en la primera que tenga horas libres.
  const semanas: Disponibilidad['dias'][] = [];
  for (const d of disp?.dias ?? []) {
    const lunes = deIso(d.fecha); lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7));
    const k = lunes.toDateString();
    const ultima = semanas[semanas.length - 1];
    if (ultima && (() => { const l = deIso(ultima[0]!.fecha); l.setDate(l.getDate() - ((l.getDay() + 6) % 7)); return l.toDateString() === k; })()) ultima.push(d); else semanas.push([d]);
  }
  const primeraLibre = Math.max(0, semanas.findIndex((w) => w.some((d) => d.horas.some((h) => h.estado === 'libre'))));
  const sem = semanas[Math.min(semana + primeraLibre, semanas.length - 1)] ?? [];
  const horas = [...new Set(sem.flatMap((d) => d.horas.map((h) => h.inicio)))].sort();

  const confirmar = async (r: { tipo: 'agendado'; fecha: string; hora: string } | { tipo: 'en_visita' }) => {
    setOcupado(true); setError(null);
    try { onListo(await atencionApi.recojo(pedido, r)); } catch (e) { setError(mensaje(e, 'No pudimos guardar el recojo.')); cargar(); setElegido(null); } finally { setOcupado(false); }
  };

  return (
    <section className="card stack at-rk" aria-labelledby="at-rk">
      <div>
        <span className="ov">Último paso · con el cliente</span>
        <h3 id="at-rk" style={{ fontSize: 18, margin: '2px 0 0' }}>¿Cuándo recogemos el mueble?</h3>
        <span className="muted" style={{ fontSize: 13 }}>Eligió delivery y el pedido ya está generado: falta el recojo. La entrega se agenda cuando el pedido esté terminado.</span>
      </div>
      {enCasa && (
        <div className="opts" role="radiogroup" aria-label="Cómo se hace el recojo">
          {([['agendar', 'Agendar el recojo', 'Elegir juntos el día y la hora en que pasa el camión', 'calendar'], ['llevar', 'Me lo llevo ahora', 'Cabe en el vehículo: se registra el recojo en esta visita', 'truck']] as const).map(([id, tt, sub, ic]) => (
            <button key={id} type="button" role="radio" aria-checked={opcion === id} className={opcion === id ? 'opt on' : 'opt'} onClick={() => setOpcion(id)}>
              <span className="ic"><Icon name={ic} /></span><span><b>{tt}</b><small>{sub}</small></span>
            </button>
          ))}
        </div>
      )}
      {error && <Alert tone="danger" title="No se guardó">{error}</Alert>}
      {opcion === 'llevar' && enCasa ? (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="gw-btn gw-btn-primary" disabled={ocupado} onClick={() => confirmar({ tipo: 'en_visita' })}>{ocupado ? 'Registrando…' : 'Registrar recojo y llevármelo'}</button>
          <span className="muted" style={{ fontSize: 12.5, flex: '1 1 280px' }}>Queda como recojo hecho, sin agendar camión; el transporte cotizado no cambia. Las piezas y las fotos de llegada se registran al recibirlo en el taller.</span>
        </div>
      ) : !disp ? <p className="muted" role="status">Cargando la agenda del recojo…</p> : (
        <div className="at-rkg">
          <div className="at-vmag">
            <div className="at-vhd">
              <button type="button" aria-label="Semana anterior" disabled={semana + primeraLibre <= 0} onClick={() => setSemana(semana - 1)}>‹</button>
              <b>{sem.length ? `Semana del ${deIso(sem[0]!.fecha).getDate()} al ${deIso(sem[sem.length - 1]!.fecha).getDate()} ${MESES[deIso(sem[sem.length - 1]!.fecha).getMonth()]!.slice(0, 3)}` : 'Sin fechas'}</b>
              <button type="button" aria-label="Semana siguiente" disabled={semana + primeraLibre >= semanas.length - 1} onClick={() => setSemana(semana + 1)}>›</button>
            </div>
            <div className="at-vmg" style={{ gridTemplateColumns: `44px repeat(${sem.length}, minmax(0, 1fr))` }} role="grid" aria-label="Horas libres para el recojo">
              <span />
              {sem.map((d) => <span key={d.fecha} className="at-vdh"><small>{DIAS[deIso(d.fecha).getDay()]!.slice(0, 3)}</small>{deIso(d.fecha).getDate()}</span>)}
              {horas.map((h, i) => (
                <FilaHora key={h} h={h} sem={sem} elegido={elegido} onElegir={setElegido} mediodia={i > 0 && horas[i - 1]! < '12:00' && h >= '12:00'} />
              ))}
            </div>
            <div className="at-vlg">
              <span><i style={{ background: 'var(--surface)', border: '1.5px solid #BFDBFE' }} />Libre</span>
              <span><i style={{ background: 'var(--primary)' }} />Elegida</span>
              <span><i style={{ background: 'var(--surface-sunken)' }} />Ocupada · «—» ya pasó o sin recojos</span>
            </div>
          </div>
          <div className="stack" style={{ gap: 12 }}>
            <div className="at-vsel">
              <span><small>{elegido ? MESES[deIso(elegido.fecha).getMonth()]!.slice(0, 3) : '—'}</small>{elegido ? deIso(elegido.fecha).getDate() : '?'}</span>
              <div><b>{elegido ? fechaLarga(deIso(elegido.fecha)) : 'Elija un día y una hora'}</b><em>{elegido ? `Recojo · de ${elegido.hora} a ${elegido.fin}` : 'En la agenda de la izquierda'}</em></div>
            </div>
            <span className="muted" style={{ fontSize: 12.5, lineHeight: 1.45 }}>Muéstrele al cliente las horas libres y elija con él. Le llega la confirmación por correo y la ve en su cuenta.</span>
            <button type="button" className="gw-btn gw-btn-primary gw-btn-block" disabled={!elegido || ocupado} onClick={() => elegido && confirmar({ tipo: 'agendado', fecha: elegido.fecha, hora: elegido.hora })}>{ocupado ? 'Guardando…' : 'Confirmar día del recojo'}</button>
          </div>
        </div>
      )}
    </section>
  );
}

function FilaHora({ h, sem, elegido, onElegir, mediodia }: { h: string; sem: Disponibilidad['dias']; elegido: { fecha: string; hora: string } | null; onElegir(x: { fecha: string; hora: string; fin: string }): void; mediodia: boolean }) {
  return (
    <>
      {mediodia && <span className="at-vlun">Cerrado al mediodía</span>}
      <span className="at-vhr">{h.replace(/^0/, '')}</span>
      {sem.map((d) => {
        const x = d.horas.find((y) => y.inicio === h);
        const libre = x?.estado === 'libre';
        const on = elegido?.fecha === d.fecha && elegido.hora === h;
        return (
          <button key={d.fecha} type="button" className={on ? 'at-vsl on' : libre ? 'at-vsl' : 'at-vsl at-busy'} disabled={!libre} aria-pressed={on}
            aria-label={`${DIAS[deIso(d.fecha).getDay()]} ${deIso(d.fecha).getDate()} a las ${h}${libre ? '' : ` · ${x?.estado ?? 'sin recojos'}`}`}
            onClick={() => x && onElegir({ fecha: d.fecha, hora: h, fin: x.fin })}>
            {on ? '✓' : libre ? h.replace(/^0/, '') : x?.estado === 'ocupada' ? 'Ocup.' : '—'}
          </button>
        );
      })}
    </>
  );
}

export function SinSolicitud() {
  return <EmptyState icon="calendar" title="Elija la cita o la visita que va a atender">Se abre desde la Agenda con «Ir a la cita» o «Ir a la visita».</EmptyState>;
}
