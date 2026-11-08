import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../../shared/api/http';
import { MapsProvider } from '../../../shared/maps/MapsProvider';
import { Alert } from '../../../shared/ui/Alert';
import { Icon } from '../../../shared/ui/Icon';
import { StatusChip } from '../../../shared/ui/StatusChip';
import { WizardSteps } from '../../../shared/ui/WizardSteps';
import { DIAS, MESES } from '../fechas';
import { CampoDireccion } from '../solicitud/PasosW2';
import { borradorW2, type BorradorW2 } from '../solicitud/borrador';
import { construirEnvio, direccionEnvio, nombreServicio, tipoDe, type DireccionW2 } from '../solicitud/estadoW2';
import { solicitudApi, type CitaDto, type DireccionGuardada, type SolicitudCliente } from '../solicitud/solicitudApi';
import { Agendador, fechaDe, isoDe } from './Agendador';
import { finDeTurno, type Turno } from './agenda';
import { citasApi, type DiaLocal, type DiaVisita, type Disponibilidad, type TipoCita } from './citasApi';
import './cita.css';

type Franja = 'manana' | 'tarde';
interface Eleccion { fecha: string; hora?: string; franja?: Franja }

const capital = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const largo = (iso: string) => { const d = fechaDe(iso); return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`; };
const corto = (iso: string) => { const d = fechaDe(iso); return `${DIAS[d.getDay()]!.slice(0, 3)} ${d.getDate()} ${MESES[d.getMonth()]!.slice(0, 3)}`; };
/** La solicitud aún no enviada (viene de W2) presentada como las ya guardadas, para mostrar "con lo que usted pidió". */
function solicitudDeBorrador({ e, c }: BorradorW2): SolicitudCliente {
  return {
    codigo: '', estado: 'En espera de cita', fecha: new Date().toISOString(), canal: 'web', tela: e.tela, telaDescripcion: e.telaBusca.trim() || null, telaConocida: null,
    esperaFotos: false, traslado: null, direccion: null, fechaPrefRecojo: null, franjaRecojo: null, motivoDescarte: null, cita: null, inasistencias: 0,
    muebles: e.muebles.map((m, i) => ({
      orden: i + 1, tipo: tipoDe(c, m).nombre, tipoCodigo: tipoDe(c, m).codigo, servicio: m.servicio, servicioNombre: nombreServicio(c, m), acabado: null,
      cantidad: m.cantidad, medidas: null, modoTela: null, telas: [],
      archivos: m.archivos.map((a, k) => ({ id: k, tipo: a.type.startsWith('video/') ? 'video' as const : 'foto' as const, nombre: a.name, url: null })),
    })),
  };
}

const franjaTexto = (f: Franja, dispo?: Disponibilidad<DiaVisita>) =>
  `${f === 'manana' ? 'mañana' : 'tarde'}, ${dispo?.dias.find((d) => d.franjas.length)?.franjas.find((x) => x.codigo === f)?.nombre.split('· ')[1] ?? (f === 'manana' ? '09:00–12:00' : '15:00–17:00')}`;

/**
 * W3 Cita en el local y W3b Visita a domicilio (CU-C04): elegir, reprogramar o cancelar con la agenda real.
 * Con ?nueva=1 es el último paso de W2: la solicitud se envía junto con el turno al confirmar.
 */
export function CitaPage({ tipo }: { tipo: TipoCita }) {
  const [params] = useSearchParams();
  const codigo = params.get('solicitud');
  const [nueva] = useState(() => {
    const b = params.get('nueva') === '1' ? borradorW2.leer() : null;
    return b && (b.e.tela === 'domicilio') === (tipo === 'domicilio') ? b : null;
  });
  const [s, setS] = useState<SolicitudCliente | null>(null);
  const [local, setLocal] = useState<Disponibilidad<DiaLocal> | null>(null);
  const [visita, setVisita] = useState<Disponibilidad<DiaVisita> | null>(null);
  const [guardadas, setGuardadas] = useState<DireccionGuardada[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!codigo && !nueva) return;
    let vigente = true;
    setError(null);
    Promise.all([
      codigo ? solicitudApi.detalle(codigo) : Promise.resolve(solicitudDeBorrador(nueva!)),
      tipo === 'local' ? citasApi.disponibilidadLocal() : citasApi.disponibilidadVisita(),
      tipo === 'domicilio' ? solicitudApi.direcciones() : Promise.resolve([]),
    ])
      .then(([sol, dispo, dirs]) => {
        if (!vigente) return;
        setS(sol);
        if (tipo === 'local') setLocal(dispo as Disponibilidad<DiaLocal>); else setVisita(dispo as Disponibilidad<DiaVisita>);
        setGuardadas(dirs);
      })
      .catch((e) => vigente && setError(e instanceof ApiError ? e.message : 'No pudimos cargar la agenda. Intente de nuevo.'));
    return () => { vigente = false; };
  }, [codigo, nueva, tipo, intento]);

  const titulo = tipo === 'local' ? 'Cita en el local' : 'Visita a domicilio';
  if (!codigo && !nueva) {
    return params.get('nueva') === '1' ? (
      <Alert tone="warning" title="Su solicitud todavía no se envió">
        Se recargó la página y se perdieron las fotos elegidas. <Link to="/cliente/solicitud">Vuelva a llenar la solicitud</Link>: al final elige el día y se envía todo junto.
      </Alert>
    ) : (
      <Alert tone="info" title="Elija la solicitud">
        Para agendar, abra su solicitud desde <Link to="/cliente/pedidos/solicitudes">Mis pedidos › Solicitudes</Link>.
      </Alert>
    );
  }
  if (error) return <Alert tone="danger" title="No pudimos abrir la agenda">{error} <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" onClick={() => setIntento((x) => x + 1)}>Reintentar</button></Alert>;
  if (!s || (tipo === 'local' ? !local : !visita)) return <p className="muted" role="status">Cargando la agenda…</p>;

  return (
    <MapsProvider>
      <Agenda tipo={tipo} titulo={titulo} s={s} setS={setS} local={local} visita={visita} guardadas={guardadas} nueva={nueva} recargar={() => setIntento((x) => x + 1)} />
    </MapsProvider>
  );
}

interface PropsAgenda {
  tipo: TipoCita; titulo: string; s: SolicitudCliente; setS(s: SolicitudCliente): void;
  local: Disponibilidad<DiaLocal> | null; visita: Disponibilidad<DiaVisita> | null;
  guardadas: DireccionGuardada[];
  /** Último paso de W2: la solicitud se envía al confirmar. */
  nueva: BorradorW2 | null;
  recargar(): void;
}

function Agenda({ tipo, titulo, s, setS, local, visita, guardadas, nueva, recargar }: PropsAgenda) {
  const navigate = useNavigate();
  const casa = tipo === 'domicilio';
  const [enviada, setEnviada] = useState(false);
  const sinEnviar = Boolean(nueva) && !enviada;
  const programada = s.cita?.estado === 'Programada' ? s.cita : null;
  const [reprogramando, setReprogramando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [recien, setRecien] = useState<'nueva' | 'reprogramada' | 'cancelada' | null>(null);
  const [eleccion, setEleccion] = useState<Eleccion | null>(null);
  const [dir, setDir] = useState<DireccionW2>({ guardadaId: guardadas[0]?.id ?? null, texto: '', ubicacion: null, referencia: '', guardar: true });
  const [falla, setFalla] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const noAsistio = s.inasistencias > 0;
  const eligiendo = (!programada || reprogramando) && s.estado === 'En espera de cita';
  const mueble = s.muebles.map((m) => `${m.cantidad > 1 ? `${m.cantidad} × ` : ''}${m.tipo}`).join(', ');
  const fotos = s.muebles.reduce((t, m) => t + m.archivos.length, 0);

  const textoEleccion = (e: Eleccion) => (e.hora ? `${capital(largo(e.fecha))} · ${e.hora}–${finDeTurno(e.hora)}` : `${capital(largo(e.fecha))} · ${franjaTexto(e.franja!, visita ?? undefined)}`);
  const textoCita = (c: CitaDto) => textoEleccion({ fecha: c.fecha, hora: c.hora ?? undefined, franja: c.franja ?? undefined });

  const confirmar = async () => {
    if (!eleccion) return;
    if (casa && !programada && dir.guardadaId == null && dir.texto.trim().length < 5) {
      setFalla('Escriba la dirección donde lo visitamos.');
      return;
    }
    setEnviando(true);
    setFalla(null);
    try {
      let codigo = s.codigo;
      if (sinEnviar) {
        // Último paso de W2: la solicitud y el turno se guardan juntos.
        const { datos, fotos } = construirEnvio(nueva!.c, nueva!.e, { ...eleccion, direccion: casa ? direccionEnvio(dir) : undefined });
        codigo = (await solicitudApi.enviar(datos, fotos)).codigo;
        borradorW2.limpiar();
        setEnviada(true);
        navigate(`?solicitud=${codigo}`, { replace: true });
      } else if (programada && reprogramando) await citasApi.reprogramar(programada.id, eleccion);
      else await citasApi.agendar({ solicitud: s.codigo, tipo, ...eleccion, direccion: casa ? direccionEnvio(dir) : undefined });
      setS(await solicitudApi.detalle(codigo));
      setRecien(programada ? 'reprogramada' : 'nueva');
      setReprogramando(false);
      setEleccion(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setFalla(e instanceof ApiError ? e.message : sinEnviar ? 'No pudimos enviar la solicitud. Intente de nuevo.' : 'No pudimos guardar la cita. Intente de nuevo.');
      // Si el turno se ocupó mientras elegía, se refresca la agenda.
      if (e instanceof ApiError && e.status === 409) recargar();
    } finally {
      setEnviando(false);
    }
  };

  const cancelar = async () => {
    if (!programada) return;
    setEnviando(true);
    try {
      await citasApi.cancelar(programada.id);
      setS(await solicitudApi.detalle(s.codigo));
      setRecien('cancelada');
      setCancelando(false);
    } catch (e) {
      setFalla(e instanceof ApiError ? e.message : 'No pudimos cancelar. Intente de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  const que = casa ? 'visita' : 'cita';
  const h1 = programada && !reprogramando ? `Su ${que} está programada` : noAsistio || reprogramando ? `Reprogramar su ${que}` : casa ? 'Elija el día de la visita a su casa' : 'Elija el día y la hora de su cita';
  const turnoElegido: Turno | null = eleccion?.hora ? { fecha: fechaDe(eleccion.fecha), hora: eleccion.hora } : null;

  return (
    <>
      <div className="whead">
        <div>
          <div className="crumb">
            {sinEnviar ? <Link to="/cliente/solicitud?paso=1">Nueva solicitud</Link> : <Link to="/cliente/pedidos/solicitudes">Mis pedidos › Solicitudes</Link>} › {titulo}
          </div>
          <h1>{h1}</h1>
        </div>
        <StatusChip status={programada ? 'Programada' : recien === 'cancelada' ? 'Cancelada' : s.estado} />
      </div>

      {sinEnviar && (
        <div className="card stack" style={{ padding: 20 }}>
          <WizardSteps steps={['Mueble y fotos', 'Tela', titulo]} current={2} onStep={(paso) => navigate(`/cliente/solicitud?paso=${paso}`)} />
          <Link className="w3-atras" to="/cliente/solicitud?paso=1">← Atrás: volver a Tela</Link>
        </div>
      )}

      <div className="wcols">
        <div className="wl">
          {!eligiendo && !programada && (
            <Alert tone="info" title={s.estado === 'Vencida' ? 'Esta solicitud venció' : 'Esta solicitud no espera una cita'}>
              Estado: {s.estado.toLowerCase()}. Para más detalles vaya a <Link to="/cliente/pedidos/solicitudes">Mis pedidos › Solicitudes</Link>.
            </Alert>
          )}

          {eligiendo && !casa && (
            <Alert tone="info" title="¿Por qué una cita?" compact>Eligió ver y tocar la tela en el local. Si eligió ver las telas en línea, este paso no aparece.</Alert>
          )}
          {eligiendo && casa && (
            <Alert tone="info" title="Visita a su casa" compact>Es una cortesía del taller: no tiene costo. Llevamos los libros de telas, medimos su mueble y el espacio, y le dejamos la cotización.</Alert>
          )}

          {eligiendo && !casa && local && (
            <Agendador dias={local.dias} duracionMin={local.duracionMin} elegido={turnoElegido} onElegir={(t) => setEleccion({ fecha: isoDe(t.fecha), hora: t.hora })} />
          )}
          {eligiendo && casa && visita && <ElegirVisita dias={visita.dias} eleccion={eleccion} onElegir={setEleccion} />}

          {programada && !reprogramando && (
            <>
              {recien && recien !== 'cancelada' && (
                <div className="okb" role="status">
                  <span className="oki"><Icon name="check" /></span>
                  <div>
                    <b>{recien === 'reprogramada' ? `Listo, su ${que} quedó reprogramada` : recien === 'nueva' && enviada ? (casa ? 'Solicitud enviada y visita programada' : 'Solicitud enviada y cita programada') : casa ? '¡Listo! Visita programada' : '¡Listo! Cita programada'}</b>
                    <span>Le enviamos la confirmación a su correo. {casa ? 'No tiene que pagar nada por la visita.' : 'El turno es solo para usted.'}</span>
                  </div>
                </div>
              )}
              <ResumenProgramada c={programada} casa={casa} textoHora={programada.hora ? (casa ? `${programada.hora}–${finDeTurno(programada.hora, programada.duracionMin)} · hora acordada con el taller` : `${programada.hora}–${finDeTurno(programada.hora)} · llegue 5 minutos antes`) : `Franja de la ${franjaTexto(programada.franja!, visita ?? undefined)} · llegamos dentro de ese horario`} />
            </>
          )}
        </div>

        <aside className="wr" aria-label={`Su ${que}`}>
          {eligiendo && noAsistio && (
            <Alert tone="warning" title={casa ? 'No lo encontramos en casa' : 'No asistió a su cita'}>
              Puede reprogramar{casa ? ' la visita' : 'la'} una sola vez. Elija {casa ? 'otro día y franja' : 'un turno nuevo'} a la izquierda. Si vuelve a pasar, la solicitud vence.
            </Alert>
          )}

          {eligiendo && (
            <>
              <div className="card stack">
                <span className="ov">{noAsistio || reprogramando ? (casa ? 'Nueva fecha' : 'Nuevo turno') : casa ? 'Día y franja elegidos' : 'Turno elegido'}</span>
                {eleccion ? <b className="w3-turno" aria-live="polite">{textoEleccion(eleccion)}</b>
                  : <div className="empty-pick"><Icon name="calendar" size={22} /><span>{casa ? 'Elija un día y una franja libre.' : 'Elija un horario libre en el calendario.'}</span></div>}
                {!casa && <span className="muted" style={{ fontSize: 14 }}>Taller Garwood, NJ · {local?.duracionMin ?? 30} min</span>}
                {casa && !programada && (
                  <>
                    <CampoDireccion valor={dir} onChange={setDir} guardadas={guardadas} etiqueta="¿Dónde lo visitamos?" />
                    <span className="muted" style={{ fontSize: 12.5 }}>Sus direcciones guardadas en Mi perfil · visita sin costo.</span>
                  </>
                )}
                {falla && <Alert tone="danger" title="No se pudo confirmar" compact>{falla}</Alert>}
                <button type="button" className="gw-btn gw-btn-primary gw-btn-lg gw-btn-block" disabled={!eleccion || enviando} onClick={confirmar}>
                  {enviando ? (sinEnviar ? 'Enviando…' : 'Guardando…') : reprogramando || noAsistio ? (casa ? 'Confirmar nueva fecha' : 'Confirmar nuevo turno') : sinEnviar ? (casa ? 'Confirmar visita y enviar solicitud' : 'Confirmar cita y enviar solicitud') : casa ? 'Confirmar visita' : 'Confirmar cita'}
                </button>
                {reprogramando && <button type="button" className="gw-btn gw-btn-ghost gw-btn-block" onClick={() => { setReprogramando(false); setEleccion(null); }}>Mantener la {que} actual</button>}
              </div>
              <div className="card stack" style={{ gap: 10 }}>
                <span className="ov">{casa ? 'En la visita, con lo que usted pidió' : 'En la cita, con lo que usted pidió'}</span>
                <div className="kv"><span>Solicitud</span><b>{s.codigo || 'Se envía al confirmar'}</b></div>
                <div className="kv"><span>Mueble</span><b>{mueble}</b></div>
                <div className="kv"><span>Servicio</span><b>{s.muebles[0]?.servicioNombre}</b></div>
                <div className="kv"><span>{s.codigo ? 'Fotos enviadas' : 'Fotos'}</span><b>{fotos}</b></div>
                <ol className="next3">
                  {casa
                    ? <><li>Le mostramos los libros de telas en su casa y elige una.</li><li>Medimos el mueble y, si es fabricación, el espacio donde irá.</li><li>Le damos la cotización ahí mismo; también le llega por correo y a su cuenta. Si acepta, el taller agenda el recojo.</li></>
                    : <><li>Le mostramos las telas y elige una.</li><li>Tomamos las medidas finales y acordamos el traslado: recojo y entrega o lo trae usted.</li><li>Registramos todo y le damos su cotización ahí mismo; también le llega por correo y a su cuenta.</li></>}
                </ol>
              </div>
            </>
          )}

          {programada && !reprogramando && (
            <>
              <div className="card stack">
                <div className="between"><b>Solicitud {s.codigo}</b><StatusChip status="Programada" /></div>
                <div className="kv"><span>{casa ? 'Día y franja' : 'Turno'}</span><b>{textoCita(programada)}</b></div>
                <div className="kv"><span>Mueble</span><b>{mueble}</b></div>
                <div className="kv"><span>Reprogramaciones</span><b>{programada.reprogramaciones ? `${programada.reprogramaciones} por inasistencia` : 'Ninguna'}</b></div>
                <Link className="gw-btn gw-btn-primary gw-btn-block" to="/cliente/pedidos/solicitudes">Ir a Mis pedidos › Solicitudes</Link>
              </div>
              {!cancelando ? (
                <div className="card stack">
                  <span className="ov">¿Le cambió el plan?</span>
                  <p className="muted" style={{ fontSize: 13.5 }}>
                    {casa
                      ? 'Puede reprogramar o cancelar hasta el día anterior. Si no lo encontramos en casa, podrá reprogramar una sola vez; si vuelve a pasar, la solicitud vence.'
                      : 'Puede reprogramar o cancelar antes de la cita. Si no asiste, podrá reprogramar una sola vez; si vuelve a faltar, la solicitud vence.'}
                  </p>
                  {falla && <Alert tone="danger" title="No se pudo" compact>{falla}</Alert>}
                  <button type="button" className="gw-btn gw-btn-secondary gw-btn-block" onClick={() => { setReprogramando(true); setRecien(null); setFalla(null); }}>Reprogramar</button>
                  <button type="button" className="gw-btn gw-btn-ghost gw-btn-block" onClick={() => setCancelando(true)}>Cancelar la {que}</button>
                </div>
              ) : (
                <div className="card stack w3-peligro" role="alertdialog" aria-labelledby="w3-cancelar">
                  <b id="w3-cancelar">¿Cancelar la {que} del {textoCita(programada)}?</b>
                  <p className="muted" style={{ fontSize: 14 }}>
                    {casa ? 'La franja se libera. Su solicitud queda guardada y puede agendar otra visita.' : 'El turno se libera para otro cliente. Su solicitud queda guardada y puede agendar otra cita cuando quiera.'}
                  </p>
                  <div className="row">
                    <button type="button" className="gw-btn gw-btn-danger" disabled={enviando} onClick={cancelar}>Sí, cancelar</button>
                    <button type="button" className="gw-btn gw-btn-ghost" onClick={() => setCancelando(false)}>Mantener</button>
                  </div>
                </div>
              )}
            </>
          )}

          {recien === 'cancelada' && !programada && (
            <Alert tone="info" title={casa ? 'Visita cancelada' : 'Cita cancelada'}>Su solicitud {s.codigo} sigue esperando la {que}. Puede elegir otro día a la izquierda.</Alert>
          )}
        </aside>
      </div>

      {/* En el celular el panel queda abajo: esta barra fija deja confirmar sin desplazarse. */}
      {eligiendo && eleccion && (
        <div className="cbar">
          <div><span>{casa ? 'Día y franja' : 'Turno elegido'}</span><b>{corto(eleccion.fecha)} · {eleccion.hora ?? (eleccion.franja === 'manana' ? 'mañana' : 'tarde')}</b></div>
          <button type="button" className="gw-btn gw-btn-primary" disabled={enviando} onClick={confirmar}>Confirmar</button>
        </div>
      )}
    </>
  );
}

/** W3b: los próximos días con atención y sus dos franjas. */
function ElegirVisita({ dias, eleccion, onElegir }: { dias: DiaVisita[]; eleccion: Eleccion | null; onElegir(e: Eleccion): void }) {
  const [desde, setDesde] = useState(0);
  const abiertos = dias.filter((d) => !d.cerrado);
  const vista = abiertos.slice(desde, desde + 8);
  return (
    <div className="card stack">
      <div className="between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h2 className="w3-h2">¿Qué día y en qué franja lo visitamos?</h2>
        <div className="navr">
          <button type="button" className="nb" aria-label="Días anteriores" disabled={desde === 0} onClick={() => setDesde((x) => Math.max(0, x - 8))}>‹</button>
          <button type="button" className="nb" aria-label="Días siguientes" disabled={desde + 8 >= abiertos.length} onClick={() => setDesde((x) => x + 8)}>›</button>
        </div>
      </div>
      <div className="w3b-grid">
        {vista.map((d) => {
          const f = fechaDe(d.fecha);
          return (
            <div key={d.fecha} className="w3b-dia">
              <b>{DIAS[f.getDay()]!.slice(0, 3)}</b>
              <span>{f.getDate()} {MESES[f.getMonth()]!.slice(0, 3)}</span>
              {d.franjas.map((x) => {
                const on = eleccion?.fecha === d.fecha && eleccion.franja === x.codigo;
                return (
                  <button key={x.codigo} type="button" className={on ? 'w3b-fr on' : 'w3b-fr'} disabled={!x.libre} aria-pressed={on}
                    aria-label={`${DIAS[f.getDay()]} ${f.getDate()}, ${x.nombre}${x.libre ? '' : ', ocupada'}`} onClick={() => onElegir({ fecha: d.fecha, franja: x.codigo })}>
                    {x.codigo === 'manana' ? 'Mañana' : 'Tarde'}<small>{x.libre ? x.nombre.split('· ')[1] : 'ocupada'}</small>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="muted" style={{ fontSize: 13 }}>Se elige una franja, no una hora exacta: llegamos en algún momento dentro de esa franja. La visita dura aprox. 1 hora. Lunes a sábado.</p>
    </div>
  );
}

function ResumenProgramada({ c, casa, textoHora }: { c: CitaDto; casa: boolean; textoHora: string }) {
  const f = fechaDe(c.fecha);
  const pasos = casa
    ? [['Llegamos a su casa', 'Dentro de la franja elegida. La visita dura aprox. 1 hora.'], ['Elige la tela y medimos', 'Le mostramos los libros de telas; medimos el mueble y, si es a medida, el espacio.'], ['Le dejamos la cotización', 'Ahí mismo, y también le llega a Mis pedidos. Si la acepta, el taller agenda el recojo.']]
    : [['Viene al taller', 'Taller Garwood, NJ. El turno dura 30 minutos y es solo para usted.'], ['Elige la tela y medimos', 'Le mostramos los libros de telas y tomamos las medidas finales.'], ['Le damos la cotización', 'Ahí mismo, y también le llega a Mis pedidos. Si la acepta, acordamos el recojo o lo trae usted.']];
  const prep = casa
    ? ['El mueble despejado y fácil de ver por todos lados.', 'Una persona adulta en casa durante toda la franja.', 'Si es un mueble a medida: el espacio libre donde irá.', 'Fotos o ideas de telas que le gusten (opcional).']
    : ['Si puede, una foto del ambiente donde va el mueble.', 'Un cojín o retazo, si quiere combinar colores.', 'Las medidas del espacio, si es un mueble a medida.', 'Llegue 5 minutos antes: el turno dura 30 min.'];
  const tags = casa ? [['Sin costo', 'g'], ['Aprox. 1 hora', ''], ['Llevamos los libros de telas', '']] : [['Sin costo', 'g'], ['30 minutos', ''], ['Libros de telas en el local', '']];
  return (
    <>
      <div className="card stack">
        <div className="w3-when">
          <div className="w3-calt"><small>{DIAS[f.getDay()]!.slice(0, 3)}</small><b>{f.getDate()}</b><span>{MESES[f.getMonth()]}</span></div>
          <div className="w3-whn">
            <span className="ov">{casa ? 'Su visita a domicilio' : 'Su cita'}</span>
            <h2>{capital(largo(c.fecha))}</h2>
            <div className="w3-wli"><Icon name="clock" size={18} /><span>{textoHora}</span></div>
            <div className="w3-wli"><Icon name="map-pin" size={18} /><span>{casa ? c.direccion ?? 'La dirección que indicó' : 'Taller Garwood, NJ'}</span></div>
            <div className="w3-tags">{tags.map(([l, k]) => <span key={l} className={k}>{l}</span>)}</div>
          </div>
        </div>
      </div>
      <div className="card stack">
        <h2 className="w3-h2">{casa ? 'Cómo será su visita' : 'Cómo será su cita'}</h2>
        <ol className="w3-tl">{pasos.map(([t, d], i) => <li key={t}><i>{i + 1}</i><div><b>{t}</b><span>{d}</span></div></li>)}</ol>
      </div>
      <div className="card stack">
        <h2 className="w3-h2">{casa ? 'Tenga listo para la visita' : 'Para aprovechar su cita'}</h2>
        <ul className="w3-prep">{prep.map((p) => <li key={p}><Icon name="check" size={16} /><span>{p}</span></li>)}</ul>
      </div>
    </>
  );
}
