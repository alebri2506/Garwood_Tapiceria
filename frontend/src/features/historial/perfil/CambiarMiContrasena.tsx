import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { TextField } from '../../../shared/ui/TextField';
import { Alert } from '../../../shared/ui/Alert';
import { ApiError } from '../../../shared/api/http';
import { useAuth } from '../../../app/auth/AuthProvider';
import { authApi } from '../../seguridad/api/authApi';
import { cambioContrasenaSchema, type CambioContrasenaForm } from '../../seguridad/schemas';

/** Aviso que Mi perfil muestra al volver. */
export const AVISO_CONTRASENA = { titulo: 'Contraseña cambiada', texto: 'Cerramos las sesiones abiertas en otros equipos. Le avisamos también por correo.' };

/**
 * W10 › Seguridad (decisiones E.4.1), en una pantalla aparte con el estilo de G1: pide la actual, cierra las sesiones en
 * otros equipos y avisa "Su contraseña cambió" por correo y en la campana. Este equipo sigue con sesión.
 */
export function CambiarMiContrasena() {
  const navigate = useNavigate();
  const { iniciar } = useAuth();
  const [errorApi, setErrorApi] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<CambioContrasenaForm>({
    resolver: zodResolver(cambioContrasenaSchema),
    defaultValues: { actual: '', contrasena: '', confirmacion: '' },
  });
  const volver = () => navigate('/cliente/perfil');

  const onSubmit = handleSubmit(async ({ actual, contrasena }) => {
    setErrorApi(null);
    try {
      iniciar(await authApi.cambiarContrasena(actual, contrasena));
      navigate('/cliente/perfil', { replace: true, state: { aviso: AVISO_CONTRASENA } });
    } catch (e) {
      const campos = e instanceof ApiError ? e.errores : {};
      const primero = (v: unknown) => (Array.isArray(v) ? String(v[0]) : String(v));
      if (campos.actual) setError('actual', { message: primero(campos.actual) });
      else if (campos.contrasena) setError('contrasena', { message: primero(campos.contrasena) });
      else setErrorApi(e instanceof ApiError ? e.message : 'Ocurrió un error inesperado. Intente de nuevo.');
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <h2>Cambiar contraseña</h2>
      <p className="muted" style={{ fontSize: 14, lineHeight: '21px' }}>
        Use 8 caracteres o más, con al menos un número. Al guardarla se cierran las sesiones abiertas en otros equipos.
      </p>
      <TextField label="Contraseña actual" type="password" autoComplete="current-password" autoFocus error={errors.actual?.message} {...register('actual')} />
      <TextField label="Nueva contraseña" type="password" autoComplete="new-password" error={errors.contrasena?.message} {...register('contrasena')} />
      <TextField label="Repita la nueva contraseña" type="password" autoComplete="new-password" error={errors.confirmacion?.message} {...register('confirmacion')} />
      {errorApi && <Alert tone="danger" compact>{errorApi}</Alert>}
      <button type="submit" className="gw-btn gw-btn-primary gw-btn-lg gw-btn-block" disabled={isSubmitting}>
        {isSubmitting ? 'Guardando…' : 'Guardar contraseña'}
      </button>
      <button type="button" className="gw-btn gw-btn-ghost gw-btn-block" onClick={volver}>Volver a Mi perfil</button>
    </form>
  );
}
