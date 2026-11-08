import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { TopAdmin } from '../../../app/layout/AdminLayout';
import { ApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { Icon } from '../../../shared/ui/Icon';
import { StatusChip } from '../../../shared/ui/StatusChip';
import { TextField } from '../../../shared/ui/TextField';
import { Toast } from '../../../shared/ui/Toast';
import { adminSolicitudesApi, type FichaAdmin } from '../bandeja/adminApi';
import { citasApi } from '../cita/citasApi';
import { DIAS, MESES } from '../fechas';
import { agendaApi, type CitaAgenda, type Semana } from './agendaApi';
import './agenda.css';

// ---------------------------------------------------------------- utilidades de fecha y hora
const fechaDe = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y!, m! - 1, d!); };
const isoDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const masDias = (iso: string, n: number) => { const d = fechaDe(iso); d.setDate(d.getDate() + n); return isoDe(d); };
const minutos = (h: string) => +h.slice(0, 2) * 60 + +h.slice(3, 5);
const sumar = (h: string, n: number) => { const t = minutos(h) + n; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const corto = (iso: string) => { const d = fechaDe(iso); return { w: DIAS[d.getDay()]!.slice(0, 3), n: d.getDate() }; };
const largo = (iso: string) => { const d = fechaDe(iso); return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`; };
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const iniciales = (n: string) => n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const telefono = (t: string) => t.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3');
const citasTexto = (n: number) => (n === 1 ? '1 cita' : `${n} citas`);
const CANAL: Record<string, string> = { web: 'Web', telefono: 'Teléfono', local: 'En persona', correo: 'Correo', mensaje: 'Mensaje de texto' };
const TELA: Record<string, string> = { trae: 'La trae el cliente', catalogo: 'Catálogo en línea', local: 'Ver en el local', domicilio: 'Visita a domicilio', sin: 'No lleva tela' };
const FILTROS = ['Todas', 'Visitas al local', 'Retiros'] as const;

/** Lo que se está agendando: una solicitud en espera (A2c/A2d/A2e) o una cita que se mueve (A2g / tras una falta, A2f). */
interface Agendando {
  codigo: string; nombre: string; telefono: string; email: string | null; mueble: string; servicio: string; tela: string;
  busca: string | null; fotos: number; contacto: string; estado: string; casa: boolean; nueva: boolean;
  /** Cita programada que se mueve a otro turno. */
  mover?: CitaAgenda;
  /** Viene de una inasistencia: se agenda una cita nueva para la misma solicitud. */
  desdeFalta?: CitaAgenda;
  ultima: boolean;
  direccion: string;
}

const desdeFicha = (f: FichaAdmin, nueva: boolean): Agendando => ({
  codigo: f.codigo, nombre: f.cliente.nombre, telefono: f.cliente.telefono, email: f.cliente.email,
  mueble: f.muebles.map((m) => `${m.cantidad > 1 ? `${m.cantidad} × ` : ''}${m.tipo}`).join(', '), servicio: f.muebles[0]?.servicioNombre ?? '',
  tela: TELA[f.tela] ?? f.tela, busca: f.telaDescripcion, fotos: f.muebles.reduce((t, m) => t + m.archivos.length, 0),
  contacto: nueva ? `${CANAL[f.canal] ?? f.canal} · registrada hace un momento` : CANAL[f.canal] ?? f.canal, estado: f.tela === 'domicilio' ? 'En espera de visita' : f.estado,
  casa: f.tela === 'domicilio', nueva, ultima: false, direccion: f.direccion ?? '',
});

const desdeCita = (c: CitaAgenda, max: number, tipo: 'mover' | 'falta'): Agendando => ({
  codigo: c.solicitud.codigo, nombre: c.solicitud.cliente, telefono: c.solicitud.telefono, email: c.solicitud.email, mueble: c.solicitud.mueble,
  servicio: c.solicitud.servicio, tela: c.solicitud.tela, busca: c.solicitud.telaDescripcion, fotos: c.solicitud.fotos,
  contacto: tipo === 'falta' ? (c.tipo === 'local' ? 'No asistió · se reprograma con el cliente' : 'No lo encontramos · se reprograma con el cliente') : 'Ya tiene cita',
  estado: tipo === 'falta' ? 'No asistió' : c.tipo === 'local' ? 'Cita programada' : 'Visita programada',
  casa: c.tipo === 'domicilio', nueva: false, ...(tipo === 'mover' ? { mover: c } : { desdeFalta: c }),
  ultima: tipo === 'falta' ? c.solicitud.inasistencias >= max : c.reprogramaciones >= max, direccion: c.direccion ?? '',
});

/** A2 Agenda de citas (CU-C03, C04): semana y día, agendar desde una solicitud, reprogramar, inasistencias y bloqueos. */
export function AgendaPage() {
  const [params, setParams] = useSearchParams();
  const codigoAgendar = params.get('agendar');
  const [desde, setDesde] = useState<string | undefined>(params.get('fecha') ?? undefined);
  const [sem, setSem] = useState<Semana | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [vista, setVista] = useState<'semana' | 'dia'>('semana');
  const [dia, setDia] = useState(0);
  const [filtro, setFiltro] = useState(0);
  const [sel, setSel] = useState<number | null>(params.get('cita') ? Number(params.get('cita')) : null);
  const [ag, setAg] = useState<Agendando | null>(null);
  const [bk, setBk] = useState<{ fecha: string; hora: string } | null>(null);
  const [cfg, setCfg] = useState(false);
  const [blk, setBlk] = useState(false);
  const [bsel, setBsel] = useState<string[]>([]);
  const [blkOk, setBlkOk] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ titulo: string; texto: string } | null>(null);
  const [falla, setFalla] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const recargar = useCallback(() => setIntento((x) => x + 1), []);
  useEffect(() => {
    let vigente = true;
    setError(null);
    agendaApi.semana(desde)
      .then((s) => {
        if (!vigente) return;
        setSem(s);
        const i = s.dias.findIndex((d) => d.fecha === s.hoy);
        setDia((x) => (i >= 0 && !desde ? i : Math.min(x, 5)));
      })
      .catch((e) => vigente && setError(e instanceof ApiError ? e.message : 'No pudimos cargar la agenda.'));
    return () => { vigente = false; };
  }, [desde, intento]);

  // A2c / A2d / A2e: viene de Solicitudes con una solicitud que espera su turno.
  useEffect(() => {
    if (!codigoAgendar) return;
    let vigente = true;
    adminSolicitudesApi.ficha(codigoAgendar)
      .then((f) => {
        if (!vigente) return;
        if (f.cita?.estado === 'Programada') {
          setFalla(`La solicitud ${f.codigo} ya tiene un turno programado. Selecciónelo en el calendario para reprogramarlo.`);
          setParams({}, { replace: true });
          return;
        }
        setAg(desdeFicha(f, params.get('nueva') === '1'));
        setBk(null);
        setCfg(false);
        setBlk(false);
      })
      .catch((e) => vigente && setFalla(e instanceof ApiError ? e.message : 'No pudimos abrir la solicitud.'));
    return () => { vigente = false; };
  }, [codigoAgendar]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- lo que hay en cada turno
  const datos = useMemo(() => {
    if (!sem) return null;
    const porTurno = new Map<string, { c: CitaAgenda; cont: boolean }>();
    const poner = (k: string, v: { c: CitaAgenda; cont: boolean }) => {
      const ya = porTurno.get(k);
      if (!ya || ya.c.estado !== 'Programada') porTurno.set(k, v);
    };
    for (const c of sem.citas) {
      if (!c.hora) continue;
      poner(`${c.fecha}|${c.hora}`, { c, cont: false });
      if (c.tipo === 'domicilio') for (let m = sem.duracionMin; m < c.duracionMin; m += sem.duracionMin) poner(`${c.fecha}|${sumar(c.hora, m)}`, { c, cont: true });
    }
    const sinHora = sem.citas.filter((c) => !c.hora);
    return { porTurno, sinHora };
  }, [sem]);

  if (error) return <Alert tone="danger" title="No pudimos cargar la agenda">{error} <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" onClick={recargar}>Reintentar</button></Alert>;
  if (!sem || !datos) return <p className="muted" role="status">Cargando la agenda…</p>;

  const { porTurno, sinHora } = datos;
  const cerradoDe = (fecha: string) => sem.dias.find((d) => d.fecha === fecha)?.cerrado ?? null;
  const bloqueo = (fecha: string, hora: string) => sem.bloqueos.find((b) => b.fecha === fecha && hora >= b.horaInicio && hora < b.horaFin);
  const pasado = (fecha: string, hora: string) => fecha < sem.hoy || (fecha === sem.hoy && hora <= sem.ahora);
  const libre = (fecha: string, hora: string) => sem.turnos.includes(hora) && !porTurno.has(`${fecha}|${hora}`) && !bloqueo(fecha, hora) && !cerradoDe(fecha) && !pasado(fecha, hora);
  const nTurnosVisita = Math.max(1, Math.ceil(sem.visitaDuracionMin / sem.duracionMin));
  const horasDe = (hora: string, casa: boolean) => Array.from({ length: casa ? nTurnosVisita : 1 }, (_, k) => sumar(hora, k * sem.duracionMin));
  const cabe = (fecha: string, hora: string, casa: boolean) => horasDe(hora, casa).every((h) => libre(fecha, h));
  const atenuada = (_c: CitaAgenda) => filtro === 2;
  const almuerzo = sem.turnos.findIndex((h, i) => i > 0 && minutos(h) - minutos(sem.turnos[i - 1]!) > sem.duracionMin);
  const textoAlmuerzo = `${sem.horario.manana.split('-')[1]} – ${sem.horario.tarde.split('-')[0]} · almuerzo, sin atención`;

  const visibles = sem.citas;
  const porDia = sem.dias.map((d) => visibles.filter((c) => c.fecha === d.fecha).length);
  const hoyIdx = sem.dias.findIndex((d) => d.fecha === sem.hoy);
  const proxima = sem.citas.filter((c) => c.fecha === sem.hoy && c.estado === 'Programada' && c.hora && c.hora > sem.ahora).sort((a, b) => a.hora!.localeCompare(b.hora!))[0];
  const s = sem.citas.find((c) => c.id === sel) ?? null;

  const elegirCita = (c: CitaAgenda) => { setSel(c.id); setAviso(null); setFalla(null); };
  const salirDeAgendar = () => { setAg(null); setBk(null); setFalla(null); if (params.has('agendar')) setParams({}, { replace: true }); };

  // ---------------------------------------------------------------- acciones
  const hacer = async (accion: () => Promise<void>) => {
    setOcupado(true);
    setFalla(null);
    try {
      await accion();
    } catch (e) {
      setFalla(e instanceof ApiError ? e.message : 'No se pudo completar. Intente de nuevo.');
      if (e instanceof ApiError && e.status === 409) recargar();
    } finally {
      setOcupado(false);
    }
  };

  const confirmar = () => hacer(async () => {
    if (!ag || !bk) return;
    if (ag.casa && !ag.mover && ag.direccion.trim().length < 5) throw new ApiError('Escriba la dirección donde se hace la visita.', 400);
    const cita = ag.mover
      ? await citasApi.reprogramar(ag.mover.id, bk)
      : await citasApi.agendar({ solicitud: ag.codigo, tipo: ag.casa ? 'domicilio' : 'local', ...bk, direccion: ag.casa ? { tipo: 'nueva', texto: ag.direccion.trim(), guardar: false } : undefined });
    setAviso({
      titulo: ag.mover ? (ag.casa ? 'Visita reprogramada' : 'Cita reprogramada') : ag.casa ? 'Visita confirmada' : 'Cita confirmada',
      texto: `Le avisamos al cliente por correo y en su cuenta. La solicitud ${ag.codigo} pasa a «${ag.casa ? 'Visita programada' : 'Cita programada'}».`,
    });
    salirDeAgendar();
    setSel(cita.id);
    recargar();
  });

  const noAsistio = (c: CitaAgenda) => hacer(async () => {
    await adminSolicitudesApi.resultadoCita(c.id, 'no_asistio');
    setAviso(null);
    recargar();
  });

  const vencer = (c: CitaAgenda) => hacer(async () => {
    await agendaApi.vencer(c.solicitud.codigo);
    setAviso({ titulo: 'Solicitud vencida', texto: `Se le avisó a ${c.solicitud.cliente}. Si más adelante quiere el servicio, envía una nueva solicitud.` });
    recargar();
  });

  const guardarBloqueo = () => hacer(async () => {
    const r = await agendaApi.bloquear(bsel.map((k) => { const [fecha, hora] = k.split('|'); return { fecha: fecha!, hora: hora! }; }));
    setBlk(false);
    setBsel([]);
    setCfg(true);
    setBlkOk(`${r.bloqueados} ${r.bloqueados === 1 ? 'bloque bloqueado' : 'bloques bloqueados'}. Los clientes ya no los ven.`);
    recargar();
  });

  const moverSemana = (n: number) => { setDesde(masDias(sem.desde, n * 7)); setBk(null); };

  // ---------------------------------------------------------------- celdas
  const celda = (fecha: string, hora: string, enDia: boolean) => {
    const k = `${fecha}|${hora}`;
    const x = porTurno.get(k);
    if (x) {
      const c = x.c;
      const clase = c.estado === 'Atendida' ? 'ag-done' : c.estado === 'No asistió' ? 'ag-miss' : 'ag-appt';
      const detalle = x.cont ? `${c.solicitud.mueble} · continúa (1 hora)` : `${c.solicitud.mueble}${c.tipo === 'domicilio' ? ' · visita a domicilio' : ' · ver telas en el local'}`;
      return (
        <button type="button" className={`ag-ap ${clase}${c.tipo === 'domicilio' ? ' ag-home' : ''}${sel === c.id ? ' ag-sel' : ''}${atenuada(c) ? ' ag-dim' : ''}`}
          aria-pressed={sel === c.id} aria-label={`${c.solicitud.cliente}, ${largo(fecha)} a las ${hora}, ${c.estado}`} onClick={() => elegirCita(c)}>
          {enDia
            ? <><div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}><b>{c.solicitud.cliente}</b><span>{detalle}</span></div><StatusChip status={c.estado} /></>
            : <><b>{c.solicitud.cliente}</b><span>{x.cont ? 'continúa' : c.solicitud.mueble}</span></>}
        </button>
      );
    }
    const cierre = cerradoDe(fecha);
    if (cierre) return <div className="ag-off"><Icon name="lock" size={14} />{enDia ? `Cerrado · ${cierre}` : cierre}</div>;
    const b = bloqueo(fecha, hora);
    if (b) return <div className="ag-off"><Icon name="lock" size={14} /><span>{enDia ? `Bloqueado · ${b.motivo}` : b.motivo}</span></div>;
    if (pasado(fecha, hora)) return <div className="ag-past" title="Turno pasado" />;
    const { w, n } = corto(fecha);
    if (blk) {
      const on = bsel.includes(k);
      return (
        <button type="button" className={`ag-free ${on ? 'ag-blk' : 'ag-bhl'}`} aria-pressed={on} aria-label={`Bloquear ${w} ${n} a las ${hora}`}
          onClick={() => setBsel((x) => (on ? x.filter((y) => y !== k) : [...x, k]))}>
          {enDia ? (on ? 'Se bloqueará ✓' : 'Libre · elegir para bloquear') : on ? 'Bloquear ✓' : 'Elegir'}
        </button>
      );
    }
    if (!ag) return <span className="ag-free0" />;
    // El segundo turno de una visita elegida se marca como parte de ella.
    if (bk?.fecha === fecha && bk.hora !== hora && horasDe(bk.hora, ag.casa).includes(hora)) {
      return <button type="button" className="ag-free ag-pk" aria-pressed="true" aria-label={`${w} ${n} a las ${hora}, parte de la visita elegida`} onClick={() => setBk({ fecha, hora: bk.hora })}>{enDia ? 'Elegido · continúa' : 'Elegido'}</button>;
    }
    if (!cabe(fecha, hora, ag.casa)) {
      return <button type="button" className="ag-free ag-no" disabled title={`La visita necesita ${sem.visitaDuracionMin} minutos seguidos`}>{enDia ? `No alcanza ${sem.visitaDuracionMin / 60 === 1 ? '1 hora' : `${sem.visitaDuracionMin} min`}` : ''}</button>;
    }
    const on = bk?.fecha === fecha && horasDe(bk.hora, ag.casa).includes(hora);
    return (
      <button type="button" className={`ag-free ${on ? 'ag-pk' : 'ag-hl'}`} aria-pressed={on} aria-label={`Elegir ${w} ${n} a las ${hora}`}
        onClick={() => { setBk({ fecha, hora }); setFalla(null); }}>
        {enDia ? (on ? 'Elegido' : 'Disponible · elegir') : on ? 'Elegido' : 'Elegir'}
      </button>
    );
  };

  const ahoraEn = (fecha: string, hora: string) => fecha === sem.hoy && sem.ahora >= hora && sem.ahora < sumar(hora, sem.duracionMin)
    ? (minutos(sem.ahora) - minutos(hora)) / sem.duracionMin : null;

  const fila = (hora: string, i: number) => (
    <div key={hora} style={{ display: 'contents' }}>
      {i === almuerzo && <div className="ag-lunch">{textoAlmuerzo}</div>}
      <span className="ag-t">{hora}</span>
      {sem.dias.map((d) => {
        const ahora = ahoraEn(d.fecha, hora);
        return (
          <div key={d.fecha} className={d.fecha === sem.hoy ? 'ag-cell ag-td' : 'ag-cell'}>
            {celda(d.fecha, hora, false)}
            {ahora != null && <span className="ag-now" style={{ top: `${ahora * 100}%` }} data-hora={sem.ahora} title={`Ahora · ${sem.ahora}`} />}
          </div>
        );
      })}
    </div>
  );

  const diaSel = sem.dias[dia]!;
  const visitasSinHora = (fecha?: string) => sinHora.filter((c) => !fecha || c.fecha === fecha);
  const chipVisita = (c: CitaAgenda) => (
    <button key={c.id} type="button" className={`ag-vsh${sel === c.id ? ' ag-sel' : ''}`} onClick={() => elegirCita(c)}>
      <Icon name="map-pin" size={14} /><b>{c.solicitud.cliente}</b><span>{corto(c.fecha).w} {corto(c.fecha).n} · {c.franja === 'manana' ? 'mañana' : 'tarde'} · {c.estado}</span>
    </button>
  );

  const W = ag?.casa ? 'visita' : 'cita';
  const max = sem.maxInasistencias;
  const tituloSemana = `Semana del ${corto(sem.desde).n}${fechaDe(sem.desde).getMonth() !== fechaDe(sem.hasta).getMonth() ? ` de ${MESES[fechaDe(sem.desde).getMonth()]}` : ''} al ${corto(sem.hasta).n} de ${MESES[fechaDe(sem.hasta).getMonth()]}`;

  return (
    <>
      <TopAdmin
        crumb="Comercial › Agenda"
        titulo="Agenda de citas"
        debajo={<p className="muted ag-sub">{capital(largo(sem.hoy))} · {sem.ahora}{hoyIdx >= 0 && <> · <b>{citasTexto(porDia[hoyIdx]!)} hoy{proxima ? ` · próxima a las ${proxima.hora}` : ''}</b></>}</p>}
      >
        <div className="ag-tools">
          <div className="ag-wk">
            <button type="button" aria-label="Semana anterior" onClick={() => moverSemana(-1)}>‹</button>
            <button type="button" className="ag-today-btn" onClick={() => { setDesde(undefined); setVista('semana'); }}>Hoy</button>
            <button type="button" aria-label="Semana siguiente" onClick={() => moverSemana(1)}>›</button>
          </div>
          <div className="ag-seg" role="group" aria-label="Vista">
            <button type="button" aria-pressed={vista === 'semana'} onClick={() => setVista('semana')}>Semana</button>
            <button type="button" aria-pressed={vista === 'dia'} onClick={() => setVista('dia')}>Día</button>
          </div>
          <button type="button" className={cfg ? 'gw-btn gw-btn-primary' : 'gw-btn gw-btn-secondary'} aria-pressed={cfg} onClick={() => { setCfg((v) => !v); setBlk(false); setBsel([]); }}>
            Configurar agenda
          </button>
        </div>
      </TopAdmin>

      {ag && !blk && (
        <div className="ag-bar" role="status">
          <span className="ag-bari"><Icon name="calendar" size={20} /></span>
          <div>
            <b>{ag.mover ? `Reprogramando la ${W} de ${ag.nombre}` : `Agendando ${ag.casa ? 'visita a domicilio' : 'cita en el local'} para ${ag.nombre}`}</b>
            <small>{ag.nueva ? `Solicitud ${ag.codigo} registrada · ${ag.mueble} · toque el turno que acordó con el cliente` : `${ag.codigo} · ${ag.mueble} · toque un turno libre del calendario`}{ag.casa ? ' (la visita ocupa 1 hora)' : ''}</small>
          </div>
          {ag.mover || ag.desdeFalta
            ? <button type="button" className="gw-btn gw-btn-sm" onClick={salirDeAgendar}>Cancelar</button>
            : <Link className="gw-btn gw-btn-sm" to="/admin/solicitudes" onClick={salirDeAgendar}>{ag.nueva ? 'Agendar después' : 'Cancelar y volver a Solicitudes'}</Link>}
        </div>
      )}
      {blk && (
        <div className="ag-bar ag-gray" role="status">
          <span className="ag-bari"><Icon name="lock" size={20} /></span>
          <div><b>Bloqueando horarios</b><small>Toque los bloques libres que quiere bloquear; puede elegir varios, en distintos días.</small></div>
          <button type="button" className="gw-btn gw-btn-sm" onClick={() => { setBlk(false); setBsel([]); setCfg(true); }}>Cancelar</button>
        </div>
      )}

      <div className="split">
        <div className="wide">
          <section className="ag-calcard" aria-labelledby="ag-titulo">
            <div className="ag-calhd">
              <b id="ag-titulo">{vista === 'semana' ? tituloSemana : `${capital(largo(diaSel.fecha))}${diaSel.fecha === sem.hoy ? ' · hoy' : ''}`}</b>
              <div className="ag-fchips" role="group" aria-label="Filtrar">
                {FILTROS.map((f, i) => (
                  <button key={f} type="button" className="ag-fchip" aria-pressed={filtro === i} onClick={() => setFiltro(i)}>
                    {f}<em>{i === 2 ? 0 : visibles.length}</em>
                  </button>
                ))}
              </div>
            </div>
            {visitasSinHora(vista === 'dia' ? diaSel.fecha : undefined).length > 0 && (
              <div className="ag-vshs"><span className="ov">Visitas a domicilio por franja (las eligió el cliente)</span>{visitasSinHora(vista === 'dia' ? diaSel.fecha : undefined).map(chipVisita)}</div>
            )}
            {vista === 'semana' ? (
              <div className="ag-scroll">
                <div className="ag-cal">
                  <span className="ag-corner" />
                  {sem.dias.map((d, i) => (
                    <button key={d.fecha} type="button" className={d.fecha === sem.hoy ? 'ag-h ag-today' : 'ag-h'} aria-label={`Ver el día ${corto(d.fecha).w} ${corto(d.fecha).n}`} onClick={() => { setDia(i); setVista('dia'); }}>
                      <small>{corto(d.fecha).w}</small><b>{corto(d.fecha).n}</b><em>{d.cerrado ? 'cerrado' : citasTexto(porDia[i]!)}</em>
                    </button>
                  ))}
                  {sem.turnos.map(fila)}
                </div>
              </div>
            ) : (
              <div className="ag-day">
                <div className="ag-daynav">
                  {sem.dias.map((d, i) => <button key={d.fecha} type="button" className="ag-fchip" aria-pressed={dia === i} onClick={() => setDia(i)}>{corto(d.fecha).w} {corto(d.fecha).n}</button>)}
                </div>
                {sem.turnos.map((hora, i) => (
                  <div key={hora} style={{ display: 'contents' }}>
                    {i === almuerzo && <div className="ag-lunch">{textoAlmuerzo}</div>}
                    <div className="ag-drow"><span className="ag-t">{hora}</span>{celda(diaSel.fecha, hora, true)}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="ag-lgf">
              <span><i style={{ background: 'var(--primary)' }} />Programada</span>
              <span><i style={{ background: 'var(--success-500)' }} />Atendida</span>
              <span><i style={{ background: 'var(--error-500)' }} />No asistió</span>
              <span><i style={{ background: '#7C3AED' }} />Visita a domicilio</span>
              <span><i style={{ background: 'var(--warning-500)' }} />Retiro en taller</span>
              <span><i style={{ background: 'repeating-linear-gradient(135deg,var(--line-strong) 0 2px,transparent 2px 4px)' }} />Bloqueado</span>
              <span>Las citas se agendan desde la solicitud (Solicitudes › Agendar cita); aquí se elige el turno</span>
            </div>
          </section>
        </div>

        <aside className="aside">
          {cfg && !blk && (
            <section className="ag-det" style={{ border: '2px solid var(--primary)' }} aria-label="Configurar la agenda">
              <div className="between"><span className="ov">Configurar la agenda</span><button type="button" className="gw-btn gw-btn-sm gw-btn-ghost" onClick={() => setCfg(false)}>Cerrar</button></div>
              <b style={{ fontSize: 15 }}>Horario de atención</b>
              <div className="ag-hrs">
                {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
                  <div key={d} className="ag-hr"><b>{d}</b>
                    {d === 'Dom'
                      ? <><span className="ag-closed">Cerrado</span><span className="ag-closed">Cerrado</span></>
                      : <><span>{sem.horario.manana.replace('-', '–')}</span><span>{sem.horario.tarde.replace('-', '–')}</span></>}
                  </div>
                ))}
              </div>
              <p className="audit">Turnos de {sem.duracionMin} min (parámetro, en <Link to="/admin/parametros">Parámetros</Link>). Un turno = un cliente. El cliente solo ve los turnos libres.</p>
              <hr className="stitch" />
              <div className="between"><b style={{ fontSize: 15 }}>Bloqueos</b><button type="button" className="gw-btn gw-btn-sm gw-btn-secondary" onClick={() => { setBlk(true); setBsel([]); setCfg(false); setBlkOk(null); salirDeAgendar(); }}>+ Bloquear horario</button></div>
              {blkOk && <Alert tone="success" title="Bloqueo guardado" compact>{blkOk}</Alert>}
              {sem.proximosBloqueos.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No hay bloqueos próximos.</p>}
              {sem.proximosBloqueos.slice(0, 12).map((b) => (
                <div key={b.id} className="ag-blk"><Icon name="lock" size={16} />
                  <div><b>{corto(b.fecha).w} {corto(b.fecha).n} {MESES[fechaDe(b.fecha).getMonth()]!.slice(0, 3)} · {b.horaInicio ? `${b.horaInicio}–${b.horaFin}` : 'todo el día'}</b><small>{b.motivo}</small></div>
                </div>
              ))}
            </section>
          )}

          {blk && (
            <section className="ag-det" style={{ border: '2px solid #334155' }} aria-label="Bloquear horario">
              <span className="ov">Bloquear horario</span>
              {bsel.length === 0
                ? <Alert tone="info" title="Elija los bloques en el calendario" compact>Solo se pueden bloquear turnos libres. Si un turno ya tiene cita, primero reprográmela.</Alert>
                : <><span className="gw-field-label">{bsel.length} {bsel.length === 1 ? 'bloque elegido' : 'bloques elegidos'}</span>
                  <div className="ag-bsel">{[...bsel].sort().map((k) => { const [f, h] = k.split('|'); return <span key={k}>{corto(f!).w} {corto(f!).n} · {h}</span>; })}</div></>}
              {falla && <Alert tone="danger" title="No se pudo bloquear" compact>{falla}</Alert>}
              <button type="button" className="gw-btn gw-btn-primary gw-btn-block" disabled={!bsel.length || ocupado} onClick={guardarBloqueo}>
                {bsel.length ? `Bloquear ${bsel.length} ${bsel.length === 1 ? 'bloque' : 'bloques'}` : 'Elija al menos un bloque'}
              </button>
              <p className="audit" style={{ margin: 0 }}>El cliente deja de ver estos turnos en la web. Queda registrado quién bloqueó y cuándo.</p>
            </section>
          )}

          {ag && !blk && (
            <section className="ag-det" style={{ border: '2px solid var(--primary)' }} aria-label={ag.mover ? 'Reprogramar' : `Agendar ${W}`}>
              <div className="between"><span className="ov">{ag.mover ? 'Reprogramar' : `Agendar ${W}`}</span><StatusChip status={ag.estado} tone="info" /></div>
              <div className="ag-who"><span className="ag-av" aria-hidden="true">{iniciales(ag.nombre)}</span><div><h2>{ag.nombre}</h2><small>{[telefono(ag.telefono), ag.email].filter(Boolean).join(' · ')}</small></div></div>
              <span className="ov" style={{ marginTop: 4 }}>Solicitud vinculada</span>
              <dl className="ag-facts">
                <div><span className="ag-ic"><Icon name="inbox" size={16} /></span><dt>Solicitud</dt><dd>{ag.codigo}</dd></div>
                <div><span className="ag-ic"><Icon name="sofa" size={16} /></span><dt>Mueble</dt><dd>{ag.mueble}</dd></div>
                <div><span className="ag-ic"><Icon name="scissors" size={16} /></span><dt>Servicio</dt><dd>{ag.servicio}</dd></div>
                <div><span className="ag-ic"><Icon name="image" size={16} /></span><dt>Tela</dt><dd>{ag.tela}</dd></div>
                <div><span className="ag-ic"><Icon name="image" size={16} /></span><dt>Fotos</dt><dd>{ag.fotos ? `${ag.fotos} ${ag.fotos === 1 ? 'foto' : 'fotos'}` : 'Pedidas por enlace'}</dd></div>
                <div><span className="ag-ic"><Icon name="user" size={16} /></span><dt>Contacto</dt><dd>{ag.contacto}</dd></div>
                {ag.mover?.hora && <div><span className="ag-ic"><Icon name="clock" size={16} /></span><dt>Turno actual</dt><dd>{capital(largo(ag.mover.fecha))} · {ag.mover.hora}</dd></div>}
                {ag.casa && ag.mover && <div><span className="ag-ic"><Icon name="map-pin" size={16} /></span><dt>Dirección</dt><dd>{ag.mover.direccion}</dd></div>}
              </dl>
              {ag.busca && <p className="ag-busca"><b>Tela que busca:</b> «{ag.busca}»</p>}
              {ag.casa && !ag.mover && (
                <TextField label="Dirección de la visita" value={ag.direccion} maxLength={200} placeholder="Ej.: 22 Orchard Rd, Bloomfield, NJ"
                  onChange={(x) => setAg({ ...ag, direccion: x.target.value })} hint="Donde se llevan los libros de telas y se mide." />
              )}
              <Link className="gw-btn gw-btn-ghost gw-btn-sm" style={{ alignSelf: 'flex-start' }} to={`/admin/solicitudes?ver=${ag.codigo}`}>Ver la solicitud completa</Link>
              {bk
                ? <div className="ag-bkslot"><Icon name="calendar" size={22} /><div><b>{capital(largo(bk.fecha))} · {bk.hora}</b><small>{ag.casa ? `Visita: ${sem.visitaDuracionMin} min (${nTurnosVisita} turnos)` : `Turno de ${sem.duracionMin} min`}</small></div></div>
                : <Alert tone="info" title="Elija un turno libre en el calendario" compact>{ag.casa ? 'Los turnos marcados tienen 1 hora libre seguida. La visita es sin costo para el cliente.' : `Los turnos marcados están libres. Un turno = ${sem.duracionMin} minutos, un cliente.`}</Alert>}
              {ag.ultima && <Alert tone="warning" title="Es su última reprogramación" compact>Si vuelve a faltar, la solicitud vence.</Alert>}
              {falla && <Alert tone="danger" title="No se pudo confirmar" compact>{falla}</Alert>}
              <button type="button" className="gw-btn gw-btn-primary gw-btn-block" disabled={!bk || ocupado} onClick={confirmar}>
                {!bk ? 'Elija un turno' : `${ag.mover ? 'Confirmar nuevo turno' : ag.casa ? 'Confirmar visita' : 'Confirmar cita'} · ${corto(bk.fecha).w} ${corto(bk.fecha).n}, ${bk.hora}`}
              </button>
              <p className="audit" style={{ margin: 0 }}>
                {ag.desdeFalta ? 'El turno en que faltó queda en el historial como «No asistió». Cuenta como su reprogramación.'
                  : ag.mover ? 'El turno anterior se libera y queda en el historial como «Reprogramada».'
                    : `La ${W} queda ligada a la solicitud ${ag.codigo}. No se crean citas sin solicitud.`}
              </p>
            </section>
          )}

          {!ag && !blk && !cfg && falla && <Alert tone="danger" title="No se pudo" compact>{falla}</Alert>}

          {!ag && !blk && (s ? (
            <section className="ag-det" aria-labelledby="ag-sel-nombre">
              {aviso && <Toast title={aviso.titulo} onClose={() => setAviso(null)}>{aviso.texto}</Toast>}
              <div className="between"><span className="ov">Cita seleccionada</span><StatusChip status={s.solicitud.estado === 'Vencida' ? 'Vencida' : s.estado} /></div>
              <div className="ag-who">
                <span className="ag-av" aria-hidden="true">{iniciales(s.solicitud.cliente)}</span>
                <div><h2 id="ag-sel-nombre">{s.solicitud.cliente}</h2><small>{capital(largo(s.fecha))} · {s.hora ?? `franja de la ${s.franja === 'manana' ? 'mañana' : 'tarde'}`}</small></div>
              </div>
              <dl className="ag-facts">
                <div><span className="ag-ic"><Icon name="calendar" size={16} /></span><dt>Tipo</dt><dd>{s.tipo === 'domicilio' ? 'Visita a domicilio' : 'Visita en el local'}</dd></div>
                <div><span className="ag-ic"><Icon name="inbox" size={16} /></span><dt>Solicitud</dt><dd>{s.solicitud.codigo}</dd></div>
                <div><span className="ag-ic"><Icon name="sofa" size={16} /></span><dt>Mueble</dt><dd>{s.solicitud.mueble}</dd></div>
                <div><span className="ag-ic"><Icon name="user" size={16} /></span><dt>Teléfono</dt><dd><a href={`tel:${s.solicitud.telefono}`}>{telefono(s.solicitud.telefono)}</a></dd></div>
                <div><span className="ag-ic"><Icon name="history" size={16} /></span><dt>Reprogramaciones</dt><dd>{Math.min(s.reprogramaciones, max)} de {max}<span className="ag-rep" aria-hidden="true"><i className={s.reprogramaciones ? 'ag-on' : undefined} /></span></dd></div>
                {s.tipo === 'domicilio' && s.direccion && <div><span className="ag-ic"><Icon name="map-pin" size={16} /></span><dt>Dirección</dt><dd>{s.direccion}</dd></div>}
              </dl>
              {s.solicitud.telaDescripcion && <p className="ag-busca"><b>Tela que busca:</b> «{s.solicitud.telaDescripcion}»</p>}

              {s.estado === 'Programada' && (
                <>
                  <Link className="gw-btn gw-btn-primary gw-btn-block" to={`/admin/agenda/atender?solicitud=${s.solicitud.codigo}${s.tipo === 'domicilio' ? '&lugar=domicilio' : ''}`}>
                    {s.tipo === 'domicilio' ? 'Atender la visita (en casa del cliente)' : 'Atender la cita en el local'}
                  </Link>
                  <p className="audit" style={{ margin: 0 }}>
                    {s.tipo === 'domicilio'
                      ? 'Se abre en la tablet o el celular en casa del cliente: la misma guía de telas, medidas, cotización y respuesta. Al terminar, la solicitud pasa a Atendida.'
                      : 'Guía paso a paso: telas, medidas, traslado, cotización y respuesta de la clienta, en el mismo momento.'}
                  </p>
                  <div className="row">
                    <button type="button" className="gw-btn gw-btn-secondary" style={{ flex: 1 }} onClick={() => { setAg(desdeCita(s, max, 'mover')); setBk(null); setCfg(false); setAviso(null); }}>Reprogramar</button>
                    <button type="button" className="gw-btn gw-btn-danger" style={{ flex: 1 }} disabled={ocupado || !pasado(s.fecha, s.hora ?? '00:00')}
                      title={pasado(s.fecha, s.hora ?? '00:00') ? undefined : 'Se marca cuando llega la hora de la cita'} onClick={() => noAsistio(s)}>
                      {s.tipo === 'domicilio' ? 'No lo encontramos' : 'No asistió'}
                    </button>
                  </div>
                  <p className="audit">
                    {s.tipo === 'domicilio'
                      ? 'Si no hay nadie en casa, márquelo aquí: el cliente recibe el aviso y puede reprogramar una vez; la segunda vez la solicitud vence.'
                      : 'Si no asiste, el cliente puede reprogramar una vez; la segunda inasistencia vence la solicitud.'}
                  </p>
                </>
              )}
              {s.estado === 'Atendida' && (
                <>
                  <Link className="gw-btn gw-btn-primary gw-btn-block" to="/admin/cotizaciones">Ver su cotización</Link>
                  <p className="audit">Cita atendida. La cotización se arma desde esta visita y el cliente la recibe en su cuenta (W4).</p>
                </>
              )}
              {s.estado === 'No asistió' && (s.solicitud.estado === 'Vencida' ? (
                <Alert tone="info" title="Solicitud vencida" compact>Se le avisó al cliente. Si más adelante quiere el servicio, envía una nueva solicitud.</Alert>
              ) : s.solicitud.tieneProgramada ? (
                <Alert tone="info" title="Ya tiene un nuevo turno" compact>La solicitud {s.solicitud.codigo} ya tiene otra {s.tipo === 'local' ? 'cita' : 'visita'} programada en la agenda.</Alert>
              ) : s.solicitud.inasistencias <= max ? (
                <>
                  <Alert tone="warning" title={s.tipo === 'domicilio' ? 'Marcado: no lo encontramos en casa' : 'Marcado: no asistió'} compact>Le avisamos al cliente por correo y en su cuenta. Puede reprogramar una sola vez; si vuelve a faltar, la solicitud vence.</Alert>
                  <span className="gw-field-label">¿Qué sigue?</span>
                  <button type="button" className="gw-btn gw-btn-primary gw-btn-block" onClick={() => { setAg(desdeCita(s, max, 'falta')); setBk(null); setAviso(null); }}>Reprogramar con el cliente</button>
                  <p className="audit" style={{ margin: 0 }}>Úselo si el cliente llamó o le contestó. Si no, él mismo puede elegir otro turno desde su cuenta (Mis pedidos › Reprogramar).</p>
                </>
              ) : (
                <>
                  <Alert tone="danger" title="Faltó por segunda vez" compact>Ya usó su única reprogramación. Por regla, la solicitud vence; si el cliente insiste, puede ofrecerle un último turno.</Alert>
                  <div className="row" style={{ gap: 8 }}>
                    <button type="button" className="gw-btn gw-btn-danger" style={{ flex: 1 }} disabled={ocupado} onClick={() => vencer(s)}>Dar por vencida</button>
                    <button type="button" className="gw-btn gw-btn-secondary" style={{ flex: 1 }} onClick={() => { setAg(desdeCita(s, max, 'falta')); setBk(null); setAviso(null); }}>Ofrecer último turno</button>
                  </div>
                </>
              ))}
            </section>
          ) : !cfg && (
            <section className="ag-det">
              {aviso && <Toast title={aviso.titulo} onClose={() => setAviso(null)}>{aviso.texto}</Toast>}
              <span className="ov">Cita seleccionada</span>
              <p className="muted">Toque una cita del calendario para ver sus datos. Las citas nuevas se agendan desde <Link to="/admin/solicitudes">Solicitudes</Link>.</p>
            </section>
          ))}
        </aside>
      </div>
    </>
  );
}
