import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../shared/api/http';
import { Alert } from '../../shared/ui/Alert';
import { EmptyState } from '../../shared/ui/EmptyState';
import { Icon, type IconName } from '../../shared/ui/Icon';
import { avisosCambiaron, notificacionesApi, type Notificacion } from './notificacionesApi';
import './notificaciones.css';

/** Ícono y color por tipo de aviso. */
function aspecto(tipo: string): { icono: IconName; tono: 'info' | 'ok' | 'warn' | 'bad'; grupo: string } {
  if (tipo.startsWith('cita') || tipo === 'solicitud_vencida') return { icono: 'calendar', tono: tipo.includes('inasistencia') || tipo === 'solicitud_vencida' ? 'warn' : 'info', grupo: 'Citas y visitas' };
  if (tipo === 'fotos_recibidas') return { icono: 'image', tono: 'ok', grupo: 'Solicitudes' };
  if (tipo === 'solicitud_descartada') return { icono: 'x', tono: 'bad', grupo: 'Solicitudes' };
  return { icono: 'inbox', tono: 'info', grupo: 'Solicitudes' };
}
const cuando = (iso: string) => new Date(iso).toLocaleString('es-US', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** W11 Notificaciones (RG-05): lo mismo que le llegó por correo, con enlace a donde se atiende. */
export function NotificacionesPage() {
  const [lista, setLista] = useState<Notificacion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('Todas');

  useEffect(() => {
    notificacionesApi.listar().then((b) => setLista(b.notificaciones)).catch((e) => setError(e instanceof ApiError ? e.message : 'No pudimos cargar sus avisos.'));
  }, []);

  const leer = (n: Notificacion) => {
    if (n.leida) return;
    setLista((l) => l?.map((x) => (x.id === n.id ? { ...x, leida: true } : x)) ?? null);
    notificacionesApi.leida(n.id).then(avisosCambiaron).catch(() => undefined);
  };
  const leerTodas = () => {
    setLista((l) => l?.map((x) => ({ ...x, leida: true })) ?? null);
    notificacionesApi.leerTodas().then(avisosCambiaron).catch(() => undefined);
  };

  const todas = lista ?? [];
  const FILTROS: [string, (n: Notificacion) => boolean][] = [
    ['Todas', () => true],
    ['No leídas', (n) => !n.leida],
    ['Solicitudes', (n) => aspecto(n.tipo).grupo === 'Solicitudes'],
    ['Citas y visitas', (n) => aspecto(n.tipo).grupo === 'Citas y visitas'],
  ];
  const visibles = todas.filter(FILTROS.find(([f]) => f === filtro)![1]);

  return (
    <>
      <div className="whead">
        <div><div className="crumb">También le llegan por correo · <Link to="/cliente/perfil">preferencias</Link></div><h1>Notificaciones</h1></div>
        <button type="button" className="gw-btn gw-btn-secondary" disabled={!todas.some((n) => !n.leida)} onClick={leerTodas}>Marcar todas como leídas</button>
      </div>
      {error && <Alert tone="danger" title="No pudimos cargar sus avisos">{error}</Alert>}
      {!lista && !error && <p className="muted" role="status">Cargando avisos…</p>}
      {lista && (
        <div className="wcols">
          <aside className="wr nt-filtros">
            <div className="card nt-flt" role="group" aria-label="Filtrar avisos">
              {FILTROS.map(([f, ok]) => (
                <button key={f} type="button" aria-pressed={filtro === f} className={filtro === f ? 'on' : undefined} onClick={() => setFiltro(f)}>
                  <span>{f}</span><span className="num">{todas.filter(ok).length}</span>
                </button>
              ))}
            </div>
          </aside>
          <div className="wl">
            <div className="card nt-lista">
              {visibles.map((n) => {
                const a = aspecto(n.tipo);
                const contenido = (
                  <>
                    <span className={`nt-ic nt-${a.tono}`}><Icon name={a.icono} /></span>
                    <span><b>{n.titulo}</b><p>{n.mensaje}</p></span>
                    <small>{cuando(n.fecha)}</small>
                  </>
                );
                return n.enlace
                  ? <Link key={n.id} className={n.leida ? 'nt' : 'nt nt-nueva'} to={n.enlace} onClick={() => leer(n)}>{contenido}</Link>
                  : <button key={n.id} type="button" className={n.leida ? 'nt' : 'nt nt-nueva'} onClick={() => leer(n)}>{contenido}</button>;
              })}
              {visibles.length === 0 && <div style={{ padding: 24 }}><EmptyState icon="check" title="Está al día">No hay avisos en este filtro.</EmptyState></div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
