import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../../shared/ui/Icon';
import { StatusChip } from '../../../shared/ui/StatusChip';
import type { Aviso, Tarjeta } from './datos';

/** Línea de pasos compacta: hechos en verde, el actual resaltado. */
export function Pasos({ pasos, actual }: { pasos: string[]; actual: number }) {
  return (
    <ol className="steps" aria-label={`Paso ${actual + 1} de ${pasos.length}: ${pasos[actual]}`}>
      {pasos.map((l, i) => (
        <li key={l} style={{ display: 'contents' }}>
          {i > 0 && <span className={i <= actual ? 'ln d' : 'ln'} aria-hidden="true" />}
          <span className={i < actual ? 's d' : i === actual ? 's c' : 's'}><i aria-hidden="true" />{l}</span>
        </li>
      ))}
    </ol>
  );
}

/** Qué sigue: le toca al cliente (amarillo) o al taller (azul). */
export function AvisoSiguiente({ aviso }: { aviso: Aviso }) {
  return (
    <div className={`nx ${aviso.quien}`}>
      <Icon name={aviso.icono} size={18} />
      <span>{aviso.texto}</span>
    </div>
  );
}

/** Tarjeta de las listas de W6a (pedidos) y W6c (solicitudes y cotizaciones). */
export function TarjetaPedido({ t, children }: { t: Tarjeta; children?: ReactNode }) {
  return (
    <article className={t.necesitaAccion && t.monto ? 'oc act' : 'oc'}>
      <span className={`thumb ${t.thumb} ph`}><Icon name={t.icono} size={30} /></span>
      <div className="bd">
        <div className="between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div><h2>{t.titulo}</h2><span className="code">{t.codigo}</span></div>
          <StatusChip status={t.estado} tone={t.tono} />
        </div>
        <Pasos pasos={t.pasos} actual={t.pasoActual} />
        <AvisoSiguiente aviso={t.aviso} />
      </div>
      <div className="oside">
        {t.monto && <div className="amt"><b>{t.monto.valor}</b><small>{t.monto.sub}</small></div>}
        {t.accion && <Link className={`gw-btn gw-btn-${t.accion.tipo} gw-btn-block`} to={t.accion.a}>{t.accion.texto}</Link>}
        {children}
      </div>
    </article>
  );
}
