import { Link } from 'react-router-dom';
import { useAuth } from '../../app/auth/AuthProvider';
import { TopAdmin } from '../../app/layout/AdminLayout';
import { Icon } from '../../shared/ui/Icon';
import { StatusChip } from '../../shared/ui/StatusChip';
import { AGENDA_HOY, AHORA, ATENCION, DIA, MATERIAL_ESCASO, PAGOS_POR_CONFIRMAR, PARADAS_HOY, SALIDA_HOY, TALLER_ALERTAS, TALLER_HOY, type Fila } from './datos';
import './panel.css';

function FilaPunto({ f }: { f: Fila }) {
  const contenido = (
    <>
      <span className={`p-dot p-dot-${f.punto}`} aria-hidden="true" />
      <div><b>{f.titulo}</b><span>{f.detalle}</span></div>
      <StatusChip status={f.chip.texto} tone={f.chip.tono} />
    </>
  );
  return f.a ? <Link className="p-li" to={f.a}>{contenido}</Link> : <div className="p-li">{contenido}</div>;
}

function Tarjeta({ id, titulo, enlace, children }: { id: string; titulo: string; enlace: { texto: string; a: string }; children: React.ReactNode }) {
  return (
    <section className="card stack p-card" aria-labelledby={id}>
      <div className="between"><h2 id={id}>{titulo}</h2><Link to={enlace.a}>{enlace.texto}</Link></div>
      {children}
    </section>
  );
}

