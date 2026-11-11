// CU-H02 Actualizar cliente, lado del cliente: W10 Mi perfil (decisiones-recientes.md, sección E).
// RG-07: el cliente sale SIEMPRE de la sesión; ninguna función recibe un id de cliente desde la URL o el formulario.
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Cliente } from '@prisma/client';
import { env } from '../../../config/env.js';
import { prisma } from '../../../shared/infrastructure/prisma.js';
import { parametroNumero } from '../../../shared/infrastructure/parametros.js';
import { registrarBitacora } from '../../../shared/infrastructure/bitacora.js';
import { avisoAlCliente, enviarCorreos, guardarAvisos, type Aviso } from '../../../shared/infrastructure/avisos.js';
import type { Correo } from '../../../shared/infrastructure/correo.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import { OBLIGATORIOS_EN_PERFIL } from '../../../shared/domain/tiposAviso.js';
import { direccionesDelCliente } from '../../comercial/application/catalogoSolicitud.js';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const CORREO_REPETIDO = 'Ya existe una cuenta con ese correo.';

/** El cliente de la sesión (solo un usuario con rol Cliente tiene cliente asociado). */
async function clienteDeSesion(usuarioId: number) {
  const u = await prisma.usuario.findUnique({ where: { id: usuarioId }, include: { cliente: true } });
  if (!u?.cliente) throw new ReglaNegocioError('Solo un cliente tiene Mi perfil.', 403);
  return { usuario: u, cliente: u.cliente };
}

const datosDto = (c: Cliente) => ({
  tipoPersona: c.tipoPersona as 'persona' | 'empresa',
  nombres: c.nombres, apellidos: c.apellidos,
  razonSocial: c.razonSocial, documento: c.documento, cargo: c.cargo,
  email: c.email, telefono: c.telefono,
});

/** El correo que espera confirmación, si hay uno vigente. */
async function correoPendiente(usuarioId: number) {
  const p = await prisma.cambioCorreo.findFirst({
    where: { usuarioId, fechaUso: null, fechaExpiracion: { gt: new Date() } },
    orderBy: { id: 'desc' },
  });
  return p ? { email: p.emailNuevo, vence: p.fechaExpiracion.toISOString() } : null;
}

/** E.4.2: el ingreso anterior al actual (el último "login" es el de esta sesión). */
async function ultimoIngreso(usuarioId: number) {
  const ingresos = await prisma.bitacora.findMany({ where: { usuarioId, accion: 'login' }, orderBy: { fecha: 'desc' }, take: 2, select: { fecha: true } });
  return (ingresos[1] ?? null)?.fecha.toISOString() ?? null;
}

/** W10: todo lo que muestra Mi perfil. */
export async function verPerfil(usuarioId: number) {
  const { cliente } = await clienteDeSesion(usuarioId);
  const [direcciones, pendiente, ultimo] = await Promise.all([direccionesDelCliente(cliente.id), correoPendiente(usuarioId), ultimoIngreso(usuarioId)]);
  return {
    datos: datosDto(cliente),
    clienteDesde: cliente.fechaRegistro.toISOString(),
    correoPendiente: pendiente,
    direcciones,
    avisos: { informativos: cliente.aceptaAvisosCorreo, novedades: cliente.aceptaNovedades, obligatorios: OBLIGATORIOS_EN_PERFIL },
    ultimoIngreso: ultimo,
  };
}

export interface DatosEditables { nombres?: string; apellidos?: string; telefono?: string; razonSocial?: string; cargo?: string | null }

/**
 * E.1: guarda los datos que el cliente puede cambiar. El tipo (persona o empresa) y el EIN no se cambian aquí
 * (los rechaza el esquema). Nombre de la empresa y cargo solo existen para una empresa.
 */
