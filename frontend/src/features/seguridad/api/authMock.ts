// API simulada en memoria. Solo se usa cuando VITE_API_URL está vacía (ver authApi.ts);
// imita las respuestas que dará el backend real, incluido el bloqueo por intentos fallidos.
import { ApiError } from '../../../shared/api/http';
import type { Rol, Sesion } from '../../../shared/api/sesion';
import type { AuthApi } from './authApi';

interface UsuarioMock {
  id: string;
  usuario: string;
  email: string;
  documento?: string;
  contrasena: string;
  nombre: string;
  rol: Rol;
  fallidos: number;
  bloqueadoHasta?: number;
}

// Usuarios de prueba (caso PED-0076 del prototipo). Contraseña de todos: Sofa2026
const usuarios: UsuarioMock[] = [
  { id: 'u1', usuario: 'laura.mendez', email: 'laura.mendez@correo.com', contrasena: 'Sofa2026', nombre: 'Laura Méndez', rol: 'Cliente', fallidos: 0 },
  { id: 'u2', usuario: 'admin', email: 'admin@garwood.com', contrasena: 'Sofa2026', nombre: 'Administrador', rol: 'Administrador', fallidos: 0 },
  { id: 'u3', usuario: 'tapicero', email: 'tapicero@garwood.com', contrasena: 'Sofa2026', nombre: 'Carlos', rol: 'Tapicero', fallidos: 0 },
  { id: 'u4', usuario: 'conductor', email: 'conductor@garwood.com', contrasena: 'Sofa2026', nombre: 'Luis', rol: 'Conductor', fallidos: 0 },
];

// En el backend real estos valores vienen de la tabla `parametro` (RG-04).
const MAX_INTENTOS = 5;
const MINUTOS_BLOQUEO = 15;

const esperar = () => new Promise((r) => setTimeout(r, 450));
// Imita la cookie de refresh: la sesión simulada sobrevive a recargar la pestaña.
const CLAVE_MOCK = 'garweb.mock.sesion';
function sesionDe(u: UsuarioMock): Sesion {
  const s: Sesion = { token: `mock-${u.id}`, usuario: { id: u.id, nombre: u.nombre, rol: u.rol } };
  try { sessionStorage.setItem(CLAVE_MOCK, JSON.stringify(s)); } catch { /* sin almacenamiento */ }
  return s;
}

export const authMock: AuthApi = {
  async iniciarSesion({ identificador, contrasena }) {
    await esperar();
    const id = identificador.trim().toLowerCase();
    const u = usuarios.find((x) => x.email === id || x.usuario === id);
    if (u?.bloqueadoHasta && u.bloqueadoHasta > Date.now()) {
      throw new ApiError(`Cuenta bloqueada por intentos fallidos. Intente de nuevo en ${MINUTOS_BLOQUEO} minutos.`, 423);
    }
    if (!u || u.contrasena !== contrasena) {
      if (u && ++u.fallidos >= MAX_INTENTOS) {
        u.bloqueadoHasta = Date.now() + MINUTOS_BLOQUEO * 60_000;
        u.fallidos = 0;
      }
      throw new ApiError(`Correo o contraseña incorrectos. Tras ${MAX_INTENTOS} intentos la cuenta se bloquea ${MINUTOS_BLOQUEO} minutos.`, 401);
    }
    u.fallidos = 0;
    return sesionDe(u);
  },

  async registrarCliente(dto) {
    await esperar();
    const email = dto.email.trim().toLowerCase();
    if (usuarios.some((x) => x.email === email)) {
      throw new ApiError('Ya existe una cuenta con este correo. Inicie sesión o recupere su contraseña.', 409);
    }
    if (dto.documento && usuarios.some((x) => x.documento === dto.documento)) {
      throw new ApiError('Ya existe una cuenta con este EIN.', 409);
    }
    const nombre = dto.tipoPersona === 'empresa' ? dto.razonSocial! : `${dto.nombres} ${dto.apellidos}`;
    const u: UsuarioMock = {
      id: `u${usuarios.length + 1}`, usuario: email, email, documento: dto.documento,
      contrasena: dto.contrasena, nombre, rol: 'Cliente', fallidos: 0,
    };
    usuarios.push(u);
    return sesionDe(u);
  },

  async solicitarRecuperacion() {
    await esperar();
  },

  async restablecerContrasena() {
    await esperar();
  },

  async refrescarSesion() {
    let raw: string | null = null;
    try { raw = sessionStorage.getItem(CLAVE_MOCK); } catch { /* sin almacenamiento */ }
    if (!raw) throw new ApiError('Su sesión venció. Vuelva a iniciar sesión.', 401);
    return JSON.parse(raw) as Sesion;
  },

  async cerrarSesion() {
    try { sessionStorage.removeItem(CLAVE_MOCK); } catch { /* sin almacenamiento */ }
  },

  async cambiarContrasenaTemporal() {
    await esperar();
    const s = await this.refrescarSesion();
    const nueva: Sesion = { ...s, usuario: { ...s.usuario, debeCambiarContrasena: false } };
    try { sessionStorage.setItem(CLAVE_MOCK, JSON.stringify(nueva)); } catch { /* sin almacenamiento */ }
    return nueva;
  },
};
