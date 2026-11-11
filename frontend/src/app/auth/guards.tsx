import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { INICIO_POR_ROL, RUTA_CAMBIO_CONTRASENA, type Rol } from '../../shared/api/sesion';
import { useAuth } from './AuthProvider';

function Comprobando() {
  return <p role="status" className="muted" style={{ padding: 32, textAlign: 'center' }}>Cargando…</p>;
}

/**
 * RG-07: solo deja pasar a los roles indicados. Sin sesión → al acceso (recordando a dónde iba);
 * con otro rol → a la vista de su propio rol; con contraseña temporal → a crear una propia (D.1.3).
 * Es solo navegación: la API vuelve a comprobar el rol (y la contraseña temporal) en cada petición.
 */
export function RutaRol({ roles }: { roles: Rol[] }) {
  const { sesion, cargando } = useAuth();
  const location = useLocation();
  if (cargando) return <Comprobando />;
  if (!sesion) return <Navigate to="/acceso" replace state={{ desde: location.pathname }} />;
  if (sesion.usuario.debeCambiarContrasena) return <Navigate to={RUTA_CAMBIO_CONTRASENA} replace />;
  if (!roles.includes(sesion.usuario.rol)) return <Navigate to={INICIO_POR_ROL[sesion.usuario.rol]} replace />;
  return <Outlet />;
}

/** Acceso y registro: quien ya tiene sesión va directo a su vista (o a cambiar su contraseña temporal). */
export function SoloInvitado() {
  const { sesion, cargando } = useAuth();
  if (cargando) return <Comprobando />;
  if (sesion) return <Navigate to={sesion.usuario.debeCambiarContrasena ? RUTA_CAMBIO_CONTRASENA : INICIO_POR_ROL[sesion.usuario.rol]} replace />;
  return <Outlet />;
}

/** D.1.3: la pantalla de cambio obligatorio, solo para quien entró con una contraseña temporal. */
export function SoloContrasenaTemporal() {
  const { sesion, cargando } = useAuth();
  if (cargando) return <Comprobando />;
  if (!sesion) return <Navigate to="/acceso" replace />;
  if (!sesion.usuario.debeCambiarContrasena) return <Navigate to={INICIO_POR_ROL[sesion.usuario.rol]} replace />;
  return <Outlet />;
}
