import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { INICIO_POR_ROL, type Rol } from '../../shared/api/sesion';
import { useAuth } from './AuthProvider';

function Comprobando() {
  return <p role="status" className="muted" style={{ padding: 32, textAlign: 'center' }}>Cargando…</p>;
}

/**
 * RG-07: solo deja pasar a los roles indicados. Sin sesión → al acceso (recordando a dónde iba);
 * con otro rol → a la vista de su propio rol.
 * Es solo navegación: la API vuelve a comprobar el rol en cada petición.
 */
export function RutaRol({ roles }: { roles: Rol[] }) {
  const { sesion, cargando } = useAuth();
  const location = useLocation();
  if (cargando) return <Comprobando />;
  if (!sesion) return <Navigate to="/acceso" replace state={{ desde: location.pathname }} />;
  if (!roles.includes(sesion.usuario.rol)) return <Navigate to={INICIO_POR_ROL[sesion.usuario.rol]} replace />;
  return <Outlet />;
}

/** Acceso y registro: quien ya tiene sesión va directo a su vista. */
export function SoloInvitado() {
  const { sesion, cargando } = useAuth();
  if (cargando) return <Comprobando />;
  if (sesion) return <Navigate to={INICIO_POR_ROL[sesion.usuario.rol]} replace />;
  return <Outlet />;
}
