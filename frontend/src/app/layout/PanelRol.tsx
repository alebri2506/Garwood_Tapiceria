import { Outlet, useNavigate } from 'react-router-dom';
import { NOMBRE_ROL } from '../../shared/api/sesion';
import { useAuth } from '../auth/AuthProvider';
import './panel-rol.css';

/** Marco común de las vistas por rol: marca, rol, usuario y salida. Cada rol pone sus pantallas en el Outlet. */
export function PanelRol() {
  const { sesion, salir } = useAuth();
  const navigate = useNavigate();
  if (!sesion) return null;

  const cerrar = async () => {
    await salir();
    navigate('/acceso', { replace: true });
  };

  return (
    <div className="panel-rol">
      <header className="panel-top">
        <div className="panel-brand">
          <b>GARWEB</b>
          <span>{NOMBRE_ROL[sesion.usuario.rol]}</span>
        </div>
        <div className="panel-user">
          <span>{sesion.usuario.nombre}</span>
          <button type="button" className="gw-btn gw-btn-on-dark gw-btn-sm" onClick={cerrar}>Cerrar sesión</button>
        </div>
      </header>
      <main className="panel-main">
        <Outlet />
      </main>
    </div>
  );
}
