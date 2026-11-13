import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TopAdmin } from '../../../app/layout/AdminLayout';
import { normalizar } from '../../../shared/texto';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { Icon, type IconName } from '../../../shared/ui/Icon';
import { StatusChip } from '../../../shared/ui/StatusChip';
import { ETAPAS_TALLER, FASES, PEDIDOS, type PedidoFila } from './datos';
import './pedidosAdmin.css';

const FILTROS: [string, (p: PedidoFila) => boolean][] = [
  ['Todos', () => true],
  ['Necesitan atención', (p) => p.tono === 'danger' || p.tono === 'warn'],
  ['Entrega', (p) => p.traslado === 'Entrega'],
  ['Retiro', (p) => p.traslado === 'Retiro'],
];

/** Plazo con color: verde con margen, ámbar 3 días o menos, rojo vencido. */
function plazo(p: PedidoFila): [string, string] {
  if (p.quedan === null) return p.fase === 1 ? ['En pausa', 'pd-plz pd-nt'] : ['', 'pd-plz'];
  if (p.quedan < 0) return [`Vencido hace ${-p.quedan} días`, 'pd-plz pd-bad'];
  return [`Quedan ${p.quedan} días`, p.quedan <= 3 ? 'pd-plz pd-mid' : 'pd-plz pd-ok'];
}

/** Las 6 etapas del taller: hechas, la actual (o en pausa) y las que faltan. */
function Etapas({ p }: { p: PedidoFila }) {
  const actual = p.etapa === 'Sin empezar' ? -1 : p.avance === 100 ? ETAPAS_TALLER.length : ETAPAS_TALLER.findIndex((e) => p.etapa.startsWith(e));
  return (
    <div className="pd-trk" role="img" aria-label={`Etapa: ${p.etapa}`}>
      {ETAPAS_TALLER.map((e, i) => (
        <i key={e} title={e} className={i < actual ? 'pd-sg pd-done' : i === actual ? (p.estado === 'En pausa' ? 'pd-sg pd-pause' : 'pd-sg pd-cur') : 'pd-sg'} />
      ))}
    </div>
  );
}

/** A6 Pedidos (C16): cada pedido con su etapa en el taller y su fecha para terminar. Solo diseño: datos de ejemplo. */
export function PedidosPage() {
  const [filtro, setFiltro] = useState(0);
  const [busca, setBusca] = useState('');
  const q = normalizar(busca.trim());
  const visibles = PEDIDOS.filter(FILTROS[filtro]![1]).filter((p) => !q || normalizar(`${p.codigo} ${p.cliente} ${p.mueble}`).includes(q));
  const vencidos = PEDIDOS.filter((p) => p.quedan !== null && p.quedan < 0).length;
  const indicadores: { v: number; l: string; icono: IconName; cls: string; f: number }[] = [
    { v: PEDIDOS.filter((p) => p.fase < 3).length, l: 'Pedidos activos', icono: 'kanban', cls: 'pd-ic pd-info', f: 0 },
    { v: PEDIDOS.filter((p) => p.fase === 1).length, l: 'En el taller', icono: 'sofa', cls: 'pd-ic pd-info', f: 0 },
    { v: PEDIDOS.filter((p) => p.fase === 2).length, l: 'Para despacho', icono: 'truck', cls: 'pd-ic pd-warn', f: 0 },
    { v: vencidos, l: 'Vencidos', icono: 'clock', cls: 'pd-ic pd-danger', f: 1 },
  ];

  return (
    <>
      <TopAdmin
        crumb="Comercial › Pedidos"
        titulo="Pedidos"
        debajo={<p className="muted pd-sub">Cada pedido muestra su etapa en el taller (Revisión → Desarmar → Cortar → Coser → Tapizar → Acabado) y su fecha para terminar, que pone el sistema (14 días).</p>}
      >
        <label className="search pd-search">
          <Icon name="search" size={18} />
          <input type="search" placeholder="Buscar pedido o cliente" aria-label="Buscar pedido o cliente" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
      </TopAdmin>

      <div className="pd-sum">
        {indicadores.map((k) => (
          <button key={k.l} type="button" className="pd-st" onClick={() => setFiltro(k.f)}>
            <span className={k.cls}><Icon name={k.icono} size={22} /></span>
            <div><div className="pd-v">{k.v}</div><div className="pd-l">{k.l}</div></div>
          </button>
        ))}
      </div>

      <div className="between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div className="pd-flt" role="group" aria-label="Filtrar pedidos">
          {FILTROS.map(([l, f], i) => (
            <button key={l} type="button" aria-pressed={filtro === i} onClick={() => setFiltro(i)}>{l} <i>{PEDIDOS.filter(f).length}</i></button>
          ))}
        </div>
        <span className="pd-note">{visibles.length} de {PEDIDOS.length} pedidos</span>
      </div>

      {FASES.map((g, fase) => {
        const filas = visibles.filter((p) => p.fase === fase);
        if (!filas.length) return null;
        return (
          <section key={g.titulo} className="pd-grp" aria-labelledby={`pd-g${fase}`}>
            <div className="pd-gh"><span className="pd-gd" style={{ background: g.color }} /><b id={`pd-g${fase}`}>{g.titulo}</b><i>{filas.length}</i><small>{g.detalle}</small></div>
            {filas.map((p) => {
              const [texto, cls] = plazo(p);
              const vencido = p.quedan !== null && p.quedan < 0;
              return (
                <div key={p.codigo} className={vencido ? 'pd-pr pd-late' : 'pd-pr'}>
                  <Link className="pd-pc" to={`/admin/pedidos/${p.codigo}`}><em>{p.codigo}</em><b>{p.mueble}</b><small>{p.cliente} · {p.traslado}</small></Link>
                  <div className="pd-pe"><StatusChip status={p.estado} tone={p.estado === 'Entregado con saldo' ? 'warning' : undefined} />{p.aviso && <small className="pd-det">{p.aviso}</small>}</div>
                  <div className="pd-pa"><small>{p.etapa}</small><Etapas p={p} /></div>
                  <div className="pd-pp"><small>{p.etiquetaFecha ?? 'Terminar para'}</small><b>{p.fecha}</b>{texto && <span className={cls}>{texto}</span>}</div>
                </div>
              );
            })}
          </section>
        );
      })}
      {visibles.length === 0 && <EmptyState icon="search" title="Sin resultados">No hay pedidos con ese filtro.</EmptyState>}

      <div className="pd-lgd">
        <span><i className="pd-k pd-done" />Etapa hecha</span><span><i className="pd-k pd-cur" />Etapa actual</span><span><i className="pd-k pd-pause" />En pausa</span><span><i className="pd-k" />Por hacer</span>
      </div>
      <p className="pd-note" style={{ margin: 0 }}>
        Plazo: <span className="pd-plz pd-ok">con margen</span> · <span className="pd-plz pd-mid">quedan 3 días o menos</span> · <span className="pd-plz pd-bad">vencido</span>.
        La fecha se puede cambiar desde la ficha del pedido, con motivo. Los pedidos entregados y pagados pasan solos al Historial.
      </p>
    </>
  );
}
