// CU-S01 (decisiones D.1.3): en su primer ingreso con una contraseña temporal, la persona crea una propia.
import bcrypt from 'bcryptjs';
import { prisma } from '../../../shared/infrastructure/prisma.js';
import { registrarBitacora } from '../../../shared/infrastructure/bitacora.js';
import { NoAutorizadoError, ReglaNegocioError } from '../../../shared/domain/errores.js';
import { avisoAlCliente, enviarCorreos, guardarAvisos, type Aviso } from '../../../shared/infrastructure/avisos.js';
import type { Correo } from '../../../shared/infrastructure/correo.js';
import { COSTO_BCRYPT } from './recuperarContrasena.js';
import { crearSesion, verificarRefreshToken } from './tokens.js';

/** "Recordarme" con que inició sesión (para mantener el mismo tipo de cookie); sin cookie válida, sesión del navegador. */
function recordarmeDe(refreshActual: string | undefined) {
  try { return refreshActual ? verificarRefreshToken(refreshActual).recordarme : false; } catch { return false; }
}

/**
 * W10 › Seguridad (decisiones E.4.1): cambiar la contraseña desde Mi perfil.
 *  - pide la contraseña actual y no acepta la misma;
 *  - sube `version_sesion`: las sesiones abiertas en OTROS equipos ya no se renuevan; este equipo recibe una nueva;
 *  - avisa "Su contraseña cambió" por correo y en la campana (aviso obligatorio, RG-05).
 */
export async function cambiarContrasena(usuarioId: number, actual: string, nueva: string, refreshActual: string | undefined, correo: Correo, ip?: string) {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario || !usuario.activo) throw new NoAutorizadoError();
  if (!(await bcrypt.compare(actual, usuario.contrasenaHash))) {
    throw new ReglaNegocioError('La contraseña actual no es correcta.', 400, { actual: 'La contraseña actual no es correcta.' });
  }
  if (actual === nueva) throw new ReglaNegocioError('Use una contraseña distinta de la actual.', 400, { contrasena: 'Use una contraseña distinta de la actual.' });

  const contrasenaHash = await bcrypt.hash(nueva, COSTO_BCRYPT);
  const { actualizado, avisos } = await prisma.$transaction(async (tx) => {
    const actualizado = await tx.usuario.update({
      where: { id: usuarioId },
      data: { contrasenaHash, debeCambiarContrasena: false, intentosFallidos: 0, bloqueadoHasta: null, versionSesion: { increment: 1 } },
      include: { rol: true, cliente: true },
    });
    await registrarBitacora(tx, { usuarioId, modulo: 'seguridad', accion: 'contrasena_cambiada', entidad: 'usuario', entidadId: usuarioId, valorNuevo: { temporal: false }, ip });
    const avisos: Aviso[] = actualizado.clienteId
      ? await avisoAlCliente(
        tx, actualizado.clienteId,
        { tipo: 'contrasena_cambiada', titulo: 'Su contraseña cambió', mensaje: 'Se cambió la contraseña de su cuenta y se cerraron las sesiones en otros equipos. Si no fue usted, use «¿Olvidó su contraseña?» y avise al taller.', enlace: '/cliente/perfil' },
        'GARWEB · Su contraseña cambió',
        'Se cambió la contraseña de su cuenta de GARWEB y se cerraron las sesiones abiertas en otros equipos.\n\nSi no fue usted, entre con «¿Olvidó su contraseña?» para crear una nueva y avise al taller.',
      )
      : [];
    await guardarAvisos(tx, avisos);
    return { actualizado, avisos };
  });
  await enviarCorreos(correo, avisos);

  const recordarme = recordarmeDe(refreshActual);
  return { ...crearSesion(actualizado, recordarme), recordarme };
}

/**
 * Reemplaza la contraseña temporal por una propia. Sube `version_sesion` (D.1.6): las sesiones abiertas con la
 * temporal en otros equipos ya no se renuevan; esta recibe una sesión nueva, sin la marca de "debe cambiarla".
 */
export async function cambiarContrasenaTemporal(usuarioId: number, contrasena: string, refreshActual: string | undefined, ip?: string) {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario || !usuario.activo) throw new NoAutorizadoError();
  if (!usuario.debeCambiarContrasena) throw new ReglaNegocioError('Su contraseña ya no es temporal. Para cambiarla, use “¿Olvidó su contraseña?”.');
  if (await bcrypt.compare(contrasena, usuario.contrasenaHash)) {
    throw new ReglaNegocioError('Use una contraseña distinta de la temporal.', 400, { contrasena: 'Use una contraseña distinta de la temporal.' });
  }

  const contrasenaHash = await bcrypt.hash(contrasena, COSTO_BCRYPT);
  const [actualizado] = await prisma.$transaction([
    prisma.usuario.update({
      where: { id: usuarioId },
      data: { contrasenaHash, debeCambiarContrasena: false, intentosFallidos: 0, bloqueadoHasta: null, versionSesion: { increment: 1 } },
      include: { rol: true, cliente: true },
    }),
    registrarBitacora(prisma, { usuarioId, modulo: 'seguridad', accion: 'contrasena_cambiada', entidad: 'usuario', entidadId: usuarioId, valorNuevo: { temporal: true }, ip }),
  ]);

  const recordarme = recordarmeDe(refreshActual);
  return { ...crearSesion(actualizado, recordarme), recordarme };
}

/** D.2.2: cerrar sesión también queda en la bitácora (si la cookie todavía identifica a alguien). */
export async function registrarCierreSesion(refreshActual: string | undefined, ip?: string) {
  if (!refreshActual) return;
  try {
    const { usuarioId } = verificarRefreshToken(refreshActual);
    await registrarBitacora(prisma, { usuarioId, modulo: 'seguridad', accion: 'logout', entidad: 'usuario', entidadId: usuarioId, ip });
  } catch {
    // Cookie vencida o inválida: no hay a quién atribuirlo; la salida igual se completa.
  }
}
