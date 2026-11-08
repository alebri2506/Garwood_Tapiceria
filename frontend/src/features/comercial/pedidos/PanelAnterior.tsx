import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Icon } from '../../../shared/ui/Icon';
import { StatusChip } from '../../../shared/ui/StatusChip';
import { dolares, type PedidoAnterior } from './datos';

/** Panel lateral de W6b con la ficha completa de un pedido entregado (CU-H05 / H06). */
export function PanelAnterior({ pedido: d, cerrar }: { pedido: PedidoAnterior; cerrar(): void }) {
  const cerrarRef = useRef<HTMLButtonElement>(null);
  const alCerrar = useRef(cerrar);
  alCerrar.current = cerrar;

  // Esc cierra, el foco entra al panel y la página de atrás no se desplaza.
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    cerrarRef.current?.focus();
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') alCerrar.current(); };
    document.addEventListener('keydown', tecla);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = overflow;
      previo?.focus();
    };
  }, []);

  return createPortal(
    <>
      <div className="hdim" onClick={cerrar} aria-hidden="true" />
      <aside className="hdrw" role="dialog" aria-modal="true" aria-labelledby="panel-anterior-titulo">
        <div className="hdh">
          <div>
            <span className="ov">{d.codigo} · {d.servicio}</span>
            <h2 id="panel-anterior-titulo">{d.titulo}</h2>
            <div style={{ marginTop: 6 }}><StatusChip status={d.estado} /></div>
          </div>
          <button ref={cerrarRef} type="button" className="hxb" aria-label="Cerrar" onClick={cerrar}><Icon name="x" size={20} /></button>
        </div>
        <div className="hbody">
          <div className="ba">
            <div><span className="thumb b t" aria-hidden="true" /><small>Antes · {d.antes}</small></div>
            <div><span className="thumb c t" aria-hidden="true" /><small style={{ color: 'var(--primary)' }}>Después · entrega</small></div>
          </div>
          <section className="hsec">
            <h3>Qué hicimos</h3>
            <p style={{ fontSize: 14.5, lineHeight: '22px' }}>{d.trabajo}</p>
            <dl className="hk">
              <div><dt>Tela</dt><dd>{d.tela}</dd></div>
              <div><dt>Cantidad de tela</dt><dd>{d.yardas}</dd></div>
              <div><dt>Piezas entregadas</dt><dd>{d.piezas}</dd></div>
              <div><dt>Traslado</dt><dd>{d.traslado}</dd></div>
              <div><dt>Entregado</dt><dd>{d.entregado}</dd></div>
              <div><dt>Tiempo total</dt><dd>{d.duracion}</dd></div>
            </dl>
          </section>
          <section className="hsec">
            <h3>Cómo fue su pedido</h3>
            <ol className="htl">
              {d.eventos.map((e) => <li key={e.d + e.t} className="hte"><i aria-hidden="true" /><span className="d">{e.d}</span><span>{e.t}</span></li>)}
            </ol>
          </section>
          <section className="hsec">
            <h3>Pagos</h3>
            <div>
              {d.pagos.map((p) => (
                <div key={p.c + p.m} className="hpay"><span>{p.c}<small>{p.m}</small></span><b className="num">{p.a}</b></div>
              ))}
              <div className="hpay tot"><span>Total pagado</span><span className="num">{dolares(d.total)}</span></div>
            </div>
          </section>
          <section className="hsec">
            <h3>Documentos</h3>
            {d.documentos.map((n) => (
              <div key={n} className="hdoc">
                <span><Icon name="clipboard" size={18} />{n}</span>
                {/* Los PDF los genera el backend (CU-C13); el botón se activa cuando exista. */}
                <button type="button" disabled title="Disponible cuando se conecte con el sistema">Descargar PDF</button>
              </div>
            ))}
          </section>
          <section className="hsec">
            <h3>Reclamos y garantía</h3>
            <div className={`hrc ${d.reclamo.caja}`}>{d.reclamo.largo}</div>
          </section>
        </div>
        <div className="hft">
          {d.reclamo.puede && <Link className="gw-btn gw-btn-secondary" to="/cliente/reclamos">Reportar un problema</Link>}
          <Link className="gw-btn gw-btn-primary" to="/cliente/solicitud">Repetir trabajo</Link>
        </div>
      </aside>
    </>,
    document.body,
  );
}
