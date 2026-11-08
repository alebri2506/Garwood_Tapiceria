import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { TopAdmin } from '../../../app/layout/AdminLayout';
import { normalizar } from '../../../shared/texto';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { Icon } from '../../../shared/ui/Icon';
import { StatusChip } from '../../../shared/ui/StatusChip';
import { Tabs } from '../../../shared/ui/Tabs';
import { dolares } from '../atender/estado';
import { COTIZACIONES, ESTADOS_COTIZACION, POR_ARMAR, RUTA_COTIZAR } from './datos';
import './cotizaciones.css';

const PENDIENTE = 1 + ESTADOS_COTIZACION.indexOf('Pendiente de respuesta');
const ACEPTADA = 1 + ESTADOS_COTIZACION.indexOf('Aceptada');

/** A4 Cotizaciones: lo que falta armar y el estado de cada cotización (CU-C08, C09, C10). */
export function CotizacionesPage() {
  const [pestana, setPestana] = useState(0);
  const [busca, setBusca] = useState('');
  const porArmar = useRef<HTMLElement>(null);

  const estado = pestana === 0 ? null : ESTADOS_COTIZACION[pestana - 1];
  const texto = normalizar(busca.trim());
  const filas = COTIZACIONES.filter((c) => (!estado || c.estado === estado) && (!texto || normalizar(`${c.codigo} ${c.cliente} ${c.mueble}`).includes(texto)));
  const pendientes = COTIZACIONES.filter((c) => c.estado === 'Pendiente de respuesta');

  return (
    <>
      <TopAdmin crumb="Comercial › Cotizaciones" titulo="Cotizaciones">
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <label className="search co-search">
            <Icon name="search" size={18} />
            <input type="search" aria-label="Buscar cotización" placeholder="Buscar por cliente o código" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
          <Link className="gw-btn gw-btn-primary" to="/admin/solicitudes">+ Nueva cotización</Link>
        </div>
      </TopAdmin>

      <div className="co-kp">
        <button type="button" className="co-k co-k-warn" onClick={() => porArmar.current?.scrollIntoView({ block: 'center' })}>
          <span className="ov">Por armar</span><b>{POR_ARMAR.length}</b><small>1 lleva 3 días</small>
        </button>
        <button type="button" className="co-k" onClick={() => setPestana(PENDIENTE)}>
          <span className="ov">Esperando respuesta</span><b>{pendientes.length}</b><small>{dolares(pendientes.reduce((t, c) => t + c.total, 0))} en juego</small>
        </button>
        <button type="button" className="co-k co-k-ok" onClick={() => setPestana(ACEPTADA)}>
          <span className="ov">Aceptadas en octubre</span><b>99</b><small>Conversión 90 % · meta 230 / mes</small>
        </button>
        <div className="co-k co-k-fija">
          <span className="ov">Tiempo prom. para cotizar</span><b>12 min</b><small>Meta &lt; 15 min · antes 30–60 min</small>
        </div>
      </div>

      <section ref={porArmar} className="co-todo" aria-labelledby="co-todo">
        <div className="between" style={{ flexWrap: 'wrap' }}>
          <h2 id="co-todo">Por armar <em>{POR_ARMAR.length}</em></h2>
          <span className="muted" style={{ fontSize: 13 }}>Solicitudes listas para cotizar: nuevas con fotos o atendidas en el local</span>
        </div>
        <div className="co-tgrid">
          {POR_ARMAR.map((t) => (
            <Link key={t.codigo} className="co-td" to={RUTA_COTIZAR}>
              <div>
                <b>{t.codigo} · {t.cliente}</b>
                <small>{t.mueble}</small>
                <span className={`co-tag ${t.tono && `co-tag-${t.tono}`}`}>{t.etiqueta}</span>
              </div>
              <span className="gw-btn gw-btn-sm gw-btn-primary">Armar</span>
            </Link>
          ))}
        </div>
      </section>

      <Tabs
        label="Filtrar por estado"
        active={pestana}
        onChange={setPestana}
        items={[{ label: 'Todas', count: COTIZACIONES.length }, ...ESTADOS_COTIZACION.map((e) => ({ label: e, count: COTIZACIONES.filter((c) => c.estado === e).length }))]}
      />

      {filas.length > 0 ? (
        <div className="tbl-box">
          <table className="t co-lista">
            <thead><tr><th>Cotización</th><th>Cliente</th><th>Mueble</th><th className="r">Total</th><th>Estado</th><th>Vence / fecha</th><th><span className="co-sr">Acción</span></th></tr></thead>
            <tbody>
              {filas.map((c) => (
                <tr key={`${c.codigo}-${c.version}`} className={c.estado === 'Reemplazada' ? 'co-old' : undefined}>
                  <td className="num co-nw"><b>{c.codigo}</b><div className="muted co-s">{c.version}</div></td>
                  <td><b>{c.cliente}</b><div className="muted co-s">{c.origen}</div></td>
                  <td>{c.mueble}</td>
                  <td className="r num"><b>{dolares(c.total)}</b></td>
                  <td><StatusChip status={c.estado} /><div className="muted co-s" style={{ marginTop: 4 }}>{c.detalle}</div></td>
                  <td className="num"><span className={c.fechaTono ? `co-due co-due-${c.fechaTono}` : 'co-due'}>{c.fecha}</span></td>
                  <td><Link className="gw-btn gw-btn-sm gw-btn-secondary co-nw" to={c.accion.a}>{c.accion.texto}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : texto ? (
        <EmptyState icon="search" title="Sin resultados">No hay cotizaciones con «{busca.trim()}» en este estado.</EmptyState>
      ) : (
        <EmptyState icon="quote" title="No hay cotizaciones con este filtro">Las cotizaciones se arman desde una solicitud (Solicitudes o la cita en el local).</EmptyState>
      )}

      <p className="audit">Cada cotización guarda el precio sugerido y el propuesto, quién la armó y cuánto tardó (indicador de tiempo para cotizar).</p>
    </>
  );
}
