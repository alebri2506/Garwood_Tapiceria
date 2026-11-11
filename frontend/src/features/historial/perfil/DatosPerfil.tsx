import { useState, type FormEvent } from 'react';
import { ApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { Icon } from '../../../shared/ui/Icon';
import { TextField } from '../../../shared/ui/TextField';
import { formatearTelefono } from '../../seguridad/components/RegistroForm';
import { digitosTelefono } from '../../seguridad/schemas';
import { erroresDe, perfilApi, type DatosCliente, type Perfil } from './perfilApi';

/** Lo que el cliente escribe en el bloque Datos (el teléfono con formato, como en el registro). */
export interface BorradorDatos { nombres: string; apellidos: string; telefono: string; razonSocial: string; cargo: string }

export const borradorDe = (d: DatosCliente): BorradorDatos => ({
  nombres: d.nombres, apellidos: d.apellidos, telefono: formatearTelefono(d.telefono),
  razonSocial: d.razonSocial ?? '', cargo: d.cargo ?? '',
});

/** Solo lo que cambió, listo para enviar (E.1: tipo, EIN y correo no van aquí). */
export function cambiosDe(d: DatosCliente, b: BorradorDatos) {
  const telefono = `+1${digitosTelefono(b.telefono)}`;
  return {
    ...(b.nombres.trim() !== d.nombres && { nombres: b.nombres.trim() }),
    ...(b.apellidos.trim() !== d.apellidos && { apellidos: b.apellidos.trim() }),
    ...(telefono !== d.telefono && { telefono }),
    ...(d.tipoPersona === 'empresa' && b.razonSocial.trim() !== (d.razonSocial ?? '') && { razonSocial: b.razonSocial.trim() }),
    ...(d.tipoPersona === 'empresa' && b.cargo.trim() !== (d.cargo ?? '') && { cargo: b.cargo.trim() }),
  };
}

/** Mismas reglas que el backend, para avisar antes de enviar. */
export function revisarDatos(d: DatosCliente, b: BorradorDatos) {
  const e: Record<string, string> = {};
  if (!b.nombres.trim()) e.nombres = 'Ingrese sus nombres';
  if (!b.apellidos.trim()) e.apellidos = 'Ingrese sus apellidos';
  if (digitosTelefono(b.telefono).length !== 10) e.telefono = 'Ingrese el código de área y los 7 dígitos';
  if (d.tipoPersona === 'empresa' && !b.razonSocial.trim()) e.razonSocial = 'Ingrese el nombre de la empresa';
  return e;
}

/** E.1.4: pedir el cambio de correo con la contraseña actual; se confirma desde el correo nuevo. */
function CambiarCorreo({ actual, alPedir, alCerrar }: { actual: string | null; alPedir(p: Perfil['correoPendiente']): void; alCerrar(): void }) {
  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const faltan: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) faltan.email = email.trim() ? 'El correo no es válido' : 'Ingrese el correo nuevo';
    if (!contrasena) faltan.contrasena = 'Ingrese su contraseña actual';
    if (Object.keys(faltan).length) { setErrores(faltan); return; }
    setEnviando(true);
    setError(null);
    try {
      alPedir((await perfilApi.pedirCambioCorreo(email.trim(), contrasena)).correoPendiente);
    } catch (err) {
      const campos = erroresDe(err);
      setErrores(campos);
      if (!Object.keys(campos).length) setError(err instanceof ApiError ? err.message : 'No pudimos enviar el enlace. Intente de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form className="pf-correo stack" onSubmit={enviar} noValidate>
      <p className="muted">
        Le enviaremos un enlace al correo nuevo. El cambio se aplica cuando lo abra; mientras tanto sigue entrando con {actual ? <b>{actual}</b> : 'su correo actual'}.
      </p>
      <div className="grid2" style={{ gap: 16 }}>
        <TextField label="Correo nuevo" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} autoFocus
          value={email} onChange={(e) => { setEmail(e.target.value); setErrores(({ email: _, ...r }) => r); }} error={errores.email} />
        <TextField label="Contraseña actual" type="password" autoComplete="current-password"
          value={contrasena} onChange={(e) => { setContrasena(e.target.value); setErrores(({ contrasena: _, ...r }) => r); }} error={errores.contrasena}
          hint="Para confirmar que es usted" />
      </div>
      {error && <Alert tone="danger" compact>{error}</Alert>}
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button type="submit" className="gw-btn gw-btn-primary" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar enlace de confirmación'}</button>
        <button type="button" className="gw-btn gw-btn-ghost" onClick={alCerrar}>Cancelar</button>
      </div>
    </form>
  );
}

