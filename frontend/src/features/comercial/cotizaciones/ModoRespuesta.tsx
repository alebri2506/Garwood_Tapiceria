import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TextField } from '../../../shared/ui/TextField';
import { Toast } from '../../../shared/ui/Toast';
import { dolares } from '../atender/estado';
import { MEDIOS_RESPUESTA, MOTIVOS_RECHAZO, type CotizacionRespuesta } from './datos';

const ACEPTA = 0, RECHAZA = 1;

/** Respuesta del cliente recibida fuera de la web: queda quién la registró, el medio y la hora (CU-C09). */
export function ModoRespuesta({ cotizacion, onEstado }: { cotizacion: CotizacionRespuesta; onEstado(estado: string): void }) {
  const [medio, setMedio] = useState(0);
  const [respuesta, setRespuesta] = useState(ACEPTA);
  const [motivo, setMotivo] = useState(-1);
  const [fecha, setFecha] = useState('mié 7 oct, 16:20');
  const [nota, setNota] = useState('');
  const [guardada, setGuardada] = useState(false);

  const rechazada = respuesta === RECHAZA;
  const incompleta = (rechazada && motivo < 0) || !fecha.trim();
  const detalle = `${rechazada ? `Rechazada · motivo: ${(MOTIVOS_RECHAZO[motivo] ?? '').toLowerCase()}` : 'Aceptada'} · por ${MEDIOS_RESPUESTA[medio]!.toLowerCase()} · registrada por Administrador.`;

  return (
    <div className="split">
      <div className="wide">
        <section className="card stack" aria-labelledby="co-resp">
          <div className="between" style={{ flexWrap: 'wrap' }}>
            <h2 id="co-resp" style={{ fontSize: 18 }}>Registrar respuesta del cliente</h2>
            <span className="muted" style={{ fontSize: 13 }}>Para respuestas fuera de la web</span>
          </div>
          <fieldset className="co-fs" style={{ gap: 12 }} disabled={guardada}>
            <legend className="co-sr">Respuesta del cliente</legend>
            <div className="stack" style={{ gap: 6 }}>
              <span className="gw-field-label" id="co-medio">¿Por qué medio respondió?</span>
              <div className="co-seg" role="group" aria-labelledby="co-medio">
                {MEDIOS_RESPUESTA.map((m, i) => <button key={m} type="button" aria-pressed={medio === i} onClick={() => setMedio(i)}>{m}</button>)}
              </div>
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <span className="gw-field-label" id="co-ans">Respuesta</span>
              <div className="co-seg" role="group" aria-labelledby="co-ans">
                {['Acepta', 'Rechaza'].map((a, i) => <button key={a} type="button" aria-pressed={respuesta === i} onClick={() => setRespuesta(i)}>{a}</button>)}
              </div>
            </div>
            {rechazada && (
              <div className="stack" style={{ gap: 6 }}>
                <span className="gw-field-label" id="co-mot">Motivo del rechazo · obligatorio (RN-04)</span>
                <div className="co-seg" role="group" aria-labelledby="co-mot">
                  {MOTIVOS_RECHAZO.map((m, i) => <button key={m} type="button" aria-pressed={motivo === i} onClick={() => setMotivo(i)}>{m}</button>)}
                </div>
              </div>
            )}
            <div className="grid2" style={{ gap: 14 }}>
              <TextField label="Fecha y hora de la respuesta" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
              <TextField label="Nota" optional placeholder="Ej.: pide que el recojo sea por la mañana" value={nota} onChange={(e) => setNota(e.target.value)} />
            </div>
          </fieldset>
          {guardada ? (
            <>
              <Toast title="Respuesta registrada">{detalle}</Toast>
              <Link className="gw-btn gw-btn-secondary" style={{ alignSelf: 'flex-start' }} to={rechazada ? '/admin/cotizaciones' : '/admin/pagos'}>{rechazada ? 'Volver a Cotizaciones' : 'Ver el adelanto en Pagos'}</Link>
            </>
          ) : (
            <button type="button" className="gw-btn gw-btn-primary" style={{ alignSelf: 'flex-start' }} disabled={incompleta}
              onClick={() => { setGuardada(true); onEstado(rechazada ? 'Rechazada' : 'Aceptada: pendiente de adelanto'); }}>
              Guardar respuesta
            </button>
          )}
        </section>
      </div>
      <aside className="aside">
        <section className="card stack" aria-label={`Cotización ${cotizacion.codigo}`}>
          <span className="ov">Cotización {cotizacion.codigo}</span>
          <b className="co-nombre">{cotizacion.cliente} · {cotizacion.mueble}</b>
          <div className="kv"><span>Total</span><b>{dolares(cotizacion.total)}</b></div>
          <div className="kv"><span>Publicada</span><b>{cotizacion.publicada}</b></div>
          <div className="kv"><span>Vigencia</span><b>{cotizacion.vigencia}</b></div>
          <p className="audit">Queda quién registró la respuesta, el medio y la hora.</p>
        </section>
      </aside>
    </div>
  );
}
