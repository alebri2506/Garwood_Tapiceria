import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TopAdmin } from '../../../app/layout/AdminLayout';
import { ApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { Icon } from '../../../shared/ui/Icon';
import { Contador } from '../solicitud/Contador';
import { MESES, fechaLarga } from '../fechas';
import { Armar, type ArmadoEnVisita } from '../cotizaciones/ModoArmar';
import { FotosMueble } from '../cotizaciones/VisorMedios';
import { cotizacionesApi, type Armado, type EntradaCotizacion, type MuebleArmado } from '../cotizaciones/cotizacionesApi';
import { DibujoMueble } from '../solicitud/DibujoMueble';
import { CampoDireccion } from '../solicitud/PasosW2';
import type { DireccionW2 } from '../solicitud/estadoW2';
import type { DireccionGuardada } from '../solicitud/solicitudApi';
import { MapaUbicacion } from '../../../shared/maps/MapaUbicacion';
import { MapsProvider } from '../../../shared/maps/MapsProvider';
import { fondoDe } from '../solicitud/datos';
import '../solicitud/solicitud.css';
import type { Medio } from '../cotizaciones/datos';
import { PASOS, SIGUIENTE, TEXTOS } from './datos';
import { GrillaRecojo, deIso, type HoraElegida } from './GrillaRecojo';
import { atencionApi, type Atencion, type Disponibilidad, type MetodoPago, type ResultadoRespuesta } from './atencionApi';
import '../cotizaciones/cotizaciones.css';

// A2b Atender la cita o la visita a domicilio conectada a la API (decisiones L). La cotización se arma con A4.

const dolares = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;
const minuscula = (s: string) => `${s[0]!.toLowerCase()}${s.slice(1)}`;
const mensaje = (e: unknown, def: string) => (e instanceof ApiError ? e.message : def);
const METODOS: { id: MetodoPago; l: string; frase: string }[] = [
  { id: 'efectivo', l: 'Efectivo', frase: 'en efectivo' }, { id: 'tarjeta', l: 'Tarjeta', frase: 'con tarjeta' },
  { id: 'zelle', l: 'Zelle', frase: 'por Zelle' }, { id: 'cheque', l: 'Cheque', frase: 'con cheque' },
];
const MOTIVOS = ['Precio', 'Plazo de entrega', 'Elegirá otro taller', 'Otro motivo'];

/** La cotización con las telas elegidas en la visita, a partir de lo que trae «armar» (para guardar el borrador). */
/** La tela de un mueble en la cita o la visita, como en W2: una para todo, o una por cada parte. Las yardas van por tela. */
interface TelaDelMueble { modo: 'una' | 'partes'; una: number | null; porParte: Record<number, number>; activa: number; yardas: Record<number, number> }

const telaInicial = (m: MuebleArmado): TelaDelMueble => ({
  modo: m.partes?.length ? 'partes' : 'una',
  una: m.partes?.length ? null : m.tela.telas[0]?.materialId ?? null,
  porParte: Object.fromEntries((m.partes ?? []).map((x) => [x.parteId, x.materialId])),
  activa: 0,
  yardas: Object.fromEntries(m.tela.telas.map((t) => [t.materialId, t.yardas || 1])),
});
/** Las telas que usa el mueble (sin repetir), con sus yardas. */
const telasUsadas = (t: TelaDelMueble) => {
  const ids = t.modo === 'una' ? (t.una != null ? [t.una] : []) : [...new Set(Object.values(t.porParte))];
  return ids.map((id) => ({ materialId: id, yardas: t.yardas[id] ?? 1 }));
};

function entradaDesde(a: Armado, telas: Record<number, TelaDelMueble>): EntradaCotizacion {
  return {
    muebles: a.muebles.map((m) => {
      const t = telas[m.solicitudMuebleId];
      return {
        solicitudMuebleId: m.solicitudMuebleId,
        actividades: m.actividades.map((x) => ({ nombre: x.nombre, horasPersona: x.horasPersona, maquinaId: x.maquinaId, horasMaquina: x.horasMaquina, materiales: x.materiales.map((y) => ({ materialId: y.materialId, cantidad: y.cantidad })) })),
        telas: m.tela.eligeAqui ? (t ? telasUsadas(t) : []) : m.tela.telas.map((x) => ({ materialId: x.materialId, yardas: x.yardas })),
        ...(m.tela.eligeAqui && t?.modo === 'partes' ? { partes: Object.entries(t.porParte).map(([parteId, materialId]) => ({ parteId: Number(parteId), materialId })) } : {}),
        propuesto: m.propuesto, motivo: m.motivo, revisado: m.revisado,
      };
    }),
    transporte: a.transporte.manual ? { manual: true, monto: a.transporte.monto, motivo: a.transporte.motivo } : { manual: false },
    adelanto: a.condiciones.adelanto,
    observaciones: a.observaciones,
  };
}

export function AtencionConectada({ codigo }: { codigo: string }) {
  const navigate = useNavigate();
  const [at, setAt] = useState<Atencion | null>(null);
  const [armado, setArmado] = useState<Armado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paso, setPaso] = useState(0);
  // Lo que se elige en el paso Telas antes de guardar: el resumen lateral lo muestra en vivo (solo en ese paso).
  const [telasEnCurso, setTelasEnCurso] = useState<Record<number, TelaDelMueble> | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const titulo = useRef<HTMLHeadingElement>(null);

  const retomada = useRef(false);
  const cargarArmado = useCallback(async () => {
    try { const a = await cotizacionesApi.armar(codigo); setArmado(a); return a; } catch (e) { setAviso(mensaje(e, 'No pudimos cargar la cotización.')); return null; }
  }, [codigo]);
  const cargar = useCallback(async () => {
    setError(null);
    try {
      const d = await atencionApi.datos(codigo);
      setAt(d);
      // La cotización se arma cuando la visita ya se está atendiendo (la solicitud dejó de esperar su cita).
      const a = d.solicitud.estado !== 'En espera de cita' ? await cargarArmado() : null;
      if (d.cotizacion && d.cotizacion.estado !== 'Borrador') setPaso(4);
      else if (!retomada.current && (d.cita?.estado === 'En atención' || d.cita?.estado === 'Atendida') && a) {
        // Se volvió a abrir una atención ya empezada: sigue en el primer paso que falta (telas → traslado → cotización).
        const faltaTela = a.muebles.some((m) => m.tela.eligeAqui && m.tela.tipo !== 'no' && m.tela.telas.length === 0);
        setPaso(faltaTela ? 1 : d.solicitud.traslado == null ? 2 : 3);
      }
      retomada.current = true;
    } catch (e) { setError(mensaje(e, 'No pudimos abrir la atención.')); }
  }, [codigo, cargarArmado]);
  useEffect(() => { void cargar(); }, [cargar]);

  if (error) return <Alert tone="danger" title="No pudimos abrir la atención">{error} <Link to="/admin/agenda">Volver a la agenda</Link></Alert>;
  if (!at) return <p className="muted" role="status">Cargando la atención…</p>;

  const lugar = at.cita?.tipo ?? (at.solicitud.telaOpcion === 'domicilio' ? 'domicilio' : 'local');
  const t = TEXTOS[lugar];
  const cuando = at.cita ? `${minuscula(fechaLarga(deIso(at.cita.fecha)))}${at.cita.hora ? `, ${at.cita.hora}` : at.cita.franja ? `, por la ${at.cita.franja === 'manana' ? 'mañana' : 'tarde'}` : ''}` : '';
  const ir = (n: number) => { setPaso(n); window.scrollTo({ top: 0 }); titulo.current?.focus(); };
  const publicada = Boolean(at.cotizacion && at.cotizacion.estado !== 'Borrador');
  const resumen = <ResumenAtencion at={at} armado={armado} paso={paso} enCurso={paso === 1 ? telasEnCurso : null} />;

  /** «Empezar»: la visita se está realizando (CU-C05) y la solicitud queda lista para cotizar. */
  const empezar = async () => {
    setOcupado(true);
    try {
      // La cita queda «En atención»: pasa a «Atendida» recién al registrar la respuesta del cliente.
      if (at.cita?.estado === 'Programada') await atencionApi.empezar(codigo);
      await cargar();
      ir(1);
    } catch (e) { setAviso(mensaje(e, 'No pudimos empezar la atención.')); } finally { setOcupado(false); }
  };

  return (
    <>
      <TopAdmin
        crumb={<><Link to="/admin/agenda">Agenda</Link> › {lugar === 'domicilio' ? 'Atender visita' : 'Atender cita'} · {at.cliente.nombre}{cuando ? ` · ${cuando}` : ''}{at.cita?.direccion ? ` · ${at.cita.direccion}` : ''}</>}
        titulo={<span ref={titulo} tabIndex={-1} style={{ outline: 'none' }}>{t.titulo}</span>}
      />
      {aviso && <Alert tone="danger" title="No se pudo completar">{aviso}</Alert>}

      <nav className="at-stp" aria-label="Pasos de la atención">
        {PASOS.map((l, i) => {
          const habilitado = i === 0 || (armado != null && !publicada) || (publicada && i === 4);
          return (
            <button key={l} type="button" disabled={!habilitado} className={i === paso ? 'at-st at-on' : i < paso ? 'at-st at-done' : 'at-st'} aria-current={i === paso ? 'step' : undefined} onClick={() => ir(i)}>
              <b aria-hidden="true">{i < paso ? '✓' : i + 1}</b><span>{l}</span>
            </button>
          );
        })}
      </nav>

      {paso === 0 && <PasoRevisar aside={resumen} at={at} lugar={lugar} onEmpezar={empezar} ocupado={ocupado} onNoEstaba={async () => {
        if (!at.cita) return;
        try { await atencionApi.resultado(at.cita.id, 'no_asistio'); navigate('/admin/agenda'); } catch (e) { setAviso(mensaje(e, 'No pudimos registrar la inasistencia.')); }
      }} />}
      {paso === 1 && armado && <PasoTelas aside={resumen} onCambio={setTelasEnCurso} armado={armado} codigo={codigo} onListo={async () => { await cargarArmado(); ir(2); }} onAtras={() => ir(0)} />}
      {/* El mapa y el autocompletado de direcciones de Google necesitan su proveedor (igual que W2). */}
      {paso === 2 && <MapsProvider><PasoTraslado aside={resumen} at={at} codigo={codigo} onListo={async (d) => { setAt(d); await cargarArmado(); ir(3); }} onAtras={() => ir(1)} /></MapsProvider>}
      {paso >= 3 && armado && !publicada && (
        <PasoCotizacionYRespuesta key={`${armado.cotizacion.codigo}|${armado.transporte.calculado}`} armado={armado} at={at} codigo={codigo} paso={paso} lugar={lugar}
          onPaso={ir} onRecargar={async () => { await cargarArmado(); }} onRespondido={cargar} />
      )}
      {paso === 4 && publicada && <Cierre at={at} lugar={lugar} onCambio={setAt} />}
    </>
  );
}

