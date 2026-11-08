import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../../shared/api/http';
import { MapsProvider } from '../../../shared/maps/MapsProvider';
import { Alert } from '../../../shared/ui/Alert';
import { Icon, type IconName } from '../../../shared/ui/Icon';
import { TextField } from '../../../shared/ui/TextField';
import { WizardSteps } from '../../../shared/ui/WizardSteps';
import { EIN_RE, digitosTelefono } from '../../seguridad/schemas';
import { formatearTelefono } from '../../seguridad/components/RegistroForm';
import {
  construirEnvio, estadoInicial, etiquetaMueble, hayRecojo, necesitaCita, nombreServicio, textoRecojo, textoTelaW2, textoTraslado, type EstadoW2,
} from '../solicitud/estadoW2';
import { PasoMuebles, PasoTelaW2, PasoTrasladoW2, type PropsPaso } from '../solicitud/PasosW2';
import { solicitudApi, type Catalogo } from '../solicitud/solicitudApi';
import { pasoDeCampo, validarPaso, type Errores } from '../solicitud/validacion';
import { adminSolicitudesApi, type ClienteBuscado, type RegistroAdmin } from './adminApi';

const PASOS = ['Cliente', 'Mueble y fotos', 'Tela', 'Traslado', 'Revisar y registrar'];
const MEDIOS: { id: RegistroAdmin['canal']; nombre: string; detalle: string; icono: IconName }[] = [
  { id: 'telefono', nombre: 'Teléfono', detalle: 'Llamó al taller', icono: 'user' },
  { id: 'local', nombre: 'En persona', detalle: 'Vino al local', icono: 'map-pin' },
  { id: 'correo', nombre: 'Correo', detalle: 'Escribió un correo', icono: 'inbox' },
  { id: 'mensaje', nombre: 'Mensaje de texto', detalle: 'Mandó un mensaje de texto', icono: 'quote' },
];
const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Nuevo { empresa: boolean; nombres: string; apellidos: string; legal: string; ein: string; telefono: string; correo: string }
type Accion = { id: string; titulo: string; detalle: string; icono: IconName; ir: string; queda: string; pasa: string; boton: string };

interface Props {
  onIr(ruta: string): void;
  onRegistrada(codigo: string, texto: string): void;
  onCancelar(): void;
}

/** A3 · Nueva solicitud registrada por el Administrador: los mismos pasos que hace el cliente en W2 (CU-C01). */
export function NuevaSolicitudAdmin(props: Props) {
  const [c, setC] = useState<Catalogo | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    solicitudApi.catalogo().then(setC).catch((e) => setError(e instanceof ApiError ? e.message : 'No pudimos cargar el catálogo.'));
  }, []);
  if (error) return <Alert tone="danger" title="No se pudo abrir el formulario">{error}</Alert>;
  if (!c) return <p className="muted" role="status">Cargando el formulario…</p>;
  return <MapsProvider><Asistente c={c} {...props} /></MapsProvider>;
}

