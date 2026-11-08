import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useOutletContext } from 'react-router-dom';
import { useAuth } from '../../../app/auth/AuthProvider';
import { ApiError } from '../../../shared/api/http';
import { solicitudApi, type SolicitudCliente } from '../solicitud/solicitudApi';
import { PEDIDOS_ANTERIORES, PEDIDOS_EN_CURSO } from './datos';
import './pedidos.css';

interface MisPedidosContexto {
  /** Las solicitudes del cliente con sesión (W6c), desde la API. */
  solicitudes: SolicitudCliente[];
  cargando: boolean;
  error: string | null;
  /** Reemplaza una solicitud tras subir las fotos pedidas. */
  actualizar(s: SolicitudCliente): void;
  recargar(): void;
}

export const useMisPedidos = () => useOutletContext<MisPedidosContexto>();

const pestana = ({ isActive }: { isActive: boolean }) => (isActive ? 'on' : undefined);

/** W6 Mis pedidos: encabezado y pestañas comunes a W6c, W6a y W6b. */
export function MisPedidosLayout() {
  const { sesion } = useAuth();
  const nombre = sesion?.usuario.nombre.split(/\s+/)[0] ?? '';
  const [solicitudes, setSolicitudes] = useState<SolicitudCliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pestanas = useRef<HTMLElement>(null);
  const { pathname } = useLocation();

  const recargar = useCallback(() => {
    setCargando(true);
    setError(null);
    solicitudApi.mias()
      .then(setSolicitudes)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Intente de nuevo en unos minutos.'))
      .finally(() => setCargando(false));
  }, []);
  useEffect(recargar, [recargar]);

  // En el celular las pestañas se desplazan: la activa siempre queda a la vista.
  useEffect(() => {
    const nav = pestanas.current;
    const activa = nav?.querySelector<HTMLElement>('a.on');
    if (nav && activa) nav.scrollLeft = activa.offsetLeft - nav.offsetLeft - (nav.clientWidth - activa.offsetWidth) / 2;
  }, [pathname]);

  const abiertas = solicitudes.filter((s) => s.estado !== 'Descartada' && s.estado !== 'Vencida').length;

  return (
    <>
      <div className="mp-head"><div><div className="crumb">Hola, {nombre}</div><h1>Mis pedidos</h1></div></div>
      <nav ref={pestanas} className="tabsx" aria-label="Mis pedidos">
        <NavLink to="/cliente/pedidos/solicitudes" className={pestana}>Solicitudes y cotizaciones <span>{cargando ? '…' : abiertas}</span></NavLink>
        <NavLink to="/cliente/pedidos" end className={pestana}>En curso <span>{PEDIDOS_EN_CURSO.length}</span></NavLink>
        <NavLink to="/cliente/pedidos/anteriores" className={pestana}>Anteriores <span>{PEDIDOS_ANTERIORES.length}</span></NavLink>
      </nav>
      <Outlet
        context={{
          solicitudes, cargando, error, recargar,
          actualizar: (s: SolicitudCliente) => setSolicitudes((x) => x.map((y) => (y.codigo === s.codigo ? s : y))),
        } satisfies MisPedidosContexto}
      />
    </>
  );
}