// ---------------------------------------------------------------- Resumen lateral (pasos 1 a 3)
function ResumenAtencion({ at, armado, paso, enCurso }: { at: Atencion; armado: Armado | null; paso: number; enCurso: Record<number, TelaDelMueble> | null }) {
  const fotos = at.muebles.reduce((t, m) => t + m.medios.length, 0);
  const color = (id: number) => armado?.muestrario?.find((x) => x.id === id)?.colorHex ?? null;
  const telas = armado?.muebles.flatMap((m) => {
    const vivo = enCurso?.[m.solicitudMuebleId];
    if (vivo && m.tela.eligeAqui) {
      return telasUsadas(vivo).map((t) => ({
        clave: `${m.solicitudMuebleId}-${t.materialId}`, nombre: armado.muestrario?.find((x) => x.id === t.materialId)?.nombre ?? 'Tela', yardas: t.yardas, color: color(t.materialId),
        partes: vivo.modo === 'partes' ? (m.partesMueble ?? []).filter((p) => vivo.porParte[p.id] === t.materialId).map((p) => p.nombre).join(', ') : '',
      }));
    }
    return m.tela.telas.map((t) => ({
      clave: `${m.solicitudMuebleId}-${t.materialId}`, nombre: t.nombre, yardas: t.yardas, color: color(t.materialId),
      partes: (m.partes ?? []).filter((x) => x.materialId === t.materialId).map((x) => m.partesMueble?.find((p) => p.id === x.parteId)?.nombre).filter(Boolean).join(', '),
    }));
  }) ?? [];
  const telaTexto = (() => {
    if (!armado) return 'Se eligen en el paso 2';
    const sinTela = (m: MuebleArmado) => (enCurso?.[m.solicitudMuebleId] && m.tela.eligeAqui ? telasUsadas(enCurso[m.solicitudMuebleId]!).length === 0 : !m.tela.telas.length);
    const notas = [...new Set(armado.muebles.filter(sinTela).map((m) => (m.tela.eligeAqui ? 'Falta elegir' : m.tela.nota)))];
    if (!telas.length) return notas.join(' · ') || 'Falta elegir';
    return `${telas.length} ${telas.length === 1 ? 'tela' : 'telas'}${notas.length ? ` · ${notas.join(' · ').toLowerCase()}` : ''}`;
  })();
  const dir = at.direcciones.find((d) => d.id === at.solicitud.direccionId);
  const traslado = at.solicitud.traslado === 'propio' ? 'Lo lleva el cliente'
    : at.solicitud.traslado === 'delivery' ? `Delivery${dir ? ` · ${dir.texto}` : ''}` : 'Se define en el paso 3';
  return (
    <section className="card at-sum" aria-label="Resumen de la atención">
      <span className="ov">{paso === 0 ? 'Se guarda mientras avanza' : 'Lo que se lleva el cliente'}</span>
      {at.muebles.map((m, i) => <div key={m.id} className="kv"><span>{at.muebles.length > 1 ? `Mueble ${i + 1}` : 'Mueble'}</span><b>{m.titulo}</b></div>)}
      <div className="kv"><span>Telas</span><b>{telaTexto}</b></div>
      {telas.map((t) => <div key={t.clave} className="at-fs"><i style={{ background: t.color ?? 'var(--primary-soft)', border: '1px solid var(--line)' }} aria-hidden="true" /><span>{t.nombre}{t.partes && <small className="at-fs-p">{t.partes}</small>}</span><b>{t.yardas ? `${t.yardas} yd` : '—'}</b></div>)}
      <div className="kv"><span>Fotos</span><b>{fotos ? `${fotos} de la solicitud` : 'No envió'}</b></div>
      <div className="kv"><span>Traslado</span><b>{traslado}</b></div>
      <p className="audit" style={{ margin: 0 }}>
        Cada paso se guarda en la solicitud {at.solicitud.codigo}. Si el cliente se va antes de terminar, se sigue después con
        «Continuar la atención» desde la Agenda o Solicitudes.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- Paso 1 · Recibir y revisar
/** Hoy en New York (YYYY-MM-DD), el mismo día que usa el backend. */
const hoyNY = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

function PasoRevisar({ at, lugar, onEmpezar, onNoEstaba, ocupado, aside }: { aside: ReactNode; at: Atencion; lugar: 'local' | 'domicilio'; onEmpezar(): void; onNoEstaba(): void; ocupado: boolean }) {
  const [confirmar, setConfirmar] = useState(false);
  // Decisiones L.2.11: una cita «Programada» solo se empieza el día que le corresponde.
  const otroDia = at.cita?.estado === 'Programada' && at.cita.fecha !== hoyNY() ? at.cita.fecha : null;
  const t = TEXTOS[lugar];
  const tela = at.solicitud.telaOpcion === 'trae' ? 'La trae el cliente' : at.solicitud.telaOpcion === 'sin' ? 'No lleva tela' : at.solicitud.telaOpcion === 'catalogo' ? 'La eligió en línea' : t.tela;
  return (
    <div className="split">
      <div className="wide">
        <section className="card stack" aria-labelledby="at-p1">
          <h2 id="at-p1" style={{ fontSize: 20 }}>Lo que pidió {at.cliente.nombre}</h2>
          <p className="muted" style={{ fontSize: 14 }}>Revíselo con el cliente antes de empezar.</p>
          {at.muebles.map((m, i) => {
            const medios: Medio[] = m.medios.map((x) => ({ nombre: x.nombre, origen: 'cliente', tipo: x.tipo === 'video' ? 'Video' : 'Foto', detalle: 'Enviado por el cliente', fondo: 'linear-gradient(135deg,#1E3A8A,#0B1B3A)', url: x.url }));
            return (
              <div key={m.id} className="stack" style={{ gap: 10 }}>
                <dl className="at-facts">
                  <div><dt>{at.muebles.length > 1 ? `Mueble ${i + 1}` : 'Mueble'}</dt><dd>{m.titulo}</dd></div>
                  <div><dt>Servicio</dt><dd>{m.servicio}</dd></div>
                  <div><dt>Tela</dt><dd>{tela}</dd></div>
                  <div><dt>Medidas</dt><dd>{m.medidas ?? 'No indicó'}</dd></div>
                </dl>
                {medios.length > 0 ? <FotosMueble compacto medios={medios} titulo={`Fotos y videos · ${m.titulo.toLowerCase()}`} /> : <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>No envió fotos de este mueble.</p>}
              </div>
            );
          })}
        </section>
        {otroDia && (
          <Alert tone="info" title={otroDia > hoyNY() ? `${lugar === 'domicilio' ? 'Esta visita' : 'Esta cita'} es para otro día` : 'El día de esta cita ya pasó'}>
            Solo se atiende el día que le corresponde. {otroDia > hoyNY()
              ? 'Si el cliente vino hoy, vuelva a la Agenda, use «Reprogramar» y elija un turno de hoy; luego podrá atenderla.'
              : 'Márquela como inasistencia o reprográmela para hoy desde la Agenda.'} <Link to={`/admin/agenda?cita=${at.cita!.id}&fecha=${otroDia}`}>Ir a la Agenda</Link>
          </Alert>
        )}
        <div className="between at-foot">
          {confirmar ? (
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13.5 }}>{lugar === 'domicilio' ? '¿No había nadie en casa?' : '¿El cliente no vino?'} Se registra la inasistencia y se le avisa.</span>
              <button type="button" className="gw-btn gw-btn-danger gw-btn-sm" onClick={onNoEstaba}>Sí, registrar</button>
              <button type="button" className="gw-btn gw-btn-ghost gw-btn-sm" onClick={() => setConfirmar(false)}>Cancelar</button>
            </div>
          ) : at.cita?.estado === 'Programada' ? (
            <button type="button" className="gw-btn gw-btn-ghost" style={{ color: 'var(--danger-ink)' }} onClick={() => setConfirmar(true)}>{t.noAsistio}</button>
          ) : <span />}
          <button type="button" className="gw-btn gw-btn-primary gw-btn-lg" disabled={ocupado || Boolean(otroDia)} title={otroDia ? 'Se atiende el día de la cita' : undefined} onClick={onEmpezar}>{ocupado ? 'Empezando…' : at.cita?.estado === 'En atención' || at.cita?.estado === 'Atendida' ? 'Seguir: elegir telas' : SIGUIENTE[0]}</button>
        </div>
      </div>
      <aside className="aside">{aside}</aside>
    </div>
  );
}