function Asistente({ c, onIr, onRegistrada, onCancelar }: Props & { c: Catalogo }) {
  const [paso, setPaso] = useState(0);
  const [e, setE] = useState<EstadoW2>(() => estadoInicial(c, null));
  const [canal, setCanal] = useState<RegistroAdmin['canal']>('telefono');
  const [busca, setBusca] = useState('');
  const [hallados, setHallados] = useState<ClienteBuscado[]>([]);
  const [cliente, setCliente] = useState<ClienteBuscado | 'nuevo' | null>(null);
  const [nuevo, setNuevo] = useState<Nuevo>({ empresa: false, nombres: '', apellidos: '', legal: '', ein: '', telefono: '', correo: '' });
  const [pedirFotos, setPedirFotos] = useState(false);
  const [accion, setAccion] = useState(0);
  const [avisar, setAvisar] = useState(true);
  const [errores, setErrores] = useState<Errores>({});
  const [falla, setFalla] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const arriba = useRef<HTMLDivElement>(null);

  const enPersona = canal === 'local';
  // Con cita en el local o visita, no hay traslado ni revisión: al registrar se abre la Agenda (A2d / A2e).
  const conCita = necesitaCita(e.tela);
  const casa = e.tela === 'domicilio';
  const pasos = conCita ? ['Cliente', 'Mueble y fotos', 'Tela', casa ? 'Turno de la visita (Agenda)' : enPersona ? 'Atención o turno' : 'Turno en la Agenda'] : PASOS;
  const fotosPorEnlace = pedirFotos && !enPersona;
  const guardadas = cliente && cliente !== 'nuevo' ? cliente.direcciones : [];
  const set = (cambio: Partial<EstadoW2>) => { setE((x) => ({ ...x, ...cambio })); setFalla(null); };

  // Búsqueda de clientes registrados (nombre, correo o teléfono).
  useEffect(() => {
    const q = busca.trim();
    if (q.length < 2) { setHallados([]); return; }
    const t = setTimeout(() => adminSolicitudesApi.buscarClientes(q).then(setHallados).catch(() => setHallados([])), 250);
    return () => clearTimeout(t);
  }, [busca]);

  useEffect(() => { arriba.current?.scrollIntoView({ block: 'start' }); }, [paso]);

  const elegirCliente = (x: ClienteBuscado | 'nuevo') => {
    setCliente(x);
    const id = x !== 'nuevo' ? x.direcciones[0]?.id ?? null : null;
    set({ dir: { ...e.dir, guardadaId: id } });
  };

  const erroresCliente = (): Errores => {
    const r: Errores = {};
    if (!cliente) r.cliente = 'Elija un cliente o registre uno nuevo.';
    if (cliente !== 'nuevo') return r;
    if (nuevo.empresa) {
      if (!nuevo.legal.trim()) r.legal = 'Falta el nombre legal de la empresa.';
      if (!EIN_RE.test(nuevo.ein.trim())) r.ein = 'El EIN tiene 9 dígitos: 12-3456789.';
      if (!CORREO_RE.test(nuevo.correo.trim())) r.correo = 'Falta un correo de trabajo válido.';
    } else {
      if (!nuevo.apellidos.trim()) r.apellidos = 'Falta el apellido.';
      if (nuevo.correo.trim() && !CORREO_RE.test(nuevo.correo.trim())) r.correo = 'El correo no es válido.';
    }
    if (!nuevo.nombres.trim()) r.nombres = 'Falta el nombre.';
    if (digitosTelefono(nuevo.telefono).length !== 10) r.telefono = 'El teléfono lleva código de área y 7 dígitos.';
    return r;
  };
  const erroresDe = (k: number) => (k === 0 ? erroresCliente() : k === 4 ? {} : validarPaso(c, e, k - 1, fotosPorEnlace));

  const mostrar = (errs: Errores, k: number) => {
    setErrores(errs);
    if (!Object.keys(errs).length) return true;
    const mueble = /^muebles\.(\d+)/.exec(Object.keys(errs)[0]!);
    setPaso(k);
    if (mueble) set({ activo: +mueble[1]! });
    setFalla('Revise lo marcado en rojo para continuar.');
    return false;
  };
  const continuar = () => {
    // Con cita en el local o visita, el traslado se define ahí: el paso se salta.
    if (mostrar(erroresDe(paso), paso)) setPaso(paso + 1);
  };
  const atras = () => setPaso(paso - 1);

  const acciones = accionesDe(e, enPersona, fotosPorEnlace);
  const elegida = acciones[accion] ?? acciones[0]!;

  /** `despues`: a dónde ir con el código de la solicitud registrada (la Agenda o la atención en el local). */
  const registrar = async (despues?: (codigo: string) => string) => {
    for (let k = 0; k < (conCita ? 3 : 4); k++) if (!mostrar(erroresDe(k), k)) return;
    setEnviando(true);
    setFalla(null);
    try {
      const { datos, fotos } = construirEnvio(c, e);
      const r = await adminSolicitudesApi.registrar({
        cliente: cliente !== 'nuevo' ? { id: cliente!.id } : {
          nuevo: {
            tipoPersona: nuevo.empresa ? 'empresa' : 'persona', nombres: nuevo.nombres.trim(), apellidos: nuevo.apellidos.trim(),
            razonSocial: nuevo.empresa ? nuevo.legal.trim() : undefined, documento: nuevo.empresa ? nuevo.ein.trim() : undefined,
            telefono: `+1${digitosTelefono(nuevo.telefono)}`, email: nuevo.correo.trim() || undefined,
          },
        },
        canal, esperaFotos: fotosPorEnlace, avisar, solicitud: datos,
      }, fotosPorEnlace ? e.muebles.map(() => []) : fotos);
      if (despues) return onIr(despues(r.codigo));
      if (elegida.ir) return onIr(elegida.ir);
      onRegistrada(r.codigo, `Recibida por ${MEDIOS.find((m) => m.id === canal)!.nombre.toLowerCase()}${avisar ? ' · el cliente recibe un aviso con el enlace a su solicitud' : ''}${r.cuentaCreada ? ' y otro para crear su contraseña' : ''}.`);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.errores).length) {
        const campo = Object.keys(err.errores)[0]!;
        const k = campo.startsWith('cliente') ? 0 : campo.startsWith('solicitud.') ? pasoDeCampo(campo.slice(10)) + 1 : 0;
        mostrar(Object.fromEntries(Object.entries(err.errores).map(([kk, v]) => [kk.replace(/^solicitud\./, '').replace(/^cliente\.nuevo\./, ''), v])), k);
      }
      setFalla(err instanceof ApiError ? err.message : 'No pudimos registrar la solicitud. Intente de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  const propsPaso: PropsPaso = {
    c, e, set, errores, guardadas, admin: true, buscaOpcionalEnLocal: enPersona,
    fotosPorEnlace: { activo: fotosPorEnlace, posible: !enPersona, cambiar: (v) => { setPedirFotos(v); setAccion(0); } },
  };
  const resumenCliente = cliente === 'nuevo' ? `${(nuevo.empresa ? nuevo.legal : `${nuevo.nombres} ${nuevo.apellidos}`).trim() || 'Cliente nuevo'} · nuevo` : cliente?.nombre ?? 'Sin elegir';
  const pend = (desde: number, valor: string) => (paso >= desde ? valor : 'Pendiente');

  return (
    <>
      <div className="between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <span className="ov">Nueva solicitud · la registra el Administrador</span>
          <p className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>Para clientes que llaman, escriben o vienen al local. Son los mismos pasos que hace el cliente en la web.</p>
        </div>
        <button type="button" className="gw-btn gw-btn-ghost" onClick={onCancelar}>Cancelar</button>
      </div>
      <div ref={arriba} className="card" style={{ padding: 20 }}><WizardSteps steps={pasos} current={paso} onStep={enviando ? undefined : setPaso} /></div>
      <div className="sl-wz-cols">
        <div className="sl-wz-l">
          {paso === 0 && (
            <>
              <section className="card stack" aria-labelledby="sl-medio">
                <h2 id="sl-medio" style={{ fontSize: 20 }}>¿Por dónde se comunicó?</h2>
                <div className="opts" role="radiogroup" aria-labelledby="sl-medio">
                  {MEDIOS.map((m) => (
                    <button key={m.id} type="button" role="radio" aria-checked={canal === m.id} className={canal === m.id ? 'opt on' : 'opt'} onClick={() => { setCanal(m.id); setAccion(0); if (m.id === 'local' && e.tela === 'catalogo') set({ tela: 'local' }); }}>
                      <span className="ic"><Icon name={m.icono} /></span><span><b>{m.nombre}</b><small>{m.detalle}</small></span>
                    </button>
                  ))}
                </div>
              </section>
              <section className="card stack" aria-labelledby="sl-cli">
                <h2 id="sl-cli" style={{ fontSize: 20 }}>El cliente</h2>
                <TextField label="Buscar cliente" type="search" value={busca} placeholder="Nombre, teléfono o correo" hint="Si ya compró, se usan sus datos, sus direcciones y su historial." onChange={(x) => setBusca(x.target.value)} />
                <div className="stack" role="radiogroup" aria-label="Cliente">
                  {[...(cliente && cliente !== 'nuevo' && !hallados.some((h) => h.id === cliente.id) ? [cliente] : []), ...hallados].map((x) => (
                    <button key={x.id} type="button" role="radio" aria-checked={cliente !== 'nuevo' && cliente?.id === x.id} className={cliente !== 'nuevo' && cliente?.id === x.id ? 'opt on' : 'opt'} onClick={() => elegirCliente(x)}>
                      <span className="ic"><Icon name={x.tipoPersona === 'empresa' ? 'building' : 'user'} /></span>
                      <span><b>{x.nombre}</b><small>{formatearTelefono(x.telefono.replace(/^\+1/, ''))}{x.ciudad ? ` · ${x.ciudad}` : ''} · {x.solicitudes} {x.solicitudes === 1 ? 'solicitud' : 'solicitudes'}</small></span>
                      <span className="sl-tag">Cliente registrado</span>
                    </button>
                  ))}
                  {busca.trim().length >= 2 && hallados.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Ningún cliente registrado coincide con «{busca.trim()}».</p>}
                  <button type="button" role="radio" aria-checked={cliente === 'nuevo'} className={cliente === 'nuevo' ? 'opt on' : 'opt'} onClick={() => elegirCliente('nuevo')}>
                    <span className="ic"><Icon name="inbox" /></span><span><b>Es un cliente nuevo</b><small>No aparece en la búsqueda: registrarlo ahora</small></span>
                  </button>
                </div>
                {errores.cliente && <p className="gw-field-error w2-error" role="alert"><Icon name="alert" size={14} />{errores.cliente}</p>}
                {cliente === 'nuevo' && <ClienteNuevo n={nuevo} set={(x) => setNuevo((y) => ({ ...y, ...x }))} errores={errores} />}
              </section>
            </>
          )}
          {paso === 1 && <PasoMuebles {...propsPaso} />}
          {paso === 2 && <PasoTelaW2 {...propsPaso} />}
          {paso === 3 && <PasoTrasladoW2 {...propsPaso} />}
          {paso === 4 && (
            <section className="card stack" aria-labelledby="sl-rev">
              <h2 id="sl-rev" style={{ fontSize: 20 }}>Revise y registre</h2>
              <p className="muted">Léale al cliente el resumen para confirmar que todo está bien.</p>
              <span className="gw-field-label" id="sl-ahora">¿Qué hacemos ahora?</span>
              <div className="opts" role="radiogroup" aria-labelledby="sl-ahora">
                {acciones.map((a, i) => (
                  <button key={a.id} type="button" role="radio" aria-checked={a === elegida} className={a === elegida ? 'opt on' : 'opt'} onClick={() => setAccion(i)}>
                    <span className="ic"><Icon name={a.icono} /></span><span><b>{a.titulo}</b><small>{a.detalle}</small></span>
                  </button>
                ))}
              </div>
              <Alert tone="info" title={elegida.queda} compact>{elegida.pasa}</Alert>
              <label className="row" style={{ fontSize: 14, gap: 8 }}>
                <input type="checkbox" checked={avisar} onChange={(x) => setAvisar(x.target.checked)} style={{ width: 18, height: 18, flex: 'none', accentColor: 'var(--primary)' }} />
                Avisar al cliente por correo y en la web, con el enlace a su solicitud
              </label>
            </section>
          )}
          {falla && <Alert tone="danger" title="No se pudo continuar" compact>{falla}</Alert>}
          <div className="sl-pie">
            {paso > 0 && <button type="button" className="gw-btn gw-btn-ghost" disabled={enviando} onClick={atras}>Atrás</button>}
            <div className="sl-pie-der">
              {conCita && paso === 2 ? (
                enPersona && !casa ? (
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="gw-btn gw-btn-secondary gw-btn-lg" disabled={enviando} onClick={() => registrar((codigo) => `/admin/agenda?agendar=${codigo}&nueva=1`)}>Guardarle un turno para otro día</button>
                    <button type="button" className="gw-btn gw-btn-primary gw-btn-lg" disabled={enviando} onClick={() => registrar((codigo) => `/admin/agenda/atender?solicitud=${codigo}`)}>{enviando ? 'Registrando…' : 'Atenderlo ahora'}</button>
                  </div>
                ) : (
                  <button type="button" className="gw-btn gw-btn-primary gw-btn-lg" disabled={enviando} onClick={() => registrar((codigo) => `/admin/agenda?agendar=${codigo}&nueva=1`)}>
                    {enviando ? 'Registrando…' : casa ? 'Registrar y elegir turno de la visita' : 'Registrar y elegir turno'}
                  </button>
                )
              ) : paso < 4
                ? <button type="button" className="gw-btn gw-btn-primary gw-btn-lg" onClick={continuar}>Continuar</button>
                : <button type="button" className="gw-btn gw-btn-primary gw-btn-lg" disabled={enviando} onClick={() => registrar()}>{enviando ? 'Registrando…' : elegida.boton}</button>}
            </div>
          </div>
          {conCita && paso === 2 && (
            <label className="row" style={{ fontSize: 14, gap: 8 }}>
              <input type="checkbox" checked={avisar} onChange={(x) => setAvisar(x.target.checked)} style={{ width: 18, height: 18, flex: 'none', accentColor: 'var(--primary)' }} />
              Avisar al cliente por correo y en la web, con el enlace a su solicitud
            </label>
          )}
        </div>
        <aside className="sl-wz-sum" aria-label="Resumen de la solicitud">
          <div className="card stack" style={{ gap: 10 }}>
            <div className="between"><span className="ov">Resumen de la solicitud</span><span className="pill">{MEDIOS.find((m) => m.id === canal)!.nombre}</span></div>
            <div className="kv"><span>Cliente</span><b className={cliente ? undefined : 'sl-pend'}>{resumenCliente}</b></div>
            <hr className="stitch" />
            {e.muebles.map((m, i) => <div key={m.uid} className="kv"><span>{e.muebles.length > 1 ? `Mueble ${i + 1}` : 'Mueble'}</span><b className={paso >= 1 ? undefined : 'sl-pend'}>{pend(1, `${etiquetaMueble(c, m)} · ${nombreServicio(c, m).toLowerCase()}`)}</b></div>)}
            <div className="kv"><span>Fotos</span><b className={paso >= 1 ? undefined : 'sl-pend'}>{pend(1, fotosPorEnlace ? 'Se pedirán al cliente' : `${e.muebles.reduce((t, m) => t + m.archivos.length, 0)} archivos`)}</b></div>
            <hr className="stitch" />
            <div className="kv"><span>Tela</span><b className={paso >= 2 ? undefined : 'sl-pend'}>{pend(2, textoTelaW2(c, e))}</b></div>
            <div className="kv"><span>Traslado</span><b className={paso >= 3 || (paso >= 2 && necesitaCita(e.tela)) ? undefined : 'sl-pend'}>{paso >= 2 && necesitaCita(e.tela) ? textoTraslado(e) : pend(3, `${textoTraslado(e)}${!necesitaCita(e.tela) && e.traslado === 'delivery' && hayRecojo(e) ? ` · ${textoRecojo(c, e)}` : ''}`)}</b></div>
            <p className="audit">Queda registrado que la ingresó el Administrador, por {MEDIOS.find((m) => m.id === canal)!.nombre.toLowerCase()}, con fecha y hora.</p>
          </div>
        </aside>
      </div>
    </>
  );
}

