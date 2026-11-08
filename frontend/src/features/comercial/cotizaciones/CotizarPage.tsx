import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { TopAdmin } from '../../../app/layout/AdminLayout';
import { Icon } from '../../../shared/ui/Icon';
import { StatusChip } from '../../../shared/ui/StatusChip';
import { ModoArmar } from './ModoArmar';
import { ModoRenovar } from './ModoRenovar';
import { ModoRespuesta } from './ModoRespuesta';
import { ModoV2 } from './ModoV2';
import { RESPUESTA_ARMADA, RESPUESTA_EJEMPLO, type CotizacionRespuesta } from './datos';
import './cotizaciones.css';

const MODOS = [
  { clave: 'armar', etiqueta: 'Armar cotización', crumb: 'SOL-0076 · mar 6 oct, después de la cita', titulo: 'Cotización COT-0076', estado: 'Borrador' },
  { clave: 'v2', etiqueta: 'Recotización (V2) tras la revisión', crumb: 'PED-0077 · mar 13 oct', titulo: 'COT-0077 · versión V2', estado: 'Borrador' },
  { clave: 'respuesta', etiqueta: 'Registrar respuesta del cliente', crumb: 'SOL-0078 · mié 7 oct', titulo: 'Respuesta a COT-0078', estado: 'Pendiente de respuesta' },
  { clave: 'recalcular', etiqueta: 'Renovar vencida', crumb: 'SOL-0071 · mar 13 oct', titulo: 'Renovar COT-0071', estado: 'Vencida' },
];

/** A4 Cotización: armar, recotizar por daño oculto, registrar la respuesta y renovar (CU-C08, C09, C10). */
export function CotizarPage() {
  const [params, setParams] = useSearchParams();
  const i = Math.max(0, MODOS.findIndex((m) => m.clave === params.get('modo')));
  const [respuesta, setRespuesta] = useState<CotizacionRespuesta>(RESPUESTA_EJEMPLO);
  const armada = respuesta !== RESPUESTA_EJEMPLO;
  const modo = i === 2 && armada ? { ...MODOS[2]!, crumb: 'SOL-0076 · mar 6 oct', titulo: `Respuesta a ${respuesta.codigo}` } : MODOS[i]!;
  const [estados, setEstados] = useState(() => MODOS.map((m) => m.estado));
  const cambiarEstado = (indice: number) => (estado: string) => setEstados((x) => x.map((e, k) => (k === indice ? estado : e)));

  // Publicó con el cliente presente: su respuesta se registra en la misma cotización.
  const responderAhora = (total: number) => {
    setRespuesta({ ...RESPUESTA_ARMADA, total });
    cambiarEstado(2)('Pendiente de respuesta');
    setParams({ modo: 'respuesta' }, { replace: true });
  };

  return (
    <>
      <TopAdmin
        crumb={<><Link to="/admin/cotizaciones">Cotizaciones</Link> › {modo.crumb}</>}
        titulo={modo.titulo}
        debajo={<div style={{ marginTop: 8 }}><StatusChip status={estados[i]} /></div>}
      >
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {i === 0 && (
            <span className="pill co-tiempo"><Icon name="clock" size={14} />{estados[0] === 'Borrador' ? 'Armando hace 11 min' : 'Armada en 11 min'}</span>
          )}
          {i === 1 && <Link className="gw-btn gw-btn-ghost" to="/admin/pedidos">Ficha del pedido</Link>}
        </div>
      </TopAdmin>

      <div className="co-modes" role="group" aria-label="Acciones de la cotización">
        {MODOS.map((m, k) => (
          <button key={m.clave} type="button" aria-pressed={i === k} onClick={() => setParams(k === 0 ? {} : { modo: m.clave }, { replace: true })}>{m.etiqueta}</button>
        ))}
      </div>

      {/* Se quedan montados: cambiar de pestaña no pierde lo que ya se escribió. */}
      <div className="co-modo" hidden={i !== 0}><ModoArmar onEstado={cambiarEstado(0)} onResponder={responderAhora} /></div>
      <div className="co-modo" hidden={i !== 1}><ModoV2 onEstado={cambiarEstado(1)} /></div>
      <div className="co-modo" hidden={i !== 2}><ModoRespuesta key={respuesta.codigo} cotizacion={respuesta} onEstado={cambiarEstado(2)} /></div>
      <div className="co-modo" hidden={i !== 3}><ModoRenovar onEstado={cambiarEstado(3)} /></div>
    </>
  );
}
