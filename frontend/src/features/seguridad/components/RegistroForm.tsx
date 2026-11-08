import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { TextField } from '../../../shared/ui/TextField';
import { Alert } from '../../../shared/ui/Alert';
import { Icon, type IconName } from '../../../shared/ui/Icon';
import { ApiError } from '../../../shared/api/http';
import { useAuth } from '../../../app/auth/AuthProvider';
import { authApi, type RegistroClienteDto } from '../api/authApi';
import { digitosTelefono, EIN_RE, REGLAS_CONTRASENA, registroSchema, type RegistroForm as RegistroValues } from '../schemas';

const TIPOS: { valor: RegistroValues['tipoPersona']; icono: IconName; titulo: string; desc: string; nota: string }[] = [
  { valor: 'persona', icono: 'home', titulo: 'Persona', desc: 'Muebles de su casa', nota: 'Nombre, correo y teléfono' },
  { valor: 'empresa', icono: 'building', titulo: 'Empresa', desc: 'Hoteles, oficinas, decoradores', nota: 'Pide el EIN de la empresa' },
];

const NIVELES = [
  { texto: '', tono: 't-bad' },
  { texto: 'Débil', tono: 't-bad' },
  { texto: 'Aceptable', tono: 't-warn' },
  { texto: 'Buena', tono: '' },
  { texto: 'Fuerte', tono: '' },
];

/** +1 (973) 555-0142 mientras se escribe. */
export function formatearTelefono(v: string) {
  const d = digitosTelefono(v).slice(0, 10);
  if (!d) return '';
  let out = `+1 (${d.slice(0, 3)}`;
  if (d.length >= 3) out += ') ';
  if (d.length > 3) out += d.slice(3, 6);
  if (d.length > 6) out += `-${d.slice(6)}`;
  return out;
}

/** 12-3456789 mientras se escribe. */
function formatearEin(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 9);
  return d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d;
}

function nivelContrasena(v: string) {
  if (!v) return 0;
  return [v.length >= 8, /\d/.test(v), /[A-Z]/.test(v), v.length >= 12].filter(Boolean).length;
}