export async function guardarDatos(usuarioId: number, e: DatosEditables, ip?: string) {
  const { cliente } = await clienteDeSesion(usuarioId);
  if (cliente.tipoPersona !== 'empresa' && (e.razonSocial !== undefined || e.cargo !== undefined)) {
    throw new ReglaNegocioError('El nombre de la empresa y el cargo son solo para clientes empresa.');
  }
  const antes: Record<string, unknown> = {}, despues: Record<string, unknown> = {};
  for (const campo of ['nombres', 'apellidos', 'telefono', 'razonSocial', 'cargo'] as const) {
    const nuevo = e[campo];
    if (nuevo === undefined || nuevo === cliente[campo]) continue;
    antes[campo] = cliente[campo];
    despues[campo] = nuevo;
  }
  if (!Object.keys(despues).length) return { datos: datosDto(cliente) };

  const [actualizado] = await prisma.$transaction([
    prisma.cliente.update({ where: { id: cliente.id }, data: despues }),
    registrarBitacora(prisma, {
      usuarioId, modulo: 'historial', accion: 'cliente_actualizado', entidad: 'cliente', entidadId: cliente.id,
      valorAnterior: antes as never, valorNuevo: despues as never, ip,
    }),
  ]);
  return { datos: datosDto(actualizado) };
}

/**
 * E.1.4 (paso 1 de 2): el cliente pide cambiar su correo. Se confirma con su contraseña; se envía un enlace al correo
 * NUEVO y se avisa al ANTERIOR. Hasta que abra el enlace, sigue entrando con el correo de siempre.
 */
export async function pedirCambioCorreo(usuarioId: number, emailNuevo: string, contrasena: string, correo: Correo, ip?: string) {
  const { usuario, cliente } = await clienteDeSesion(usuarioId);
  if (!(await bcrypt.compare(contrasena, usuario.contrasenaHash))) {
    throw new ReglaNegocioError('La contraseña no es correcta.', 400, { contrasena: 'La contraseña no es correcta.' });
  }
  if (emailNuevo === cliente.email) throw new ReglaNegocioError('Ese ya es su correo.', 400, { email: 'Ese ya es su correo.' });
  if (await correoOcupado(emailNuevo, usuario.id, cliente.id)) throw new ReglaNegocioError(CORREO_REPETIDO, 409, { email: CORREO_REPETIDO });

  const horas = await parametroNumero(prisma, 'correo.horas_confirmacion');
  const token = randomBytes(32).toString('base64url');
  const vence = new Date(Date.now() + horas * 3_600_000);
  const enlace = `${env.APP_URL}/confirmar-correo?token=${token}`;

  const avisos: Aviso[] = await prisma.$transaction(async (tx) => {
    // Un pedido nuevo anula el anterior que no se confirmó.
    await tx.cambioCorreo.updateMany({ where: { usuarioId, fechaUso: null }, data: { fechaUso: new Date() } });
    await tx.cambioCorreo.create({ data: { usuarioId, emailNuevo, tokenHash: sha256(token), fechaExpiracion: vence } });
    await registrarBitacora(tx, {
      usuarioId, modulo: 'historial', accion: 'correo_cambio_solicitado', entidad: 'cliente', entidadId: cliente.id,
      valorAnterior: { email: cliente.email }, valorNuevo: { email: emailNuevo }, ip,
    });
    // Al correo ANTERIOR (y a la campana): obligatorio, por seguridad.
    const alAnterior = await avisoAlCliente(
      tx, cliente.id,
      { tipo: 'correo_cambio_solicitado', titulo: 'Se pidió cambiar su correo', mensaje: `Se pidió cambiar el correo de su cuenta a ${emailNuevo}. Se aplicará cuando lo confirme desde ese correo.`, enlace: '/cliente/perfil' },
      'GARWEB · Se pidió cambiar su correo',
      `Se pidió cambiar el correo de su cuenta de GARWEB a ${emailNuevo}.\n\nMientras no se confirme desde ese correo, usted sigue entrando con este.\n\nSi no fue usted, entre a GARWEB y cambie su contraseña.`,
    );
    await guardarAvisos(tx, alAnterior);
    return alAnterior;
  });

  // Al correo NUEVO: solo el enlace (no va a la campana: es para comprobar que el correo existe y es suyo).
  await enviarCorreos(correo, [...avisos, {
    usuarioId, tipo: 'correo_confirmacion', titulo: '', mensaje: '',
    correo: {
      para: emailNuevo,
      asunto: 'GARWEB · Confirme su correo nuevo',
      texto: `Pidió usar este correo para entrar a GARWEB.\n\nConfírmelo aquí (vence en ${horas} horas):\n${enlace}\n\nSi no fue usted, ignore este mensaje; nada cambia.`,
    },
  }]);
  return { correoPendiente: { email: emailNuevo, vence: vence.toISOString() } };
}

