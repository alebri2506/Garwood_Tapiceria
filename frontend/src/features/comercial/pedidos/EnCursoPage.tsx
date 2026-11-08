import { Link, useSearchParams } from 'react-router-dom';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { DetallePedido } from './DetallePedido';
import { PEDIDOS_EN_CURSO } from './datos';
import { TarjetaPedido } from './TarjetaPedido';

/** W6a Mis pedidos · en curso (CU-C16). Primero los que necesitan algo del cliente. */
export function EnCursoPage() {
  const [params, setParams] = useSearchParams();
  const pedidos = PEDIDOS_EN_CURSO;
  const elegido = pedidos.find((p) => p.id === params.get('pedido'));

  if (pedidos.length === 0) {
    return (
      <EmptyState icon="package" title="No tiene pedidos en curso">
        Cuando acepte una cotización, su pedido aparecerá aquí. <Link to="/cliente/solicitud">Pedir una cotización</Link>
      </EmptyState>
    );
  }

  // Con un solo pedido se muestra directo su ficha.
  if (elegido || pedidos.length === 1) {
    return (
      <DetallePedido
        key={(elegido ?? pedidos[0]!).id}
        pedido={elegido ?? pedidos[0]!}
        volver={pedidos.length > 1 ? { n: pedidos.length, ir: () => setParams({}) } : undefined}
      />
    );
  }

  const grupos = [
    { t: 'Necesitan su acción', items: pedidos.filter((p) => p.necesitaAccion) },
    { t: 'En el taller', items: pedidos.filter((p) => !p.necesitaAccion) },
  ].filter((g) => g.items.length > 0);

  return (
    <>
      <p className="muted mp-nota">Tiene {pedidos.length} pedidos en marcha. Primero verá los que necesitan algo de usted.</p>
      {grupos.map((g) => (
        <section key={g.t} className="stack" style={{ gap: 16 }} aria-label={g.t}>
          <div className="sec">{g.t} · {g.items.length}</div>
          {g.items.map((p) => (
            <TarjetaPedido key={p.id} t={p}>
              <button
                type="button"
                className={`gw-btn ${p.accion ? 'gw-btn-ghost' : 'gw-btn-secondary'} gw-btn-block`}
                onClick={() => { setParams({ pedido: p.id }); window.scrollTo({ top: 0 }); }}
              >
                Ver pedido
              </button>
            </TarjetaPedido>
          ))}
        </section>
      ))}
    </>
  );
}
