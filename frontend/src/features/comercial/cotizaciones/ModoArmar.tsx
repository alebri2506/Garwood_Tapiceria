import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../../shared/ui/Icon';
import { PricePanel } from '../../../shared/ui/PricePanel';
import { StatusChip } from '../../../shared/ui/StatusChip';
import { TextField } from '../../../shared/ui/TextField';
import { Toast } from '../../../shared/ui/Toast';
import { dolares } from '../atender/estado';
import { ACTIVIDADES, MEDIOS_MUEBLE, OBSERVACIONES, PLANTILLA, PROPUESTO_INICIAL, TRANSPORTE, calcularSugerido, type Actividad } from './datos';
import { FotosMueble } from './VisorMedios';

const numero = (v: string) => { const n = parseFloat(v.replace(',', '.')); return Number.isNaN(n) || n < 0 ? 0 : n; };

type Revision = { tono: 'ok' | 'warn' | 'falta'; texto: string };

/** Armar la cotización: actividades de la plantilla, transporte, condiciones y precio propuesto (CU-C07, C08). */
export function ModoArmar({ onEstado, onResponder }: { onEstado(estado: string): void; onResponder(total: number): void }) {
  const [actividades, setActividades] = useState<Actividad[]>(() => ACTIVIDADES.map((a) => ({ ...a })));
  const [observaciones, setObservaciones] = useState(OBSERVACIONES);
  const [propuesto, setPropuesto] = useState(PROPUESTO_INICIAL);
  const [motivo, setMotivo] = useState('Ajuste acordado en la cita');
  const [manual, setManual] = useState(false);
  const [montoManual, setMontoManual] = useState('');
  const [motivoManual, setMotivoManual] = useState('');
  const [publicada, setPublicada] = useState(false);

  const { horas, horasMaquina, desglose } = calcularSugerido(actividades);
  const transporte = manual ? numero(montoManual) : TRANSPORTE.costo;
  const cambiar = (id: number, cambio: Partial<Actividad>) => setActividades((x) => x.map((a) => (a.id === id ? { ...a, ...cambio } : a)));
  const agregar = () => setActividades((x) => [...x, { id: Math.max(0, ...x.map((a) => a.id)) + 1, nombre: '', horas: 0, maquina: '—', tarifaMaquina: 0, horasMaquina: null, materiales: [], nueva: true }]);

  const fotos = MEDIOS_MUEBLE.filter((m) => m.tipo === 'Foto').length;
  const videos = MEDIOS_MUEBLE.length - fotos;
  const llevaTela = actividades.some((a) => a.materiales.some((m) => m.tela));
  const manualCompleto = numero(montoManual) > 0 && motivoManual.trim() !== '';

  const revision: Revision[] = [
    manual && !manualCompleto
      ? { tono: 'falta', texto: 'Falta el costo y el motivo del transporte a mano' }
      : { tono: 'ok', texto: manual ? 'Logística completa: transporte ingresado a mano' : 'Logística completa: dirección ubicada y transporte calculado' },
    { tono: 'ok', texto: 'Ningún material descontinuado' },
    { tono: 'ok', texto: 'Costos vigentes: precios actualizados hace 5 días' },
    ...(llevaTela ? [{ tono: 'warn', texto: 'Lino Navy 204 requiere compra (14 yd). No bloquea: se pide al aceptar' } as Revision] : []),
    { tono: 'ok', texto: 'Vigencia: 1 mes, igual a la del precio de la tela' },
    ...(actividades.length === 0 ? [{ tono: 'falta', texto: 'Agregue al menos una actividad' } as Revision] : []),
    ...(actividades.some((a) => !a.nombre.trim()) ? [{ tono: 'falta', texto: 'Hay una actividad sin nombre' } as Revision] : []),
    ...(propuesto <= 0 ? [{ tono: 'falta', texto: 'Indique el precio propuesto' } as Revision] : []),
  ];
  const lista = revision.every((r) => r.tono !== 'falta');

  const publicar = () => { setPublicada(true); onEstado('Pendiente de respuesta'); };
  const publicarYResponder = () => { if (!publicada) publicar(); onResponder(propuesto + transporte); };

  return (
    <div className="split">
      <div className="wide">
        <section className="card co-ficha" aria-label="Datos de la solicitud">
          <div className="row">
            <span className="thumb" style={{ width: 64, height: 64 }}><Icon name="sofa" size={28} /></span>
            <div><b className="co-nombre">Laura Méndez</b><div className="muted" style={{ fontSize: 13 }}>Cliente nueva · sin pedidos cerrados · Montclair, NJ</div></div>
          </div>
          <div className="co-datos">
            <div><div className="muted">Mueble</div><b>Sofá 3 cuerpos</b></div>
            <div><div className="muted">Servicio</div><b>Retapizado + espuma</b></div>
            <div><div className="muted">Tela</div><b>Lino Navy 204 · 14 yd</b></div>
            <div><div className="muted">Fotos y videos</div><b>{fotos} fotos · {videos} video</b></div>
          </div>
        </section>

        <FotosMueble />

        <fieldset className="co-fs" disabled={publicada}>
          <legend className="co-sr">Datos editables de la cotización</legend>
          <section className="card stack" style={{ padding: 20 }} aria-labelledby="co-acts">
            <div className="between" style={{ flexWrap: 'wrap' }}>
              <div>
                <h2 id="co-acts" style={{ fontSize: 20 }}>Actividades del trabajo</h2>
                <p className="muted" style={{ fontSize: 13 }}>Desde la plantilla <Link to="/admin/plantillas"><b>{PLANTILLA}</b></Link>. Edite las horas; el precio sugerido se recalcula.</p>
              </div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <Link className="gw-btn gw-btn-secondary gw-btn-sm" to="/admin/plantillas">Cambiar plantilla</Link>
                <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" onClick={agregar}>+ Agregar actividad</button>
              </div>
            </div>
            <div className="tbl-box" style={{ boxShadow: 'none' }}>
              <table className="t co-acts">
                <thead><tr><th style={{ width: '30%' }}>Actividad</th><th className="r" style={{ width: 92 }}>Horas persona</th><th>Máquina</th><th className="r" style={{ width: 92 }}>Horas máq.</th><th>Materiales</th><th style={{ width: 44 }}><span className="co-sr">Quitar</span></th></tr></thead>
                <tbody>
                  {actividades.map((a) => (
                    <tr key={a.id}>
                      <td>{a.nueva
                        ? <input className="co-cell" style={{ fontWeight: 700 }} value={a.nombre} placeholder="Nombre de la actividad" aria-label="Nombre de la actividad" onChange={(e) => cambiar(a.id, { nombre: e.target.value })} />
                        : <b>{a.nombre}</b>}
                      </td>
                      <td><input className="co-cell" type="number" min={0} step={0.5} value={a.horas} aria-label={`Horas persona: ${a.nombre || 'actividad nueva'}`} onChange={(e) => cambiar(a.id, { horas: numero(e.target.value) })} /></td>
                      <td className="muted">{a.maquina}</td>
                      <td>{a.horasMaquina == null
                        ? <span className="muted">—</span>
                        : <input className="co-cell" type="number" min={0} step={0.5} value={a.horasMaquina} aria-label={`Horas máquina: ${a.nombre}`} onChange={(e) => cambiar(a.id, { horasMaquina: numero(e.target.value) })} />}
                      </td>
                      <td>
                        {a.materiales.length === 0 && <span className="muted">—</span>}
                        {a.materiales.map((m) => <span key={m.nombre} className="co-mat">{m.nombre}</span>)}
                      </td>
                      <td>
                        <button type="button" className="co-x" aria-label={`Quitar actividad ${a.nombre || 'nueva'}`} onClick={() => setActividades((x) => x.filter((y) => y.id !== a.id))}><Icon name="x" size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="between" style={{ paddingTop: 4, fontSize: 14, flexWrap: 'wrap' }}>
              <span className="muted">{actividades.length} {actividades.length === 1 ? 'actividad' : 'actividades'}</span>
              <span><span className="muted">Total horas persona</span> <b className="num">{horas} h</b> · <span className="muted">horas máquina</span> <b className="num">{horasMaquina} h</b></span>
            </div>
          </section>

          <div className="co-qgrid">
            <section className="card stack" style={{ padding: 20 }} aria-label="Transporte">
              <div className="between"><h3 style={{ fontSize: 16 }}>Transporte</h3><span className="pill"><Icon name={manual ? 'user' : 'lock'} size={14} />{manual ? 'A mano' : 'Calculado'}</span></div>
              <div className="kv"><span>Delivery ida y vuelta</span><b>{TRANSPORTE.direccion}</b></div>
              {manual ? (
                <>
                  <TextField label="Costo (un solo cobro)" required inputMode="decimal" placeholder="Ej.: 90" value={montoManual} onChange={(e) => setMontoManual(e.target.value)} />
                  <TextField label="¿Por qué se ingresa a mano?" required placeholder="Ej.: Google Maps no ubica la dirección" value={motivoManual} onChange={(e) => setMotivoManual(e.target.value)} />
                  <button type="button" className="co-link" onClick={() => setManual(false)}>Volver al costo calculado ({dolares(TRANSPORTE.costo)})</button>
                </>
              ) : (
                <>
                  <div className="kv"><span>Distancia al taller</span><b>{TRANSPORTE.millas} mi</b></div>
                  <div className="kv"><span>Costo (un solo cobro)</span><b>{dolares(TRANSPORTE.costo)}</b></div>
                  <p className="audit">¿Google Maps no ubica la dirección? <button type="button" className="co-link" onClick={() => setManual(true)}>Ingresar el transporte a mano</button> · queda registrado quién y por qué.</p>
                </>
              )}
            </section>
            <section className="card stack" style={{ padding: 20 }} aria-label="Condiciones">
              <div className="between"><h3 style={{ fontSize: 16 }}>Condiciones</h3><StatusChip status="Parámetros" tone="info" /></div>
              <div className="kv"><span>Vigencia</span><b>1 mes · hasta vie 6 nov</b></div>
              <div className="kv"><span>Adelanto sugerido</span><b>40 % · sin pedidos cerrados (RN-05)</b></div>
              {llevaTela && <div className="kv"><span>Tela bajo pedido</span><b>14 yd · se compra al aceptar</b></div>}
            </section>
            <section className="card stack" style={{ padding: 20 }} aria-label="Observaciones para el cliente">
              <div className="between" style={{ flexWrap: 'wrap' }}><h3 style={{ fontSize: 16 }}>Observaciones para el cliente</h3><span className="pill">Las verá en su cotización</span></div>
              <div className="gw-field">
                <label className="gw-field-label" htmlFor="co-obs">Una por línea</label>
                <textarea id="co-obs" className="gw-input gw-textarea" rows={4} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
              </div>
              <p className="audit">No escriba costos, márgenes ni el precio sugerido: el cliente lee este texto tal cual.</p>
            </section>
          </div>
        </fieldset>
      </div>

      <aside className="aside">
        <section className="card stack" style={{ padding: '18px 20px' }} aria-labelledby="co-rev">
          <div className="between">
            <h3 id="co-rev" style={{ fontSize: 16 }}>Revisión antes de publicar</h3>
            <span className={lista ? 'pill co-pill-ok' : 'pill co-pill-warn'}>{lista ? 'Lista' : 'Falta completar'}</span>
          </div>
          {revision.map((r) => (
            <div key={r.texto} className={`co-ck co-ck-${r.tono}`}><Icon name={r.tono === 'ok' ? 'check' : 'alert'} size={16} /><span>{r.texto}</span></div>
          ))}
        </section>

        <fieldset className="co-fs" disabled={publicada}>
          <legend className="co-sr">Precio de la cotización</legend>
          <PricePanel
            desglose={desglose}
            propuesto={propuesto}
            onPropuesto={setPropuesto}
            motivo={motivo}
            onMotivo={setMotivo}
            transporte={transporte}
            sugerencia="En los últimos 3 pedidos de sofá 3 cuerpos se usó 12 % más tela de lo cotizado."
          >
            <p className="audit" style={{ margin: 0 }}>Precio propuesto editado por Administrador · mar 6 oct 2026, 11:12</p>
            {!publicada && <button type="button" className="gw-btn gw-btn-primary gw-btn-block" disabled={!lista} onClick={publicar}>Publicar y avisar al cliente</button>}
          </PricePanel>
        </fieldset>
        {publicada && (
          <Toast title="Cotización COT-0076 publicada">Laura Méndez recibió correo y notificación. Tiene hasta el vie 6 nov para responder.</Toast>
        )}
        <p className="audit">El cliente verá los trabajos sin montos, el precio del servicio, el transporte y el total. Nunca el desglose ni el precio sugerido.</p>
        <section className="card stack co-presente" aria-labelledby="co-presente">
          <b id="co-presente" style={{ fontSize: 15 }}>¿El cliente está con usted?</b>
          <span className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>Si está en el local o al teléfono, publique y registre su respuesta en el momento. Si acepta, el adelanto se cobra ahí mismo en Pagos.</span>
          <button type="button" className="gw-btn gw-btn-secondary gw-btn-block" disabled={!lista} onClick={publicarYResponder}>{publicada ? 'Registrar su respuesta ahora' : 'Publicar y registrar su respuesta ahora'}</button>
          <Link className="gw-btn gw-btn-ghost gw-btn-block" to="/admin/pagos">Cobrar el adelanto en el local</Link>
        </section>
      </aside>
    </div>
  );
}
