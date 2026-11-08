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
import { ESTADOS_SOLICITUD, adminSolicitudesApi, type Bandeja, type FichaAdmin, type FilaBandeja } from './adminApi';
import { FichaSolicitud } from './FichaSolicitud';
import { NuevaSolicitudAdmin } from './NuevaSolicitudAdmin';
import './bandeja.css';

const CANAL: Record<string, string> = { web: 'Web', telefono: 'Teléfono', local: 'En persona', correo: 'Correo', mensaje: 'Mensaje de texto' };
const TELA: Record<string, string> = { trae: 'La trae', catalogo: 'Catálogo en línea', local: 'Ver en el local', domicilio: 'Visita a domicilio', sin: 'No lleva' };
const fecha = (iso: string) => { const d = new Date(iso); return `${DIAS[d.getDay()]!.slice(0, 3)} ${d.getDate()} ${MESES[d.getMonth()]!.slice(0, 3)}`; };

/** Lo que pasa con la solicitud en una línea, debajo del estado. */
function detalle(f: FilaBandeja) {
  if (f.esperaFotos) return 'Esperando fotos del cliente';
  if (f.estado === 'En espera de cita') return f.tieneCita ? (f.tela === 'domicilio' ? 'Visita programada' : 'Cita programada') : 'Falta elegir el turno';
  if (f.estado === 'Nueva') return f.archivos ? `${f.archivos} ${f.archivos === 1 ? 'archivo' : 'archivos'} · lista para cotizar` : 'Sin fotos';
  return '';
}

/** A3 Solicitudes: toda solicitud termina cotizada, vencida o descartada con motivo (CU-C02). Datos de la API. */
export function SolicitudesAdminPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [bandeja, setBandeja] = useState<Bandeja | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pestana, setPestana] = useState(0);
  const [busca, setBusca] = useState('');
  // ?ver=SOL-… abre esa ficha (p. ej. desde la Agenda).
  const [sel, setSel] = useState<string | null>(params.get('ver'));
  const [aviso, setAviso] = useState<{ titulo: string; texto: string } | null>(null);
  const creando = params.get('nueva') === '1';
  const ficha = useRef<HTMLElement>(null);

  const cargar = useCallback(() => {
    setError(null);
    adminSolicitudesApi.bandeja()
      .then((b) => { setBandeja(b); setSel((s) => s ?? b.solicitudes[0]?.codigo ?? null); })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No pudimos cargar las solicitudes.'));
  }, []);
  useEffect(cargar, [cargar]);

  const abrirNueva = (si: boolean) => setParams(si ? { nueva: '1' } : {}, { replace: true });

  const estado = pestana === 0 ? null : ESTADOS_SOLICITUD[pestana - 1];
  const texto = normalizar(busca.trim());
  const todas = bandeja?.solicitudes ?? [];
  const filas = todas.filter((s) => (!estado || s.estado === estado) && (!texto || normalizar(`${s.codigo} ${s.cliente}`).includes(texto)));
  const atrasadas = todas.filter((s) => s.atrasada).length;

  const elegir = (codigo: string) => {
    setSel(codigo);
    // Con la ficha debajo de la tabla (pantallas angostas), se lleva la vista hasta ella.
    const r = ficha.current?.getBoundingClientRect();
    if (r && r.top > window.innerHeight * 0.6) ficha.current?.scrollIntoView({ block: 'start' });
  };

  /** Tras un cambio en la ficha (descarte, cita), la fila de la bandeja se actualiza. */
  const alCambiar = (f: FichaAdmin) => {
    setBandeja((b) => b && { ...b, solicitudes: b.solicitudes.map((x) => (x.codigo === f.codigo ? { ...x, estado: f.estado, esperaFotos: f.esperaFotos, tieneCita: f.cita?.estado === 'Programada', atrasada: x.atrasada && f.estado === 'Nueva' } : x)) });
    cargar();
  };

  return (
    <>
      <TopAdmin crumb="Comercial › Solicitudes" titulo="Solicitudes">
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <label className="search sl-search">
            <Icon name="search" size={18} />
            <input type="search" aria-label="Buscar por cliente o código" placeholder="Buscar por cliente o código" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
          <button type="button" className="gw-btn gw-btn-primary" onClick={() => { abrirNueva(true); setAviso(null); }}>+ Nueva solicitud</button>
        </div>
      </TopAdmin>

      {atrasadas > 0 && !creando && bandeja && (
        <div className="sl-late">
          <Icon name="clock" size={18} />
          <span>
            <b>{atrasadas === 1 ? `1 solicitud nueva lleva ${bandeja.diasAtraso} días o más sin atender` : `${atrasadas} solicitudes nuevas llevan ${bandeja.diasAtraso} días o más sin atender`}</b>
            {' '}· Ninguna solicitud se pierde: toda debe terminar cotizada, vencida o descartada con motivo (RN-C04).
          </span>
          <button type="button" className="gw-btn gw-btn-sm gw-btn-secondary" onClick={() => setPestana(1)}>Ver nuevas</button>
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
          <Tabs
            label="Filtrar por estado"
            active={pestana}
            onChange={setPestana}
            items={[{ label: 'Todas', count: todas.length }, ...ESTADOS_SOLICITUD.map((e) => ({ label: e, count: bandeja.conteo[e] ?? 0 }))]}
          />
          <div className="split sl-split">
            <div className="wide">
              {filas.length > 0 ? (
                <div className="tbl-box">
                  <table className="t sl-t">
                    <thead><tr><th>Código</th><th>Cliente</th><th>Mueble y tela</th><th>Estado</th><th>Recibida</th></tr></thead>
                    <tbody>
                      {filas.map((s) => (
                        <tr key={s.codigo} className={sel === s.codigo ? 'sel' : undefined} style={{ cursor: 'pointer' }} onClick={() => elegir(s.codigo)}>
                          <td className="sl-nw"><button type="button" className="sl-cod" aria-pressed={sel === s.codigo}>{s.codigo}</button></td>
                          <td><b className="sl-nw">{s.cliente}</b><div className="muted sl-s">{s.ciudad ?? '—'}</div></td>
                          <td><b style={{ fontWeight: 600 }}>{s.muebles.join(', ')}</b><div className="muted sl-s">{TELA[s.tela]}</div></td>
                          <td><StatusChip status={s.estado} /><div className="muted sl-s" style={{ marginTop: 4 }}>{detalle(s)}</div></td>
                          <td className="sl-nw">
                            <span className={s.atrasada ? 'sl-age' : undefined}>{s.atrasada ? `${fecha(s.fecha)} · hace ${s.dias} días` : fecha(s.fecha)}</span>
                            <div className="muted sl-s">{CANAL[s.canal] ?? s.canal}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : texto ? (
                <EmptyState icon="search" title="Sin resultados">No hay solicitudes con «{busca.trim()}» en este estado.</EmptyState>
              ) : (
                <EmptyState icon="inbox" title="No hay solicitudes en este estado">Cuando un cliente envíe una solicitud, o la registre usted por teléfono, aparecerá aquí.</EmptyState>
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
