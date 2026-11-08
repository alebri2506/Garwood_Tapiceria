import { Link } from 'react-router-dom';
import { Alert } from '../../../shared/ui/Alert';
import { Icon } from '../../../shared/ui/Icon';
import { StatusChip } from '../../../shared/ui/StatusChip';
import { TextField } from '../../../shared/ui/TextField';
import { UploadZone } from '../../../shared/ui/UploadZone';
import { MapsProvider } from '../../../shared/maps/MapsProvider';
import { MapaUbicacion } from '../../../shared/maps/MapaUbicacion';
import { DireccionAutocompletar } from '../../../shared/maps/DireccionAutocompletar';
import { mapsHabilitado } from '../../../shared/maps/config';
import { CalendarioRecojo } from '../solicitud/CalendarioRecojo';
import { Contador } from '../solicitud/Contador';
import { DibujoMueble } from '../solicitud/DibujoMueble';
import { DIRECCIONES_GUARDADAS, FRANJAS, TELAS, UNIDAD, fondoTela } from '../solicitud/datos';
import { MESES, fechaCorta, fechaLarga } from '../fechas';
import {
  ACTIVIDADES, ADELANTO, ADJUNTOS, CITA, COSTO_YARDA, METODOS_ADELANTO, MOTIVOS_RECHAZO, PEDIDO_SOLICITUD, PLANTILLA, PLAZO_ADELANTO,
  TRANSPORTE, VIGENCIA, YARDAS_UNA_TELA,
} from './datos';
import { PARTES, dolares, type Atencion, type Calculo, type CambioAtencion } from './estado';

interface Props { a: Atencion; set(c: CambioAtencion): void; c: Calculo }

const fondoAdjunto = (color: string) => `linear-gradient(135deg,${color},#0B1B3A)`;

/** Paso 1 · Lo que pidió la clienta (CU-C05: revisar la solicitud con ella). */
export function PasoRevisar({ a, set }: Omit<Props, 'c'>) {
  const sel = ADJUNTOS[a.adjunto]!;
  return (
    <section className="card stack" aria-labelledby="at-p1">
      <h2 id="at-p1" style={{ fontSize: 20 }}>Lo que pidió la clienta</h2>
      <p className="muted" style={{ fontSize: 14 }}>Revíselo con ella antes de empezar. Esto llegó con su solicitud del {CITA.enviada}.</p>
      <dl className="at-facts">{PEDIDO_SOLICITUD.map((f) => <div key={f.l}><dt>{f.l}</dt><dd>{f.v}</dd></div>)}</dl>
      <span className="gw-field-label" id="at-adj">Fotos y video que envió · toque para ver en grande</span>
      <div className="at-cg">
        <div className="at-big" style={{ background: fondoAdjunto(sel.color) }} role="img" aria-label={`${sel.nombre}, ${a.adjunto + 1} de ${ADJUNTOS.length}`}>
          {sel.duracion
            ? <span className="at-play"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg></span>
            : <Icon name="image" size={30} />}
          <em>{sel.nombre} · {a.adjunto + 1} de {ADJUNTOS.length}</em>
        </div>
        <div className="at-th" role="group" aria-labelledby="at-adj">
          {ADJUNTOS.map((x, i) => (
            <button key={x.nombre} type="button" aria-label={x.nombre} aria-pressed={a.adjunto === i} style={{ background: fondoAdjunto(x.color) }} onClick={() => set({ adjunto: i })}>
              <Icon name="image" size={16} />{x.duracion && <em>▶ {x.duracion}</em>}
            </button>
          ))}
        </div>
      </div>
      {a.extra ? (
        <div className="at-xbox">
          <div className="between"><b style={{ fontSize: 14 }}>Datos extra que trae la clienta</b><button type="button" className="gw-btn gw-btn-ghost gw-btn-sm" onClick={() => set({ extra: false })}>Quitar</button></div>
          <div className="grid3" style={{ gap: 12 }}>
            {(['ancho', 'fondo', 'alto'] as const).map((k) => (
              <TextField key={k} label={k[0]!.toUpperCase() + k.slice(1)} optional inputMode="decimal" placeholder="—" suffix={<span className="muted">in</span>}
                value={a.medidas[k]} onChange={(e) => set({ medidas: { ...a.medidas, [k]: e.target.value } })} />
            ))}
          </div>
          <UploadZone title="Fotos que muestra en su celular" hint="Se suman a las de la solicitud" accept="image/*" files={a.fotos} onChange={(fotos) => set({ fotos })} />
        </div>
      ) : (
        <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ extra: true })}>
          + La clienta trae medidas o más fotos (opcional)
        </button>
      )}
      <p className="audit">El sofá suele quedarse en casa: las medidas exactas y la revisión del mueble se hacen cuando llega al taller.</p>
      <Alert tone="info" title="Plantilla sugerida" compact>{PLANTILLA}. Se usa para armar la cotización en el paso 4.</Alert>
    </section>
  );
}