/** A1 Panel de hoy: lo que pasa hoy en el taller y lo que necesita una decisión ahora. Los resultados del mes están en A21. */
export function PanelPage() {
  const { sesion } = useAuth();
  const nombre = sesion?.usuario.nombre.split(/\s+/)[0] ?? '';

  return (
    <>
      <TopAdmin
        crumb={<>Hoy · {AHORA.fecha} · <b className="num">{AHORA.hora}</b> <span className="p-live"><i aria-hidden="true" />en vivo</span></>}
        titulo={`${AHORA.saludo}, ${nombre}`}
        debajo={<p className="muted" style={{ marginTop: 4 }}>Lo que pasa hoy en el taller y lo que necesita una decisión suya ahora.</p>}
      >
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Link className="search" to="/admin/historial"><Icon name="search" size={18} />Buscar cliente, teléfono, mueble o tela…</Link>
          <Link className="gw-btn gw-btn-secondary" to="/admin/estadisticas"><Icon name="trending-up" size={18} />Estadísticas del mes</Link>
        </div>
      </TopAdmin>

      <section className="p-now" aria-labelledby="p-now">
        <div className="p-now-h"><h2 id="p-now">Atención ahora</h2><span className="muted">{ATENCION.length} asuntos · ordenados por urgencia</span></div>
        <div className="p-acts">
          {ATENCION.map((x) => (
            <div key={x.titulo} className={`p-act p-act-${x.tono}`}>
              <span className="p-ai"><Icon name={x.icono} /></span>
              <div className="p-at"><b>{x.titulo}</b><span>{x.detalle}</span></div>
              <div className="p-ab">
                {x.acciones.map((a) => <Link key={a.texto} className={`gw-btn gw-btn-sm ${a.primaria ? 'gw-btn-primary' : 'gw-btn-secondary'}`} to={a.a}>{a.texto}</Link>)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="p-cnt5" aria-label="El día en números">
        {DIA.map((c) => (
          <Link key={c.etiqueta} className={c.mal ? 'p-c p-c-mal' : 'p-c'} to={c.a}>
            <span className="p-lb">{c.etiqueta}</span>
            <span className="p-vl">{c.valor}{c.de && <small>{c.de}</small>}</span>
            {c.avance != null && <span className="p-br" aria-hidden="true"><i style={{ width: `${Math.round(c.avance * 100)}%` }} /></span>}
            <span className="p-ft">{c.pie}</span>
          </Link>
        ))}
      </section>

      <div className="grid2">
        <Tarjeta id="p-agenda" titulo="Agenda de hoy" enlace={{ texto: 'Ver agenda', a: '/admin/agenda' }}>
          <ol className="p-tl">
            {AGENDA_HOY.map((c) => (
              c.ahora
                ? <li key={c.hora} className="p-ahora" aria-label={`Ahora, ${c.hora}`}><b className="num">{c.hora}</b><div /></li>
                : (
                  <li key={c.hora} className={c.hecha ? 'p-hecha' : undefined}>
                    <b className="num">{c.hora}</b>
                    <div><b>{c.titulo}</b><span>{c.detalle}</span></div>
                    {c.estado ? <StatusChip status={c.estado} /> : c.chip && <StatusChip status={c.chip.texto} tone={c.chip.tono} />}
                  </li>
                )
            ))}
          </ol>
        </Tarjeta>

        <Tarjeta id="p-salidas" titulo="Salidas de hoy" enlace={{ texto: 'Ver salida', a: '/admin/salidas' }}>
          <p className="muted">{SALIDA_HOY.camion}</p>
          <div>{PARADAS_HOY.map((f) => <FilaPunto key={f.titulo} f={f} />)}</div>
        </Tarjeta>

        <Tarjeta id="p-taller" titulo="Taller hoy" enlace={{ texto: 'Ver pedidos', a: '/admin/pedidos' }}>
          <div className="p-trio">
            <div><b className="num">{TALLER_HOY.enTrabajo}</b><span>en trabajo</span></div>
            <div><b className="num">{TALLER_HOY.terminados}</b><span>terminados hoy</span></div>
            <div className="p-w"><b className="num">{TALLER_HOY.enRiesgo}</b><span>en riesgo</span></div>
          </div>
          <div>{TALLER_ALERTAS.map((f) => <FilaPunto key={f.titulo} f={f} />)}</div>
        </Tarjeta>

        <Tarjeta id="p-material" titulo="Material que se acaba" enlace={{ texto: 'Qué pedir', a: '/admin/inventario' }}>
          <div className="p-mtbox">
            <table className="p-mt">
              <thead><tr><th>Material</th><th>Hay</th><th>Reservado para pedidos</th><th>Llega en</th></tr></thead>
              <tbody>
                {MATERIAL_ESCASO.map((m) => (
                  <tr key={m.nombre} className={`p-mt-${m.tono}`}>
                    <td><b>{m.nombre}</b></td>
                    <td className="num">{m.hay}</td>
                    <td className="num">{m.reservado}</td>
                    <td>{m.llega}{m.pedir && <> <Link to="/admin/inventario">Pedir</Link></>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="audit">«Reservado» = lo que los pedidos aceptados ya necesitan. Si «hay» no alcanza, el material aparece aquí el mismo día.</p>
        </Tarjeta>

        <Tarjeta id="p-pagos" titulo="Pagos por confirmar" enlace={{ texto: 'Revisar', a: '/admin/pagos' }}>
          <div>{PAGOS_POR_CONFIRMAR.map((f) => <FilaPunto key={f.titulo} f={f} />)}</div>
          <p className="audit">Tarjeta y cuenta bancaria se confirman solas. Solo Zelle y cheque necesitan su revisión.</p>
        </Tarjeta>

        <Link className="card stack p-go" to="/admin/estadisticas">
          <span className="p-gi"><Icon name="trending-up" /></span>
          <h2>¿Cómo va el mes?</h2>
          <p className="muted">Ventas, cobros y margen comparados con el mes anterior y con octubre del año pasado; formas de pago en porcentaje y lo que más se vende.</p>
          <span className="p-go-a">Abrir estadísticas →</span>
        </Link>
      </div>

      <p className="audit">Este panel muestra solo el día de hoy y se actualiza solo con lo que registran el conductor, el taller y los pagos. Los resultados del mes están en Estadísticas.</p>
    </>
  );
}
