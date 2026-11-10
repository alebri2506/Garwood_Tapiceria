import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../../shared/api/http';
import { MapsProvider } from '../../../shared/maps/MapsProvider';
import { Alert } from '../../../shared/ui/Alert';
import { WizardSteps } from '../../../shared/ui/WizardSteps';
import { borradorW2 } from './borrador';
import {
  construirEnvio, estadoInicial, etiquetaMueble, hayRecojo, necesitaCita, nombreServicio, pasosDe, textoRecojo, textoTelaW2, textoTraslado,
  type EstadoW2,
} from './estadoW2';
import { PasoMuebles, PasoTelaW2, PasoTrasladoW2, type PropsPaso } from './PasosW2';
import { solicitudApi, type Catalogo, type DireccionGuardada, type SolicitudCreada } from './solicitudApi';
import { pasoDeCampo, validarPaso, type Errores } from './validacion';
import './solicitud.css';

/**
 * W2 Solicitar cotización (CU-C01): guarda la solicitud en la API con sus muebles, fotos, tela y traslado.
 * Con cita en el local o visita, el último paso es W3 / W3b: ahí se envía la solicitud junto con el turno.
 */
export function SolicitudPage() {
  const [carga, setCarga] = useState<{ c: Catalogo; guardadas: DireccionGuardada[] } | { error: string } | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCarga(null);
    Promise.all([solicitudApi.catalogo(), solicitudApi.direcciones()])
      .then(([c, guardadas]) => vigente && setCarga({ c, guardadas }))
      .catch((err) => vigente && setCarga({ error: err instanceof ApiError ? err.message : 'No pudimos cargar el formulario. Intente de nuevo.' }));
    return () => { vigente = false; };
  }, [intento]);

  if (!carga) return <p className="muted" role="status">Cargando el formulario…</p>;
  if ('error' in carga) {
    return (
      <Alert tone="danger" title="No pudimos abrir la solicitud">
        {carga.error} <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" onClick={() => setIntento((x) => x + 1)}>Reintentar</button>
      </Alert>
    );
  }
  return <Asistente c={carga.c} guardadas={carga.guardadas} />;
}

