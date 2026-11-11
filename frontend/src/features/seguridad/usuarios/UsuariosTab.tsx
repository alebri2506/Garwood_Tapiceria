import { useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '../../../app/auth/AuthProvider';
import { ApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { Icon } from '../../../shared/ui/Icon';
import { StatusChip } from '../../../shared/ui/StatusChip';
import { TextField } from '../../../shared/ui/TextField';
import { Toast } from '../../../shared/ui/Toast';
import { DIAS, MESES } from '../../comercial/fechas';
import { usuariosApi, type ConTemporal, type ListaUsuarios, type RolPersonal, type UsuarioPersonal } from './usuariosApi';

const dos = (n: number) => String(n).padStart(2, '0');
const mismoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
/** Como en el prototipo: "hoy 08:01", "ayer 17:42", "jue 22 oct", "31 ago". */
export function ultimoAcceso(iso: string | null, ahora = new Date()) {
  if (!iso) return 'Nunca';
  const d = new Date(iso);
  const hora = `${dos(d.getHours())}:${dos(d.getMinutes())}`;
  const ayer = new Date(ahora); ayer.setDate(ayer.getDate() - 1);
  if (mismoDia(d, ahora)) return `hoy ${hora}`;
  if (mismoDia(d, ayer)) return `ayer ${hora}`;
  const mes = MESES[d.getMonth()]!.slice(0, 3);
  if (ahora.getTime() - d.getTime() < 7 * 86_400_000) return `${DIAS[d.getDay()]!.slice(0, 3)} ${d.getDate()} ${mes}`;
  return d.getFullYear() === ahora.getFullYear() ? `${d.getDate()} ${mes}` : `${d.getDate()} ${mes} ${d.getFullYear()}`;
}

/** El validador del backend puede mandar el error de un campo como lista: se muestra el primero. */
const erroresDe = (e: unknown): Record<string, string> =>
  e instanceof ApiError ? Object.fromEntries(Object.entries(e.errores).map(([k, v]) => [k, Array.isArray(v) ? String(v[0]) : String(v)])) : {};
const mensajeDe = (e: unknown, porDefecto: string) => (e instanceof ApiError ? e.message : porDefecto);

function Seleccion({ label, value, onChange, children, error, hint }: { label: string; value: string; onChange(v: string): void; children: ReactNode; error?: string; hint?: ReactNode }) {
  return (
    <label className={error ? 'gw-field is-invalid' : 'gw-field'}>
      <span className="gw-field-label">{label}</span>
      <select className="gw-input" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)}>{children}</select>
      {error ? <p className="gw-field-error"><Icon name="alert" size={14} />{error}</p> : hint ? <p className="gw-field-hint">{hint}</p> : null}
    </label>
  );
}

/** D.1.3: la contraseña temporal se muestra una sola vez para entregarla en persona. */
function Entrega({ datos, alCerrar }: { datos: ConTemporal; alCerrar(): void }) {
  const [copiada, setCopiada] = useState(false);
  const copiar = () => navigator.clipboard?.writeText(datos.contrasenaTemporal).then(() => setCopiada(true)).catch(() => undefined);
  return (
    <div className="card stack us-entrega" role="status">
      <h2 style={{ fontSize: 17 }}>Contraseña temporal de {datos.usuario.nombre}</h2>
      <p className="muted">Entra con su correo <b>{datos.usuario.email}</b> y esta contraseña:</p>
      <div className="us-clave">
        <code>{datos.contrasenaTemporal}</code>
        <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" onClick={copiar}>{copiada ? 'Copiada' : 'Copiar'}</button>
      </div>
      <Alert tone="warning" compact>Entréguela en persona. <b>No se volverá a mostrar.</b> Se le pedirá cambiarla al primer ingreso.</Alert>
      <button type="button" className="gw-btn gw-btn-primary" onClick={alCerrar}>Listo, ya la entregué</button>
    </div>
  );
}

