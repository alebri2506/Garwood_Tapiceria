import { API_URL, ApiError, apiFetch, apiPost } from '../../../shared/api/http';
import type { DireccionGuardada } from '../../comercial/solicitud/solicitudApi';

// W10 Mi perfil (CU-H02 · decisiones-recientes.md, sección E). Siempre sobre la cuenta de la sesión: no hay ids de cliente.

export interface DatosCliente {
  tipoPersona: 'persona' | 'empresa';
  nombres: string; apellidos: string;
  razonSocial: string | null; documento: string | null; cargo: string | null;
  email: string | null; telefono: string;
}
export type DireccionPerfil = DireccionGuardada & { esPrincipal: boolean };
export interface Perfil {
  datos: DatosCliente;
  clienteDesde: string;
  /** E.1.4: correo nuevo que espera confirmación desde el enlace. */
  correoPendiente: { email: string; vence: string } | null;
  direcciones: DireccionPerfil[];
  avisos: { informativos: boolean; novedades: boolean; obligatorios: string[] };
  ultimoIngreso: string | null;
}
export type DatosEditables = Partial<Pick<DatosCliente, 'nombres' | 'apellidos' | 'telefono' | 'razonSocial' | 'cargo'>>;
export interface NuevaDireccion { etiqueta: string; direccion: string; referencia?: string; latitud?: number; longitud?: number }

interface PerfilApi {
  ver(): Promise<Perfil>;
  guardarDatos(d: DatosEditables): Promise<{ datos: DatosCliente }>;
  pedirCambioCorreo(email: string, contrasena: string): Promise<{ correoPendiente: { email: string; vence: string } }>;
  agregarDireccion(d: NuevaDireccion): Promise<{ direcciones: DireccionPerfil[] }>;
  marcarPrincipal(id: number): Promise<{ direcciones: DireccionPerfil[] }>;
  quitarDireccion(id: number): Promise<{ direcciones: DireccionPerfil[] }>;
  /** E.3: los dos interruptores (solo el correo; la campana siempre muestra todo). */
  guardarAvisos(a: { informativos?: boolean; novedades?: boolean }): Promise<{ avisos: Perfil['avisos'] }>;
  /** E.1.4: se abre desde el enlace del correo nuevo; no necesita sesión. */
  confirmarCorreo(token: string): Promise<{ mensaje: string; email: string }>;
}

const json = (body: unknown) => ({ body: JSON.stringify(body) });
const http: PerfilApi = {
  ver: () => apiFetch('/cliente/perfil'),
  guardarDatos: (d) => apiFetch('/cliente/perfil/datos', { method: 'PATCH', ...json(d) }),
  pedirCambioCorreo: (email, contrasena) => apiFetch('/cliente/perfil/correo', { method: 'POST', ...json({ email, contrasena }) }),
  agregarDireccion: (d) => apiFetch('/cliente/perfil/direcciones', { method: 'POST', ...json(d) }),
  marcarPrincipal: (id) => apiFetch(`/cliente/perfil/direcciones/${id}/principal`, { method: 'POST' }),
  quitarDireccion: (id) => apiFetch(`/cliente/perfil/direcciones/${id}/quitar`, { method: 'POST' }),
  guardarAvisos: (a) => apiFetch('/cliente/perfil/avisos', { method: 'PATCH', ...json(a) }),
  confirmarCorreo: (token) => apiPost('/auth/confirmar-correo', { token }),
};

// ---------------------------------------------------------------- Sin API: el perfil de ejemplo del prototipo.
const ejemplo: Perfil = {
  datos: { tipoPersona: 'persona', nombres: 'Laura', apellidos: 'Méndez', razonSocial: null, documento: null, cargo: null, email: 'laura.mendez@correo.com', telefono: '+19735550142' },
  clienteDesde: '2026-10-05T15:00:00.000Z',
  correoPendiente: null,
  direcciones: [
    { id: 1, etiqueta: 'Casa', direccion: '48 Park St, Montclair, NJ 07042', referencia: null, ciudad: 'Montclair', latitud: 40.8126, longitud: -74.2124, esPrincipal: true },
    { id: 2, etiqueta: 'Oficina', direccion: '200 Bloomfield Ave, Montclair, NJ', referencia: null, ciudad: 'Montclair', latitud: 40.8076, longitud: -74.2147, esPrincipal: false },
  ],
  avisos: { informativos: true, novedades: false, obligatorios: ['Citas y visitas', 'Recojo del mueble en su casa', 'Entrega del pedido', 'Retiro en el taller', 'Daño oculto (V2)'] },
  ultimoIngreso: new Date(Date.now() - 86_400_000).toISOString(),
};
let siguienteId = 3;
const lista = () => structuredClone([...ejemplo.direcciones].sort((a, b) => Number(b.esPrincipal) - Number(a.esPrincipal)));
const simulada: PerfilApi = {
  ver: async () => ({ ...structuredClone(ejemplo), direcciones: lista() }),
  guardarDatos: async (d) => {
    Object.assign(ejemplo.datos, d);
    return { datos: structuredClone(ejemplo.datos) };
  },
  pedirCambioCorreo: async (email, contrasena) => {
    if (contrasena.length < 4) throw new ApiError('La contraseña no es correcta.', 400, { contrasena: 'La contraseña no es correcta.' });
    ejemplo.correoPendiente = { email, vence: new Date(Date.now() + 24 * 3_600_000).toISOString() };
    return { correoPendiente: structuredClone(ejemplo.correoPendiente) };
  },
  agregarDireccion: async (d) => {
    ejemplo.direcciones.push({ id: siguienteId++, etiqueta: d.etiqueta, direccion: d.direccion, referencia: d.referencia ?? null, ciudad: d.direccion.split(',')[1]?.trim() ?? null, latitud: d.latitud ?? null, longitud: d.longitud ?? null, esPrincipal: !ejemplo.direcciones.length });
    return { direcciones: lista() };
  },
  marcarPrincipal: async (id) => {
    ejemplo.direcciones.forEach((x) => { x.esPrincipal = x.id === id; });
    return { direcciones: lista() };
  },
  quitarDireccion: async (id) => {
    const eraPrincipal = ejemplo.direcciones.find((x) => x.id === id)?.esPrincipal;
    ejemplo.direcciones = ejemplo.direcciones.filter((x) => x.id !== id);
    if (eraPrincipal && ejemplo.direcciones[0]) ejemplo.direcciones[0].esPrincipal = true;
    return { direcciones: lista() };
  },
  guardarAvisos: async (a) => {
    Object.assign(ejemplo.avisos, a);
    return { avisos: structuredClone(ejemplo.avisos) };
  },
  confirmarCorreo: async () => {
    const email = ejemplo.correoPendiente?.email ?? 'nuevo@correo.com';
    ejemplo.datos.email = email;
    ejemplo.correoPendiente = null;
    return { mensaje: `Listo: desde ahora entra a GARWEB con ${email}.`, email };
  },
};

export const perfilApi: PerfilApi = API_URL ? http : simulada;

/** El validador del backend puede mandar el error de un campo como lista: se muestra el primero. */
export const erroresDe = (e: unknown): Record<string, string> =>
  e instanceof ApiError ? Object.fromEntries(Object.entries(e.errores).map(([k, v]) => [k, Array.isArray(v) ? String(v[0]) : String(v)])) : {};
