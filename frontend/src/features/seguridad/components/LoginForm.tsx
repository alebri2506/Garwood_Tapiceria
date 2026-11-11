import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocation, useNavigate } from 'react-router-dom';
import { TextField } from '../../../shared/ui/TextField';
import { Alert } from '../../../shared/ui/Alert';
import { ApiError } from '../../../shared/api/http';
import { RUTA_CAMBIO_CONTRASENA, destinoTrasIngreso } from '../../../shared/api/sesion';
import { useAuth } from '../../../app/auth/AuthProvider';
import { authApi } from '../api/authApi';
import { loginSchema, type LoginForm as LoginValues } from '../schemas';

/** CU-S01 Iniciar sesión: un solo formulario para clientes y personal. */
export function LoginForm({ onOlvido }: { onOlvido: () => void }) {
  const navigate = useNavigate();
  const desde = (useLocation().state as { desde?: string } | null)?.desde;
  const { iniciar } = useAuth();
  const [errorApi, setErrorApi] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identificador: '', contrasena: '', recordarme: true },
  });

  const onSubmit = handleSubmit(async (credenciales) => {
    setErrorApi(null);
    try {
      const sesion = await authApi.iniciarSesion(credenciales);
      iniciar(sesion);
      // Con una contraseña temporal, primero crea una propia (D.1.3); si no, cada rol entra a su vista (RG-07).
      navigate(sesion.usuario.debeCambiarContrasena ? RUTA_CAMBIO_CONTRASENA : destinoTrasIngreso(sesion.usuario.rol, desde), { replace: true });
    } catch (e) {
      setErrorApi(e instanceof ApiError ? e.message : 'Ocurrió un error inesperado. Intente de nuevo.');
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <h2>Iniciar sesión</h2>
      <TextField
        label="Correo o usuario"
        autoComplete="username"
        autoFocus
        error={errors.identificador?.message}
        {...register('identificador')}
      />
      <TextField
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        error={errors.contrasena?.message}
        {...register('contrasena')}
      />
      <div className="between">
        <label className="row remember">
          <input type="checkbox" {...register('recordarme')} /> Recordarme
        </label>
        <button type="button" className="gw-btn gw-btn-ghost gw-btn-sm" onClick={onOlvido}>
          ¿Olvidó su contraseña?
        </button>
      </div>
      <button type="submit" className="gw-btn gw-btn-primary gw-btn-lg gw-btn-block" disabled={isSubmitting}>
        {isSubmitting ? 'Ingresando…' : 'Ingresar'}
      </button>
      {errorApi && (
        <Alert tone="danger" title="Los datos no coinciden" compact>
          {errorApi}
        </Alert>
      )}
    </form>
  );
}