// Decisión del equipo (10/11): nombres y apellidos + correo obligatorio (con él entra); sin nombre de usuario aparte.
const VACIO = { nombre: '', email: '', rol: 'Tapicero' as RolPersonal, dispositivo: 'Celular' };
const CORREO_OBLIGATORIO = 'Ingrese el correo: con él la persona entra a GARWEB.';
const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Las mismas reglas que valida el backend, para avisar antes de enviar. */
function revisar(nombre: string, email: string) {
  const errores: Record<string, string> = {};
  const n = nombre.trim().replace(/\s+/g, ' ');
  if (!n) errores.nombre = 'Ingrese nombres y apellidos';
  else if (n.split(' ').length < 2) errores.nombre = 'Ingrese nombres y apellidos (por ejemplo, Pedro Ruiz)';
  if (!email.trim()) errores.email = CORREO_OBLIGATORIO;
  else if (!CORREO_VALIDO.test(email.trim())) errores.email = 'El correo no es válido';
  return errores;
}

function CrearUsuario({ opciones, alCrear }: { opciones: ListaUsuarios['opciones']; alCrear(d: ConTemporal): void }) {
  const [f, setF] = useState(VACIO);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const poner = (campo: keyof typeof VACIO) => (v: string) => { setF((x) => ({ ...x, [campo]: v })); setErrores(({ [campo]: _, ...r }) => r); };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const faltan = revisar(f.nombre, f.email);
    if (Object.keys(faltan).length) { setErrores(faltan); return; }
    setEnviando(true);
    setError(null);
    try {
      alCrear(await usuariosApi.crear(f));
      setF(VACIO);
    } catch (err) {
      setErrores(erroresDe(err));
      setError(mensajeDe(err, 'No pudimos crear el usuario. Intente de nuevo.'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form className="card stack" onSubmit={enviar} noValidate>
      <h2 style={{ fontSize: 17 }}>Crear usuario</h2>
      <TextField label="Nombres y apellidos" required placeholder="Ej.: Pedro Ruiz" autoComplete="off" value={f.nombre} onChange={(e) => poner('nombre')(e.target.value)} error={errores.nombre} />
      <TextField
        label="Correo" type="email" required placeholder="pedro@garwood.com" autoComplete="off" autoCapitalize="none" spellCheck={false}
        value={f.email} onChange={(e) => poner('email')(e.target.value)} error={errores.email}
        hint="Con este correo entrará a GARWEB y podrá recuperar su contraseña"
      />
      <Seleccion label="Rol" value={f.rol} onChange={poner('rol')} error={errores.rol}>
        {opciones.roles.map((r) => <option key={r.nombre} value={r.nombre}>{r.etiqueta}</option>)}
      </Seleccion>
      <Seleccion label="Dispositivo" value={f.dispositivo} onChange={poner('dispositivo')}>
        {opciones.dispositivos.map((d) => <option key={d}>{d}</option>)}
      </Seleccion>
      <TextField label="Contraseña temporal" value="Se genera automáticamente" readOnly disabled suffix={<Icon name="lock" size={16} />} hint="Se le pedirá cambiarla al primer ingreso" />
      {error && <Alert tone="danger" compact>{error}</Alert>}
      <button type="submit" className="gw-btn gw-btn-primary" disabled={enviando}>{enviando ? 'Creando…' : 'Crear usuario'}</button>
    </form>
  );
}

function EditarUsuario({ u, opciones, esUnoMismo, alGuardar, alTemporal, alCerrar }: {
  u: UsuarioPersonal; opciones: ListaUsuarios['opciones']; esUnoMismo: boolean;
  alGuardar(u: UsuarioPersonal, texto: string): void; alTemporal(d: ConTemporal): void; alCerrar(): void;
}) {
  const [f, setF] = useState({ nombre: u.nombre, rol: u.rol, email: u.email ?? '', dispositivo: u.dispositivo ?? '' });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState<'desactivar' | 'temporal' | null>(null);
  const poner = (campo: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [campo]: v })); setErrores(({ [campo]: _, ...r }) => r); };

  const cambios = {
    ...(f.nombre.trim() !== u.nombre && { nombre: f.nombre.trim() }),
    ...(f.rol !== u.rol && { rol: f.rol }),
    ...(f.email.trim().toLowerCase() !== (u.email ?? '') && { email: f.email.trim() }),
    ...(f.dispositivo !== (u.dispositivo ?? '') && { dispositivo: f.dispositivo }),
  };
  const hayCambios = Object.keys(cambios).length > 0;

  const hacer = async (accion: () => Promise<void>, porDefecto: string) => {
    setOcupado(true);
    setError(null);
    try { await accion(); } catch (err) { setErrores(erroresDe(err)); setError(mensajeDe(err, porDefecto)); } finally { setOcupado(false); setConfirmar(null); }
  };
  const guardar = (e: FormEvent) => {
    e.preventDefault();
    if (!hayCambios) return;
    const faltan = revisar(f.nombre, f.email);
    if (Object.keys(faltan).length) { setErrores(faltan); return; }
    void hacer(async () => {
      const r = await usuariosApi.editar(u.id, cambios);
      alGuardar(r, cambios.rol ? `${r.nombre} usará el rol ${r.rolEtiqueta} desde su próximo ingreso (en máximo 15 minutos).` : 'Los cambios quedaron registrados.');
    }, 'No pudimos guardar los cambios.');
  };

  return (
    <form className="card stack" onSubmit={guardar} noValidate>
      <div className="between"><h2 style={{ fontSize: 17 }}>Editar usuario</h2><button type="button" className="gw-btn gw-btn-ghost gw-btn-sm" onClick={alCerrar}>Cerrar</button></div>
      {!u.email && <Alert tone="warning" compact>Esta cuenta no tiene correo. Complételo: con él la persona entra a GARWEB.</Alert>}
      <TextField label="Nombres y apellidos" required value={f.nombre} onChange={(e) => poner('nombre')(e.target.value)} error={errores.nombre} />
      <TextField
        label="Correo" type="email" required autoCapitalize="none" spellCheck={false} value={f.email}
        onChange={(e) => poner('email')(e.target.value)} error={errores.email}
        hint={u.email && f.email.trim().toLowerCase() !== u.email ? 'Al guardar, entrará con este correo nuevo; el anterior dejará de servir.' : 'Con este correo entra a GARWEB'}
      />
      <Seleccion
        label="Rol" value={f.rol} onChange={(v) => poner('rol')(v)} error={errores.rol}
        hint={f.rol !== u.rol ? 'Al guardar, deberá volver a entrar para usar su nuevo rol (en máximo 15 minutos).' : undefined}
      >
        {opciones.roles.map((r) => <option key={r.nombre} value={r.nombre}>{r.etiqueta}</option>)}
      </Seleccion>
      <Seleccion label="Dispositivo" value={f.dispositivo} onChange={poner('dispositivo')}>
        {!u.dispositivo && <option value="">Sin indicar</option>}
        {opciones.dispositivos.map((d) => <option key={d}>{d}</option>)}
      </Seleccion>
      {error && <Alert tone="danger" compact>{error}</Alert>}
      <button type="submit" className="gw-btn gw-btn-primary" disabled={!hayCambios || ocupado}>{ocupado && !confirmar ? 'Guardando…' : 'Guardar cambios'}</button>

      <div className="us-acciones stack">
        <span className="ov">Acceso</span>
        {confirmar === 'temporal' ? (
          <Alert tone="warning" title="¿Generar una contraseña temporal nueva?">
            La actual deja de servir y su sesión abierta se cerrará en máximo 15 minutos.
            <span className="row us-confirmar">
              <button type="button" className="gw-btn gw-btn-primary gw-btn-sm" disabled={ocupado} onClick={() => hacer(async () => alTemporal(await usuariosApi.nuevaTemporal(u.id)), 'No pudimos generar la contraseña.')}>Sí, generar</button>
              <button type="button" className="gw-btn gw-btn-ghost gw-btn-sm" onClick={() => setConfirmar(null)}>Cancelar</button>
            </span>
          </Alert>
        ) : (
          <button type="button" className="gw-btn gw-btn-secondary" onClick={() => setConfirmar('temporal')}>Generar contraseña temporal nueva</button>
        )}
        {esUnoMismo ? (
          <p className="audit">No puede desactivar su propia cuenta.</p>
        ) : confirmar === 'desactivar' ? (
          <Alert tone="danger" title={`¿Desactivar a ${u.nombre}?`}>
            No podrá entrar; su sesión abierta se cierra en máximo 15 minutos. Su historial se conserva y puede reactivarlo cuando quiera.
            <span className="row us-confirmar">
              <button type="button" className="gw-btn gw-btn-danger gw-btn-sm" disabled={ocupado} onClick={() => hacer(async () => alGuardar(await usuariosApi.desactivar(u.id), `${u.nombre} ya no puede entrar a GARWEB.`), 'No pudimos desactivar el usuario.')}>Sí, desactivar</button>
              <button type="button" className="gw-btn gw-btn-ghost gw-btn-sm" onClick={() => setConfirmar(null)}>Cancelar</button>
            </span>
          </Alert>
        ) : (
          <button type="button" className="gw-btn gw-btn-ghost us-desactivar" onClick={() => setConfirmar('desactivar')}>Desactivar usuario</button>
        )}
      </div>
    </form>
  );
}