function Asistente({ c, guardadas }: { c: Catalogo; guardadas: DireccionGuardada[] }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Al volver desde W3 / W3b ("Atrás" o un paso hecho) se recupera lo llenado, en el paso pedido.
  const [e, setE] = useState<EstadoW2>(() => {
    const b = borradorW2.leer();
    const paso = Number(params.get('paso'));
    if (b && params.has('paso') && paso >= 0 && paso <= 1) return { ...b.e, paso };
    borradorW2.limpiar();
    return estadoInicial(c, guardadas[0]?.id ?? null);
  });
  const [errores, setErrores] = useState<Errores>({});
  const [enviando, setEnviando] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);
  const [creada, setCreada] = useState<SolicitudCreada | null>(null);
  const set = (cambio: Partial<EstadoW2>) => {
    setE((x) => ({ ...x, ...cambio }));
    setFalla(null);
  };

  const pasos = pasosDe(e);
  const cita = necesitaCita(e.tela);
  const ultimo = cita ? 1 : 3;

  // Al cambiar de paso, el foco y la vista vuelven arriba para que se lea el paso nuevo.
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const primerRender = useRef(true);
  useEffect(() => {
    if (primerRender.current) { primerRender.current = false; return; }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    tituloRef.current?.focus({ preventScroll: true });
  }, [e.paso]);

  /** Muestra los errores; si hay, lleva al paso y al mueble del primero. Devuelve true si no hay errores. */
  const mostrarErrores = (errs: Errores, paso: number) => {
    setErrores(errs);
    const primero = Object.keys(errs)[0];
    if (!primero) return true;
    const mueble = /^muebles\.(\d+)/.exec(primero);
    setE((x) => ({ ...x, paso, activo: mueble ? +mueble[1]! : x.activo }));
    setFalla('Revise lo marcado en rojo para continuar.');
    setTimeout(() => document.querySelector('.w2-error, .gw-field.is-invalid')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
    return false;
  };

  const continuar = () => {
    if (mostrarErrores(validarPaso(c, e, e.paso), e.paso)) set({ paso: e.paso + 1 });
  };

  /** Con cita: nada se envía todavía; lo llenado pasa a W3 / W3b, donde se elige el turno y se envía todo junto. */
  const irACita = () => {
    for (let paso = 0; paso <= 1; paso++) {
      if (!mostrarErrores(validarPaso(c, e, paso), paso)) return;
    }
    borradorW2.guardar({ e, c });
    navigate(e.tela === 'local' ? '/cliente/cita?nueva=1' : '/cliente/visita?nueva=1');
  };

  const enviar = async () => {
    for (let paso = 0; paso <= Math.min(ultimo, 2); paso++) {
      if (!mostrarErrores(validarPaso(c, e, paso), paso)) return;
    }
    setEnviando(true);
    setFalla(null);
    try {
      const { datos, fotos } = construirEnvio(c, e);
      setCreada(await solicitudApi.enviar(datos, fotos));
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.errores).length) {
        const [campo] = Object.keys(err.errores);
        mostrarErrores(err.errores, pasoDeCampo(campo!));
        setFalla(err.message);
      } else {
        setFalla(err instanceof ApiError ? err.message : 'No pudimos enviar la solicitud. Intente de nuevo.');
      }
    } finally {
      setEnviando(false);
    }
  };

  const props: PropsPaso = { c, e, set, errores, guardadas };
  const totalArchivos = e.muebles.reduce((t, m) => t + m.archivos.length, 0);
  const fabricacion = e.muebles.length === 1 && e.muebles[0]!.servicio === 'fabricacion';

  return (
    <MapsProvider>
      <div className="whead">
        <div>
          <div className="crumb">Nueva solicitud</div>
          <h1 ref={tituloRef} tabIndex={-1}>Solicitar cotización</h1>
        </div>
      </div>
      <div className="card" style={{ padding: 20 }}>
        <WizardSteps steps={pasos} current={Math.min(e.paso, pasos.length - 1)} onStep={creada ? undefined : (paso) => set({ paso })} />
      </div>

      <div className="wcols">
        <div className="wl">
          {e.paso === 0 && <PasoMuebles {...props} />}
          {e.paso === 1 && <PasoTelaW2 {...props} />}
          {e.paso === 2 && !cita && <PasoTrasladoW2 {...props} />}
          {e.paso === 3 && !cita && (
            <section className="card stack" aria-labelledby="w2-rev">
              <h2 id="w2-rev" className="w2-h2">Revise y envíe</h2>
              <p className="muted">Revise el resumen de su solicitud antes de enviarla.</p>
              {creada ? (
                <>
                  <Alert tone="success" title={`Solicitud ${creada.codigo} enviada`}>Le avisaremos por correo y aquí mismo cuando su cotización esté lista.</Alert>
                  <Link className="gw-btn gw-btn-secondary" style={{ alignSelf: 'flex-start' }} to="/cliente/pedidos/solicitudes">Ir a Mis pedidos › Solicitudes</Link>
                </>
              ) : (
                <Alert tone="info" title="Siguiente: su cotización" compact>El taller la arma con sus fotos y le avisa por correo y aquí mismo.</Alert>
              )}
            </section>
          )}

          {falla && <Alert tone="danger" title="No se pudo continuar" compact>{falla}</Alert>}

          {!creada && (
            <div className="between w2-pie">
              {e.paso > 0
                ? <button type="button" className="gw-btn gw-btn-ghost" disabled={enviando} onClick={() => set({ paso: e.paso - 1 })}>Atrás</button>
                : <Link className="gw-btn gw-btn-ghost" to="/cliente/pedidos/solicitudes">Atrás</Link>}
              {e.paso < ultimo && <button type="button" className="gw-btn gw-btn-primary gw-btn-lg" onClick={continuar}>Continuar</button>}
              {e.paso === ultimo && (
                <button type="button" className="gw-btn gw-btn-primary gw-btn-lg" disabled={enviando} onClick={cita ? irACita : enviar}>
                  {enviando ? 'Enviando…' : e.tela === 'local' ? 'Elegir día y hora de la cita' : e.tela === 'domicilio' ? 'Elegir día de la visita' : 'Enviar solicitud'}
                </button>
              )}
            </div>
          )}
          {e.paso === ultimo && cita && <p className="audit">Su solicitud se envía cuando confirme el día{e.tela === 'local' ? ' y la hora' : ''}, en el siguiente paso.</p>}
        </div>

        <aside className="wr" aria-label="Resumen de su solicitud">
          <div className="card stack" style={{ gap: 10 }}>
            <span className="ov">Resumen de su solicitud</span>
            {e.muebles.length > 1
              ? e.muebles.map((m, i) => <div key={m.uid} className="kv"><span>Mueble {i + 1}</span><b>{etiquetaMueble(c, m)} · {nombreServicio(c, m).toLowerCase()}</b></div>)
              : (
                <>
                  <div className="kv"><span>Mueble</span><b>{etiquetaMueble(c, e.muebles[0]!)}</b></div>
                  <div className="kv"><span>Servicio</span><b>{nombreServicio(c, e.muebles[0]!)}</b></div>
                </>
              )}
            {fabricacion && <div className="kv"><span>Acabado</span><b>{c.acabados.find((a) => a.codigo === e.muebles[0]!.acabado)?.nombre}</b></div>}
            <div className="kv"><span>Fotos</span><b>{totalArchivos === 0 ? 'Ninguna aún' : `${totalArchivos} ${totalArchivos === 1 ? 'archivo' : 'archivos'}`}</b></div>
            <hr className="stitch" />
            <div className="kv"><span>Tela</span><b>{textoTelaW2(c, e)}</b></div>
            <div className="kv"><span>Traslado</span><b>{textoTraslado(e)}</b></div>
            {!cita && e.traslado === 'delivery' && hayRecojo(e) && <div className="kv"><span>Recojo preferido</span><b>{textoRecojo(c, e)}</b></div>}
            <div className="kv"><span>Cita</span><b>{e.tela === 'domicilio' ? 'Visita a domicilio sin costo · la elige en el siguiente paso' : e.tela === 'local' ? 'En el local · la elige en el siguiente paso' : 'No necesita'}</b></div>
          </div>
        </aside>
      </div>
    </MapsProvider>
  );
}
