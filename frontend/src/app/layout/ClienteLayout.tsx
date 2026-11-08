import { Link, NavLink, Outlet } from 'react-router-dom';
import { Icon } from '../../shared/ui/Icon';
import { useAuth } from '../auth/AuthProvider';
import { useSinLeer } from '../../features/notificaciones/notificacionesApi';
import '../../features/notificaciones/notificaciones.css';
import './cliente.css';

const iniciales = (nombre: string) =>
  nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

/** Portal del cliente (web adaptable): barra superior de las pantallas W del diseño. */
export function ClienteLayout() {
  const { sesion } = useAuth();
  const sinLeer = useSinLeer();
  if (!sesion) return null;

  return (
    <div className="wp">
      <header className="wtop">
        <div className="wtop-in">
          <Link className="wbrand" to="/cliente/pedidos"><b>Garwood</b><span>Tapicería de Interiores</span></Link>
          <nav className="wnav" aria-label="Portal del cliente">
            <NavLink to="/cliente/pedidos" className={({ isActive }) => (isActive ? 'on' : undefined)}>Mis pedidos</NavLink>
            <NavLink to="/cliente/reclamos" className={({ isActive }) => (isActive ? 'on' : undefined)}>Reclamos</NavLink>
          </nav>
          <Link className="gw-btn gw-btn-on-dark gw-btn-sm" to="/cliente/solicitud">+ Nueva solicitud</Link>
          <Link className="wbell" to="/cliente/notificaciones" aria-label={sinLeer ? `Notificaciones, ${sinLeer} sin leer` : 'Notificaciones'}>
            <Icon name="bell" size={20} />{sinLeer > 0 && <span className="wbell-n" aria-hidden="true">{sinLeer > 9 ? '9+' : sinLeer}</span>}
          </Link>
          <Link className="wav" to="/cliente/perfil" aria-label={`Mi perfil (${sesion.usuario.nombre})`}>{iniciales(sesion.usuario.nombre)}</Link>
        </div>
      </header>
      <main className="wmain">
        <Outlet />
      </main>
    </div>
  );
}