// ---------------------------------------------------------------- Paso 2 · Telas (del muestrario, con las yardas que mide el taller)
function PasoTelas({ armado, codigo, onListo, onAtras, aside, onCambio }: { aside: ReactNode; onCambio(t: Record<number, TelaDelMueble>): void; armado: Armado; codigo: string; onListo(): Promise<void>; onAtras(): void }) {
  const [telas, setTelas] = useState<Record<number, TelaDelMueble>>(() => Object.fromEntries(armado.muebles.map((m) => [m.solicitudMuebleId, telaInicial(m)])));
  useEffect(() => { onCambio(telas); }, [telas, onCambio]);
  const [actual, setActual] = useState(0);
  const [familia, setFamilia] = useState('Todas');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const muestrario = armado.muestrario ?? [];
  const m = armado.muebles[Math.min(actual, armado.muebles.length - 1)]!;
  const t = telas[m.solicitudMuebleId] ?? telaInicial(m);
  const partes = m.partesMueble ?? [];
  const porPartes = t.modo === 'partes' && partes.length > 0;
  const parte = partes[t.activa] ?? partes[0];
  // «Sofá seccional (en L)» → «sofá seccional (en L)»: solo la primera letra en minúscula.
  const nombreMueble = m.titulo.replace(/^\d+ × /, '').replace(/^./, (c) => c.toLowerCase());
  const tela = (id: number | null | undefined) => muestrario.find((x) => x.id === id);
  const familias = ['Todas', ...new Set(muestrario.map((x) => x.familia).filter((x): x is string => Boolean(x)))];
  const visibles = muestrario.filter((x) => familia === 'Todas' || x.familia === familia);
  const usadas = telasUsadas(t);
  const cambiar = (c: Partial<TelaDelMueble>) => setTelas((x) => ({ ...x, [m.solicitudMuebleId]: { ...t, ...c } }));
  const elegir = (id: number) => (porPartes && parte ? cambiar({ porParte: { ...t.porParte, [parte.id]: id } }) : cambiar({ una: id }));

  /** Lo que falta para seguir (el cliente está presente: se elige ahora). */
  const falta = armado.muebles.flatMap((x, i) => {
    if (!x.tela.eligeAqui || x.tela.tipo === 'no') return [];
    const y = telas[x.solicitudMuebleId]!;
    const pre = armado.muebles.length > 1 ? `Mueble ${i + 1}: ` : '';
    if (y.modo === 'partes' && (x.partesMueble ?? []).some((p) => y.porParte[p.id] == null)) return [`${pre}elija una tela para cada parte`];
    if (y.modo === 'una' && y.una == null) return [`${pre}elija la tela`];
    return [];
  });
  const guardar = async () => {
    if (falta.length) { setError(`Falta: ${falta.join(' · ')}.`); return; }
    setGuardando(true); setError(null);
    try { await cotizacionesApi.guardar(codigo, entradaDesde(armado, telas)); await onListo(); } catch (e) { setError(mensaje(e, 'No pudimos guardar las telas.')); } finally { setGuardando(false); }
  };

  return (
    <div className="split">
      <div className="wide">
        <section className="card stack" aria-labelledby="at-p2">
          <h2 id="at-p2" style={{ fontSize: 20 }}>Telas que elige</h2>
          {armado.muebles.length > 1 && (
            <div className="co-mtabs" role="group" aria-label="Mueble">
              {armado.muebles.map((x, i) => (
                <button key={x.solicitudMuebleId} type="button" className="co-mtab" aria-pressed={i === actual} onClick={() => setActual(i)}>
                  <b>{x.clave}</b><span>{x.titulo}</span><em style={{ fontSize: 13 }}>{x.tela.eligeAqui ? `${telasUsadas(telas[x.solicitudMuebleId]!).length} tela(s)` : x.tela.nota}</em>
                </button>
              ))}
            </div>
          )}
          {!m.tela.eligeAqui || m.tela.tipo === 'no' ? (
            <div className="at-nota"><Icon name="info" size={18} /><span>{m.titulo}: <b>{m.tela.nota}</b>. No hay que elegir tela aquí.</span></div>
          ) : (
            <>
              <span className="gw-field-label" id="at-como">¿Cómo quiere la tela?</span>
              <div className="use" role="radiogroup" aria-labelledby="at-como">
                {([
                  ['una', 'Una tela para todo', 'Una sola tela en todo el mueble', 'quote'],
                  ['partes', 'Distintas telas por partes', partes.length ? 'Elija en el dibujo qué tela va en cada parte' : 'Este mueble no tiene partes definidas', 'sofa'],
                ] as const).map(([id, titulo, detalle, icono]) => (
                  <button key={id} type="button" role="radio" aria-checked={(id === 'partes') === porPartes} disabled={id === 'partes' && !partes.length}
                    className={(id === 'partes') === porPartes ? 'opt on' : 'opt'} onClick={() => { if (id !== t.modo) cambiar({ modo: id, una: null, porParte: {}, activa: 0, yardas: {} }); }}>
                    <span className="ic"><Icon name={icono} /></span>
                    <span><b>{titulo}</b><small>{detalle}</small></span>
                  </button>
                ))}
              </div>

              {porPartes && (
                <div className="dz">
                  <div className="dzhd"><b>1. Toque una parte del {nombreMueble}</b><small>Puede usar una tela distinta en cada parte.</small></div>
                  <div className="dzgrid">
                    <DibujoMueble muebleId={m.tipoCodigo ?? ''} partes={partes.map((x) => x.nombre)} activa={t.activa}
                      colorDe={(k) => tela(t.porParte[partes[k]?.id ?? -1])?.colorHex ?? '#CBD5E1'} onElegir={(activa) => cambiar({ activa })} />
                    <div className="plist">
                      {partes.map((x, k) => {
                        const y = tela(t.porParte[x.id]);
                        return (
                          <div key={x.id} className={t.activa === k ? 'prow on' : 'prow'}>
                            <button type="button" className="pbtn" aria-pressed={t.activa === k} onClick={() => cambiar({ activa: k })}>
                              <i style={{ background: y ? fondoDe(y.familia, y.colorHex) : '#CBD5E1' }} />
                              <span><b>{x.nombre}</b><small>{y?.nombre ?? 'Sin tela'}</small></span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              <div className="swhd">
                <span className="gw-field-label">{porPartes && parte ? `2. Elija la tela para: ${parte.nombre}` : 'Elija la tela para todo el mueble'}</span>
                <b>{usadas.length ? `${usadas.length} ${usadas.length === 1 ? 'tela' : 'telas'} en el mueble` : 'Ninguna elegida'}</b>
              </div>
              {familias.length > 2 && (
                <div className="fchips" role="group" aria-label="Tipo de tela">
                  {familias.map((x) => <button key={x} type="button" aria-pressed={familia === x} className={familia === x ? 'fchip on' : 'fchip'} onClick={() => setFamilia(x)}>{x}</button>)}
                </div>
              )}
              {muestrario.length === 0 ? <p className="muted">No hay telas activas en el muestrario. Cárguelas en Inventario › Telas.</p> : (
                <div className="sw at-sw">
                  {visibles.map((x) => {
                    const on = porPartes && parte ? t.porParte[parte.id] === x.id : t.una === x.id;
                    return (
                      <button key={x.id} type="button" aria-pressed={on} className={on ? 'on' : undefined} onClick={() => elegir(x.id)}>
                        <span className="tex" style={{ background: fondoDe(x.familia, x.colorHex) }}><span className="ck"><Icon name="check" size={13} strokeWidth={3} /></span></span>
                        <span className="cap"><b>{x.nombre}</b><small>{x.precio != null ? `Costo $${x.precio}/yd` : 'Sin precio'}{x.libro ? ` · ${x.libro}` : ''}</small></span>
                      </button>
                    );
                  })}
                </div>
              )}

              {usadas.length > 0 && (
                <div className="stack" style={{ gap: 8 }}>
                  <span className="gw-field-label">{porPartes ? '3. Yardas de cada tela (las mide el taller)' : 'Yardas (las mide el taller)'}</span>
                  {usadas.map((x) => {
                    const y = tela(x.materialId);
                    const donde = porPartes ? partes.filter((p) => t.porParte[p.id] === x.materialId).map((p) => p.nombre).join(', ') : 'todo el mueble';
                    return (
                      <div key={x.materialId} className="ydrow at-una">
                        <div><b>{y?.nombre ?? 'Tela'}</b><small>{donde} · {y?.precio != null ? `costo $${y.precio}/yd, solo lo ve usted` : 'sin precio en Inventario'}</small></div>
                        <Contador valor={x.yardas} unidad="yd" etiqueta={`yardas de ${y?.nombre ?? 'tela'}`} onChange={(v) => cambiar({ yardas: { ...t.yardas, [x.materialId]: v } })} />
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
          {error && <Alert tone="danger" title="No se guardó">{error}</Alert>}
        </section>
        <div className="between at-foot">
          <button type="button" className="gw-btn gw-btn-ghost" onClick={onAtras}>Atrás</button>
          <button type="button" className="gw-btn gw-btn-primary gw-btn-lg" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : SIGUIENTE[1]}</button>
        </div>
      </div>
      <aside className="aside">{aside}</aside>
    </div>
  );
}

// ---------------------------------------------------------------- Paso 3 · Traslado
function PasoTraslado({ at, codigo, onListo, onAtras, aside }: { aside: ReactNode; at: Atencion; codigo: string; onListo(d: Atencion): Promise<void>; onAtras(): void }) {
  const [traslado, setTraslado] = useState<'delivery' | 'propio'>(at.solicitud.traslado ?? 'delivery');
  // Las direcciones del cliente con el formato de W2, para usar el mismo campo de dirección y el mismo mapa.
  const guardadas: DireccionGuardada[] = at.direcciones.map((d) => ({ id: d.id, etiqueta: d.etiqueta, direccion: d.texto, referencia: d.referencia, ciudad: d.ciudad, latitud: d.latitud, longitud: d.longitud }));
  const inicial = at.solicitud.direccionId ?? at.direcciones.find((d) => d.principal)?.id ?? at.direcciones[0]?.id ?? null;
  const [dir, setDir] = useState<DireccionW2>({ guardadaId: inicial, texto: '', ubicacion: null, referencia: '', guardar: true });
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guardada = guardadas.find((d) => d.id === dir.guardadaId);
  const mapa = guardada
    ? { ubicacion: guardada.latitud != null && guardada.longitud != null ? { lat: guardada.latitud, lng: guardada.longitud } : null, etiqueta: `${guardada.etiqueta ?? 'Dirección'} · ${guardada.ciudad ?? guardada.direccion}` }
    : { ubicacion: dir.ubicacion, etiqueta: dir.ubicacion ? dir.texto : undefined };
  const lista = traslado === 'propio' || (dir.guardadaId != null ? Boolean(guardada) : dir.texto.trim().length >= 5);

  const seguir = async () => {
    setOcupado(true); setError(null);
    try {
      const direccion = traslado === 'propio' ? undefined
        : dir.guardadaId != null ? { tipo: 'guardada' as const, id: dir.guardadaId }
          : { tipo: 'nueva' as const, texto: dir.texto.trim(), referencia: dir.referencia.trim() || undefined, guardar: dir.guardar, ...(dir.ubicacion ? { latitud: dir.ubicacion.lat, longitud: dir.ubicacion.lng } : {}) };
      await onListo(await atencionApi.traslado(codigo, traslado, direccion));
    } catch (e) { setError(mensaje(e, 'No pudimos guardar el traslado.')); } finally { setOcupado(false); }
  };
  return (
    <div className="split">
      <div className="wide">
        <section className="card stack" aria-labelledby="at-p3">
          <h2 id="at-p3" style={{ fontSize: 20 }}>¿Cómo llega el mueble al taller?</h2>
          <div className="opts" role="radiogroup" aria-label="Traslado">
            {([['delivery', 'Delivery (recojo y entrega)', 'Ida y vuelta, un solo costo: se calcula solo con la distancia', 'truck'], ['propio', 'Lo lleva y lo recoge el cliente', 'Sin costo de traslado', 'map-pin']] as const).map(([id, tt, sub, ic]) => (
              <button key={id} type="button" role="radio" aria-checked={traslado === id} className={traslado === id ? 'opt on' : 'opt'} onClick={() => setTraslado(id)}>
                <span className="ic"><Icon name={ic} /></span><span><b>{tt}</b><small>{sub}</small></span>
              </button>
            ))}
          </div>
          {traslado === 'propio' && (
            <Alert tone="info" title="El cliente lo trae y lo retira" compact>Después de aceptar la cotización se le da un turno libre para dejarlo en el taller, y otro para retirarlo cuando esté listo.</Alert>
          )}
          {traslado === 'delivery' && (
            <>
              {/* Como W2 y W3b: la dirección a la izquierda (con la ficha de la elegida) y el mapa a la derecha. */}
              <div className="at-tras">
                <div className="stack" style={{ gap: 12 }}>
                  <CampoDireccion valor={dir} onChange={setDir} guardadas={guardadas} etiqueta="Dirección de recojo y entrega" textoGuardar="Guardarla en la ficha del cliente" />
                  {(guardada || dir.texto.trim().length >= 5) && (
                    <dl className="at-dir" aria-label="Dirección elegida">
                      <div><dt><Icon name="map-pin" size={15} /> {guardada ? guardada.etiqueta ?? 'Dirección guardada' : 'Dirección nueva'}</dt><dd>{guardada ? guardada.direccion : dir.texto.trim()}</dd></div>
                      {(guardada?.referencia || (!guardada && dir.referencia.trim())) && <div><dt><Icon name="info" size={15} /> Referencia</dt><dd>{guardada ? guardada.referencia : dir.referencia.trim()}</dd></div>}
                      {guardada?.ciudad && <div><dt><Icon name="building" size={15} /> Ciudad</dt><dd>{guardada.ciudad}</dd></div>}
                      <div><dt><Icon name="truck" size={15} /> Traslado</dt><dd>Recojo y entrega en esta dirección</dd></div>
                    </dl>
                  )}
                </div>
                {/* Tocar el mapa llena la dirección (como dirección nueva), igual que en W2. */}
                <MapaUbicacion alto={280} ubicacion={mapa.ubicacion} etiqueta={mapa.etiqueta}
                  onElegir={(d) => setDir({ ...dir, guardadaId: null, texto: d.texto, ubicacion: d.ubicacion })} />
              </div>
              <div className="at-nota"><Icon name="calendar" size={18} /><span><b>El día del recojo se elige después del adelanto.</b> Si el cliente acepta y paga hoy, lo eligen juntos al final. Si paga después, lo elige desde su cuenta.</span></div>
            </>
          )}
          {error && <Alert tone="danger" title="No se guardó">{error}</Alert>}
        </section>
        <div className="between at-foot">
          <button type="button" className="gw-btn gw-btn-ghost" onClick={onAtras}>Atrás</button>
          <button type="button" className="gw-btn gw-btn-primary gw-btn-lg" disabled={ocupado || !lista} onClick={seguir}>{ocupado ? 'Guardando…' : SIGUIENTE[2]}</button>
        </div>
      </div>
      <aside className="aside">{aside}</aside>
    </div>
  );
}

// ---------------------------------------------------------------- Pasos 4 y 5 · Cotización (A4) y respuesta del cliente
function PasoCotizacionYRespuesta({ armado, at, codigo, paso, lugar, onPaso, onRecargar, onRespondido }: {
  armado: Armado; at: Atencion; codigo: string; paso: number; lugar: 'local' | 'domicilio';
  onPaso(n: number): void; onRecargar(): Promise<void>; onRespondido(): Promise<void>;
}) {
  const [cot, setCot] = useState<ArmadoEnVisita | null>(null);
  const [respuesta, setRespuesta] = useState<'acepta' | 'pensara' | 'rechaza'>('acepta');
  const [pagaAhora, setPagaAhora] = useState(true);
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo');
  const [motivo, setMotivo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<{ m: string; errores: string[] } | null>(null);
  const [resultado, setResultado] = useState<ResultadoRespuesta | null>(null);
  const sinAdelanto = (cot?.adelanto ?? 0) === 0;
  const pct = armado.condiciones.adelanto != null || !cot ? null : armado.condiciones.adelantoPct;

  const enviar = async () => {
    if (!cot) return;
    setEnviando(true); setError(null);
    try {
      const r = await atencionApi.responder(codigo, { cotizacion: cot.entrada, respuesta, pagaAhora: respuesta === 'acepta' ? pagaAhora : undefined, metodo: respuesta === 'acepta' && pagaAhora && !sinAdelanto ? metodo : undefined, motivo: respuesta === 'rechaza' ? motivo ?? undefined : undefined });
      setResultado(r);
      await onRespondido();
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('No pudimos registrar la respuesta.', 0);
      setError({ m: err.message, errores: Object.values(err.errores) });
    } finally { setEnviando(false); }
  };

  return (
    <>
      {/* La cotización queda montada en el paso 5: así no se pierde lo editado. */}
      <div hidden={paso !== 3}>
        <Armar armado={armado} onRecargar={() => { void onRecargar(); }} onResponder={() => undefined} enVisita={setCot} />
        <div className="between at-foot">
          <button type="button" className="gw-btn gw-btn-ghost" onClick={() => onPaso(2)}>Atrás</button>
          <button type="button" className="gw-btn gw-btn-primary gw-btn-lg" disabled={!cot?.lista} onClick={() => onPaso(4)}>{SIGUIENTE[3]}</button>
        </div>
        {!cot?.lista && <p className="audit" style={{ textAlign: 'right' }}>Complete la revisión de la cotización para mostrársela al cliente.</p>}
      </div>

      {paso === 4 && cot && (
        <div className="split">
          <div className="wide">
            <section className="card stack" aria-labelledby="at-p5">
              <h2 id="at-p5" style={{ fontSize: 20 }}>¿Qué decide el cliente?</h2>
              <div className="at-opts3" role="radiogroup" aria-label="Respuesta del cliente">
                {([['acepta', 'Acepta ahora', 'Se genera la orden; el adelanto lo paga ahora o después', 'check'], ['pensara', 'Lo pensará', `Se publica en su cuenta con vigencia de ${armado.condiciones.vigenciaDias} días`, 'clock'], ['rechaza', 'No acepta', 'Con motivo obligatorio', 'x']] as const).map(([id, tt, sub, ic]) => (
                  <button key={id} type="button" role="radio" aria-checked={respuesta === id} className={respuesta === id ? 'opt on' : 'opt'} onClick={() => setRespuesta(id)}>
                    <span className="ic"><Icon name={ic} /></span><span><b>{tt}</b><small>{sub}</small></span>
                  </button>
                ))}
              </div>

              {respuesta === 'acepta' && (
                <div className="at-paybox">
                  <div className="at-pay-hd">
                    <div><span className="ov">{TEXTOS[lugar].adelanto}{pct != null ? ` · ${pct} %` : ''}</span><b className="at-bigv">{dolares(cot.adelanto)}</b></div>
                    <div className="at-pay-tot"><span>Total <b>{dolares(cot.total)}</b></span><span>Saldo al entregar <b>{dolares(cot.total - cot.adelanto)}</b></span></div>
                  </div>
                  {sinAdelanto ? (
                    <div className="at-nota"><Icon name="info" size={18} /><span>Cliente con pedidos cerrados: <b>adelanto 0 %</b>. El pedido se genera ahora, sin cobrar nada.</span></div>
                  ) : (
                    <>
                      <span className="gw-field-label" id="at-cuando">¿Cuándo paga el adelanto?</span>
                      <div className="at-pay-op" role="radiogroup" aria-labelledby="at-cuando">
                        <button type="button" role="radio" aria-checked={pagaAhora} className={pagaAhora ? 'opt on' : 'opt'} onClick={() => setPagaAhora(true)}>
                          <span className="ic"><Icon name="payment" /></span><span><b>Paga ahora</b><small>Se genera el pedido{at.solicitud.traslado === 'delivery' ? ' y definen el recojo' : ''} en este momento</small></span>
                        </button>
                        <button type="button" role="radio" aria-checked={!pagaAhora} className={!pagaAhora ? 'opt on' : 'opt'} onClick={() => setPagaAhora(false)}>
                          <span className="ic"><Icon name="clock" /></span><span><b>Paga después</b><small>Lo paga luego desde su cuenta; el pedido se genera al confirmarse</small></span>
                        </button>
                      </div>
                      {pagaAhora ? (
                        <>
                          <span className="gw-field-label" id="at-medio">Medio de pago</span>
                          <div className="at-chips" role="radiogroup" aria-labelledby="at-medio">
                            {METODOS.map((x) => <button key={x.id} type="button" role="radio" aria-checked={metodo === x.id} className="at-chip" onClick={() => setMetodo(x.id)}>{x.l}</button>)}
                          </div>
                        </>
                      ) : (
                        <div className="at-nota"><Icon name="info" size={18} /><span>Cuando pague el adelanto <b>se genera su pedido</b>{at.solicitud.traslado === 'delivery' ? ' y elige desde su cuenta el día del recojo.' : '.'}</span></div>
                      )}
                    </>
                  )}
                  <button type="button" className="gw-btn gw-btn-primary at-pay-cta" disabled={enviando} onClick={enviar}>
                    {enviando ? 'Registrando…' : sinAdelanto ? 'Generar orden (adelanto 0 %)' : pagaAhora ? `Generar orden y cobrar ${dolares(cot.adelanto)} ${METODOS.find((x) => x.id === metodo)!.frase}` : 'Registrar la aceptación · paga después'}
                  </button>
                </div>
              )}
              {respuesta === 'pensara' && (
                <button type="button" className="gw-btn gw-btn-primary" style={{ alignSelf: 'flex-start' }} disabled={enviando} onClick={enviar}>{enviando ? 'Publicando…' : 'Publicar la cotización en su cuenta'}</button>
              )}
              {respuesta === 'rechaza' && (
                <>
                  <span className="gw-field-label" id="at-mot">Motivo (obligatorio)</span>
                  <div className="at-chips" role="radiogroup" aria-labelledby="at-mot">
                    {MOTIVOS.map((x) => <button key={x} type="button" role="radio" aria-checked={motivo === x} className="at-chip" onClick={() => setMotivo(x)}>{x}</button>)}
                  </div>
                  <button type="button" className="gw-btn gw-btn-danger" style={{ alignSelf: 'flex-start' }} disabled={!motivo || enviando} onClick={enviar}>{enviando ? 'Registrando…' : 'Registrar rechazo'}</button>
                </>
              )}
              {error && (
                <Alert tone="danger" title="No se registró">
                  {error.m}{error.errores.length > 1 && <ul className="co-errs">{error.errores.map((x) => <li key={x}>{x}</li>)}</ul>}
                </Alert>
              )}
              {resultado && <p className="muted" role="status">Registrado: {resultado.estado}.</p>}
            </section>
            <div className="between at-foot"><button type="button" className="gw-btn gw-btn-ghost" onClick={() => onPaso(3)}>Atrás</button></div>
          </div>
          <aside className="aside">
            <section className="card at-sum" aria-label="Lo que se lleva el cliente">
              <span className="ov">Lo que se lleva el cliente</span>
              <div className="kv"><span>{armado.muebles.length > 1 ? 'Muebles' : 'Mueble'}</span><b>{cot.descripcion}</b></div>
              <div className="kv"><span>Traslado</span><b>{at.solicitud.traslado === 'delivery' ? 'Delivery · recojo al generar el pedido' : 'Lo lleva el cliente'}</b></div>
              <hr className="stitch" />
              <div className="kv"><span>Total</span><b className="at-bigv">{dolares(cot.total)}</b></div>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Después de la respuesta: el resultado y el recojo
function Cierre({ at, lugar, onCambio }: { at: Atencion; lugar: 'local' | 'domicilio'; onCambio(a: Atencion): void }) {
  const c = at.cotizacion!;
  const p = at.pedido;
  const pideRecojo = Boolean(p) && at.solicitud.traslado === 'delivery' && !p!.recojo;
  const titulo = p ? `Pedido ${p.codigo} generado` : c.estado === 'Aceptada: pendiente de adelanto' ? `Cotización ${c.codigo} aceptada · adelanto pendiente` : c.estado === 'Rechazada' ? `Cotización ${c.codigo} rechazada` : `Cotización ${c.codigo} publicada en su cuenta`;
  const texto = p ? `Total ${dolares(c.total)}${c.adelanto > 0 ? ` · adelanto ${dolares(c.adelanto)} cobrado` : ' · sin adelanto'}. El cliente recibió por correo y en su cuenta la constancia de lo que aceptó.${pideRecojo ? ' Ahora definan juntos el recojo.' : ''}`
    : c.estado === 'Aceptada: pendiente de adelanto' ? `Cuando pague el adelanto de ${dolares(c.adelanto)} se genera su pedido${at.solicitud.traslado === 'delivery' ? ' y elige desde su cuenta el día del recojo' : ''}.`
      : c.estado === 'Rechazada' ? 'La solicitud se cerró como Rechazada. Se conserva para el historial.'
        : `Total ${dolares(c.total)}. Le llegó por correo y la puede aceptar o rechazar desde su cuenta mientras esté vigente.`;
  return (
    <div className="split">
      <div className="wide">
        <section className="card stack">
          <div className={c.estado === 'Rechazada' ? 'at-okbox at-okbox-n' : 'at-okbox'} role="status">
            <Icon name={c.estado === 'Rechazada' ? 'x' : 'check'} size={22} />
            <div><b>{titulo}</b><small>{texto}</small></div>
          </div>
          {pideRecojo && <RecojoConectado pedido={p!.codigo} enCasa={lugar === 'domicilio'} onListo={onCambio} />}
          {p?.recojo && (
            <div className="at-okbox" role="status">
              <Icon name="truck" size={22} />
              <div>
                <b>{p.recojo.tipo === 'en_visita' ? 'Mueble recogido en la visita' : 'Recojo agendado'}</b>
                <small>{p.recojo.tipo === 'en_visita'
                  ? `El pedido ${p.codigo} sigue «Esperando mueble» hasta que el taller lo recibe.`
                  : `Pasamos el ${minuscula(fechaLarga(deIso(p.recojo.fecha!)))} a las ${p.recojo.hora}. El cliente recibió la confirmación por correo y en su cuenta.`}</small>
              </div>
            </div>
          )}
          {!pideRecojo && (
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {p && <Link className="gw-btn gw-btn-primary" to="/admin/pedidos">Ver en el Planning</Link>}
              <Link className="gw-btn gw-btn-ghost" to="/admin/agenda">Volver a la agenda</Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** Último paso (decisiones L): agendar el recojo en una hora libre real, o llevárselo en la visita a domicilio. */
function RecojoConectado({ pedido, enCasa, onListo }: { pedido: string; enCasa: boolean; onListo(a: Atencion): void }) {
  const [disp, setDisp] = useState<Disponibilidad | null>(null);
  const [opcion, setOpcion] = useState<'agendar' | 'llevar'>('agendar');
  const [elegido, setElegido] = useState<HoraElegida | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cargar = useCallback(() => { atencionApi.disponibilidad().then(setDisp).catch((e) => setError(mensaje(e, 'No pudimos cargar la agenda del recojo.'))); }, []);
  useEffect(cargar, [cargar]);


  const confirmar = async (r: { tipo: 'agendado'; fecha: string; hora: string } | { tipo: 'en_visita' }) => {
    setOcupado(true); setError(null);
    try { onListo(await atencionApi.recojo(pedido, r)); } catch (e) { setError(mensaje(e, 'No pudimos guardar el recojo.')); cargar(); setElegido(null); } finally { setOcupado(false); }
  };

  return (
    <section className="card stack at-rk" aria-labelledby="at-rk">
      <div>
        <span className="ov">Último paso · con el cliente</span>
        <h3 id="at-rk" style={{ fontSize: 18, margin: '2px 0 0' }}>¿Cuándo recogemos el mueble?</h3>
        <span className="muted" style={{ fontSize: 13 }}>Eligió delivery y el pedido ya está generado: falta el recojo. La entrega se agenda cuando el pedido esté terminado.</span>
      </div>
      {enCasa && (
        <div className="opts" role="radiogroup" aria-label="Cómo se hace el recojo">
          {([['agendar', 'Agendar el recojo', 'Elegir juntos el día y la hora en que pasa el camión', 'calendar'], ['llevar', 'Me lo llevo ahora', 'Cabe en el vehículo: se registra el recojo en esta visita', 'truck']] as const).map(([id, tt, sub, ic]) => (
            <button key={id} type="button" role="radio" aria-checked={opcion === id} className={opcion === id ? 'opt on' : 'opt'} onClick={() => setOpcion(id)}>
              <span className="ic"><Icon name={ic} /></span><span><b>{tt}</b><small>{sub}</small></span>
            </button>
          ))}
        </div>
      )}
      {error && <Alert tone="danger" title="No se guardó">{error}</Alert>}
      {opcion === 'llevar' && enCasa ? (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="gw-btn gw-btn-primary" disabled={ocupado} onClick={() => confirmar({ tipo: 'en_visita' })}>{ocupado ? 'Registrando…' : 'Registrar recojo y llevármelo'}</button>
          <span className="muted" style={{ fontSize: 12.5, flex: '1 1 280px' }}>Queda como recojo hecho, sin agendar camión; el transporte cotizado no cambia. Las piezas y las fotos de llegada se registran al recibirlo en el taller.</span>
        </div>
      ) : !disp ? <p className="muted" role="status">Cargando la agenda del recojo…</p> : (
        <div className="at-rkg">
          <GrillaRecojo disp={disp} elegido={elegido} onElegir={setElegido} />
          <div className="stack" style={{ gap: 12 }}>
            <div className="at-vsel">
              <span><small>{elegido ? MESES[deIso(elegido.fecha).getMonth()]!.slice(0, 3) : '—'}</small>{elegido ? deIso(elegido.fecha).getDate() : '?'}</span>
              <div><b>{elegido ? fechaLarga(deIso(elegido.fecha)) : 'Elija un día y una hora'}</b><em>{elegido ? `Recojo · de ${elegido.hora} a ${elegido.fin}` : 'En la agenda de la izquierda'}</em></div>
            </div>
            <span className="muted" style={{ fontSize: 12.5, lineHeight: 1.45 }}>Muéstrele al cliente las horas libres y elija con él. Le llega la confirmación por correo y la ve en su cuenta.</span>
            <button type="button" className="gw-btn gw-btn-primary gw-btn-block" disabled={!elegido || ocupado} onClick={() => elegido && confirmar({ tipo: 'agendado', fecha: elegido.fecha, hora: elegido.hora })}>{ocupado ? 'Guardando…' : 'Confirmar día del recojo'}</button>
          </div>
        </div>
      )}
    </section>
  );
}

export function SinSolicitud() {
  return <EmptyState icon="calendar" title="Elija la cita o la visita que va a atender">Se abre desde la Agenda con «Ir a la cita» o «Ir a la visita».</EmptyState>;
}