function ClienteNuevo({ n, set, errores }: { n: Nuevo; set(x: Partial<Nuevo>): void; errores: Errores }) {
  return (
    <>
      <span className="gw-field-label" id="sl-tipo">Tipo de cliente</span>
      <div className="opts" role="radiogroup" aria-labelledby="sl-tipo">
        {([[false, 'Persona', 'Muebles de su casa', 'user'], [true, 'Empresa', 'Hoteles, oficinas, decoradores · pide el EIN', 'building']] as const).map(([v, t, d, ic]) => (
          <button key={t} type="button" role="radio" aria-checked={n.empresa === v} className={n.empresa === v ? 'opt on' : 'opt'} onClick={() => set({ empresa: v })}>
            <span className="ic"><Icon name={ic} /></span><span><b>{t}</b><small>{d}</small></span>
          </button>
        ))}
      </div>
      {n.empresa && (
        <div className="grid2" style={{ gap: 16 }}>
          <TextField label="Nombre legal de la empresa" required maxLength={160} value={n.legal} error={errores.legal ?? errores.razonSocial} placeholder="Ej.: Maple Grove Offices LLC" onChange={(x) => set({ legal: x.target.value })} />
          <TextField label="EIN · identificación fiscal" required value={n.ein} error={errores.ein ?? errores.documento} placeholder="12-3456789" hint="9 dígitos que emite el IRS" onChange={(x) => set({ ein: x.target.value })} />
        </div>
      )}
      {n.empresa && <span className="gw-field-label">Persona de contacto</span>}
      <div className="grid2" style={{ gap: 16 }}>
        <TextField label="Nombre" required maxLength={80} value={n.nombres} error={errores.nombres} onChange={(x) => set({ nombres: x.target.value })} />
        <TextField label="Apellido" required={!n.empresa} optional={n.empresa} maxLength={80} value={n.apellidos} error={errores.apellidos} onChange={(x) => set({ apellidos: x.target.value })} />
      </div>
      <div className="grid2" style={{ gap: 16 }}>
        <TextField label="Teléfono" required inputMode="tel" value={n.telefono} error={errores.telefono} placeholder="+1 (908) 555-0147" hint="Solo números de EE. UU. (+1)" onChange={(x) => set({ telefono: formatearTelefono(x.target.value) })} />
        <TextField label={n.empresa ? 'Correo de trabajo' : 'Correo'} required={n.empresa} optional={!n.empresa} type="email" maxLength={160} value={n.correo} error={errores.correo ?? errores.email}
          hint={n.empresa ? 'Aquí le llegan la cotización y los comprobantes' : 'Con correo le creamos su cuenta para seguir la solicitud en la web'} onChange={(x) => set({ correo: x.target.value })} />
      </div>
    </>
  );
}

