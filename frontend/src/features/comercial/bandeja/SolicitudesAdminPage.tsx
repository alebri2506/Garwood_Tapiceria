import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TopAdmin } from '../../../app/layout/AdminLayout';
import { ApiError } from '../../../shared/api/http';
import { normalizar } from '../../../shared/texto';
import { Alert } from '../../../shared/ui/Alert';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { Icon } from '../../../shared/ui/Icon';
import { StatusChip } from '../../../shared/ui/StatusChip';
import { Tabs } from '../../../shared/ui/Tabs';
import { Toast } from '../../../shared/ui/Toast';
import { DIAS, MESES } from '../fechas';
import { ETAPAS, adminSolicitudesApi, type Bandeja, type Etapa, type FichaAdmin, type FilaBandeja } from './adminApi';
import { FichaSolicitud } from './FichaSolicitud';
import { NuevaSolicitudAdmin } from './NuevaSolicitudAdmin';
import './bandeja.css';

const CANAL: Record<string, string> = { web: 'Web', telefono: 'Teléfono', local: 'En persona', correo: 'Correo', mensaje: 'Mensaje de texto' };
const TELA: Record<string, string> = { trae: 'La trae el cliente', catalogo: 'Telas en línea', local: 'Ver en el local', domicilio: 'Visita a domicilio', sin: 'No lleva tela' };
/** Pestañas: Todas + las 4 etapas. Se puede abrir una con ?etapa=por-cotizar (p. ej. desde A2b o A4). */
const PESTANAS = ['Todas', ...ETAPAS] as const;
const SLUG: Record<string, number> = { 'cita-visita': 1, 'por-cotizar': 2, 'esperando-al-cliente': 3, cerradas: 4 };
const AYUDA = [
  'Todo el camino de cada solicitud hasta que el cliente acepta: después pasa a Pedidos.',
  'Esperan su cita en el local o su visita a domicilio.',
  'Ya tienen lo necesario: arme y publique la cotización.',
  'Cotización enviada: falta la respuesta del cliente o su adelanto.',
  'Aceptadas (ya son pedido), rechazadas, vencidas o descartadas.',
];
const TONO: Record<string, 'info' | 'success' | 'progress' | 'danger' | 'neutral'> = {
  'Nueva': 'info', 'En espera de cita': 'info', 'En espera de visita': 'info', 'Atendida': 'success', 'Esperando respuesta': 'progress',
  'Aceptada': 'success', 'Rechazada': 'danger', 'Vencida': 'neutral', 'Descartada': 'danger',
};
const FECHAS = ['Todas', 'Hoy', 'Últimos 7 días', 'Este mes', 'Rango'] as const;

const isoDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fechaLarga = (iso: string) => { const d = new Date(iso); return `${DIAS[d.getDay()]!.slice(0, 3)} ${d.getDate()} ${MESES[d.getMonth()]!.slice(0, 3)} ${d.getFullYear()}`; };
const dia = (iso: string) => { const [y, m, dd] = iso.split('-').map(Number); const d = new Date(y!, m! - 1, dd!); return `${DIAS[d.getDay()]!.slice(0, 3)} ${dd} ${MESES[m! - 1]!.slice(0, 3)}`; };

