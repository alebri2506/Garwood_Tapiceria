import jwt from 'jsonwebtoken';
import type { Cliente, Rol, Usuario } from '@prisma/client';
import { env } from '../../../config/env.js';
import { NoAutorizadoError } from '../../../shared/domain/errores.js';

export type NombreRol = 'Administrador' | 'Tapicero' | 'Conductor' | 'Cliente';

export interface UsuarioToken {
  id: number;
  rol: NombreRol;
  clienteId: number | null;
  /** D.1.3: entró con una contraseña temporal; la API solo le deja cambiarla (ver `autenticar`). */
  debeCambiarContrasena: boolean;
}

/** Respuesta de login y registro: la misma forma que espera el frontend. */
export interface SesionDto {
  token: string;
  usuario: { id: string; nombre: string; rol: NombreRol; debeCambiarContrasena: boolean };
}

type UsuarioCompleto = Usuario & { rol: Rol; cliente: Cliente | null };

/** El personal se muestra con su nombre ("Carlos"); el cliente, con su nombre o el de su empresa. */
export function nombreVisible(u: UsuarioCompleto) {
  if (!u.cliente) return u.nombre ?? u.nombreUsuario;
  return u.cliente.tipoPersona === 'empresa' && u.cliente.razonSocial
    ? u.cliente.razonSocial
    : `${u.cliente.nombres} ${u.cliente.apellidos}`;
}

export function emitirAccessToken(u: UsuarioToken) {
  // `cc` (cambiar contraseña) solo va cuando hace falta.
  return jwt.sign({ rol: u.rol, clienteId: u.clienteId, ...(u.debeCambiarContrasena && { cc: true }) }, env.JWT_ACCESS_SECRET, {
    subject: String(u.id),
    expiresIn: env.JWT_ACCESS_MINUTOS * 60,
  });
}

/**
 * `rec` guarda si el usuario marcó "Recordarme", para renovar la cookie del mismo tipo.
 * `ver` es la `version_sesion` del usuario al emitirlo: si luego se desactiva, cambia de rol o de contraseña,
 * la versión sube y este token ya no renueva la sesión (decisiones D.1.6).
 */
export function emitirRefreshToken(usuarioId: number, recordarme: boolean, version = 0) {
  return jwt.sign({ rec: recordarme, ver: version }, env.JWT_REFRESH_SECRET, {
    subject: String(usuarioId),
    expiresIn: env.JWT_REFRESH_DIAS * 86_400,
  });
}

export function crearSesion(u: UsuarioCompleto, recordarme: boolean): { sesion: SesionDto; refreshToken: string } {
  const rol = u.rol.nombre as NombreRol;
  return {
    sesion: {
      token: emitirAccessToken({ id: u.id, rol, clienteId: u.clienteId, debeCambiarContrasena: u.debeCambiarContrasena }),
      usuario: { id: String(u.id), nombre: nombreVisible(u), rol, debeCambiarContrasena: u.debeCambiarContrasena },
    },
    refreshToken: emitirRefreshToken(u.id, recordarme, u.versionSesion),
  };
}

export function verificarAccessToken(token: string): UsuarioToken {
  try {
    const p = jwt.verify(token, env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
    return { id: Number(p.sub), rol: p.rol, clienteId: p.clienteId ?? null, debeCambiarContrasena: p.cc === true };
  } catch {
    throw new NoAutorizadoError();
  }
}

export function verificarRefreshToken(token: string): { usuarioId: number; recordarme: boolean; version: number } {
  try {
    const p = jwt.verify(token, env.JWT_REFRESH_SECRET) as jwt.JwtPayload;
    // Los tokens emitidos antes de version_sesion no traen `ver`: cuentan como versión 0.
    return { usuarioId: Number(p.sub), recordarme: p.rec === true, version: typeof p.ver === 'number' ? p.ver : 0 };
  } catch {
    throw new NoAutorizadoError();
  }
}
