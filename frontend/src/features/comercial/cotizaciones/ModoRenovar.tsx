import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '../../../shared/ui/Alert';
import { StatusChip } from '../../../shared/ui/StatusChip';
import { TextField } from '../../../shared/ui/TextField';
import { Toast } from '../../../shared/ui/Toast';
import { dolares } from '../atender/estado';
import { RENOVACION } from './datos';

/** Renovar una cotización vencida: nueva versión con los costos de hoy, nunca reutiliza el precio anterior (CU-C10). */
export function ModoRenovar({ onEstado }: { onEstado(estado: string): void }) {
  const [propuesto, setPropuesto] = useState(RENOVACION.propuesto.toFixed(2));
  const [publicada, setPublicada] = useState(false);
  const valido = parseFloat(propuesto.replace(',', '.')) > 0;

  return (
    <>
      <Alert tone="info" title="COT-0071 · Tom Becker · vencida el 1 oct">Renovar revisa que los materiales sigan activos y toma los costos de hoy. Se publica con una vigencia nueva y la versión anterior queda Reemplazada.</Alert>
      <Alert tone="warning" title="Hay una plantilla más nueva" compact>Cabecera · Retapizado tiene la versión v2 desde el 1 oct (la cotización usó la v1). <Link to="/admin/plantillas" style={{ fontWeight: 600 }}>Ver cambios</Link></Alert>
      <div className="split">
        <div className="wide">
          <div className="tbl-box">
            <table className="t">
              <thead><tr><th>Material</th><th className="r">Costo al cotizar</th><th className="r">Costo hoy</th><th>Estado</th></tr></thead>
              <tbody>
                {RENOVACION.materiales.map((m) => (
                  <tr key={m.nombre}>
                    <td><b>{m.nombre}</b>{m.nota && <> <span className="muted co-s">{m.nota}</span></>}</td>
                    <td className="r">{m.antes}</td>
                    <td className={m.subio ? 'r co-up' : 'r'}>{m.hoy}</td>
                    <td><StatusChip status={m.estado} tone={m.tono} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <aside className="aside">
          <section className="card stack" aria-label="Precio de la renovación">
            <div className="kv"><span>Sugerido anterior</span><b>{dolares(RENOVACION.sugeridoAnterior)}</b></div>
            <div className="kv"><span>Sugerido recalculado</span><b className="co-up">{dolares(RENOVACION.sugeridoNuevo)}</b></div>
            <TextField label="Precio propuesto ($)" inputMode="decimal" disabled={publicada} error={valido ? undefined : 'Indique el precio propuesto.'} value={propuesto} onChange={(e) => setPropuesto(e.target.value)} />
            <div className="kv"><span>Nueva vigencia</span><b>{RENOVACION.vigencia}</b></div>
            {publicada
              ? <Toast title="Cotización renovada y publicada">Tom Becker recibió correo y notificación. La versión anterior queda Reemplazada.</Toast>
              : <button type="button" className="gw-btn gw-btn-primary gw-btn-block" disabled={!valido} onClick={() => { setPublicada(true); onEstado('Pendiente de respuesta'); }}>Renovar y publicar</button>}
          </section>
        </aside>
      </div>
    </>
  );
}