/** Rango de fechas de solicitud según el chip elegido (días del negocio, ambos incluidos). */
function rangoDe(i: number, d1: string, d2: string): { desde?: string; hasta?: string } {
  const hoy = new Date();
  if (i === 1) return { desde: isoDe(hoy), hasta: isoDe(hoy) };
  if (i === 2) { const d = new Date(hoy); d.setDate(d.getDate() - 7); return { desde: isoDe(d), hasta: isoDe(hoy) }; }
  if (i === 3) return { desde: isoDe(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: isoDe(hoy) };
  if (i === 4) return { desde: d1 || undefined, hasta: d2 || undefined };
  return {};
}

/** Lo que pasa con la solicitud en una línea, debajo del estado. */
function detalle(f: FilaBandeja) {
  if (f.esperaFotos) return 'Esperando fotos del cliente';
  if (f.estado === 'En espera de cita') {
    if (!f.cita) return f.tela === 'domicilio' ? 'Falta elegir el día de la visita' : 'Falta elegir el turno';
    const hoy = isoDe(new Date());
    const cuando = f.cita.fecha === hoy ? 'hoy' : dia(f.cita.fecha);
    return `${f.cita.tipo === 'domicilio' ? 'Visita' : 'Cita'} ${cuando}${f.cita.hora ? ` · ${f.cita.hora}` : f.cita.franja ? ` · ${f.cita.franja === 'manana' ? 'mañana' : 'tarde'}` : ''}`;
  }
  if (f.estado === 'Nueva') return f.canal === 'web' ? 'Cotizar con fotos' : 'Registrada por el Administrador';
  if (f.estado === 'Atendida') return 'Cita o visita hecha · por cotizar';
  return '';
}

/**
 * A3 Solicitudes y cotizaciones (CU-C01, C02): cada solicitud avanza por 4 etapas, una por pestaña, y su ficha trae
 * un solo botón con lo que toca hacer. Toda solicitud termina aceptada, rechazada, vencida o descartada con motivo.
 */
export function SolicitudesAdminPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [bandeja, setBandeja] = useState<Bandeja | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pestana, setPestana] = useState(SLUG[params.get('etapa') ?? ''] ?? 0);
  const [busca, setBusca] = useState('');
  const [fechas, setFechas] = useState(0);
  const [d1, setD1] = useState('');
  const [d2, setD2] = useState('');
  // ?ver=SOL-… abre esa ficha (p. ej. desde la Agenda).
  const [sel, setSel] = useState<string | null>(params.get('ver'));
  const [aviso, setAviso] = useState<{ titulo: string; texto: string } | null>(null);
  const creando = params.get('nueva') === '1';
  const ficha = useRef<HTMLElement>(null);

  const cargar = useCallback(() => {
    setError(null);
    adminSolicitudesApi.bandeja(rangoDe(fechas, d1, d2))
      .then((b) => { setBandeja(b); setSel((s) => s ?? b.solicitudes[0]?.codigo ?? null); })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No pudimos cargar las solicitudes.'));
  }, [fechas, d1, d2]);
  useEffect(cargar, [cargar]);

  const abrirNueva = (si: boolean) => setParams(si ? { nueva: '1' } : {}, { replace: true });

  const texto = normalizar(busca.trim());
  const todas = (bandeja?.solicitudes ?? []).filter((s) => !texto || normalizar(`${s.codigo} ${s.cliente} ${s.muebles.join(' ')}`).includes(texto));
  const etapa: Etapa | null = pestana === 0 ? null : ETAPAS[pestana - 1]!;
  const filas = todas.filter((s) => !etapa || s.etapa === etapa);
  const cuenta = (e: Etapa) => todas.filter((s) => s.etapa === e).length;
  const atrasadas = todas.filter((s) => s.atrasada).length;

  const elegir = (codigo: string) => {
    setSel(codigo);
    // Con la ficha debajo de la tabla (pantallas angostas), se lleva la vista hasta ella.
    const r = ficha.current?.getBoundingClientRect();
    if (r && r.top > window.innerHeight * 0.6) ficha.current?.scrollIntoView({ block: 'start' });
  };

  /** Tras un cambio en la ficha (descarte, cita), la fila se actualiza y se recarga la bandeja. */
  const alCambiar = (f: FichaAdmin) => {
    setBandeja((b) => b && { ...b, solicitudes: b.solicitudes.map((x) => (x.codigo === f.codigo ? { ...x, estado: f.estado, estadoVisible: f.estadoVisible, etapa: f.etapa, esperaFotos: f.esperaFotos, atrasada: x.atrasada && f.estado === 'Nueva' } : x)) });
    cargar();
  };

  return (
    <>
      <TopAdmin crumb="Comercial › Solicitudes y cotizaciones" titulo="Solicitudes y cotizaciones">
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <label className="search sl-search">
            <Icon name="search" size={18} />
            <input type="search" aria-label="Buscar solicitud" placeholder="Buscar por cliente, código o mueble" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
          <button type="button" className="gw-btn gw-btn-primary" onClick={() => { abrirNueva(true); setAviso(null); }}>+ Nueva solicitud</button>
        </div>
      </TopAdmin>

      {atrasadas > 0 && !creando && bandeja && (
        <div className="sl-late">
          <Icon name="clock" size={18} />
          <span>
            <b>{atrasadas === 1 ? `1 solicitud nueva lleva ${bandeja.diasAtraso} días o más sin cotizar` : `${atrasadas} solicitudes nuevas llevan ${bandeja.diasAtraso} días o más sin cotizar`}</b>
            {' '}· Ninguna solicitud se pierde: toda debe terminar cotizada, vencida o descartada con motivo (RN-C04).
          </span>
          <button type="button" className="gw-btn gw-btn-sm gw-btn-secondary" onClick={() => { setPestana(2); setFechas(0); }}>Ver nuevas</button>
        </div>
      )}

      {creando && (
        <NuevaSolicitudAdmin
          onIr={navigate}
          onCancelar={() => abrirNueva(false)}
          onRegistrada={(codigo, t) => { abrirNueva(false); setAviso({ titulo: `Solicitud ${codigo} registrada`, texto: t }); setPestana(0); setBusca(''); setSel(codigo); cargar(); }}
        />
      )}
      {aviso && <Toast title={aviso.titulo} onClose={() => setAviso(null)}>{aviso.texto}</Toast>}
      {error && <Alert tone="danger" title="No pudimos cargar las solicitudes">{error} <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" onClick={cargar}>Reintentar</button></Alert>}
      {!bandeja && !error && !creando && <p className="muted" role="status">Cargando solicitudes…</p>}

      {!creando && bandeja && (
        <>
          <div className="sl-kp">
            <button type="button" className="sl-k sl-warn" onClick={() => setPestana(2)}><span className="ov">Por cotizar</span><b>{cuenta('Por cotizar')}</b><small>Listas para armar la cotización</small></button>
            <button type="button" className="sl-k" onClick={() => setPestana(3)}><span className="ov">Esperando al cliente</span><b>{cuenta('Esperando al cliente')}</b><small>Cotización enviada, falta su respuesta</small></button>
            <button type="button" className="sl-k sl-ok" onClick={() => setPestana(4)}><span className="ov">Aceptadas</span><b>{todas.filter((s) => s.estado === 'Aceptada').length}</b><small>Ya son pedido o falta el adelanto</small></button>
          </div>
          <Tabs
            label="Filtrar por etapa"
            active={pestana}
            onChange={setPestana}
            items={PESTANAS.map((p, i) => ({ label: p, count: i === 0 ? todas.length : cuenta(p as Etapa) }))}
          />
          <div className="sl-dfr">
            <span className="ov">Fecha de solicitud</span>
            <div className="sl-chips" role="group" aria-label="Fecha de solicitud">
              {FECHAS.map((l, i) => <button key={l} type="button" className="sl-fchip" aria-pressed={fechas === i} onClick={() => setFechas(i)}>{l}</button>)}
            </div>
            {fechas === 4 && (
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <label className="sl-dfi">Desde<input type="date" value={d1} max={d2 || undefined} onChange={(e) => setD1(e.target.value)} /></label>
                <label className="sl-dfi">Hasta<input type="date" value={d2} min={d1 || undefined} onChange={(e) => setD2(e.target.value)} /></label>
              </div>
            )}
            <span className="muted sl-dfinfo">{todas.length} {todas.length === 1 ? 'solicitud' : 'solicitudes'}</span>
          </div>
          <p className="muted sl-hint">{AYUDA[pestana]}</p>

          <div className="split sl-split">
            <div className="wide">
              {filas.length > 0 ? (
                <div className="tbl-box">
                  <table className="t sl-t">
                    <thead><tr><th>Código</th><th>Cliente</th><th>Mueble y tela</th><th>Etapa y estado</th><th>Fecha de solicitud</th></tr></thead>
                    <tbody>
                      {filas.map((s) => (
                        <tr key={s.codigo} className={sel === s.codigo ? 'sel' : undefined} style={{ cursor: 'pointer' }} onClick={() => elegir(s.codigo)}>
                          <td className="sl-nw"><button type="button" className="sl-cod" aria-pressed={sel === s.codigo}>{s.codigo}</button></td>
                          <td><b className="sl-nw">{s.cliente}</b><div className="muted sl-s">{s.ciudad ?? '—'}</div></td>
                          <td><b style={{ fontWeight: 600 }}>{s.muebles.join(', ')}</b><div className="muted sl-s">{TELA[s.tela]}</div></td>
                          <td>
                            <span className="sl-etapa">{s.etapa}</span>
                            <StatusChip status={s.estadoVisible} tone={TONO[s.estadoVisible]} />
                            <div className="muted sl-s" style={{ marginTop: 4 }}>{detalle(s)}</div>
                          </td>
                          <td className="sl-nw">
                            <b style={{ fontWeight: 600 }}>{fechaLarga(s.fecha)}</b>
                            <div className={s.atrasada ? 'sl-age' : 'muted sl-s'}>{s.hora}{s.dias >= 2 ? ` · hace ${s.dias} días` : s.dias === 1 ? ' · ayer' : ' · hoy'}</div>
                            <div className="muted sl-s">{CANAL[s.canal] ?? s.canal}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : texto ? (
                <EmptyState icon="search" title="Sin resultados">No hay solicitudes con «{busca.trim()}» en esta etapa.</EmptyState>
              ) : (
                <EmptyState icon="inbox" title="No hay solicitudes en esta etapa">
                  {etapa === 'Esperando al cliente'
                    ? 'Aquí aparecen las solicitudes con la cotización enviada, mientras el cliente responde o paga el adelanto.'
                    : 'Cuando un cliente envíe una solicitud, o la registre usted por teléfono, aparecerá aquí.'}
                </EmptyState>
              )}
            </div>
            <aside className="aside">
              {sel && <FichaSolicitud key={sel} ref={ficha} codigo={sel} motivos={bandeja.motivosDescarte} onCambio={alCambiar} />}
            </aside>
          </div>
        </>
      )}
    </>
  );
}
