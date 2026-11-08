import { API_URL, apiPost } from '../../../shared/api/http';
import type { Sesion } from '../../../shared/api/sesion';
import { authMock } from './authMock';

export interface CredencialesLogin {
  identificador: string; // correo o nombre de usuario
  contrasena: string;
  recordarme: boolean;
}

/** CU-H01: el cliente se registra como persona o empresa. */
export interface RegistroClienteDto {
  tipoPersona: 'persona' | 'empresa';
  razonSocial?: string;
  documento?: string; // EIN (solo empresa)
  nombres: string;
  apellidos: string;
  cargo?: string;
  email: string;
  telefono: string; // E.164: +1XXXXXXXXXX
  contrasena: string;
  avisosCorreo: boolean;
}

export interface AuthApi {
  /** CU-S01 */
  iniciarSesion(c: CredencialesLogin): Promise<Sesion>;
  /** CU-H01 */
  registrarCliente(dto: RegistroClienteDto): Promise<Sesion>;
  /** CU-S02: responde igual exista o no el correo, para no revelar cuentas. */
  solicitarRecuperacion(email: string): Promise<void>;
  /** CU-S02: fija la nueva contraseña con el token del enlace del correo. */
  restablecerContrasena(token: string, contrasena: string): Promise<void>;
  /** Recupera la sesión con la cookie de refresh (al recargar o cuando vence el access token). */
  refrescarSesion(): Promise<Sesion>;
  /** Borra la cookie de refresh en el servidor. */
  cerrarSesion(): Promise<void>;
}

const httpAuthApi: AuthApi = {
  iniciarSesion: (c) => apiPost<Sesion>('/auth/login', c),
  registrarCliente: (dto) => apiPost<Sesion>('/auth/registro', dto),
  solicitarRecuperacion: (email) => apiPost<void>('/auth/recuperar', { email }),
  restablecerContrasena: (token, contrasena) => apiPost<void>('/auth/restablecer', { token, contrasena }),
  refrescarSesion: () => apiPost<Sesion>('/auth/refresh', {}),
  cerrarSesion: () => apiPost<void>('/auth/logout', {}),
};

// Sin backend configurado se usa la API simulada para poder recorrer las pantallas.
export const authApi: AuthApi = API_URL ? httpAuthApi : authMock;