const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-US', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** W10 › Datos (decisiones E.1). Se guarda con «Guardar cambios» de la cabecera. */
export function DatosPerfil({ perfil, borrador, errores, onChange, onCorreoPendiente }: {
  perfil: Perfil; borrador: BorradorDatos; errores: Record<string, string>;
  onChange(b: BorradorDatos, campo: keyof BorradorDatos): void;
  onCorreoPendiente(p: Perfil['correoPendiente']): void;
}) {
  const { datos, correoPendiente } = perfil;
  const empresa = datos.tipoPersona === 'empresa';
  const [cambiandoCorreo, setCambiandoCorreo] = useState(false);
  const poner = (campo: keyof BorradorDatos, valor: string) => onChange({ ...borrador, [campo]: valor }, campo);

  return (
    <section className="card stack" aria-labelledby="pf-datos">
      <div className="between" style={{ flexWrap: 'wrap' }}>
        <h2 id="pf-datos" style={{ fontSize: 18 }}>Datos</h2>
        {/* E.1.1: se muestra, pero no se cambia desde el perfil. */}
        <div className="pf-seg" role="group" aria-label="Tipo de cliente (no se cambia aquí)">
          {(['persona', 'empresa'] as const).map((t) => (
            <span key={t} className={datos.tipoPersona === t ? 'on' : undefined} aria-current={datos.tipoPersona === t || undefined}>{t === 'persona' ? 'Persona' : 'Empresa'}</span>
          ))}
        </div>
      </div>
      <p className="muted pf-nota"><Icon name="lock" size={14} /> {empresa ? 'Empresa' : 'Persona'}: si necesita cambiarlo, pídalo al taller.</p>

      {empresa && (
        <div className="grid2" style={{ gap: 16 }}>
          <TextField label="Nombre de la empresa" required value={borrador.razonSocial} onChange={(e) => poner('razonSocial', e.target.value)} error={errores.razonSocial} />
          <TextField label="EIN" value={datos.documento ?? ''} readOnly disabled suffix={<Icon name="lock" size={16} />} hint="No se cambia desde aquí: pídalo al taller" />
        </div>
      )}
      {empresa && <span className="pf-sub">Persona de contacto</span>}
      <div className="grid2" style={{ gap: 16 }}>
        <TextField label="Nombres" required autoComplete="given-name" value={borrador.nombres} onChange={(e) => poner('nombres', e.target.value)} error={errores.nombres} />
        <TextField label="Apellidos" required autoComplete="family-name" value={borrador.apellidos} onChange={(e) => poner('apellidos', e.target.value)} error={errores.apellidos} />
        {empresa && <TextField label="Cargo" optional value={borrador.cargo} onChange={(e) => poner('cargo', e.target.value)} error={errores.cargo} />}
        <TextField
          label="Teléfono" required type="tel" inputMode="tel" autoComplete="tel" placeholder="+1 (973) 555-0142"
          hint="Solo números de EE. UU. (+1): código de área + 7 dígitos"
          value={borrador.telefono} onChange={(e) => poner('telefono', formatearTelefono(e.target.value))} error={errores.telefono}
        />
      </div>

      <div className="pf-correo-fila">
        <TextField label={empresa ? 'Correo de trabajo' : 'Correo'} value={datos.email ?? ''} readOnly hint="Con este correo entra a GARWEB" />
        {!cambiandoCorreo && <button type="button" className="gw-btn gw-btn-secondary" onClick={() => setCambiandoCorreo(true)}>Cambiar correo</button>}
      </div>
      {correoPendiente && !cambiandoCorreo && (
        <Alert tone="info" title="Falta confirmar su correo nuevo">
          Le enviamos un enlace a <b>{correoPendiente.email}</b> (vence el {fechaHora(correoPendiente.vence)}). Ábralo para terminar el cambio; mientras tanto sigue entrando con su correo actual.
        </Alert>
      )}
      {cambiandoCorreo && (
        <CambiarCorreo actual={datos.email} alCerrar={() => setCambiandoCorreo(false)} alPedir={(p) => { onCorreoPendiente(p); setCambiandoCorreo(false); }} />
      )}
    </section>
  );
}
