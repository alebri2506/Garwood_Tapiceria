import jwt from 'jsonwebtoken';
import type { Cliente, Rol, Usuario } from '@prisma/client';
import { env } from '../../../config/env.js';
import { NoAutorizadoError } from '../../../shared/domain/errores.js';

export type NombreRol = 'Administrador' | 'Tapicero' | 'Conductor' | 'Cliente';

export interface UsuarioToken {
  id: number;
  rol: NombreRol;
  clienteId: number | null;
}

/** Respuesta de login y registro: la misma forma que espera el frontend. */
export interface SesionDto {
  token: string;
  usuario: { id: string; nombre: string; rol: NombreRol };
}

type UsuarioCompleto = Usuario & { rol: Rol; cliente: Cliente | null };

export function nombreVisible(u: UsuarioCompleto) {
  if (!u.cliente) return u.nombreUsuario;
  return u.cliente.tipoPersona === 'empresa' && u.cliente.razonSocial
    ? u.cliente.razonSocial
    : `${u.cliente.nombres} ${u.cliente.apellidos}`;
}

export function emitirAccessToken(u: UsuarioToken) {
  return jwt.sign({ rol: u.rol, clienteId: u.clienteId }, env.JWT_ACCESS_SECRET, {
    subject: String(u.id),
    expiresIn: env.JWT_ACCESS_MINUTOS * 60,
  });
}

/** `rec` guarda si el usuario marcó "Recordarme", para renovar la cookie del mismo tipo. */
export function emitirRefreshToken(usuarioId: number, recordarme: boolean) {
  return jwt.sign({ rec: recordarme }, env.JWT_REFRESH_SECRET, {
    subject: String(usuarioId),
    expiresIn: env.JWT_REFRESH_DIAS * 86_400,
  });
}

export function crearSesion(u: UsuarioCompleto, recordarme: boolean): { sesion: SesionDto; refreshToken: string } {
  const rol = u.rol.nombre as NombreRol;
  return {
    sesion: {
      token: emitirAccessToken({ id: u.id, rol, clienteId: u.clienteId }),
      usuario: { id: String(u.id), nombre: nombreVisible(u), rol },
    },
    refreshToken: emitirRefreshToken(u.id, recordarme),
  };
}

export function verificarAccessToken(token: string): UsuarioToken {
  try {
    const p = jwt.verify(token, env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
    return { id: Number(p.sub), rol: p.rol, clienteId: p.clienteId ?? null };
  } catch {
    throw new NoAutorizadoError();
  }
}

export function verificarRefreshToken(token: string): { usuarioId: number; recordarme: boolean } {
  try {
    const p = jwt.verify(token, env.JWT_REFRESH_SECRET) as jwt.JwtPayload;
    return { usuarioId: Number(p.sub), recordarme: p.rec === true };
  } catch {
    throw new NoAutorizadoError();
  }
}
