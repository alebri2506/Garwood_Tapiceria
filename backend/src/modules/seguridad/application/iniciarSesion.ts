import bcrypt from 'bcryptjs';
import { prisma } from '../../../shared/infrastructure/prisma.js';
import { parametroNumero } from '../../../shared/infrastructure/parametros.js';
import { registrarBitacora } from '../../../shared/infrastructure/bitacora.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import { crearSesion } from './tokens.js';

// Se compara contra este hash cuando el usuario no existe, para que la respuesta tarde lo mismo
// y no revele qué correos están registrados.
const HASH_FICTICIO = bcrypt.hashSync('garweb-usuario-inexistente', 10);

const mensajeBloqueo = (minutos: number) =>
  `Cuenta bloqueada por intentos fallidos. Intente de nuevo en ${minutos} minuto${minutos === 1 ? '' : 's'}.`;

/** CU-S01 Iniciar sesión: clientes y personal entran con correo o usuario y contraseña. */
export async function iniciarSesion(
  entrada: { identificador: string; contrasena: string; recordarme: boolean },
  ip?: string,
) {
  const identificador = entrada.identificador.trim().toLowerCase();
  const [maxIntentos, minutosBloqueo] = await Promise.all([
    parametroNumero(prisma, 'login.max_intentos'),
    parametroNumero(prisma, 'login.minutos_bloqueo'),
  ]);
  const credencialesInvalidas = new ReglaNegocioError(
    `Correo o contraseña incorrectos. Tras ${maxIntentos} intentos la cuenta se bloquea ${minutosBloqueo} minutos.`,
    401,
  );

  const usuario = await prisma.usuario.findFirst({
    where: { OR: [{ email: identificador }, { nombreUsuario: identificador }] },
    include: { rol: true, cliente: true },
  });
  if (!usuario) {
    await bcrypt.compare(entrada.contrasena, HASH_FICTICIO);
    throw credencialesInvalidas;
  }

  const ahora = Date.now();
  if (usuario.bloqueadoHasta && usuario.bloqueadoHasta.getTime() > ahora) {
    throw new ReglaNegocioError(mensajeBloqueo(Math.ceil((usuario.bloqueadoHasta.getTime() - ahora) / 60_000)), 423);
  }

  if (!(await bcrypt.compare(entrada.contrasena, usuario.contrasenaHash))) {
    // increment es atómico: dos intentos simultáneos no se pisan el contador.
    const { intentosFallidos } = await prisma.usuario.update({
      where: { id: usuario.id },
      data: { intentosFallidos: { increment: 1 } },
    });
    if (intentosFallidos >= maxIntentos) {
      await prisma.$transaction([
        prisma.usuario.update({
          where: { id: usuario.id },
          data: { intentosFallidos: 0, bloqueadoHasta: new Date(ahora + minutosBloqueo * 60_000) },
        }),
        registrarBitacora(prisma, { usuarioId: usuario.id, modulo: 'seguridad', accion: 'cuenta_bloqueada', entidad: 'usuario', entidadId: usuario.id, ip }),
      ]);
      throw new ReglaNegocioError(mensajeBloqueo(minutosBloqueo), 423);
    }
    await registrarBitacora(prisma, { usuarioId: usuario.id, modulo: 'seguridad', accion: 'login_fallido', entidad: 'usuario', entidadId: usuario.id, ip });
    throw credencialesInvalidas;
  }

  // Solo se informa que la cuenta está inactiva a quien demostró conocer la contraseña.
  if (!usuario.activo || (usuario.cliente && !usuario.cliente.activo)) {
    throw new ReglaNegocioError('Su cuenta está desactivada. Comuníquese con Garwood para reactivarla.', 403);
  }

  await prisma.$transaction([
    prisma.usuario.update({ where: { id: usuario.id }, data: { intentosFallidos: 0, bloqueadoHasta: null } }),
    registrarBitacora(prisma, { usuarioId: usuario.id, modulo: 'seguridad', accion: 'login', entidad: 'usuario', entidadId: usuario.id, ip }),
  ]);
  return crearSesion(usuario, entrada.recordarme);
}
