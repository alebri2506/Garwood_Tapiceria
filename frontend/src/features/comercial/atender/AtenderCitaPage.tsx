import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { API_URL } from '../../../shared/api/http';
import { AtencionConectada, SinSolicitud } from './AtencionConectada';
import { TopAdmin } from '../../../app/layout/AdminLayout';
import { PricePanel } from '../../../shared/ui/PricePanel';
import { CITA, PASOS, SIGUIENTE, TEXTOS } from './datos';
import { textoRecojo } from './Recojo';
import { atencionInicial, calcular, dolares, type CambioAtencion } from './estado';
import { PasoCotizar, PasoRevisar, PasoRespuesta, PasoTelas, PasoTraslado } from './Pasos';
import './atender.css';

/**
 * A2b Atender cita en el local o visita a domicilio (?lugar=domicilio): revisar, telas, traslado, cotización y respuesta en el
 * mismo momento (CU-C05 → C08 → C09). Si acepta y se genera el pedido con delivery, al final se define el recojo
 * (decisiones L). Solo diseño: datos de ejemplo. ?historial=con muestra un cliente con pedidos cerrados (adelanto 0 %).
 */
export function AtenderCitaPage() {
  const [params] = useSearchParams();
  // Con backend: la cita o la visita real (?solicitud=SOL-…). Sin backend: el ejemplo del diseño.
  if (API_URL) {
    const codigo = params.get('solicitud');
    return codigo ? <AtencionConectada key={codigo} codigo={codigo} /> : <SinSolicitud />;
  }
  return <AtenderEjemplo />;
}

function AtenderEjemplo() {
  const [params] = useSearchParams();
  const [a, setA] = useState(() => atencionInicial(params.get('lugar') === 'domicilio' ? 'domicilio' : 'local', params.get('historial') === 'con'));
  const t = TEXTOS[a.lugar];
  const set = (c: CambioAtencion) => setA((x) => ({ ...x, ...c }));
  const c = calcular(a);

  const titulo = useRef<HTMLHeadingElement>(null);
  const ir = (paso: number) => {
    set({ paso });
    window.scrollTo({ top: 0 });
    titulo.current?.focus();
  };

  const telasResumen = a.modo === 'partes' ? `${c.telas.length} ${c.telas.length === 1 ? 'tela' : 'telas'} por partes` : c.telas[0]!.tela.nombre;

  return (
    <>
      <TopAdmin
        crumb={<><Link to="/admin/agenda">Agenda</Link> › {t.crumb}</>}
        titulo={<span ref={titulo} tabIndex={-1} style={{ outline: 'none' }}>{t.titulo}</span>}
      />

      <nav className="at-stp" aria-label="Pasos de la atención">
        {PASOS.map((l, i) => (
          <button key={l} type="button" className={i === a.paso ? 'at-st at-on' : i < a.paso ? 'at-st at-done' : 'at-st'} aria-current={i === a.paso ? 'step' : undefined} onClick={() => ir(i)}>
            <b aria-hidden="true">{i < a.paso ? '✓' : i + 1}</b><span>{l}</span>
          </button>
        ))}
      </nav>

      <div className="split">
        <div className="wide">
          {a.paso === 0 && <PasoRevisar a={a} set={set} />}
          {a.paso === 1 && <PasoTelas a={a} set={set} />}
          {a.paso === 2 && <PasoTraslado a={a} set={set} />}
          {a.paso === 3 && <PasoCotizar a={a} set={set} c={c} />}
          {a.paso === 4 && <PasoRespuesta a={a} set={set} c={c} />}
          <div className="between at-foot">
            {a.paso === 0
              ? <Link className="gw-btn gw-btn-ghost" style={{ color: 'var(--danger-ink)' }} to="/admin/agenda">{t.noAsistio}</Link>
              : <button type="button" className="gw-btn gw-btn-ghost" onClick={() => ir(a.paso - 1)}>Atrás</button>}
            {a.paso < PASOS.length - 1 && <button type="button" className="gw-btn gw-btn-primary gw-btn-lg" onClick={() => ir(a.paso + 1)}>{SIGUIENTE[a.paso]}</button>}
          </div>
        </div>

        <aside className="aside">
          {a.paso === 3 && (
            <PricePanel
              desglose={c.desglose}
              propuesto={c.propuesto}
              onPropuesto={(propuesto) => set({ propuesto })}
              motivo={a.motivoPrecio}
              onMotivo={(motivoPrecio) => set({ motivoPrecio })}
              transporte={c.transporte}
              sugerencia="Cotización armada en la cita, con la clienta presente."
            >
              {a.propuesto != null && a.propuesto !== c.sugerido && (
                <button type="button" className="gw-btn gw-btn-ghost gw-btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ propuesto: null, motivoPrecio: '' })}>
                  Volver al sugerido ({dolares(c.sugerido)})
                </button>
              )}
            </PricePanel>
          )}
          {a.paso >= 3 ? (
            <section className="card at-sum" aria-label="Lo que se lleva la clienta">
              <span className="ov">Lo que se lleva la clienta</span>
              <div className="kv"><span>Mueble</span><b>Sofá 3 cuerpos</b></div>
              <div className="kv"><span>Telas</span><b>{telasResumen}</b></div>
              {c.telas.map((t) => (
                <div key={t.tela.id} className="at-fs"><i style={{ background: t.tela.color }} aria-hidden="true" /><span>{t.tela.nombre}</span><b>{t.yardas} yd</b></div>
              ))}
              <div className="kv"><span>Medidas</span><b>{a.medidas.ancho && a.medidas.fondo && a.medidas.alto ? `${a.medidas.ancho} × ${a.medidas.fondo} × ${a.medidas.alto} in` : t.medidasResumen}</b></div>
              <div className="kv"><span>Fotos</span><b>4 de la solicitud{a.fotos.length ? ` + ${a.fotos.length} de hoy` : ''}</b></div>
              <div className="kv"><span>Traslado</span><b>{a.traslado !== 'delivery' ? 'Lo lleva ella'
                : a.recojoHecho === 'llevado' ? 'Recogido hoy en la visita'
                  : a.recojoHecho === 'agendado' && a.recojoElegido ? `Delivery · recojo ${textoRecojo(a.recojoElegido)}`
                    : 'Delivery · recojo al generar el pedido'}</b></div>
              {a.paso === 4 && (
                <>
                  <hr className="stitch" />
                  <div className="kv"><span>Total</span><b className="at-bigv">{dolares(c.total)}</b></div>
                </>
              )}
              <p className="audit">Todo se guarda solo en la solicitud {CITA.solicitud}. Si la clienta se va antes de terminar, puede seguir después desde Solicitudes.</p>
            </section>
          ) : (
            <section className="card stack" style={{ gap: 8 }} aria-label="Se guarda mientras avanza">
              <span className="ov">Se guarda mientras avanza</span>
              <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>Cada paso se guarda en la solicitud {CITA.solicitud}. El resumen con el precio aparece al llegar a la cotización.</p>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
