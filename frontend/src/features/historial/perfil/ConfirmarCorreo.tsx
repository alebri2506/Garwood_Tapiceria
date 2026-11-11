import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../app/auth/AuthProvider';
import { ApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { perfilApi } from './perfilApi';

/**
 * W10 (decisiones E.1.4): se llega desde el enlace enviado al correo nuevo. Pide un clic en vez de confirmar al abrir:
 * algunos programas de correo abren los enlaces solos para revisarlos, y así no se cambia sin que la persona lo haga.
 */
export function ConfirmarCorreo({ token }: { token: string | null }) {
  const navigate = useNavigate();
  const { sesion } = useAuth();
  const [listo, setListo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const seguir = () => navigate(sesion ? '/cliente/perfil' : '/acceso', { replace: true });

  if (!token) {
    return (
      <>
        <EmptyState icon="alert" title="Enlace incompleto">Abra el enlace tal como llegó al correo nuevo, o vuelva a pedir el cambio desde Mi perfil.</EmptyState>
        <button type="button" className="gw-btn gw-btn-secondary gw-btn-block" onClick={seguir}>Volver a GARWEB</button>
      </>
    );
  }
  if (listo) {
    return (
      <>
        <EmptyState icon="check" title="Correo confirmado">{listo}</EmptyState>
        <button type="button" className="gw-btn gw-btn-primary gw-btn-lg gw-btn-block" onClick={seguir}>{sesion ? 'Volver a Mi perfil' : 'Iniciar sesión'}</button>
      </>
    );
  }

  const confirmar = async () => {
    setEnviando(true);
    setError(null);
    try {
      setListo((await perfilApi.confirmarCorreo(token)).mensaje);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos confirmar el correo. Intente de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="stack">
      <h2>Confirme su correo nuevo</h2>
      <p className="muted" style={{ fontSize: 14, lineHeight: '21px' }}>
        Pidió usar este correo para entrar a GARWEB. Al confirmarlo, el correo anterior deja de servir para iniciar sesión.
      </p>
      {error && <Alert tone="danger" compact>{error}</Alert>}
      <button type="button" className="gw-btn gw-btn-primary gw-btn-lg gw-btn-block" onClick={confirmar} disabled={enviando}>
        {enviando ? 'Confirmando…' : 'Confirmar mi correo'}
      </button>
      <button type="button" className="gw-btn gw-btn-ghost gw-btn-block" onClick={seguir}>Ahora no</button>
    </div>
  );
}
