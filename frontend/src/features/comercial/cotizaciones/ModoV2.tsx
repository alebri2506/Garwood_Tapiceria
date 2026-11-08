import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '../../../shared/ui/Alert';
import { Icon } from '../../../shared/ui/Icon';
import { TextField } from '../../../shared/ui/TextField';
import { Toast } from '../../../shared/ui/Toast';
import { UploadZone } from '../../../shared/ui/UploadZone';
import { dolares } from '../atender/estado';
import { ADICIONALES, V2, sugeridoAdicional, type Adicional } from './datos';

const numero = (v: string) => { const n = parseFloat(v.replace(',', '.')); return Number.isNaN(n) || n < 0 ? 0 : n; };

/** Recotización por daño oculto: V2 = V1 + cobro adicional. La V1 no cambia y la V2 solo puede subir (CU-C08). */
export function ModoV2({ onEstado }: { onEstado(estado: string): void }) {
  const [filas, setFilas] = useState<Adicional[]>(ADICIONALES);
  const [cobro, setCobro] = useState(String(V2.cobroInicial));
  const [plazo, setPlazo] = useState(V2.plazo);
  const [fotos, setFotos] = useState<File[]>(() => V2.fotos.map((n) => new File([], n)));
  const [publicada, setPublicada] = useState(false);

  const adicional = numero(cobro);
  const total = V2.totalV1 + adicional;
  const cambiar = (id: number, cambio: Partial<Adicional>) => setFilas((x) => x.map((f) => (f.id === id ? { ...f, ...cambio } : f)));

  const falta = adicional <= 0 ? 'El cobro adicional debe ser mayor que cero: la V2 solo puede subir.'
    : filas.length === 0 ? 'Agregue al menos una actividad adicional.'
    : filas.some((f) => !f.nombre.trim()) ? 'Hay una actividad adicional sin nombre.'
    : fotos.length === 0 ? 'Adjunte al menos una foto del daño.'
    : !plazo.trim() ? 'Indique el plazo para responder.'
    : '';

  return (
    <>
      <Alert tone="warning" title="Daño oculto reportado por producción (Carlos) · 13 oct 11:20">Resortes del asiento rotos. PED-0077 (Robert King · Sillón Berger) está en pausa hasta que el cliente responda.</Alert>
      <fieldset className="co-fs" disabled={publicada}>
        <legend className="co-sr">Recotización</legend>
        <div className="split">
          <div className="wide">
            <section className="card stack" aria-labelledby="co-v2">
              <Alert tone="warning" title="Orden OS-0077 anulada en la revisión inicial · mar 13 oct" compact>Al recibir el sillón se encontraron resortes rotos y el marco flojo. El mueble no se ha tocado. El pedido sigue detenido hasta que el cliente responda la recotización.</Alert>
              <div className="between" style={{ flexWrap: 'wrap' }}>
                <h2 id="co-v2" style={{ fontSize: 18 }}>V2 = V1 + cobro adicional</h2>
                <span className="muted" style={{ fontSize: 13 }}>La V1 no se modifica; la V2 solo puede subir</span>
              </div>
              <div className="tbl-box" style={{ boxShadow: 'none' }}>
                <table className="t">
                  <thead><tr><th>Actividad</th><th className="r">Horas</th><th>Materiales</th><th>Versión</th><th><span className="co-sr">Quitar</span></th></tr></thead>
                  <tbody>
                    <tr className="co-locked"><td>5 actividades de la V1 (retapizado del sillón)</td><td className="r">10 h</td><td>Terciopelo verde 8 yd, espuma, ribete…</td><td className="co-nw">V1 · bloqueada</td><td /></tr>
                    {filas.map((f) => (
                      <tr key={f.id} className="co-add">
                        <td>{f.nueva
                          ? <input className="co-cell" style={{ fontWeight: 700 }} value={f.nombre} placeholder="Nombre de la actividad" aria-label="Nombre de la actividad" onChange={(e) => cambiar(f.id, { nombre: e.target.value })} />
                          : <b>{f.nombre}</b>}
                        </td>
                        <td className="r"><input className="co-cell" style={{ width: 70 }} type="number" min={0} step={0.5} value={f.horas} aria-label={`Horas: ${f.nombre || 'actividad nueva'}`} onChange={(e) => cambiar(f.id, { horas: numero(e.target.value) })} /></td>
                        <td>{f.materiales.length ? f.materiales.map((m) => <span key={m.nombre} className="co-mat">{m.nombre}</span>) : <span className="muted">—</span>}</td>
                        <td className="co-nw"><b style={{ color: 'var(--success-ink)' }}>+ V2</b></td>
                        <td><button type="button" className="co-x" aria-label={`Quitar ${f.nombre || 'actividad nueva'}`} onClick={() => setFilas((x) => x.filter((y) => y.id !== f.id))}><Icon name="x" size={16} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" style={{ alignSelf: 'flex-start' }}
                onClick={() => setFilas((x) => [...x, { id: Math.max(0, ...x.map((f) => f.id)) + 1, nombre: '', horas: 0, materiales: [], nueva: true }])}>
                + Agregar actividad adicional
              </button>
              <UploadZone title="Fotos del daño (del taller)" hint="Al menos una foto" files={fotos} onChange={setFotos} />
            </section>
          </div>
          <aside className="aside">
            <section className="card stack" aria-label="Lo que verá el cliente">
              <span className="ov">Lo que verá el cliente (W8)</span>
              <div className="kv"><span>V1 aceptada</span><b>{dolares(V2.totalV1)}</b></div>
              <TextField label="Cobro adicional" required inputMode="decimal" hint={`Sugerido ${dolares(sugeridoAdicional(filas))} · el cliente solo ve el cobro`} value={cobro} onChange={(e) => setCobro(e.target.value)} />
              <hr className="stitch" />
              <div className="kv"><span><b style={{ color: 'var(--ink)' }}>Total V2</b></span><b className="co-total">{dolares(total)}</b></div>
              <div className="kv"><span>Nuevo saldo al entregar</span><b>{dolares(total - V2.adelantoPagado)}</b></div>
              <TextField label="Plazo para responder" hint="Parámetro: 5 días" value={plazo} onChange={(e) => setPlazo(e.target.value)} />
              <div className="kv"><span>Si no la acepta · cargo por revisión</span><b>{dolares(V2.cargoRevision)}</b></div>
              <p className="audit" style={{ margin: 0 }}>El cargo sale de Parámetros. Se descuenta del adelanto y el mueble se devuelve.</p>
              {!publicada && (
                <>
                  <button type="button" className="gw-btn gw-btn-primary gw-btn-block" disabled={Boolean(falta)} onClick={() => { setPublicada(true); onEstado('Pendiente de respuesta'); }}>Publicar recotización y avisar al cliente</button>
                  {falta && <p className="co-falta" role="status">{falta}</p>}
                </>
              )}
            </section>
          </aside>
        </div>
      </fieldset>
      {publicada && (
        <>
          <Toast title="Recotización publicada">Robert King recibió correo y notificación. Si la acepta se genera la orden OS-0077-2; si no, se cobra la revisión y se devuelve el sillón.</Toast>
          <Link className="gw-btn gw-btn-secondary" style={{ alignSelf: 'flex-start' }} to="/admin/cotizaciones">Volver a Cotizaciones</Link>
        </>
      )}
    </>
  );
}
