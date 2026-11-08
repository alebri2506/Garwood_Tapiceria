import { useState } from 'react';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { Icon } from '../../../shared/ui/Icon';
import { StatusChip } from '../../../shared/ui/StatusChip';
import { MUEBLES, PEDIDOS_ANTERIORES, SERVICIOS_ANTERIORES, dolares, type PedidoAnterior } from './datos';
import { PanelAnterior } from './PanelAnterior';

type Clave = 'mueble' | 'servicio' | 'anio';
type Filtros = Record<Clave, string | null>;

const ANIOS = [...new Set(PEDIDOS_ANTERIORES.map((p) => String(p.anio)))];
const GRUPOS: { clave: Clave; label: string; opciones: readonly string[]; valor(p: PedidoAnterior): string }[] = [
  { clave: 'mueble', label: 'Mueble', opciones: MUEBLES, valor: (p) => p.mueble },
  { clave: 'servicio', label: 'Servicio', opciones: SERVICIOS_ANTERIORES, valor: (p) => p.servicio },
  { clave: 'anio', label: 'Año', opciones: ANIOS, valor: (p) => String(p.anio) },
];
const ORDENES = ['Más recientes', 'Más antiguos', 'Mayor monto'] as const;
const SIN_FILTROS: Filtros = { mueble: null, servicio: null, anio: null };

