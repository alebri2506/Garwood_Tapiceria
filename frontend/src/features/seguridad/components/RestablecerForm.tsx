import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { TextField } from '../../../shared/ui/TextField';
import { Alert } from '../../../shared/ui/Alert';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ApiError } from '../../../shared/api/http';
import { authApi } from '../api/authApi';
import { restablecerSchema, type RestablecerForm as RestablecerValues } from '../schemas';

/** CU-S02 Recuperar contraseña (paso 2): se llega desde el enlace del correo. */
export function RestablecerForm({ token }: { token: string | null }) {
  const navigate = useNavigate();
  const [listo, setListo] = useState(false);
  const [errorApi, setErrorApi] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RestablecerValues>({
    resolver: zodResolver(restablecerSchema),
    defaultValues: { contrasena: '', confirmacion: '' },
  });

  const irALogin = () => navigate('/acceso', { replace: true });

  if (!token) {
    return (
      <>
        <EmptyState icon="alert" title="Enlace incompleto">
          Abra el enlace tal como llegó en el correo, o pida uno nuevo.
        </EmptyState>
        <button type="button" className="gw-btn gw-btn-secondary gw-btn-block" onClick={irALogin}>Volver a iniciar sesión</button>
      </>
    );
  }

  if (listo) {
    return (
      <>
        <EmptyState icon="check" title="Contraseña actualizada">Ya puede iniciar sesión con su nueva contraseña.</EmptyState>
        <button type="button" className="gw-btn gw-btn-primary gw-btn-lg gw-btn-block" onClick={irALogin}>Iniciar sesión</button>
      </>
    );
  }

  const onSubmit = handleSubmit(async ({ contrasena }) => {
    setErrorApi(null);
    try {
      await authApi.restablecerContrasena(token, contrasena);
      setListo(true);
    } catch (e) {
      setErrorApi(e instanceof ApiError ? e.message : 'Ocurrió un error inesperado. Intente de nuevo.');
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <h2>Crear nueva contraseña</h2>
      <p className="muted" style={{ fontSize: 14, lineHeight: '21px' }}>
        Use 8 caracteres o más, con al menos un número.
      </p>
      <TextField
        label="Nueva contraseña"
        type="password"
        autoComplete="new-password"
        autoFocus
        error={errors.contrasena?.message}
        {...register('contrasena')}
      />
      <TextField
        label="Repita la contraseña"
        type="password"
        autoComplete="new-password"
        error={errors.confirmacion?.message}
        {...register('confirmacion')}
      />
      {errorApi && <Alert tone="danger" compact>{errorApi}</Alert>}
      <button type="submit" className="gw-btn gw-btn-primary gw-btn-lg gw-btn-block" disabled={isSubmitting}>
        {isSubmitting ? 'Guardando…' : 'Guardar contraseña'}
      </button>
      <button type="button" className="gw-btn gw-btn-ghost gw-btn-block" onClick={irALogin}>Volver a iniciar sesión</button>
    </form>
  );
}
