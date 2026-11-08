import { prisma } from '../../../shared/infrastructure/prisma.js';
import { NoAutorizadoError } from '../../../shared/domain/errores.js';
import { crearSesion, verificarRefreshToken } from './tokens.js';

/** Emite un access token nuevo si el refresh token es válido y el usuario sigue activo. */
export async function refrescarSesion(refreshToken: string | undefined) {
  if (!refreshToken) throw new NoAutorizadoError();
  const { usuarioId, recordarme } = verificarRefreshToken(refreshToken);
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId }, include: { rol: true, cliente: true } });
  if (!usuario || !usuario.activo || (usuario.cliente && !usuario.cliente.activo)) throw new NoAutorizadoError();
  return { ...crearSesion(usuario, recordarme), recordarme };
}
