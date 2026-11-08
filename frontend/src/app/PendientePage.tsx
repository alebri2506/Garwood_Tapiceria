import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../shared/ui/EmptyState';
import { useAuth } from './auth/AuthProvider';

/** Marcador de una pantalla del diseño que aún no se implementa. */
export function PendientePage({ titulo, conCerrarSesion }: { titulo: string; conCerrarSesion?: boolean }) {
  const { salir } = useAuth();
  const navigate = useNavigate();
  return (
    <div style={{ width: '100%', maxWidth: 520, margin: '48px auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <EmptyState icon="info" title={titulo}>Esta pantalla aún no está implementada.</EmptyState>
      {conCerrarSesion && (
        <button
          type="button"
          className="gw-btn gw-btn-secondary gw-btn-block"
          onClick={async () => { await salir(); navigate('/acceso', { replace: true }); }}
        >
          Cerrar sesión
        </button>
      )}
    </div>
  );
}