/** Paso 2 · Telas que elige en el local, una para todo o por partes. */
export function PasoTelas({ a, set }: Omit<Props, 'c'>) {
  const porPartes = a.modo === 'partes';
  const elegida = (id: number) => (porPartes ? a.telaPorParte[a.parteActiva] === id : a.telaUna === id);
  const elegir = (id: number) => (porPartes
    ? set({ telaPorParte: a.telaPorParte.map((t, i) => (i === a.parteActiva ? id : t)) })
    : set({ telaUna: id }));
  return (
    <section className="card stack" aria-labelledby="at-p2">
      <div className="between" style={{ flexWrap: 'wrap' }}>
        <h2 id="at-p2" style={{ fontSize: 20 }}>Telas que elige en el local</h2>
        <div className="at-pvw" role="group" aria-label="Cómo se usa la tela">
          <button type="button" aria-pressed={!porPartes} onClick={() => set({ modo: 'una' })}>Una tela para todo</button>
          <button type="button" aria-pressed={porPartes} onClick={() => set({ modo: 'partes' })}>Por partes</button>
        </div>
      </div>
      {porPartes ? (
        <div className="dzgrid">
          <DibujoMueble muebleId="sofa3" partes={PARTES} activa={a.parteActiva} colorDe={(i) => TELAS[a.telaPorParte[i]!]!.color} onElegir={(parteActiva) => set({ parteActiva })} />
          <div className="plist">
            {PARTES.map((p, i) => (
              <div key={p} className={a.parteActiva === i ? 'prow on' : 'prow'}>
                <button type="button" className="pbtn" aria-pressed={a.parteActiva === i} onClick={() => set({ parteActiva: i })}>
                  <i style={{ background: fondoTela(TELAS[a.telaPorParte[i]!]!) }} />
                  <span><b>{p}</b><small>{TELAS[a.telaPorParte[i]!]!.nombre}</small></span>
                </button>
                <Contador pequeno valor={a.yardasPorParte[i]!} unidad={UNIDAD.corta} etiqueta={`${UNIDAD.larga} para ${p}`}
                  onChange={(v) => set({ yardasPorParte: a.yardasPorParte.map((y, j) => (j === i ? v : y)) })} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="ydrow at-una">
          <div><b>Yardas para todo el sofá</b><small>Un sofá de 3 cuerpos usa unas {YARDAS_UNA_TELA} yardas.</small></div>
          <Contador valor={a.yardasUna} unidad={UNIDAD.corta} etiqueta={UNIDAD.larga} onChange={(yardasUna) => set({ yardasUna })} />
        </div>
      )}
      <span className="gw-field-label">{porPartes ? `Tela para: ${PARTES[a.parteActiva]}` : `Tela para todo el sofá · ${a.yardasUna} yd`}</span>
      <div className="sw at-sw">
        {TELAS.map((t) => {
          const on = elegida(t.id);
          return (
            <button key={t.id} type="button" aria-pressed={on} className={on ? 'on' : undefined} onClick={() => elegir(t.id)}>
              <span className="tex" style={{ background: fondoTela(t) }}><span className="ck"><Icon name="check" size={13} strokeWidth={3} /></span></span>
              <span className="cap"><b>{t.nombre}</b><small>Costo ${COSTO_YARDA[t.id]}/yd · proveedor</small></span>
            </button>
          );
        })}
      </div>
      <p className="audit">El costo por yarda es del catálogo del proveedor y solo lo ve usted. La clienta ve el precio final en el paso 4.</p>
    </section>
  );
}

/** Paso 3 · Traslado: delivery ida y vuelta (dirección + fecha preferida) o lo lleva ella. */
export function PasoTraslado(props: Omit<Props, 'c'>) {
  return <MapsProvider><Traslado {...props} /></MapsProvider>;
}

function Traslado({ a, set }: Omit<Props, 'c'>) {
  const guardada = DIRECCIONES_GUARDADAS.find((d) => d.id === a.direccionId);
  const mapa = a.usarDireccionNueva
    ? (a.ubicacionNueva ? { ubicacion: a.ubicacionNueva, etiqueta: a.direccionNueva } : { ubicacion: null })
    : { ubicacion: guardada?.ubicacion ?? null, etiqueta: guardada ? `${guardada.ciudad} · ${TRANSPORTE.millas} mi del taller` : undefined };
  const f = a.fecha;
  return (
    <section className="card stack" aria-labelledby="at-p3">
      <h2 id="at-p3" style={{ fontSize: 20 }}>¿Cómo llega el sofá al taller?</h2>
      <div className="opts" role="radiogroup" aria-label="Traslado">
        {([
          ['delivery', 'Delivery (recojo y entrega)', `Ida y vuelta, un solo costo · ${dolares(TRANSPORTE.costo)} por ${TRANSPORTE.millas} mi`, 'truck'],
          ['propio', 'Lo lleva y lo recoge ella', 'Sin costo de traslado', 'map-pin'],
        ] as const).map(([id, titulo, sub, icono]) => (
          <button key={id} type="button" role="radio" aria-checked={a.traslado === id} className={a.traslado === id ? 'opt on' : 'opt'} onClick={() => set({ traslado: id })}>
            <span className="ic"><Icon name={icono} /></span><span><b>{titulo}</b><small>{sub}</small></span>
          </button>
        ))}
      </div>
      {a.traslado === 'delivery' && (
        <>
          <div className="grid2" style={{ gap: 16, alignItems: 'start' }}>
            <div className="stack" style={{ gap: 8 }}>
              <label className="gw-field">
                <span className="gw-field-label">Dirección de recojo y entrega</span>
                <select className="gw-input" value={a.usarDireccionNueva ? '' : a.direccionId} disabled={a.usarDireccionNueva} onChange={(e) => set({ direccionId: e.target.value })}>
                  {a.usarDireccionNueva && <option value="">Dirección nueva</option>}
                  {DIRECCIONES_GUARDADAS.map((d) => <option key={d.id} value={d.id}>{d.etiqueta} · {d.texto}</option>)}
                </select>
              </label>
              <span className="muted" style={{ fontSize: 12.5 }}>Direcciones guardadas en el perfil de la clienta.</span>
              <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ usarDireccionNueva: !a.usarDireccionNueva })}>
                {a.usarDireccionNueva ? 'Usar una dirección guardada' : '+ Usar una dirección nueva'}
              </button>
              {a.usarDireccionNueva && (
                <>
                  {mapsHabilitado ? (
                    <DireccionAutocompletar label="Dirección nueva" value={a.direccionNueva}
                      onChange={(direccionNueva) => set({ direccionNueva, ubicacionNueva: null })}
                      onElegir={(d) => set({ direccionNueva: d.texto, ubicacionNueva: d.ubicacion })} />
                  ) : (
                    <TextField label="Dirección nueva" placeholder="Empiece a escribir…" hint="Autocompletada con Google Maps" value={a.direccionNueva} onChange={(e) => set({ direccionNueva: e.target.value })} />
                  )}
                  <TextField label="Depto., piso o referencia" optional value={a.referencia} onChange={(e) => set({ referencia: e.target.value })} />
                  <label className="row" style={{ fontSize: 14, gap: 8 }}>
                    <input type="checkbox" checked={a.guardarDireccion} onChange={(e) => set({ guardarDireccion: e.target.checked })} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />
                    Guardarla en el perfil de la clienta
                  </label>
                </>
              )}
            </div>
            {/* La distancia y el costo de transporte los calcula el backend con Google Maps (CU-C07). */}
            <MapaUbicacion alto={220} {...mapa} />
          </div>
          <div className="stack" style={{ gap: 8, marginTop: 8 }}>
            <span className="gw-field-label">¿Cuándo prefiere la clienta que pasemos a recogerlo?</span>
            <div className="pick2">
              <CalendarioRecojo value={f} onChange={(fecha) => set({ fecha })} />
              <div className="selday">
                <div className="big">
                  <span><small>{MESES[f.getMonth()]!.slice(0, 3)}</small>{f.getDate()}</span>
                  <div><b>{fechaLarga(f)}</b><em>Fecha preferida de recojo</em></div>
                </div>
                <span className="gw-field-label" id="at-franja">Franja horaria</span>
                <div className="row" style={{ flexWrap: 'wrap', gap: 8 }} role="radiogroup" aria-labelledby="at-franja">
                  {FRANJAS.map((l, i) => (
                    <button key={l} type="button" role="radio" aria-checked={a.franja === i} className={a.franja === i ? 'pslot on' : 'pslot'} onClick={() => set({ franja: i })}>{l}</button>
                  ))}
                </div>
                <span className="muted" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                  Es una preferencia: el taller confirma el día exacto al planificar la salida y le avisa a la clienta por correo y en su cuenta.
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

const numero = (v: string) => { const n = parseFloat(v.replace(',', '.')); return Number.isNaN(n) || n < 0 ? 0 : n; };

/** Paso 4 · Actividades del trabajo desde la plantilla, transporte y condiciones (CU-C06, C07, C08). */
export function PasoCotizar({ a, set, c }: Props) {
  const acts = a.actividades;
  const cambiar = (id: number, cambio: Partial<(typeof acts)[number]>) => set({ actividades: acts.map((x) => (x.id === id ? { ...x, ...cambio } : x)) });
  const direccion = a.usarDireccionNueva ? a.direccionNueva || 'Dirección nueva' : DIRECCIONES_GUARDADAS.find((d) => d.id === a.direccionId)?.texto.split(',')[0];
  return (
    <>
      <section className="card stack" style={{ padding: 20 }} aria-labelledby="at-p4">
        <div className="between" style={{ flexWrap: 'wrap' }}>
          <div>
            <h2 id="at-p4" style={{ fontSize: 20 }}>Actividades del trabajo</h2>
            <p className="muted" style={{ fontSize: 13 }}>Desde la plantilla <Link to="/admin/plantillas"><b>{PLANTILLA}</b></Link>, con las telas que eligió hoy. Edite horas y materiales.</p>
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <Link className="gw-btn gw-btn-secondary gw-btn-sm" to="/admin/plantillas">Cambiar plantilla</Link>
            <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm"
              onClick={() => set({ actividades: [...acts, { id: Math.max(0, ...acts.map((x) => x.id)) + 1, nombre: '', horas: 0, maquina: '—', horasMaquina: null, materiales: [] }] })}>
              + Agregar actividad
            </button>
          </div>
        </div>
        {c.dificiles.length > 0 && (
          <Alert tone="info" title="Tela que toma más tiempo" compact>
            {c.dificiles.join(' y ')} {c.dificiles.length > 1 ? 'son telas difíciles' : 'es una tela difícil'}: se sugieren +20 % de horas en coser y tapizar (marcadas en verde, puede ajustarlas).
          </Alert>
        )}
        <div className="tbl-box" style={{ boxShadow: 'none' }}>
          <table className="t at-t">
            <thead><tr><th style={{ width: '32%' }}>Actividad</th><th className="r" style={{ width: 92 }}>Horas persona</th><th>Máquina</th><th className="r" style={{ width: 92 }}>Horas máq.</th><th>Materiales</th><th style={{ width: 44 }}><span className="at-sr">Quitar</span></th></tr></thead>
            <tbody>
              {acts.map((x) => {
                const extra = c.extraDe(x);
                return (
                  <tr key={x.id}>
                    <td>{x.id > ACTIVIDADES.length
                      ? <input className="at-cell" style={{ fontWeight: 700 }} value={x.nombre} placeholder="Nombre de la actividad" aria-label="Nombre de la actividad" onChange={(e) => cambiar(x.id, { nombre: e.target.value })} />
                      : <b>{x.nombre}</b>}
                    </td>
                    <td>
                      <input className={extra ? 'at-cell at-chg' : 'at-cell'} type="number" min={0} step={0.5} aria-label={`Horas persona: ${x.nombre || 'actividad nueva'}`}
                        value={Math.round((x.horas + extra) * 10) / 10} title={extra ? `Incluye +${extra} h por tela difícil` : undefined}
                        onChange={(e) => cambiar(x.id, { horas: numero(e.target.value), manual: true })} />
                    </td>
                    <td className="muted">{x.maquina}</td>
                    <td>
                      {x.horasMaquina == null
                        ? <span className="muted">—</span>
                        : <input className="at-cell" type="number" min={0} step={0.5} aria-label={`Horas máquina: ${x.nombre}`} value={x.horasMaquina} onChange={(e) => cambiar(x.id, { horasMaquina: numero(e.target.value) })} />}
                    </td>
                    <td>
                      {x.materiales.length === 0 && <span className="muted">—</span>}
                      {x.materiales.flatMap((m) => (m === 'TELAS' ? c.telas.map((t) => `${t.tela.nombre} · ${t.yardas} yd`) : [m])).map((m) => <span key={m} className="at-mat">{m}</span>)}
                    </td>
                    <td>
                      <button type="button" className="at-x" aria-label={`Quitar actividad ${x.nombre || 'nueva'}`} onClick={() => set({ actividades: acts.filter((y) => y.id !== x.id) })}>
                        <Icon name="x" size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="between" style={{ paddingTop: 4, fontSize: 14, flexWrap: 'wrap' }}>
          <span className="muted">{acts.length} actividades</span>
          <span><span className="muted">Total horas persona</span> <b className="num">{c.horas} h</b></span>
        </div>
      </section>
      <div className="at-qgrid">
        <section className="card stack" style={{ padding: 18 }} aria-label="Transporte">
          <div className="between"><h3 style={{ fontSize: 16 }}>Transporte</h3><span className="pill"><Icon name="lock" size={14} />Calculado</span></div>
          <div className="kv"><span>{a.traslado === 'delivery' ? `Delivery ida y vuelta · ${TRANSPORTE.millas} mi` : 'Sin traslado'}</span><b>{a.traslado === 'delivery' ? direccion : 'La clienta lo lleva y lo recoge'}</b></div>
          <div className="kv"><span>Costo (un solo cobro)</span><b>{dolares(c.transporte)}</b></div>
        </section>
        <section className="card stack" style={{ padding: 18 }} aria-label="Condiciones">
          <div className="between"><h3 style={{ fontSize: 16 }}>Condiciones</h3><StatusChip status="Parámetros" tone="info" /></div>
          <div className="kv"><span>Vigencia</span><b>{VIGENCIA}</b></div>
          <div className="kv"><span>Adelanto sugerido</span><b>{ADELANTO * 100} % · sin pedidos cerrados</b></div>
          <div className="kv"><span>Telas del proveedor</span><b>{c.yardasTotal} yd · se piden al aceptar</b></div>
        </section>
        <section className="card stack" style={{ padding: 18 }} aria-label="Observaciones para la clienta">
          <div className="between" style={{ flexWrap: 'wrap' }}><h3 style={{ fontSize: 16 }}>Observaciones para la clienta</h3><span className="pill">Las verá en su cotización</span></div>
          <div className="gw-field">
            <label className="gw-field-label" htmlFor="at-obs">Una por línea</label>
            <textarea id="at-obs" className="gw-input gw-textarea" rows={3} value={a.observaciones} onChange={(e) => set({ observaciones: e.target.value })} />
          </div>
        </section>
      </div>
    </>
  );
}

/** Paso 5 · Respuesta de la clienta: acepta (orden + adelanto), lo pensará (se publica) o no acepta (motivo). CU-C09, C11, C14. */
export function PasoRespuesta({ a, set, c }: Props) {
  const recojo = a.traslado === 'delivery' ? `${fechaCorta(a.fecha)} por la ${a.franja === 0 ? 'mañana' : 'tarde'}` : null;
  const listo = a.resultado != null;
  return (
    <section className="card stack" aria-labelledby="at-p5">
      <h2 id="at-p5" style={{ fontSize: 20 }}>¿Qué decide la clienta?</h2>
      <div className="at-opts3" role="radiogroup" aria-label="Respuesta de la clienta">
        {([
          ['Acepta ahora', 'Se genera la orden y paga el adelanto aquí', 'check'],
          ['Lo pensará', 'Se publica en su cuenta con vigencia de 1 mes', 'clock'],
          ['No acepta', 'Con motivo obligatorio', 'x'],
        ] as const).map(([titulo, sub, icono], i) => (
          <button key={titulo} type="button" role="radio" aria-checked={a.respuesta === i} disabled={listo && a.respuesta !== i}
            className={a.respuesta === i ? 'opt on' : 'opt'} onClick={() => set({ respuesta: i as 0 | 1 | 2 })}>
            <span className="ic"><Icon name={icono} /></span><span><b>{titulo}</b><small>{sub}</small></span>
          </button>
        ))}
      </div>

      {a.respuesta === 0 && !listo && (
        <div className="at-paybox">
          <div className="between"><b>Adelanto en el local · {ADELANTO * 100} %</b><b className="at-bigv">{dolares(c.adelanto)}</b></div>
          <div className="at-chips" role="radiogroup" aria-label="Método de pago del adelanto">
            {METODOS_ADELANTO.map((m, i) => (
              <button key={m} type="button" role="radio" aria-checked={a.metodo === i} className="at-chip" onClick={() => set({ metodo: i })}>{m}</button>
            ))}
          </div>
          <label className="row" style={{ gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={a.firmo} onChange={(e) => set({ firmo: e.target.checked })} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />
            La clienta firmó la orden de servicio en la tablet
          </label>
          <button type="button" className="gw-btn gw-btn-primary gw-btn-lg" disabled={!a.firmo} onClick={() => set({ resultado: 'pagado' })}>Generar orden y registrar el adelanto</button>
          <button type="button" className="gw-btn gw-btn-ghost" disabled={!a.firmo} onClick={() => set({ resultado: 'despues' })}>Acepta, pero paga el adelanto después</button>
          {!a.firmo && <p className="audit">Sin la firma de la orden no se genera el pedido.</p>}
        </div>
      )}
      {a.respuesta === 0 && listo && (
        <>
          <div className="at-okbox" role="status">
            <Icon name="check" size={22} />
            <div>
              <b>{a.resultado === 'pagado' ? `Orden ${CITA.orden} firmada y pedido ${CITA.pedido} generado` : `Orden ${CITA.orden} firmada · adelanto pendiente`}</b>
              <small>
                {a.resultado === 'pagado'
                  ? `Adelanto ${dolares(c.adelanto)} en ${METODOS_ADELANTO[a.metodo]!.toLowerCase()} registrado.${recojo ? ` El recojo queda pedido para el ${recojo}` : ''}, y el pedido aparece en el Planning para planificar.`
                  : `Tiene ${PLAZO_ADELANTO} para pagar el ${dolares(c.adelanto)} desde su cuenta o en el local. El pedido se programa cuando el pago se confirme.`}
              </small>
            </div>
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <Link className="gw-btn gw-btn-primary" to="/admin/pedidos">Ver en el Planning</Link>
            <button type="button" className="gw-btn gw-btn-secondary" disabled title="El PDF de la orden lo genera el backend">Imprimir orden {CITA.orden}</button>
            <Link className="gw-btn gw-btn-ghost" to="/admin/agenda">Volver a la agenda</Link>
          </div>
        </>
      )}

      {a.respuesta === 1 && (listo ? (
        <>
          <div className="at-okbox" role="status">
            <Icon name="quote" size={22} />
            <div><b>Cotización {CITA.cotizacion} publicada en su cuenta</b><small>Le llegó por correo. Tiene hasta el vie 6 nov para aceptarla desde su celular (W4). La solicitud pasa a Cotizada.</small></div>
          </div>
          <Link className="gw-btn gw-btn-ghost" style={{ alignSelf: 'flex-start' }} to="/admin/agenda">Volver a la agenda</Link>
        </>
      ) : (
        <button type="button" className="gw-btn gw-btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => set({ resultado: 'publicada' })}>Publicar la cotización en su cuenta</button>
      ))}

      {a.respuesta === 2 && (listo ? (
        <>
          <div className="at-okbox at-okbox-n" role="status">
            <Icon name="x" size={22} />
            <div><b>Rechazo registrado · {MOTIVOS_RECHAZO[a.motivoRechazo]}</b><small>La cotización queda como Rechazada en la solicitud {CITA.solicitud}. Se conserva para el historial.</small></div>
          </div>
          <Link className="gw-btn gw-btn-ghost" style={{ alignSelf: 'flex-start' }} to="/admin/agenda">Volver a la agenda</Link>
        </>
      ) : (
        <>
          <span className="gw-field-label" id="at-mot">Motivo (obligatorio)</span>
          <div className="at-chips" role="radiogroup" aria-labelledby="at-mot">
            {MOTIVOS_RECHAZO.map((m, i) => (
              <button key={m} type="button" role="radio" aria-checked={a.motivoRechazo === i} className="at-chip" onClick={() => set({ motivoRechazo: i })}>{m}</button>
            ))}
          </div>
          <button type="button" className="gw-btn gw-btn-danger" style={{ alignSelf: 'flex-start' }} disabled={a.motivoRechazo < 0} onClick={() => set({ resultado: 'rechazo' })}>Registrar rechazo</button>
        </>
      ))}
    </section>
  );
}