/** A20 › Usuarios (CU-S03 · decisiones D.1). */
export function UsuariosTab({ datos, recargar }: { datos: ListaUsuarios; recargar(): void }) {
  const { sesion } = useAuth();
  const yo = Number(sesion?.usuario.id);
  const [editando, setEditando] = useState<number | null>(null);
  const [entrega, setEntrega] = useState<ConTemporal | null>(null);
  const [aviso, setAviso] = useState<{ titulo: string; texto: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actual = datos.usuarios.find((x) => x.id === editando);

  const reactivar = async (u: UsuarioPersonal) => {
    setError(null);
    try {
      await usuariosApi.reactivar(u.id);
      setAviso({ titulo: 'Usuario reactivado', texto: `${u.nombre} puede volver a entrar con su contraseña.` });
      recargar();
    } catch (err) {
      setError(mensajeDe(err, 'No pudimos reactivar el usuario.'));
    }
  };

  return (
    <div className="split">
      <div className="wide">
        {aviso && <Toast title={aviso.titulo} onClose={() => setAviso(null)}>{aviso.texto}</Toast>}
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="tbl-box">
          <table className="t">
            <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Dispositivo</th><th>Último acceso</th><th>Estado</th><th><span className="sr-only">Acción</span></th></tr></thead>
            <tbody>
              {datos.usuarios.map((u) => (
                <tr key={u.id} className={u.id === editando ? 'sel' : undefined}>
                  <td><b>{u.nombre}</b>{u.id === yo && <span className="muted"> (usted)</span>}</td>
                  <td>{u.email ?? <span className="us-falta">Falta el correo</span>}</td>
                  <td>{u.rolEtiqueta}</td>
                  <td>{u.dispositivo ?? <span className="muted">—</span>}</td>
                  <td className="num">{ultimoAcceso(u.ultimoAcceso)}</td>
                  <td>
                    <span className="us-estado">
                      {u.activo ? <StatusChip status="Activo" tone="success" /> : <StatusChip status="Desactivado" tone="neutral" />}
                      {u.activo && u.bloqueado && <StatusChip status="Bloqueado" tone="warning" />}
                      {u.activo && u.debeCambiarContrasena && <span className="pill" title="Entró con una contraseña temporal">Contraseña temporal</span>}
                    </span>
                  </td>
                  <td>
                    {u.activo
                      ? <button type="button" className="gw-btn gw-btn-ghost gw-btn-sm" onClick={() => { setEditando(u.id); setEntrega(null); }}>Editar</button>
                      : <button type="button" className="gw-btn gw-btn-ghost gw-btn-sm" onClick={() => reactivar(u)}>Reactivar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="audit">Los clientes crean su propia cuenta desde la web; el Administrador puede registrarlos por teléfono en Clientes (A17).</p>
      </div>
      <aside className="aside">
        {entrega && <Entrega datos={entrega} alCerrar={() => setEntrega(null)} />}
        {actual ? (
          <EditarUsuario
            key={actual.id} u={actual} opciones={datos.opciones} esUnoMismo={actual.id === yo}
            alGuardar={(r, texto) => { setAviso({ titulo: r.activo ? 'Usuario actualizado' : 'Usuario desactivado', texto }); if (!r.activo) setEditando(null); recargar(); }}
            alTemporal={(d) => { setEntrega(d); setEditando(null); recargar(); }}
            alCerrar={() => setEditando(null)}
          />
        ) : (
          !entrega && <CrearUsuario opciones={datos.opciones} alCrear={(d) => { setEntrega(d); recargar(); }} />
        )}
      </aside>
    </div>
  );
}