/** Qué se puede hacer al registrar, según el medio, las fotos y la tela (diseño A3). */
function accionesDe(e: EstadoW2, enPersona: boolean, fotosPorEnlace: boolean): Accion[] {
  const local = e.tela === 'local';
  const casa = e.tela === 'domicilio';
  const atender: Accion = { id: 'atender', titulo: 'Atenderlo ahora en el local', detalle: 'Elige la tela, se toman medidas y se cotiza en esta misma visita.', icono: 'sofa', ir: '/admin/agenda/atender', queda: 'Pasa directo a «Atención en el local»', pasa: 'Se abre la guía de atención (tela, medidas, traslado y cotización).', boton: 'Registrar y atender ahora' };
  const cotizar: Accion = { id: 'cotizar', titulo: 'Armar la cotización ahora', detalle: enPersona ? 'Con lo que ya tiene, cotice mientras el cliente espera.' : 'Cotice mientras sigue en la llamada y regístrele la respuesta.', icono: 'quote', ir: '/admin/cotizaciones/cotizar', queda: 'Queda «Nueva» y se abre la cotización', pasa: 'Se abre Cotizar con estos datos.', boton: 'Registrar y cotizar ahora' };
  const fotos: Accion = { id: 'fotos', titulo: 'Esperar las fotos', detalle: 'Se cotiza cuando el cliente las suba con el enlace.', icono: 'image', ir: '', queda: 'Queda «Esperando fotos»', pasa: 'El cliente recibe el enlace para subir las fotos. Cuando lleguen, se puede cotizar.', boton: 'Registrar y enviar enlace' };
  const registrar: Accion = { id: 'registrar', titulo: 'Solo registrarla', detalle: 'Queda en la bandeja para seguirla más tarde.', icono: 'inbox', ir: '', queda: local || casa ? 'Queda «En espera de cita»' : 'Queda «Nueva», lista para cotizar', pasa: 'Queda en la bandeja. El cliente recibe un aviso con el enlace a su solicitud.', boton: 'Registrar solicitud' };
  if (fotosPorEnlace) return [fotos];
  // Con cita en el local o visita no se llega a este paso: se elige el turno en la Agenda.
  if (enPersona) return [atender, cotizar, registrar];
  return [cotizar, registrar];
}
