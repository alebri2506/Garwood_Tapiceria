import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { TextField } from '../../../shared/ui/TextField';
import { Alert } from '../../../shared/ui/Alert';
import { ApiError } from '../../../shared/api/http';
import { INICIO_POR_ROL } from '../../../shared/api/sesion';
import { useAuth } from '../../../app/auth/AuthProvider';
import { authApi } from '../api/authApi';
import { restablecerSchema, type RestablecerForm as CambioValues } from '../schemas';

/** D.1.3 · CU-S01: primer ingreso con una contraseña temporal (la entregó el Administrador): crea una propia. */
export function CambiarContrasenaForm() {
  const navigate = useNavigate();
  const { sesion, iniciar, salir } = useAuth();
  const [errorApi, setErrorApi] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<CambioValues>({
    resolver: zodResolver(restablecerSchema),
    defaultValues: { contrasena: '', confirmacion: '' },
  });

  const onSubmit = handleSubmit(async ({ contrasena }) => {
    setErrorApi(null);
    try {
      const nueva = await authApi.cambiarContrasenaTemporal(contrasena);
      iniciar(nueva);
      navigate(INICIO_POR_ROL[nueva.usuario.rol], { replace: true });
    } catch (e) {
      const campo = e instanceof ApiError ? e.errores.contrasena : undefined;
      if (campo) setError('contrasena', { message: Array.isArray(campo) ? String(campo[0]) : campo });
      else setErrorApi(e instanceof ApiError ? e.message : 'Ocurrió un error inesperado. Intente de nuevo.');
    }
  });

  const cerrar = async () => {
    await salir();
    navigate('/acceso', { replace: true });
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      <h2>Cree su contraseña</h2>
      <p className="muted" style={{ fontSize: 14, lineHeight: '21px' }}>
        Hola{sesion ? `, ${sesion.usuario.nombre}` : ''}. Entró con una contraseña temporal. Para continuar, cree una propia:
        8 caracteres o más, con al menos un número. Solo usted la conocerá.
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
        {isSubmitting ? 'Guardando…' : 'Guardar y continuar'}
      </button>
      <button type="button" className="gw-btn gw-btn-ghost gw-btn-block" onClick={cerrar}>Cerrar sesión</button>
    </form>
  );
}
