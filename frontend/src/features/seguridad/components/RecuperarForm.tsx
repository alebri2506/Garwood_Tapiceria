import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { TextField } from '../../../shared/ui/TextField';
import { Alert } from '../../../shared/ui/Alert';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ApiError } from '../../../shared/api/http';
import { authApi } from '../api/authApi';
import { recuperarSchema, type RecuperarForm as RecuperarValues } from '../schemas';

/** CU-S02 Recuperar contraseña. */
export function RecuperarForm({ onVolver }: { onVolver: () => void }) {
  const [enviado, setEnviado] = useState(false);
  const [errorApi, setErrorApi] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RecuperarValues>({
    resolver: zodResolver(recuperarSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    setErrorApi(null);
    try {
      await authApi.solicitarRecuperacion(email);
      setEnviado(true);
    } catch (e) {
      setErrorApi(e instanceof ApiError ? e.message : 'Ocurrió un error inesperado. Intente de nuevo.');
    }
  });

  if (enviado) {
    return (
      <>
        <EmptyState icon="check" title="Revise su correo">
          Si el correo está registrado, recibirá el enlace en unos minutos.
        </EmptyState>
        <button type="button" className="gw-btn gw-btn-secondary gw-btn-block" onClick={onVolver}>
          Volver a iniciar sesión
        </button>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <h2>Recuperar contraseña</h2>
      <p className="muted" style={{ fontSize: 14, lineHeight: '21px' }}>
        Le enviaremos un enlace para crear una nueva. Vence en 30 minutos.
      </p>
      <TextField
        label="Correo registrado"
        type="email"
        autoComplete="email"
        autoFocus
        error={errors.email?.message}
        {...register('email')}
      />
      {errorApi && <Alert tone="danger" compact>{errorApi}</Alert>}
      <button type="submit" className="gw-btn gw-btn-primary gw-btn-lg gw-btn-block" disabled={isSubmitting}>
        {isSubmitting ? 'Enviando…' : 'Enviar enlace'}
      </button>
      <button type="button" className="gw-btn gw-btn-ghost gw-btn-block" onClick={onVolver}>
        Volver a iniciar sesión
      </button>
    </form>
  );
}
