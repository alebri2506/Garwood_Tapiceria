import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../../../config/env.js';
import { prisma } from '../../../shared/infrastructure/prisma.js';
import { parametroNumero } from '../../../shared/infrastructure/parametros.js';
import { registrarBitacora } from '../../../shared/infrastructure/bitacora.js';
import type { Correo } from '../../../shared/infrastructure/correo.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';

export const COSTO_BCRYPT = 12;
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/**
 * CU-S02 Recuperar contraseña (paso 1): envía un enlace con caducidad.
 * Responde igual exista o no el correo, para no revelar qué cuentas hay.
 */
export async function solicitarRecuperacion(email: string, correo: Correo, ip?: string) {
  const usuario = await prisma.usuario.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!usuario || !usuario.activo) return;

  const minutos = await parametroNumero(prisma, 'recuperacion.minutos_vigencia');
  const token = randomBytes(32).toString('base64url');
  await prisma.$transaction([
    // Un enlace nuevo invalida los anteriores que no se usaron.
    prisma.tokenRecuperacion.updateMany({ where: { usuarioId: usuario.id, fechaUso: null }, data: { fechaUso: new Date() } }),
    prisma.tokenRecuperacion.create({
      data: { usuarioId: usuario.id, tokenHash: sha256(token), fechaExpiracion: new Date(Date.now() + minutos * 60_000) },
    }),
    registrarBitacora(prisma, { usuarioId: usuario.id, modulo: 'seguridad', accion: 'recuperacion_solicitada', entidad: 'usuario', entidadId: usuario.id, ip }),
  ]);

  const enlace = `${env.APP_URL}/restablecer?token=${token}`;
  await correo.enviar({
    para: usuario.email,
    asunto: 'GARWEB · Cree una nueva contraseña',
    texto: `Recibimos un pedido para cambiar su contraseña de GARWEB.\n\nCree una nueva aquí (vence en ${minutos} minutos):\n${enlace}\n\nSi no fue usted, ignore este correo; su contraseña no cambia.`,
  });
}

/** CU-S02 Recuperar contraseña (paso 2): fija la nueva contraseña con el token del enlace. */
export async function restablecerContrasena(token: string, contrasena: string, ip?: string) {
  const registro = await prisma.tokenRecuperacion.findUnique({ where: { tokenHash: sha256(token) } });
  if (!registro || registro.fechaUso || registro.fechaExpiracion.getTime() < Date.now()) {
    throw new ReglaNegocioError('El enlace venció o ya se usó. Pida uno nuevo desde "¿Olvidó su contraseña?".', 400);
  }

  const contrasenaHash = await bcrypt.hash(contrasena, COSTO_BCRYPT);
  await prisma.$transaction([
    prisma.tokenRecuperacion.update({ where: { id: registro.id }, data: { fechaUso: new Date() } }),
    // Cambiar la contraseña también levanta un bloqueo por intentos fallidos.
    prisma.usuario.update({ where: { id: registro.usuarioId }, data: { contrasenaHash, intentosFallidos: 0, bloqueadoHasta: null } }),
    registrarBitacora(prisma, { usuarioId: registro.usuarioId, modulo: 'seguridad', accion: 'contrasena_restablecida', entidad: 'usuario', entidadId: registro.usuarioId, ip }),
  ]);
}