/** ¿Lo usa otra cuenta (como correo o como usuario) u otro cliente? */
async function correoOcupado(email: string, usuarioId: number, clienteId: number) {
  const [usuario, otroCliente] = await Promise.all([
    prisma.usuario.findFirst({ where: { OR: [{ email }, { nombreUsuario: email }], NOT: { id: usuarioId } } }),
    prisma.cliente.findFirst({ where: { email, NOT: { id: clienteId } } }),
  ]);
  return Boolean(usuario || otroCliente);
}

/**
 * E.1.4 (paso 2 de 2): el cliente abrió el enlace del correo nuevo. Desde ahora entra con ese correo; el anterior
 * deja de servir. No pide sesión: el enlace puede abrirse en otro equipo (el token prueba que el correo es suyo).
 */
export async function confirmarCambioCorreo(token: string, ip?: string) {
  const pedido = await prisma.cambioCorreo.findUnique({ where: { tokenHash: sha256(token) }, include: { usuario: { include: { cliente: true } } } });
  if (!pedido || pedido.fechaUso || pedido.fechaExpiracion.getTime() < Date.now() || !pedido.usuario.cliente) {
    throw new ReglaNegocioError('El enlace venció o ya se usó. Vuelva a pedir el cambio desde Mi perfil.', 400);
  }
  const { usuario } = pedido;
  const cliente = usuario.cliente!;
  // Otra cuenta pudo registrarse con ese correo mientras tanto.
  if (await correoOcupado(pedido.emailNuevo, usuario.id, cliente.id)) {
    await prisma.cambioCorreo.update({ where: { id: pedido.id }, data: { fechaUso: new Date() } });
    throw new ReglaNegocioError(`${CORREO_REPETIDO} Pida el cambio con otro correo.`, 409);
  }

  await prisma.$transaction([
    prisma.cambioCorreo.update({ where: { id: pedido.id }, data: { fechaUso: new Date(), confirmado: true } }),
    prisma.cliente.update({ where: { id: cliente.id }, data: { email: pedido.emailNuevo } }),
    // El cliente entra con su correo: el usuario de la cuenta es el mismo correo.
    prisma.usuario.update({
      where: { id: usuario.id },
      data: { email: pedido.emailNuevo, ...(usuario.nombreUsuario === usuario.email && { nombreUsuario: pedido.emailNuevo }) },
    }),
    registrarBitacora(prisma, {
      usuarioId: usuario.id, modulo: 'historial', accion: 'correo_cambiado', entidad: 'cliente', entidadId: cliente.id,
      valorAnterior: { email: cliente.email }, valorNuevo: { email: pedido.emailNuevo }, ip,
    }),
  ]);
  return { email: pedido.emailNuevo };
}

/**
 * E.3: los dos interruptores de W10. Solo afectan al correo; los avisos obligatorios llegan siempre y la campana
 * (W11) siempre muestra todo.
 */
export async function guardarPreferenciasAvisos(usuarioId: number, e: { informativos?: boolean; novedades?: boolean }, ip?: string) {
  const { cliente } = await clienteDeSesion(usuarioId);
  const antes: Record<string, boolean> = {}, despues: Record<string, boolean> = {};
  if (e.informativos !== undefined && e.informativos !== cliente.aceptaAvisosCorreo) {
    antes.informativos = cliente.aceptaAvisosCorreo;
    despues.informativos = e.informativos;
  }
  if (e.novedades !== undefined && e.novedades !== cliente.aceptaNovedades) {
    antes.novedades = cliente.aceptaNovedades;
    despues.novedades = e.novedades;
  }
  if (Object.keys(despues).length) {
    await prisma.$transaction([
      prisma.cliente.update({
        where: { id: cliente.id },
        data: { ...('informativos' in despues && { aceptaAvisosCorreo: despues.informativos }), ...('novedades' in despues && { aceptaNovedades: despues.novedades }) },
      }),
      registrarBitacora(prisma, {
        usuarioId, modulo: 'historial', accion: 'avisos_actualizados', entidad: 'cliente', entidadId: cliente.id,
        valorAnterior: antes, valorNuevo: despues, ip,
      }),
    ]);
  }
  const c = await prisma.cliente.findUniqueOrThrow({ where: { id: cliente.id } });
  return { avisos: { informativos: c.aceptaAvisosCorreo, novedades: c.aceptaNovedades, obligatorios: OBLIGATORIOS_EN_PERFIL } };
}
