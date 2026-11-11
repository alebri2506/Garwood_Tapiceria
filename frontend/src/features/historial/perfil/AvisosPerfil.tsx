import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { perfilApi, type Perfil } from './perfilApi';

/**
 * W10 › Avisos por correo (decisiones E.3, simplificado por el equipo el 10/11): un solo interruptor para los avisos
 * informativos. Los obligatorios (citas, recojos, entregas…) llegan siempre y la campana muestra todo.
 * Se guarda al tocarlo.
 */
export function AvisosPerfil({ avisos, onCambio }: { avisos: Perfil['avisos']; onCambio(a: Perfil['avisos']): void }) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cambiar = async () => {
    const informativos = !avisos.informativos;
    setGuardando(true);
    setError(null);
    onCambio({ ...avisos, informativos }); // se ve al instante; si falla, vuelve como estaba
    try {
      onCambio((await perfilApi.guardarAvisos({ informativos })).avisos);
    } catch (e) {
      onCambio(avisos);
      setError(e instanceof ApiError ? e.message : 'No pudimos guardar el cambio. Intente de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="card stack" aria-labelledby="pf-avisos">
      <h2 id="pf-avisos" style={{ fontSize: 18 }}>Avisos por correo</h2>
      <div className="pf-sw">
        <span id="pf-sw-informativos">Avance de mis pedidos, cotizaciones y pagos</span>
        <button
          type="button" role="switch" aria-checked={avisos.informativos} aria-labelledby="pf-sw-informativos"
          className={avisos.informativos ? 'pf-tg on' : 'pf-tg'} disabled={guardando} onClick={cambiar}
        />
      </div>
      <p className="muted pf-chico">Los avisos de citas, recojos y entregas siempre le llegan.</p>
      {error && <Alert tone="danger" compact>{error}</Alert>}
      <Link to="/cliente/notificaciones" style={{ fontSize: 14, fontWeight: 600 }}>Ver mis notificaciones</Link>
    </section>
  );
}
