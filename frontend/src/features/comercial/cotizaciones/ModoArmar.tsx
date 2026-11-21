import { useCallback, useEffect, useState } from 'react';

import { Link, useSearchParams } from 'react-router-dom';
import { API_URL, ApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { Icon } from '../../../shared/ui/Icon';
import { PricePanel } from '../../../shared/ui/PricePanel';
import { StatusChip } from '../../../shared/ui/StatusChip';
import { TextField } from '../../../shared/ui/TextField';
import { Toast } from '../../../shared/ui/Toast';
import { dolares } from '../atender/estado';
import { cotizacionesApi, type ActividadArmada, type Armado, type EntradaCotizacion, type MuebleArmado } from './cotizacionesApi';
import { FotosMueble } from './VisorMedios';
import type { Medio } from './datos';

const numero = (v: string | number) => { const n = typeof v === 'number' ? v : parseFloat(v.replace(',', '.')); return Number.isNaN(n) || n < 0 ? 0 : n; };
const fechaLarga = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-US', { weekday: 'short', day: 'numeric', month: 'short' });
/** Reglas generales que el cliente ve siempre en su cotización (no se escriben en las observaciones). */
const CONDICIONES_FIJAS = 'La tela se pide cuando paga el adelanto. Al recibir el mueble lo revisamos antes de empezar: si encontramos algo distinto a lo cotizado, no lo tocamos y le enviamos una recotización para que usted decida.';

/** `lista`: detalle en filas (p. ej. varias telas a comprar); `nota`: una línea debajo de la lista. */
type Revision = { tono: 'ok' | 'warn' | 'falta'; texto: string; lista?: { l: string; v: string }[]; nota?: string };
interface ActForm extends ActividadArmada { key: number; nueva?: boolean }
/** Lo que el Administrador arma en cada mueble. */
/** `propuesto` null = sigue al precio sugerido hasta que el Administrador escriba otro (RG-01). */
interface MuebleForm { actividades: ActForm[]; yardas: Record<number, number>; propuesto: number | null; motivo: string; revisado: boolean }
export interface Cabecera { crumb: string; titulo: string; estado: string }

let siguienteKey = 1;
const formDe = (m: MuebleArmado): MuebleForm => ({
  actividades: m.actividades.map((a) => ({ ...a, materiales: [...a.materiales], key: siguienteKey++ })),
  yardas: Object.fromEntries(m.tela.telas.map((t) => [t.materialId, t.yardas])),
  propuesto: m.propuesto > 0 ? m.propuesto : null, motivo: m.motivo, revisado: m.revisado,
});

/**
 * El mismo cálculo que hace el servidor (CU-C08): tela + materiales + mano de obra + maquinaria + costos fijos + margen.
 * Las actividades son por unidad y se multiplican por la cantidad del mueble («2 × sofá»); las yardas de tela son de
 * toda la línea y los costos fijos van una sola vez por cotización.
 */
function costear(f: MuebleForm, m: MuebleArmado, c: Armado['costos'], conFijos: boolean) {
  let horas = 0, horasMaquina = 0, materiales = 0, maquinaria = 0;
  for (const a of f.actividades) {
    horas += a.horasPersona;
    if (a.maquinaId != null) { horasMaquina += a.horasMaquina; maquinaria += a.horasMaquina * a.tarifaMaquina; }
    for (const x of a.materiales) materiales += x.cantidad * x.precio;
  }
  const n = Math.max(1, m.cantidad);
  horas *= n; horasMaquina *= n; maquinaria *= n; materiales *= n;
  if (m.tela.tipo === 'taller') for (const t of m.tela.telas) materiales += (f.yardas[t.materialId] ?? 0) * (t.precio ?? 0);
  const manoObra = horas * c.tarifaHora, fijos = conFijos ? c.costosFijos : 0;
  const costo = materiales + manoObra + maquinaria + fijos;
  const margen = costo * (c.margenPct / 100);
  const desglose = [
    { label: 'Margen', value: Math.round(margen) }, { label: 'Materiales', value: Math.round(materiales) }, { label: 'Mano de obra', value: Math.round(manoObra) },
    { label: 'Maquinaria', value: Math.round(maquinaria) }, { label: 'Costos fijos', value: Math.round(fijos) },
  ];
  return {
    // El mismo que muestra el panel (la suma de sus partes): así el propuesto inicial marca 0 %. Puede diferir en $1 del
    // redondeo del servidor (Math.round(costo × (1 + margen))), que es el que se guarda como sugerido.
    sugerido: desglose.reduce((t, p) => t + p.value, 0),
    horas: Math.round(horas * 10) / 10, horasMaquina: Math.round(horasMaquina * 10) / 10,
    desglose,
  };
}

/**
 * Armar la cotización (CU-C07, C08, C11 · decisiones K), conectada a la API: una solicitud con uno o varios muebles.
 * Cada mueble tiene su plantilla, su tela (las yardas las pone el taller), sus fotos, sus actividades y su precio; el
 * total se suma solo, el transporte se cobra una vez y el adelanto se puede cambiar solo para este pedido.
 */
export function ModoArmar({ onEstado, onResponder, onCabecera }: { onEstado(estado: string): void; onResponder(total: number, mueble: string): void; onCabecera(c: Cabecera): void }) {
  const [params] = useSearchParams();
  const codigo = params.get('solicitud') ?? (API_URL ? null : 'SOL-0076');
  const [armado, setArmado] = useState<Armado | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const cargar = useCallback(() => {
    if (!codigo) return;
    setErrorCarga(null);
    cotizacionesApi.armar(codigo).then(setArmado).catch((e) => setErrorCarga(e instanceof ApiError ? e.message : 'No pudimos cargar la cotización.'));
  }, [codigo]);
  useEffect(cargar, [cargar]);

  useEffect(() => {
    if (!armado) return;
    const fecha = new Date(armado.solicitud.fecha).toLocaleDateString('es-US', { weekday: 'short', day: 'numeric', month: 'short' });
    onCabecera({ crumb: `${armado.solicitud.codigo} · ${fecha}`, titulo: armado.cotizacion.codigo ? `Cotización ${armado.cotizacion.codigo}` : 'Nueva cotización', estado: armado.cotizacion.estado });
    onEstado(armado.cotizacion.estado);
  }, [armado, onCabecera, onEstado]);

  if (!codigo) {
    return (
      <EmptyState icon="quote" title="Elija la solicitud que va a cotizar">
        Las cotizaciones se arman desde <Link to="/admin/solicitudes?etapa=por-cotizar">Solicitudes y cotizaciones › Por cotizar</Link>, con «Armar cotización».
      </EmptyState>
    );
  }
  if (errorCarga) {
    return (
      <Alert tone="danger" title="No pudimos abrir la cotización">
        {errorCarga} <Link to="/admin/solicitudes?etapa=por-cotizar">Volver a Solicitudes</Link>
      </Alert>
    );
  }
  if (!armado) return <p className="muted" role="status">Cargando la cotización…</p>;
  return <Armar key={`${armado.solicitud.codigo}|${armado.cotizacion.estado}`} armado={armado} onRecargar={cargar} onResponder={onResponder} />;
}

/** Lo armado, para la pantalla de la cita o la visita (A2b), que publica junto con la respuesta del cliente. */
export interface ArmadoEnVisita { entrada: EntradaCotizacion; total: number; adelanto: number; lista: boolean; descripcion: string }

export function Armar({ armado, onRecargar, onResponder, enVisita }: { armado: Armado; onRecargar(): void; onResponder(total: number, mueble: string): void; enVisita?(r: ArmadoEnVisita): void }) {
  const a = armado;
  const editable = a.cotizacion.editable;
  const muebles = a.muebles;
  const varios = muebles.length > 1;
  const [forms, setForms] = useState<MuebleForm[]>(() => muebles.map(formDe));
  const [actual, setActual] = useState(0);
  const [observaciones, setObservaciones] = useState(a.observaciones);
  const [manual, setManual] = useState(a.transporte.manual);
  const [montoManual, setMontoManual] = useState(a.transporte.manual ? String(a.transporte.monto) : '');
  const [motivoManual, setMotivoManual] = useState(a.transporte.motivo);
  const [adelanto, setAdelanto] = useState<string | null>(a.condiciones.adelanto != null ? String(a.condiciones.adelanto) : null);
  const [cambiandoAdelanto, setCambiandoAdelanto] = useState(false);
  const [ocupado, setOcupado] = useState<'guardar' | 'publicar' | null>(null);
  const [aviso, setAviso] = useState<{ tono: 'success' | 'info'; titulo: string; texto: string } | null>(null);
  const [errorServidor, setErrorServidor] = useState<{ mensaje: string; errores: string[] } | null>(null);

  const mt = Math.min(actual, muebles.length - 1);
  const m = muebles[mt]!;
  const f = forms[mt]!;
  const { horas, horasMaquina, desglose } = costear(f, m, a.costos, mt === 0);
  const propuestoDe = (i: number) => forms[i]!.propuesto ?? costear(forms[i]!, muebles[i]!, a.costos, i === 0).sugerido;

  const cambiarForm = (cambio: Partial<MuebleForm> | ((x: MuebleForm) => Partial<MuebleForm>)) =>
    setForms((xs) => xs.map((x, i) => (i === mt ? { ...x, ...(typeof cambio === 'function' ? cambio(x) : cambio) } : x)));
  const cambiarAct = (key: number, cambio: Partial<ActForm>) => cambiarForm((x) => ({ actividades: x.actividades.map((y) => (y.key === key ? { ...y, ...cambio } : y)) }));
  const agregar = () => cambiarForm((x) => ({ actividades: [...x.actividades, { key: siguienteKey++, nombre: '', horasPersona: 0, maquinaId: null, maquina: null, tarifaMaquina: 0, horasMaquina: 0, materiales: [], nueva: true }] }));
  const irA = (i: number) => { setActual(i); setForms((xs) => xs.map((x, k) => (k === i ? { ...x, revisado: true } : x))); };

  // ---------------------------------------------------------------- Transporte, total y adelanto
  const t = a.transporte;
  const transporte = !t.aplica ? 0 : manual ? numero(montoManual) : (t.calculado ?? 0);
  const total = forms.reduce((s, _x, i) => s + propuestoDe(i), 0) + transporte;
  const sugeridoAdelanto = Math.round((total * a.condiciones.adelantoPct) / 100);
  const maxAdelanto = Math.round((total * a.condiciones.adelantoMaxPct) / 100);
  const valorAdelanto = adelanto == null ? sugeridoAdelanto : numero(adelanto);
  const pctAdelanto = total > 0 ? Math.round((valorAdelanto / total) * 100) : 0;
  const errorAdelanto = adelanto != null && (adelanto.trim() === '' || Number.isNaN(parseFloat(adelanto)))
    ? 'Escriba el adelanto con números.'
    : valorAdelanto > maxAdelanto ? `No puede pasar del ${a.condiciones.adelantoMaxPct} % del total (${dolares(maxAdelanto)}).` : undefined;

  // ---------------------------------------------------------------- Revisión antes de publicar (las mismas reglas que el servidor)
  const revisados = forms.filter((x) => x.revisado).length;
  const telasCompra = Object.entries(muebles.reduce<Record<string, number>>((acc, x, i) => {
    if (x.tela.tipo !== 'taller') return acc;
    for (const tl of x.tela.telas) { const yd = forms[i]!.yardas[tl.materialId] ?? 0; if (yd > 0) acc[tl.nombre] = (acc[tl.nombre] ?? 0) + yd; }
    return acc;
  }, {}));
  const revision: Revision[] = [];
  if (!t.aplica) revision.push(t.porDefinir ? { tono: 'falta', texto: 'Falta definir el traslado: delivery o lo lleva el cliente' } : { tono: 'ok', texto: 'Logística: el cliente lleva y recoge el mueble (sin transporte)' });
  else if (manual) revision.push(numero(montoManual) > 0 && motivoManual.trim() ? { tono: 'ok', texto: 'Logística completa: transporte ingresado a mano' } : { tono: 'falta', texto: 'Falta el costo y el motivo del transporte a mano' });
  else revision.push(t.calculado != null ? { tono: 'ok', texto: `Transporte calculado: ${t.millas} mi desde el taller` } : { tono: 'falta', texto: 'No se pudo calcular la distancia: ingrese el transporte a mano' });
  muebles.forEach((x, i) => {
    const pre = varios ? `${x.clave} (${x.corto}): ` : '';
    if (x.tela.tipo === 'pendiente') revision.push({ tono: 'falta', texto: `${pre}falta la tela · ${x.tela.nota.toLowerCase()}` });
    for (const tl of x.tela.tipo === 'taller' ? x.tela.telas : []) {
      if (!tl.activa) revision.push({ tono: 'falta', texto: `${pre}${tl.nombre} está descontinuada` });
      else if (tl.precio == null) revision.push({ tono: 'falta', texto: `${pre}${tl.nombre} no tiene precio: cárguelo en Inventario › Telas` });
      if (!(forms[i]!.yardas[tl.materialId] > 0)) revision.push({ tono: 'falta', texto: `${pre}faltan las yardas de ${tl.nombre}` });
    }
    if (!forms[i]!.actividades.some((y) => y.horasPersona > 0)) revision.push({ tono: 'falta', texto: `${pre}agregue al menos una actividad con horas` });
    if (forms[i]!.actividades.some((y) => !y.nombre.trim())) revision.push({ tono: 'falta', texto: `${pre}hay una actividad sin nombre` });
    if (forms[i]!.actividades.some((y) => y.materiales.some((z) => !(z.cantidad > 0)))) revision.push({ tono: 'falta', texto: `${pre}hay un material sin cantidad` });
    if (propuestoDe(i) <= 0) revision.push({ tono: 'falta', texto: `${pre}indique el precio propuesto` });
  });
  // Una tela: en una línea. Varias: en lista (nombre y yardas), más fácil de leer.
  if (telasCompra.length === 1) revision.push({ tono: 'warn', texto: `Tela a comprar: ${telasCompra[0]![0]} (${telasCompra[0]![1]} yd). No bloquea: se pide al pagar el adelanto` });
  else if (telasCompra.length > 1) {
    revision.push({
      tono: 'warn', texto: `Telas a comprar (${telasCompra.length})`,
      lista: telasCompra.map(([n, yd]) => ({ l: n, v: `${yd} yd` })),
      nota: 'No bloquea: se piden al pagar el adelanto.',
    });
  }
  revision.push({ tono: 'ok', texto: `Vigencia: ${a.condiciones.vigenciaDias} días desde que se publica` });
  if (varios) revision.push(revisados === muebles.length ? { tono: 'ok', texto: `Precio revisado en los ${muebles.length} muebles` } : { tono: 'falta', texto: `Precio revisado en ${revisados} de ${muebles.length} muebles: revise los que faltan` });
  if (errorAdelanto) revision.push({ tono: 'falta', texto: `Adelanto: ${errorAdelanto}` });
  const lista = revision.every((r) => r.tono !== 'falta');

  // ---------------------------------------------------------------- Guardar y publicar
  const entrada = (): EntradaCotizacion => ({
    muebles: muebles.map((x, i) => ({
      solicitudMuebleId: x.solicitudMuebleId,
      actividades: forms[i]!.actividades.map((y) => ({ nombre: y.nombre, horasPersona: y.horasPersona, maquinaId: y.maquinaId, horasMaquina: y.maquinaId ? y.horasMaquina : 0, materiales: y.materiales.map((z) => ({ materialId: z.materialId, cantidad: z.cantidad })) })),
      telas: x.tela.tipo === 'taller' ? x.tela.telas.map((tl) => ({ materialId: tl.materialId, yardas: forms[i]!.yardas[tl.materialId] ?? 0 })) : [],
      // La tela de cada parte, elegida en la cita o la visita, viaja tal cual hasta publicar.
      ...(x.tela.eligeAqui && x.partes?.length ? { partes: x.partes } : {}),
      propuesto: propuestoDe(i), motivo: forms[i]!.motivo, revisado: forms[i]!.revisado,
    })),
    transporte: manual ? { manual: true, monto: numero(montoManual), motivo: motivoManual } : { manual: false },
    adelanto: adelanto == null ? null : valorAdelanto,
    observaciones,
  });
  // En la cita o la visita, la pantalla de atención recibe lo armado en cada cambio y publica con la respuesta.
  const descripcionVisita = varios ? muebles.map((x) => x.titulo).join(', ') : m.titulo;
  useEffect(() => {
    enVisita?.({ entrada: entrada(), total, adelanto: valorAdelanto, lista, descripcion: descripcionVisita });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forms, manual, montoManual, motivoManual, adelanto, observaciones, total, valorAdelanto, lista]);

  const enviar = async (que: 'guardar' | 'publicar', despues?: () => void) => {
    setOcupado(que);
    setErrorServidor(null);
    setAviso(null);
    try {
      if (que === 'guardar') {
        const r = await cotizacionesApi.guardar(a.solicitud.codigo, entrada());
        setAviso({ tono: 'success', titulo: `Borrador ${r.codigo} guardado`, texto: 'Puede seguir armándola después: queda guardada tal como está.' });
        if (!a.cotizacion.codigo) onRecargar();
      } else {
        const r = await cotizacionesApi.publicar(a.solicitud.codigo, entrada());
        setAviso({ tono: 'success', titulo: `Cotización ${r.codigo} publicada`, texto: `${a.cliente.nombre} recibió correo y notificación. Tiene hasta el ${fechaLarga(r.vigenciaHasta)} para responder.` });
        despues?.();
        onRecargar();
      }
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('No pudimos guardar la cotización. Intente de nuevo.', 0);
      setErrorServidor({ mensaje: err.message, errores: Object.values(err.errores) });
    } finally {
      setOcupado(null);
    }
  };
  const descripcion = varios ? muebles.map((x) => x.titulo).join(', ') : m.titulo;
  const sufijo = varios ? ` · ${m.corto}` : '';
  const medios: Medio[] = m.medios.map((x) => ({ nombre: x.nombre, origen: 'cliente', tipo: x.tipo === 'video' ? 'Video' : 'Foto', detalle: 'Enviado por el cliente', fondo: 'linear-gradient(135deg,#1E3A8A,#0B1B3A)', url: x.url }));
  const nFotos = muebles.flatMap((x) => x.medios).filter((x) => x.tipo !== 'video').length;
  const nVideos = muebles.flatMap((x) => x.medios).length - nFotos;
  const telaFicha = m.tela.tipo === 'taller' ? m.tela.telas.map((tl) => `${tl.nombre} · ${f.yardas[tl.materialId] ?? 0} yd`).join(' + ') : m.tela.tipo === 'cliente' ? 'La brinda el cliente' : m.tela.tipo === 'no' ? 'No lleva tela' : 'Por definir';

  return (
    <div className="split">
      <div className="wide">
        {!editable && (
          <Alert tone="info" title={`Cotización publicada · ${a.cotizacion.estado}`}>
            Total {dolares(a.cotizacion.total ?? total)}{a.cotizacion.vigenciaHasta ? ` · vigente hasta el ${fechaLarga(a.cotizacion.vigenciaHasta)}` : ''}. Los precios quedaron congelados: ya no se puede cambiar.
          </Alert>
        )}
        <section className="card co-ficha" aria-label="Datos de la solicitud">
          <div className="row">
            <span className="thumb" style={{ width: 64, height: 64 }}><Icon name="sofa" size={28} /></span>
            <div><b className="co-nombre">{a.cliente.nombre}</b><div className="muted" style={{ fontSize: 13 }}>{a.cliente.historial}{a.cliente.ciudad ? ` · ${a.cliente.ciudad}` : ''}</div></div>
          </div>
          <div className="co-datos">
            <div><div className="muted">{varios ? 'Muebles' : 'Mueble'}</div><b>{varios ? `${muebles.length} · ${muebles.map((x) => x.corto).join(', ')}` : m.titulo}</b></div>
            <div><div className="muted">Servicio</div><b>{varios ? 'Uno por mueble' : m.servicioNombre}</b></div>
            <div><div className="muted">Tela</div><b>{telaFicha}</b></div>
            <div><div className="muted">Fotos y videos</div><b>{varios ? `${nFotos + nVideos} archivos · ${muebles.length} muebles` : `${nFotos} fotos · ${nVideos} video${nVideos === 1 ? '' : 's'}`}</b></div>
          </div>
        </section>

        {varios && (
          <section className="card stack" style={{ padding: 20 }} aria-labelledby="co-muebles">
            <div className="between" style={{ flexWrap: 'wrap', gap: 8 }}>
              <h2 id="co-muebles" style={{ fontSize: 20 }}>Muebles de esta cotización · {muebles.length}</h2>
              <span className="muted" style={{ fontSize: 13 }}>Arme el precio de cada uno: el total se suma solo</span>
            </div>
            <div className="co-mtabs" role="group" aria-label="Mueble que está armando">
              {muebles.map((x, i) => {
                const rev = forms[i]!.revisado;
                return (
                  <button key={x.solicitudMuebleId} type="button" className="co-mtab" aria-pressed={i === mt} onClick={() => irA(i)}>
                    <b>{x.clave}</b>
                    <span>{x.titulo} · {x.servicioNombre}</span>
                    <em>{dolares(propuestoDe(i))}</em>
                    <i className={rev ? 'co-mst co-mst-ok' : 'co-mst co-mst-pd'}>{rev ? '✓ Revisado' : 'Por revisar'}</i>
                  </button>
                );
              })}
            </div>
            <p className="audit" style={{ margin: 0 }}>El transporte se cobra una sola vez para todos los muebles, porque se recogen y entregan en el mismo viaje.</p>
          </section>
        )}

        <fieldset className="co-fs" disabled={!editable}>
          <legend className="co-sr">Acabado y tela</legend>
          <section className="card stack" style={{ padding: 20 }} aria-labelledby="co-tela">
            <h2 id="co-tela" style={{ fontSize: 20 }}>Acabado y tela{sufijo}</h2>
            <div className="co-acab">
              <span className="co-acab-ic" aria-hidden="true"><Icon name="sofa" size={18} /></span>
              <div>
                <span className="gw-field-label">Acabado</span>
                <b>{m.servicio === 'fabricacion' ? `Fabricación a medida · ${m.acabado ? m.acabado[0]!.toUpperCase() + m.acabado.slice(1) : 'Liso'}` : `Se respeta el del mueble · ${m.servicioNombre.toLowerCase()}`}</b>
                <small>Liso, capitoneado o con canales se elige solo en fabricación a medida (el capitoneado suma aprox. 45 % y los canales 40 % a la mano de obra).</small>
              </div>
              {m.medidas && <div className="co-acab-med"><span className="gw-field-label">Medidas</span><b>{m.medidas}</b></div>}
            </div>
            <div>
              <div className="stack" style={{ gap: 8 }}>
                <span className="gw-field-label">Tela</span>
                {m.tela.tipo === 'taller' && (() => {
                  // Una fila por tela: en qué partes va, las yardas (las mide el taller) y su costo, todo junto.
                  const enPartes = (id: number) => (m.partes ?? []).filter((x) => x.materialId === id).map((x) => m.partesMueble?.find((p) => p.id === x.parteId)?.nombre).filter(Boolean).join(', ');
                  const totalYd = m.tela.telas.reduce((t, tl) => t + (f.yardas[tl.materialId] ?? 0), 0);
                  const totalCosto = m.tela.telas.reduce((t, tl) => t + (f.yardas[tl.materialId] ?? 0) * (tl.precio ?? 0), 0);
                  return (
                    <>
                      <span className="muted" style={{ fontSize: 12.5 }}>{m.tela.nota.replace(/ · la pone el taller$/, '')} · {m.partes?.length ? 'distintas telas por partes' : m.tela.telas.length > 1 ? `${m.tela.telas.length} telas` : 'una tela para todo el mueble'}. {enVisita ? 'Las yardas se definieron en el paso Telas.' : 'Las yardas las mide el taller.'}</span>
                      <div className="co-tl">
                        {m.tela.telas.map((tl) => {
                          const yd = f.yardas[tl.materialId] ?? 0;
                          return (
                            <div key={tl.materialId} className="co-tlrow">
                              <div className="co-tlnm">
                                <b>{tl.nombre}</b>
                                <small>{enPartes(tl.materialId) || (m.tela.telas.length === 1 ? 'Todo el mueble' : '—')} · {tl.precio == null ? 'sin precio' : `$${tl.precio}/yd`}</small>
                              </div>
                              {enVisita ? (
                                // En la cita o la visita las yardas se definen en el paso Telas: aquí solo se ven.
                                <span className="num co-ydro" title="Se cambian en el paso Telas">{yd} yd</span>
                              ) : (
                              <div className="co-ydrow co-ydsm" role="group" aria-label={`Yardas de ${tl.nombre}`}>
                                <button type="button" className="co-ydb" aria-label="Media yarda menos" disabled={yd <= 0} onClick={() => cambiarForm((x) => ({ yardas: { ...x.yardas, [tl.materialId]: Math.max(0, yd - 0.5) } }))}>−</button>
                                <input className="co-ydi num" type="number" min={0} step={0.5} value={yd} aria-label={`Yardas de ${tl.nombre}`} onChange={(e) => cambiarForm((x) => ({ yardas: { ...x.yardas, [tl.materialId]: numero(e.target.value) } }))} />
                                <span className="muted">yd</span>
                                <button type="button" className="co-ydb" aria-label="Media yarda más" onClick={() => cambiarForm((x) => ({ yardas: { ...x.yardas, [tl.materialId]: yd + 0.5 } }))}>+</button>
                              </div>
                              )}
                              <b className="num co-tlcost">{tl.precio == null ? '—' : dolares(yd * tl.precio)}</b>
                            </div>
                          );
                        })}
                      </div>
                      {m.tela.telas.some((tl) => tl.precio == null) && <span className="co-warn-txt">Alguna tela no tiene precio: cárguelo en <Link to="/admin/inventario/telas">Inventario › Telas</Link>.</span>}
                      {m.tela.telas.length > 1 && <div className="kv co-ydtot"><span>Tela en total</span><b className="num">{totalYd} yd · {dolares(totalCosto)}</b></div>}
                    </>
                  );
                })()}
                {m.tela.tipo === 'cliente' && (
                  <>
                    <div className="kv"><span>Lo brinda el cliente</span><b className="num">$0</b></div>
                    <span className="muted" style={{ fontSize: 12.5 }}>No se cobra tela. Al recibir el mueble y la tela en el taller se revisa que alcance.</span>
                  </>
                )}
                {m.tela.tipo === 'no' && (
                  <>
                    <div className="kv"><span>Este trabajo no lleva tela</span><b className="num">$0</b></div>
                    <span className="muted" style={{ fontSize: 12.5 }}>Solo cambio de espuma o reparación de estructura.</span>
                  </>
                )}
                {m.tela.tipo === 'pendiente' && <Alert tone="warning" title="Falta la tela">{m.tela.nota}. No se puede publicar hasta que esté elegida.</Alert>}
              </div>
            </div>
          </section>
        </fieldset>

        {medios.length > 0
          ? <FotosMueble key={m.solicitudMuebleId} medios={medios} titulo={varios ? `Fotos y videos${sufijo}` : undefined} />
          : <section className="card" style={{ padding: 20 }}><h2 style={{ fontSize: 20 }}>Fotos y videos{sufijo}</h2><p className="muted" style={{ margin: '6px 0 0' }}>El cliente no envió fotos de este mueble.</p></section>}

        <fieldset className="co-fs" disabled={!editable}>
          <legend className="co-sr">Datos editables de la cotización</legend>
          <section className="card stack" style={{ padding: 20 }} aria-labelledby="co-acts">
            <div className="between" style={{ flexWrap: 'wrap' }}>
              <div>
                <h2 id="co-acts" style={{ fontSize: 20 }}>{varios ? `Actividades${sufijo}` : 'Actividades del trabajo'}</h2>
                <p className="muted" style={{ fontSize: 13 }}>
                  {m.plantilla
                    ? <>Plantilla <Link to="/admin/plantillas"><b>{m.plantilla.nombre}</b></Link>, cargada sola según el mueble y el servicio. Edite horas si este trabajo lo necesita.</>
                    : <>No hay plantilla para {m.titulo.toLowerCase()} · {m.servicioNombre.toLowerCase()}: agregue las actividades a mano o <Link to="/admin/plantillas">cree la plantilla</Link>.</>}
                </p>
              </div>
              {editable && <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" onClick={agregar}>+ Agregar actividad</button>}
            </div>
            <div className="tbl-box" style={{ boxShadow: 'none' }}>
              <table className="t co-acts">
                <thead><tr><th style={{ width: '24%' }}>Actividad</th><th className="r" style={{ width: 92 }}>Horas persona</th><th className="co-th-maq">Máquina</th><th className="r" style={{ width: 92 }}>Horas máq.</th><th className="co-th-mat">Materiales</th><th style={{ width: 44 }}><span className="co-sr">Quitar</span></th></tr></thead>
                <tbody>
                  {f.actividades.length === 0 && <tr><td colSpan={6} className="muted">Sin actividades todavía.</td></tr>}
                  {f.actividades.map((x) => (
                    <tr key={x.key}>
                      <td>{x.nueva
                        ? <input className="co-cell" style={{ fontWeight: 700 }} value={x.nombre} maxLength={80} placeholder="Nombre de la actividad" aria-label="Nombre de la actividad" onChange={(e) => cambiarAct(x.key, { nombre: e.target.value })} />
                        : <b>{x.nombre}</b>}
                      </td>
                      <td><input className="co-cell" type="number" min={0} step={0.5} value={x.horasPersona} aria-label={`Horas persona: ${x.nombre || 'actividad nueva'}`} onChange={(e) => cambiarAct(x.key, { horasPersona: numero(e.target.value) })} /></td>
                      <td className="muted">{x.nueva
                        ? <select className="co-cell" value={x.maquinaId ?? ''} aria-label="Máquina" title={x.maquina ?? 'Sin máquina'} onChange={(e) => {
                            const q = a.catalogo.maquinas.find((y) => y.id === Number(e.target.value));
                            cambiarAct(x.key, q ? { maquinaId: q.id, maquina: q.nombre, tarifaMaquina: q.tarifaHora } : { maquinaId: null, maquina: null, tarifaMaquina: 0, horasMaquina: 0 });
                          }}>
                            <option value="">Sin máquina</option>
                            {a.catalogo.maquinas.map((y) => <option key={y.id} value={y.id}>{y.nombre}</option>)}
                          </select>
                        : (x.maquina ?? '—')}
                      </td>
                      <td>{x.maquinaId == null
                        ? <span className="muted">—</span>
                        : <input className="co-cell" type="number" min={0} step={0.5} value={x.horasMaquina} aria-label={`Horas máquina: ${x.nombre}`} onChange={(e) => cambiarAct(x.key, { horasMaquina: numero(e.target.value) })} />}
                      </td>
                      <td>
                        {x.nueva && editable ? (
                          // Actividad agregada a mano: sus materiales de stock se eligen aquí (la tela va aparte, con sus yardas).
                          // Las de la plantilla conservan los suyos: las cantidades solo cambian si cambia el trabajo (CU-C08).
                          <div className="co-mats">
                            {x.materiales.map((y) => (
                              <div key={y.materialId} className="co-mat-ed">
                                <span className="co-mat-nom" title={y.nombre}>{y.nombre}</span>
                                <input className="co-cell" type="number" min={0} step={0.25} value={y.cantidad} aria-label={`Cantidad de ${y.nombre} (${y.unidad})`}
                                  onChange={(e) => cambiarAct(x.key, { materiales: x.materiales.map((z) => (z.materialId === y.materialId ? { ...z, cantidad: numero(e.target.value) } : z)) })} />
                                <small>{y.unidad}</small>
                                <button type="button" className="co-x" aria-label={`Quitar ${y.nombre}`} onClick={() => cambiarAct(x.key, { materiales: x.materiales.filter((z) => z.materialId !== y.materialId) })}><Icon name="x" size={14} /></button>
                              </div>
                            ))}
                            <select className="co-cell" value="" aria-label={`Agregar material a ${x.nombre || 'la actividad nueva'}`} onChange={(e) => {
                              const q = a.catalogo.materiales.find((y) => y.id === Number(e.target.value));
                              if (q) cambiarAct(x.key, { materiales: [...x.materiales, { materialId: q.id, nombre: q.nombre, unidad: q.unidad, precio: q.precio, cantidad: 1 }] });
                            }}>
                              <option value="">+ Agregar material</option>
                              {a.catalogo.materiales.filter((y) => !x.materiales.some((z) => z.materialId === y.id)).map((y) => (
                                <option key={y.id} value={y.id}>{y.nombre} · {y.unidad}</option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <>
                            {x.materiales.length === 0 && <span className="muted">—</span>}
                            {x.materiales.map((y) => <span key={y.materialId} className="co-mat">{y.nombre} · {y.cantidad} {y.unidad}</span>)}
                          </>
                        )}
                      </td>
                      <td>
                        {editable && <button type="button" className="co-x" aria-label={`Quitar actividad ${x.nombre || 'nueva'}`} onClick={() => cambiarForm((z) => ({ actividades: z.actividades.filter((y) => y.key !== x.key) }))}><Icon name="x" size={16} /></button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="between" style={{ paddingTop: 4, fontSize: 14, flexWrap: 'wrap' }}>
              <span className="muted">{f.actividades.length} {f.actividades.length === 1 ? 'actividad' : 'actividades'}</span>
              <span><span className="muted">Total horas persona</span> <b className="num">{horas} h</b> · <span className="muted">horas máquina</span> <b className="num">{horasMaquina} h</b></span>
            </div>
          </section>

          <div className="co-qgrid">
            <section className="card stack" style={{ padding: 20 }} aria-label="Transporte">
              <div className="between"><h3 style={{ fontSize: 16 }}>Transporte</h3>{t.aplica && <span className="pill"><Icon name={manual ? 'user' : 'lock'} size={14} />{manual ? 'A mano' : 'Calculado'}</span>}</div>
              {!t.aplica ? (
                t.porDefinir
                  ? <Alert tone="warning" title="Falta definir el traslado">Se define en la cita o la visita: delivery (recojo y entrega) o lo lleva el cliente.</Alert>
                  : <div className="kv"><span>El cliente lleva y recoge el mueble</span><b>$0</b></div>
              ) : manual ? (
                <>
                  <div className="kv"><span>Delivery ida y vuelta</span><b>{t.direccion}</b></div>
                  <TextField label="Costo (un solo cobro)" required prefix="$" inputMode="decimal" placeholder="Ej.: 90" value={montoManual} onChange={(e) => setMontoManual(e.target.value)} />
                  <TextField label="¿Por qué se ingresa a mano?" required placeholder="Ej.: OpenStreetMap no ubica la dirección" value={motivoManual} onChange={(e) => setMotivoManual(e.target.value)} />
                  {t.calculado != null && <button type="button" className="co-link" onClick={() => setManual(false)}>Volver al costo calculado ({dolares(t.calculado)})</button>}
                </>
              ) : (
                <>
                  <div className="kv"><span>Delivery ida y vuelta</span><b>{t.direccion}</b></div>
                  {t.calculado != null ? (
                    <>
                      <div className="kv"><span>Por distancia · {t.millas} mi × 2 viajes × ${t.porMilla.toFixed(2)}</span><b>{dolares(t.distancia ?? 0)}</b></div>
                      <div className="kv"><span>Por tamaño de la carga · {t.cargaTexto}</span><b>+{dolares(t.carga)}</b></div>
                      <div className="kv"><span>Costo (un solo cobro)</span><b>{dolares(t.calculado)}</b></div>
                      <p className="audit" style={{ margin: 0 }}>Se calcula solo, como una app de taxi: millas por calle desde el taller + qué tan grande es la carga. Las tarifas están en <Link to="/admin/parametros">Parámetros</Link>.</p>
                    </>
                  ) : (
                    <Alert tone="warning" title="No se pudo calcular la distancia">No encontramos la ruta desde el taller hasta esta dirección. Ingrese el transporte a mano.</Alert>
                  )}
                  <p className="audit">¿La distancia no es correcta? <button type="button" className="co-link" onClick={() => setManual(true)}>Ingresar el transporte a mano</button> · queda registrado quién y por qué.</p>
                </>
              )}
            </section>

            <section className="card stack" style={{ padding: 20 }} aria-label="Condiciones">
              <div className="between"><h3 style={{ fontSize: 16 }}>Condiciones</h3><StatusChip status="Parámetros" tone="info" /></div>
              <div className="kv"><span>Vigencia</span><b>{a.cotizacion.vigenciaHasta ? `Hasta el ${fechaLarga(a.cotizacion.vigenciaHasta)}` : `${a.condiciones.vigenciaDias} días desde que se publica`}</b></div>
              <div className="co-adel">
                <div className="kv">
                  <span>Adelanto</span>
                  <b>{dolares(valorAdelanto)} · {pctAdelanto} % del total</b>
                </div>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {adelanto == null
                    ? `Sugerido: ${a.condiciones.adelantoPct} % porque el cliente está ${a.condiciones.razon}.`
                    : `Cambiado para este pedido (el sugerido era ${a.condiciones.adelantoPct} %: ${dolares(sugeridoAdelanto)}).`}
                  {editable && !cambiandoAdelanto && <> <button type="button" className="co-link" onClick={() => { setCambiandoAdelanto(true); if (adelanto == null) setAdelanto(String(sugeridoAdelanto)); }}>Cambiar</button></>}
                </span>
                {editable && cambiandoAdelanto && (
                  <div className="stack" style={{ gap: 6 }}>
                    <TextField label="Adelanto a cobrar en este pedido" prefix="$" inputMode="decimal" autoFocus value={adelanto ?? ''} error={errorAdelanto}
                      onChange={(e) => setAdelanto(e.target.value)}
                      hint={`Entre $0 y ${dolares(maxAdelanto)} (${a.condiciones.adelantoMaxPct} %). Vale solo para este pedido y queda registrado quién y cuándo.`} />
                    <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                      <button type="button" className="co-link" onClick={() => setCambiandoAdelanto(false)} disabled={Boolean(errorAdelanto)}>Listo</button>
                      <button type="button" className="co-link" onClick={() => { setAdelanto(null); setCambiandoAdelanto(false); }}>Volver al sugerido ({a.condiciones.adelantoPct} % · {dolares(sugeridoAdelanto)})</button>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="card stack" style={{ padding: 20 }} aria-label="Observaciones para el cliente">
              <div className="between" style={{ flexWrap: 'wrap' }}><h3 style={{ fontSize: 16 }}>Observaciones para el cliente</h3><span className="pill">Las verá en su cotización</span></div>
              <div className="gw-field">
                <label className="gw-field-label" htmlFor="co-obs">Solo lo particular de este trabajo <span className="gw-optional">(opcional)</span></label>
                <textarea id="co-obs" className="gw-input gw-textarea" rows={3} maxLength={1000} value={observaciones} placeholder="Ej.: El cojín central tiene una mancha: el retapizado la cubre." onChange={(e) => setObservaciones(e.target.value)} />
              </div>
              <p className="audit" style={{ margin: 0 }}><b>El cliente siempre verá además:</b> {CONDICIONES_FIJAS}</p>
              <p className="audit">No escriba costos, márgenes ni el precio sugerido: el cliente lee este texto tal cual.</p>
            </section>
          </div>
        </fieldset>
      </div>

      <aside className="aside">
        {varios && (
          <section className="card stack co-tot-muebles" aria-labelledby="co-tot-muebles">
            <h3 id="co-tot-muebles" style={{ fontSize: 16, marginBottom: 6 }}>Total de la cotización</h3>
            {muebles.map((x, i) => {
              const rev = forms[i]!.revisado;
              return (
                <div key={x.solicitudMuebleId} className={i === mt ? 'co-mrow co-mrow-on' : 'co-mrow'}>
                  <span>{x.clave} · {x.titulo}<em className={rev ? 'co-mst co-mst-ok' : 'co-mst co-mst-pd'}>{rev ? 'Revisado' : 'Por revisar'}</em></span>
                  <b className="num">{dolares(propuestoDe(i))}</b>
                </div>
              );
            })}
            <div className="co-mrow"><span>Transporte (una sola vez)</span><b className="num">{dolares(transporte)}</b></div>
            <div className="co-mrow" style={{ borderBottom: 0 }}><b>Total para el cliente</b><b className="num" style={{ fontSize: 18 }}>{dolares(total)}</b></div>
            <p className="audit" style={{ margin: '6px 0 0' }}>Adelanto: {dolares(valorAdelanto)} ({pctAdelanto} %) · Abajo, el precio de {m.corto}.</p>
          </section>
        )}

        {editable && (
          <section className="card stack" style={{ padding: '18px 20px' }} aria-labelledby="co-rev">
            <div className="between">
              <h3 id="co-rev" style={{ fontSize: 16 }}>Revisión antes de publicar</h3>
              <span className={lista ? 'pill co-pill-ok' : 'pill co-pill-warn'}>{lista ? 'Lista' : varios && revisados < muebles.length ? 'Falta revisar' : 'Falta completar'}</span>
            </div>
            {revision.map((r) => (
              <div key={r.texto} className={`co-ck co-ck-${r.tono}`}>
                <Icon name={r.tono === 'ok' ? 'check' : 'alert'} size={16} />
                <div>
                  <span>{r.texto}</span>
                  {r.lista && <ul className="co-ck-lista">{r.lista.map((x) => <li key={x.l}><span>{x.l}</span><b className="num">{x.v}</b></li>)}</ul>}
                  {r.nota && <small className="co-ck-nota">{r.nota}</small>}
                </div>
              </div>
            ))}
          </section>
        )}

        {errorServidor && (
          <Alert tone="danger" title="No se guardó">
            {errorServidor.mensaje}
            {errorServidor.errores.length > 1 && <ul className="co-errs">{errorServidor.errores.map((x) => <li key={x}>{x}</li>)}</ul>}
          </Alert>
        )}
        {aviso && <Toast tone={aviso.tono} title={aviso.titulo} onClose={() => setAviso(null)}>{aviso.texto}</Toast>}

        <fieldset className="co-fs" disabled={!editable}>
          <legend className="co-sr">Precio de {varios ? m.corto : 'la cotización'}</legend>
          <PricePanel
            key={m.solicitudMuebleId}
            desglose={desglose}
            propuesto={propuestoDe(mt)}
            onPropuesto={(v) => cambiarForm({ propuesto: v })}
            motivo={f.motivo}
            onMotivo={(v) => cambiarForm({ motivo: v })}
            transporte={varios ? 0 : transporte}
            varios={varios ? { mueble: `este mueble (${m.titulo.replace(/^(\d+ × )?(\p{Lu})/u, (_x, n = '', l: string) => n + l.toLowerCase())})`, transporte, total } : undefined}
          >
            {editable && f.propuesto != null && (
              <button type="button" className="gw-btn gw-btn-ghost gw-btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => cambiarForm({ propuesto: null, motivo: '' })}>
                Volver al sugerido
              </button>
            )}
            {a.cotizacion.editadoPor && a.cotizacion.fechaModificacion && (
              <p className="audit" style={{ margin: 0 }}>Guardada por {a.cotizacion.editadoPor} · {new Date(a.cotizacion.fechaModificacion).toLocaleString('es-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
            )}
            {editable && !enVisita && (
              <>
                <button type="button" className="gw-btn gw-btn-primary gw-btn-block" disabled={!lista || ocupado != null} onClick={() => enviar('publicar')}>{ocupado === 'publicar' ? 'Publicando…' : 'Publicar y avisar al cliente'}</button>
                <button type="button" className="gw-btn gw-btn-secondary gw-btn-block" disabled={ocupado != null} onClick={() => enviar('guardar')}>{ocupado === 'guardar' ? 'Guardando…' : 'Guardar borrador'}</button>
              </>
            )}
          </PricePanel>
        </fieldset>
        <p className="audit">El cliente verá los trabajos sin montos, el precio del servicio, el transporte y el total. Nunca el desglose ni el precio sugerido.</p>
        {!enVisita && <section className="card stack co-presente" aria-labelledby="co-presente">
          <b id="co-presente" style={{ fontSize: 15 }}>¿El cliente está con usted?</b>
          <span className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>Si está en el local o al teléfono, publique y registre su respuesta en el momento. Si acepta, el adelanto se cobra ahí mismo en Pagos.</span>
          <button type="button" className="gw-btn gw-btn-secondary gw-btn-block" disabled={(editable && !lista) || ocupado != null}
            onClick={() => (editable ? enviar('publicar', () => onResponder(total, descripcion)) : onResponder(a.cotizacion.total ?? total, descripcion))}>
            {editable ? 'Publicar y registrar su respuesta ahora' : 'Registrar su respuesta ahora'}
          </button>
          <Link className="gw-btn gw-btn-ghost gw-btn-block" to="/admin/pagos">Cobrar el adelanto en el local</Link>
        </section>}
      </aside>
    </div>
  );
}
