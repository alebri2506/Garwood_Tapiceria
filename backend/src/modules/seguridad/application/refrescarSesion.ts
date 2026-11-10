import { prisma } from '../../../shared/infrastructure/prisma.js';
import { NoAutorizadoError } from '../../../shared/domain/errores.js';
import { crearSesion, verificarRefreshToken } from './tokens.js';

/**
 * Emite un access token nuevo si el refresh token es válido, el usuario sigue activo y no cambió su
 * `version_sesion` (se desactivó, cambió de rol o de contraseña: decisiones D.1.6).
 */
export async function refrescarSesion(refreshToken: string | undefined) {
  if (!refreshToken) throw new NoAutorizadoError();
  const { usuarioId, recordarme, version } = verificarRefreshToken(refreshToken);
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId }, include: { rol: true, cliente: true } });
  if (!usuario || !usuario.activo || (usuario.cliente && !usuario.cliente.activo)) throw new NoAutorizadoError();
  if (usuario.versionSesion !== version) throw new NoAutorizadoError();
  return { ...crearSesion(usuario, recordarme), recordarme };
}
