import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TopAdmin } from '../../app/layout/AdminLayout';
import { Icon } from '../../shared/ui/Icon';
import { FORMAS_PAGO, METRICAS, MINI, PERIODO, POR_MUEBLE, POR_SERVICIO, SERIE_ANIO, SERIE_DIA, TELAS_USADAS, type Puesto } from './datos';
import { GraficoMargen } from './GraficoMargen';
import './panel.css';

function Ranking({ filas, etiqueta }: { filas: Puesto[]; etiqueta: string }) {
  return (
    <ol className="es-rk" aria-label={etiqueta}>
      {filas.map((f) => (
        <li key={f.nombre}>
          <span className="es-rn">{f.nombre}</span>
          <span className="es-rb" aria-hidden="true"><i style={{ width: `${f.ancho}%` }} /></span>
          <b className="num">{f.valor}</b>
          <small>{f.pct != null ? `${f.pct} %` : ''}</small>
        </li>
      ))}
    </ol>
  );
}

/** A21 Estadísticas del mes: cobros, ventas y margen comparados, formas de pago y lo que más se vende. */
export function EstadisticasPage() {
  const [periodo, setPeriodo] = useState<'dia' | 'anio'>('anio');

  return (
    <>
      <TopAdmin
        crumb="Estadísticas · se actualiza cada noche"
        titulo={PERIODO.titulo}
        debajo={<p className="muted" style={{ marginTop: 4 }}>{PERIODO.detalle}</p>}
      >
        <Link className="gw-btn gw-btn-secondary" to="/admin">← Volver al panel de hoy</Link>
      </TopAdmin>

      <section className="p-earn" aria-label="Comparación del mes">
        <div className="es-mc4">
          {METRICAS.map((m) => (
            <div key={m.etiqueta} className="p-m">
              <span className="lb">{m.etiqueta}</span>
              <span className={m.acento ? 'vl es-acc' : 'vl'}>{m.valor}</span>
              <div className="es-vs">
                <div><span>vs. {PERIODO.antes}</span><span className="es-up"><Icon name="trending-up" size={15} />{m.vsMes.pct}</span><small>{m.vsMes.antes}</small></div>
                <div><span>vs. {PERIODO.anioPasado}</span><span className="es-up"><Icon name="trending-up" size={15} />{m.vsAnio.pct}</span><small>{m.vsAnio.antes}</small></div>
              </div>
              <span className="ft2">{m.pie[0]}{m.pie[1] && <b>{m.pie[1]}</b>}{m.pie[2]}{m.pie[3] && <b>{m.pie[3]}</b>}</span>
            </div>
          ))}
        </div>
        <div className="p-mini">
          {MINI.map((m) => (
            <Link key={m.titulo} to={m.a}>
              <span className="ic"><Icon name={m.icono} size={18} /></span>
              <span><b>{m.titulo}</b>{m.texto}</span>
              <strong className={m.tono}>{m.valor}</strong>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid2">
        <section className="card stack" aria-labelledby="es-pago">
          <div className="between" style={{ flexWrap: 'wrap' }}><h2 id="es-pago" className="es-h2">Formas de pago del mes</h2><span className="muted">sobre $63,900 cobrados</span></div>
          <div className="es-stk" role="img" aria-label={FORMAS_PAGO.map((f) => `${f.nombre} ${f.pct} %`).join(', ')}>
            {FORMAS_PAGO.map((f) => <i key={f.nombre} style={{ width: `${f.pct}%`, background: f.color }} title={`${f.nombre} ${f.pct} %`} />)}
          </div>
          <div className="p-mtbox">
            <table className="p-mt">
              <thead><tr><th>Forma de pago</th><th>%</th><th>Monto</th><th>vs. sep</th></tr></thead>
              <tbody>
                {FORMAS_PAGO.map((f) => (
                  <tr key={f.nombre}>
                    <td><span className="es-sw" style={{ background: f.color }} aria-hidden="true" />{f.nombre}</td>
                    <td className="num"><b>{f.pct} %</b></td>
                    <td className="num">{f.monto}</td>
                    <td className={f.vs.startsWith('+') ? 'num es-pos' : 'num muted'}>{f.vs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="audit">El 50 % ya entra por la pasarela y se confirma solo. Comisión de la pasarela en el mes: <b>$742</b> (la paga el taller).</p>
        </section>

        <section className="card stack" aria-labelledby="es-vende">
          <div className="between" style={{ flexWrap: 'wrap' }}><h2 id="es-vende" className="es-h2">Lo que más se vende</h2><span className="muted">99 ventas del mes</span></div>
          <h3 className="es-sh">Por tipo de mueble</h3>
          <Ranking filas={POR_MUEBLE} etiqueta="Ventas por tipo de mueble" />
          <h3 className="es-sh">Por servicio</h3>
          <Ranking filas={POR_SERVICIO} etiqueta="Ventas por servicio" />
        </section>

        <section className="card stack" aria-labelledby="es-telas">
          <div className="between" style={{ flexWrap: 'wrap' }}><h2 id="es-telas" className="es-h2">Telas más usadas</h2><span className="muted">yardas del mes</span></div>
          <Ranking filas={TELAS_USADAS} etiqueta="Telas más usadas" />
          <p className="audit">Sirve para decidir qué telas tener siempre en stock y cuáles pedir solo bajo pedido.</p>
        </section>
      </div>

      <section className="p-earn" aria-labelledby="es-margen">
        <div className="p-earn-h">
          <div>
            <h2 id="es-margen">Margen bruto en el tiempo</h2>
            <p>Margen bruto = lo cobrado de los pedidos cerrados − materiales − transporte. No descuenta sueldos ni alquiler.</p>
          </div>
          <div className="p-seg" role="group" aria-label="Periodo del gráfico">
            <button type="button" aria-pressed={periodo === 'dia'} onClick={() => setPeriodo('dia')}>Día a día</button>
            <button type="button" aria-pressed={periodo === 'anio'} onClick={() => setPeriodo('anio')}>12 meses</button>
          </div>
        </div>
        {periodo === 'dia'
          ? <GraficoMargen serie={SERIE_DIA} titulo="Margen bruto día a día" />
          : <GraficoMargen serie={SERIE_ANIO} titulo="Margen bruto de los últimos 12 meses" />}
      </section>
    </>
  );
}
