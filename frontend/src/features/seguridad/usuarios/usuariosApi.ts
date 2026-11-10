import { API_URL, ApiError, apiFetch } from '../../../shared/api/http';

// CU-S03, S04 · A20 › Usuarios: el personal del taller (decisiones D.1).

export type RolPersonal = 'Tapicero' | 'Conductor' | 'Administrador';
export interface UsuarioPersonal {
  id: number; nombre: string; nombreUsuario: string; email: string | null;
  rol: RolPersonal; rolEtiqueta: string; dispositivo: string | null;
  activo: boolean; debeCambiarContrasena: boolean; bloqueado: boolean; ultimoAcceso: string | null;
}
export interface ListaUsuarios {
  usuarios: UsuarioPersonal[];
  opciones: { roles: { nombre: RolPersonal; etiqueta: string }[]; dispositivos: string[] };
}
export interface DatosUsuario { nombre: string; nombreUsuario: string; rol: RolPersonal; email: string; dispositivo: string }
export type EdicionUsuario = Partial<Pick<DatosUsuario, 'nombre' | 'rol' | 'email' | 'dispositivo'>>;
/** La contraseña temporal llega solo en esta respuesta (D.1.3). */
export interface ConTemporal { usuario: UsuarioPersonal; contrasenaTemporal: string }

interface UsuariosApi {
  listar(): Promise<ListaUsuarios>;
  crear(d: DatosUsuario): Promise<ConTemporal>;
  editar(id: number, d: EdicionUsuario): Promise<UsuarioPersonal>;
  desactivar(id: number): Promise<UsuarioPersonal>;
  reactivar(id: number): Promise<UsuarioPersonal>;
  nuevaTemporal(id: number): Promise<ConTemporal>;
}

const http: UsuariosApi = {
  listar: () => apiFetch('/admin/usuarios'),
  crear: (d) => apiFetch('/admin/usuarios', { method: 'POST', body: JSON.stringify(d) }),
  editar: (id, d) => apiFetch(`/admin/usuarios/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
  desactivar: (id) => apiFetch(`/admin/usuarios/${id}/desactivar`, { method: 'POST' }),
  reactivar: (id) => apiFetch(`/admin/usuarios/${id}/reactivar`, { method: 'POST' }),
  nuevaTemporal: (id) => apiFetch(`/admin/usuarios/${id}/contrasena-temporal`, { method: 'POST' }),
};

// ---------------------------------------------------------------- Sin API: el personal de ejemplo del prototipo.
const ETIQUETA: Record<RolPersonal, string> = { Tapicero: 'Producción', Conductor: 'Conductor', Administrador: 'Administrador' };
const hace = (horas: number) => new Date(Date.now() - horas * 3_600_000).toISOString();
const u = (id: number, nombre: string, nombreUsuario: string, rol: RolPersonal, dispositivo: string, ultimoAcceso: string | null, activo = true, email: string | null = null): UsuarioPersonal =>
  ({ id, nombre, nombreUsuario, email, rol, rolEtiqueta: ETIQUETA[rol], dispositivo, activo, debeCambiarContrasena: false, bloqueado: false, ultimoAcceso });
const ejemplo: UsuarioPersonal[] = [
  u(1, 'Administrador', 'admin', 'Administrador', 'Computadora', hace(1), true, 'admin@garwood.test'),
  u(2, 'Carlos', 'carlos.taller', 'Tapicero', 'Celular', hace(2)),
  u(3, 'María', 'maria.taller', 'Tapicero', 'Celular', hace(3)),
  u(4, 'Luis', 'luis.ruta', 'Conductor', 'Celular', hace(24 * 19)),
  u(5, 'Ayudante temporal', 'temp.taller', 'Tapicero', 'Celular', hace(24 * 70), false),
];
const temporal = () => `${Math.random().toString(36).slice(2, 7).replace(/[0-9]/g, 'k')}-${String(Math.floor(2000 + Math.random() * 7000))}`;
const buscar = (id: number) => {
  const x = ejemplo.find((e) => e.id === id);
  if (!x) throw new ApiError('No encontramos ese usuario del personal.', 404);
  return x;
};
const simulada: UsuariosApi = {
  listar: async () => ({
    usuarios: structuredClone(ejemplo),
    opciones: { roles: (['Tapicero', 'Conductor', 'Administrador'] as RolPersonal[]).map((nombre) => ({ nombre, etiqueta: ETIQUETA[nombre] })), dispositivos: ['Computadora', 'Celular', 'Tablet'] },
  }),
  crear: async (d) => {
    if (d.rol === 'Administrador' && !d.email) throw new ApiError('Ingrese el correo: es obligatorio para un Administrador.', 400, { email: 'El correo es obligatorio para un Administrador.' });
    if (ejemplo.some((e) => e.nombreUsuario === d.nombreUsuario.trim().toLowerCase())) throw new ApiError('Ese usuario ya existe. Elija otro.', 409, { nombreUsuario: 'Ese usuario ya existe. Elija otro.' });
    const nuevo = { ...u(ejemplo.length + 1, d.nombre, d.nombreUsuario.trim().toLowerCase(), d.rol, d.dispositivo, null, true, d.email || null), debeCambiarContrasena: true };
    ejemplo.push(nuevo);
    return { usuario: structuredClone(nuevo), contrasenaTemporal: temporal() };
  },
  editar: async (id, d) => {
    const x = buscar(id);
    Object.assign(x, { ...d, email: d.email === undefined ? x.email : d.email || null }, d.rol ? { rolEtiqueta: ETIQUETA[d.rol] } : {});
    return structuredClone(x);
  },
  desactivar: async (id) => {
    if (id === 1) throw new ApiError('No puede desactivar su propia cuenta.', 400);
    return structuredClone(Object.assign(buscar(id), { activo: false }));
  },
  reactivar: async (id) => structuredClone(Object.assign(buscar(id), { activo: true })),
  nuevaTemporal: async (id) => ({ usuario: structuredClone(Object.assign(buscar(id), { debeCambiarContrasena: true })), contrasenaTemporal: temporal() }),
};

export const usuariosApi: UsuariosApi = API_URL ? http : simulada;