// Búsqueda sin tildes ni mayúsculas: "sofa" encuentra "Sofá".
const normalizar = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** W6b Mis pedidos · anteriores (CU-H06): búsqueda, filtros y ficha con antes/después. */
export function AnterioresPage() {
  const [q, setQ] = useState('');
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS);
  const [orden, setOrden] = useState(0);
  const [abierto, setAbierto] = useState<Clave | 'orden' | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);

  const palabras = normalizar(q).split(/\s+/).filter(Boolean);
  const coincide = (p: PedidoAnterior) =>
    palabras.every((w) => normalizar([p.codigo, p.titulo, p.tela, p.servicio].join(' ')).includes(w));
  /** Pasa la búsqueda y todos los filtros, menos el que se indique (para contar opciones). */
  const pasa = (p: PedidoAnterior, salvo?: Clave) =>
    coincide(p) && GRUPOS.every((g) => g.clave === salvo || filtros[g.clave] === null || g.valor(p) === filtros[g.clave]);

  const resultado = PEDIDOS_ANTERIORES.filter((p) => pasa(p)).sort(
    orden === 0 ? (a, b) => b.iso.localeCompare(a.iso) : orden === 1 ? (a, b) => a.iso.localeCompare(b.iso) : (a, b) => b.total - a.total,
  );
  const grupos = orden === 2
    ? [{ t: 'POR MONTO', items: resultado }]
    : [...new Set(resultado.map((p) => p.anio))].map((y) => ({ t: String(y), items: resultado.filter((p) => p.anio === y) }));
  const hayFiltros = q !== '' || Object.values(filtros).some((v) => v !== null);
  const pedido = PEDIDOS_ANTERIORES.find((p) => p.codigo === elegido);

  const elegir = (clave: Clave, v: string | null) => { setFiltros((f) => ({ ...f, [clave]: v })); setAbierto(null); };

  return (
    <>
      <div className="hbox">
        <label className="hq">
          <Icon name="search" size={20} />
          <input
            type="search"
            value={q}
            placeholder="Buscar por mueble, tela o código (ej.: sofá, lino, PED-0076)"
            aria-label="Buscar en mis pedidos"
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <div className="hrow">
          {GRUPOS.map((g) => {
            const v = filtros[g.clave];
            const open = abierto === g.clave;
            return (
              <div key={g.clave} className="hdd">
                <button
                  type="button"
                  className={['hb', v && 'on', open && 'open'].filter(Boolean).join(' ')}
                  aria-expanded={open}
                  aria-haspopup="listbox"
                  onClick={() => setAbierto(open ? null : g.clave)}
                >
                  <span>{v ? `${g.label}:` : g.label}</span>{v && <b>{v}</b>}<Icon name="chevron-down" size={16} strokeWidth={2} />
                </button>
                {v && (
                  <button type="button" className="hx" aria-label={`Quitar filtro de ${g.label.toLowerCase()}`} onClick={() => elegir(g.clave, null)}>
                    <Icon name="x" size={14} />
                  </button>
                )}
                {open && (
                  <div className="hpop" role="listbox" aria-label={g.label}>
                    <span className="t">{g.label}</span>
                    {[null, ...g.opciones].map((o) => {
                      const n = PEDIDOS_ANTERIORES.filter((p) => pasa(p, g.clave) && (o === null || g.valor(p) === o)).length;
                      const on = v === o;
                      return (
                        <button
                          key={o ?? 'todos'}
                          type="button"
                          role="option"
                          aria-selected={on}
                          className={['ho', on && 'on', n === 0 && 'zero'].filter(Boolean).join(' ')}
                          onClick={() => elegir(g.clave, o)}
                        >
                          <span className="rd" aria-hidden="true" /><span className="l">{o ?? 'Todos'}</span><small>{n}</small>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {hayFiltros && (
            <button type="button" className="hlk" onClick={() => { setFiltros(SIN_FILTROS); setQ(''); setAbierto(null); }}>Limpiar filtros</button>
          )}
          <span style={{ flex: 1 }} />
          <span className="hcnt" role="status"><b>{resultado.length}</b> {resultado.length === 1 ? 'pedido' : 'pedidos'}</span>
          <div className="hdd">
            <button
              type="button"
              className={abierto === 'orden' ? 'hb plain open' : 'hb plain'}
              aria-expanded={abierto === 'orden'}
              aria-haspopup="listbox"
              onClick={() => setAbierto(abierto === 'orden' ? null : 'orden')}
            >
              <span>Ordenar:</span><b>{ORDENES[orden]}</b><Icon name="chevron-down" size={16} strokeWidth={2} />
            </button>
            {abierto === 'orden' && (
              <div className="hpop right" role="listbox" aria-label="Ordenar">
                {ORDENES.map((l, i) => (
                  <button key={l} type="button" role="option" aria-selected={orden === i} className={orden === i ? 'ho on' : 'ho'} onClick={() => { setOrden(i); setAbierto(null); }}>
                    <span className="rd" aria-hidden="true" /><span className="l">{l}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {abierto && <div className="hovl" onClick={() => setAbierto(null)} aria-hidden="true" />}

      {resultado.length === 0 && (
        <EmptyState icon="search" title="No encontramos pedidos con esa búsqueda">Pruebe con otra palabra o quite algún filtro.</EmptyState>
      )}
      {grupos.map((g) => (
        <section key={g.t} className="stack" style={{ gap: 12 }} aria-label={g.t}>
          <div className="hy">{g.t}</div>
          {g.items.map((p) => (
            <button key={p.codigo} type="button" className={elegido === p.codigo ? 'hc on' : 'hc'} onClick={() => setElegido(p.codigo)}>
              <span className="ba2" aria-hidden="true"><span className="thumb b" /><span className="thumb c" /></span>
              <span className="tx">
                <span className="cd">{p.codigo} · {p.servicio}</span>
                <h2>{p.titulo}</h2>
                <span className="chips"><span>Entregado {p.entregado}</span><span>{p.tela}</span><span>{p.piezas}</span></span>
                <span className={`rcl2 ${p.reclamo.tono}`}><Icon name={p.reclamo.icono} size={15} />{p.reclamo.corto}</span>
              </span>
              <span className="rt">
                <StatusChip status={p.estado} />
                <span><b className="m">{dolares(p.total)}</b><small>pagado · {p.medios}</small></span>
                <span className="vd">Ver detalle →</span>
              </span>
            </button>
          ))}
        </section>
      ))}
      <p className="muted" style={{ fontSize: 13 }}>
        Los problemas se pueden reportar hasta 7 días después de la entrega. “Repetir trabajo” crea una solicitud nueva con los mismos datos y los precios de hoy.
      </p>
      <EmptyState icon="history" title="Sus trabajos de antes de GARWEB">
        Si nos encargó algo antes, el taller está digitalizando los folders en papel: aparecerán aquí cuando estén listos.
      </EmptyState>

      {pedido && <PanelAnterior pedido={pedido} cerrar={() => setElegido(null)} />}
    </>
  );
}