/** CU-H01 Registrar cliente (persona o empresa). Las cuentas del personal las crea el Administrador (CU-S03). */
export function RegistroForm({ onIrLogin }: { onIrLogin: () => void }) {
  const navigate = useNavigate();
  const { iniciar } = useAuth();
  const [verContrasena, setVerContrasena] = useState(false);
  const [errorApi, setErrorApi] = useState<string | null>(null);
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<RegistroValues>({
    resolver: zodResolver(registroSchema),
    defaultValues: {
      tipoPersona: 'persona', razonSocial: '', documento: '', nombres: '', apellidos: '', cargo: '',
      email: '', telefono: '', contrasena: '', avisosCorreo: true, aceptaTerminos: false,
    },
  });

  const tipo = watch('tipoPersona');
  const contrasena = watch('contrasena');
  const documento = watch('documento');
  const empresa = tipo === 'empresa';
  const nivel = nivelContrasena(contrasena);

  const onSubmit = handleSubmit(async (v) => {
    setErrorApi(null);
    const dto: RegistroClienteDto = {
      tipoPersona: v.tipoPersona,
      nombres: v.nombres,
      apellidos: v.apellidos,
      email: v.email,
      telefono: `+1${digitosTelefono(v.telefono)}`,
      contrasena: v.contrasena,
      avisosCorreo: v.avisosCorreo,
      ...(empresa && { razonSocial: v.razonSocial, documento: v.documento, cargo: v.cargo || undefined }),
    };
    try {
      const sesion = await authApi.registrarCliente(dto);
      iniciar(sesion);
      navigate('/cliente/solicitud', { replace: true });
    } catch (e) {
      setErrorApi(e instanceof ApiError ? e.message : 'Ocurrió un error inesperado. Intente de nuevo.');
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <div>
        <h2>Crear cuenta de cliente</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          Toma menos de un minuto. Las cuentas del personal las crea el Administrador.
        </p>
      </div>

      <div className="kinds" role="radiogroup" aria-label="Tipo de cliente">
        {TIPOS.map((t) => {
          const on = tipo === t.valor;
          return (
            <button
              key={t.valor}
              type="button"
              className={on ? 'kind on' : 'kind'}
              role="radio"
              aria-checked={on}
              onClick={() => setValue('tipoPersona', t.valor)}
            >
              <span className="kt">
                <span className="ki"><Icon name={t.icono} size={22} strokeWidth={1.8} /></span>
                <span className="rd"><Icon name="check" size={14} strokeWidth={3} /></span>
              </span>
              <b>{t.titulo}</b>
              <small>{t.desc}</small>
              <em>{t.nota}</em>
            </button>
          );
        })}
      </div>

      {empresa ? (
        <>
          <span className="fs">Datos de la empresa</span>
          <TextField
            label="Nombre legal de la empresa"
            required
            autoComplete="organization"
            hint="Como figura en sus documentos fiscales"
            error={errors.razonSocial?.message}
            {...register('razonSocial')}
          />
          <TextField
            label="EIN · Número de identificación fiscal"
            required
            inputMode="numeric"
            placeholder="12-3456789"
            hint="9 dígitos que emite el IRS (Employer Identification Number). Va en sus comprobantes."
            error={errors.documento?.message}
            {...register('documento', { onChange: (e) => setValue('documento', formatearEin(e.target.value)) })}
          />
          {EIN_RE.test(documento) && !errors.documento && (
            <div className="okline"><Icon name="check" size={15} />Formato válido</div>
          )}
          <span className="fs">Persona de contacto</span>
        </>
      ) : (
        <span className="fs">Sus datos</span>
      )}

      <div className="g2">
        <TextField label="Nombre" required autoComplete="given-name" error={errors.nombres?.message} {...register('nombres')} />
        <TextField label="Apellido" required autoComplete="family-name" error={errors.apellidos?.message} {...register('apellidos')} />
      </div>
      {empresa && (
        <TextField label="Cargo" optional autoComplete="organization-title" {...register('cargo')} />
      )}
      <TextField
        label={empresa ? 'Correo de trabajo' : 'Correo'}
        required
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <TextField
        label="Teléfono"
        required
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="+1 (973) 555-0142"
        hint="Solo números de EE. UU. (+1): código de área + 7 dígitos"
        error={errors.telefono?.message}
        {...register('telefono', { onChange: (e) => setValue('telefono', formatearTelefono(e.target.value)) })}
      />

      <span className="fs">Seguridad</span>
      <TextField
        className="pw"
        label="Contraseña"
        required
        type={verContrasena ? 'text' : 'password'}
        autoComplete="new-password"
        error={errors.contrasena?.message}
        suffix={
          <button
            type="button"
            className="eye"
            onClick={() => setVerContrasena((v) => !v)}
            aria-label={verContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {verContrasena ? 'Ocultar' : 'Mostrar'}
          </button>
        }
        {...register('contrasena')}
      />
      <div
        className={`meter ${NIVELES[nivel].tono}`}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={nivel}
        aria-label={`Seguridad de la contraseña${NIVELES[nivel].texto ? `: ${NIVELES[nivel].texto.toLowerCase()}` : ''}`}
      >
        {[1, 2, 3, 4].map((n) => <i key={n} className={nivel >= n ? 'on' : undefined} />)}
        <span aria-hidden="true">{NIVELES[nivel].texto}</span>
      </div>
      <ul className="rules">
        {REGLAS_CONTRASENA.map((r) => {
          const ok = r.cumple(contrasena);
          return (
            <li key={r.texto} className={ok ? 'ok' : undefined}>
              {ok && <Icon name="check" size={13} strokeWidth={2.5} />}
              {r.texto}
            </li>
          );
        })}
      </ul>

      <label className="ck">
        <input type="checkbox" {...register('avisosCorreo')} />
        <span>Quiero recibir avisos de mis pedidos por correo</span>
      </label>
      <div>
        <label className="ck">
          <input type="checkbox" aria-invalid={Boolean(errors.aceptaTerminos)} {...register('aceptaTerminos')} />
          <span>
            Acepto los <Link to="/terminos" target="_blank">términos</Link> y la{' '}
            <Link to="/privacidad" target="_blank">política de privacidad</Link>
          </span>
        </label>
        {errors.aceptaTerminos && (
          <p className="gw-field-error" style={{ marginTop: 6 }}>
            <Icon name="alert" size={14} />{errors.aceptaTerminos.message}
          </p>
        )}
      </div>

      {errorApi && <Alert tone="danger" title="No pudimos crear la cuenta" compact>{errorApi}</Alert>}

      <button type="submit" className="gw-btn gw-btn-primary gw-btn-lg gw-btn-block" disabled={isSubmitting}>
        {isSubmitting ? 'Creando cuenta…' : 'Crear cuenta y solicitar cotización'}
      </button>
      <p className="audit" style={{ textAlign: 'center' }}>
        ¿Ya tiene cuenta? <button type="button" className="lnk" onClick={onIrLogin}>Iniciar sesión</button> · La dirección se agrega en su primera solicitud.
      </p>
    </form>
  );
}
