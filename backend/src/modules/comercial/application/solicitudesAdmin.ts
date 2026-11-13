import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { env } from '../../../config/env.js';
import { prisma } from '../../../shared/infrastructure/prisma.js';
import { parametroNumero } from '../../../shared/infrastructure/parametros.js';
import { registrarBitacora } from '../../../shared/infrastructure/bitacora.js';
import { avisoAlCliente, enviarCorreos, guardarAvisos, type Aviso } from '../../../shared/infrastructure/avisos.js';
import type { AlmacenArchivos } from '../../../shared/infrastructure/archivos.js';
import type { Correo } from '../../../shared/infrastructure/correo.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import { hoyNegocio, leerFecha } from '../domain/calendario.js';
import { enNY, instanteNY, sumarDias } from '../domain/agenda.js';
import { estadoVisible, etapaDe } from '../domain/solicitud.js';
import { citaDto } from './citas.js';
import { incluirSolicitud, solicitudDto } from './seguimientoSolicitud.js';

const error = (m: string, status = 400) => new ReglaNegocioError(m, status);

export const MOTIVOS_DESCARTE = ['El cliente no respondió', 'Trabajo que no hacemos', 'Solicitud duplicada', 'El cliente desistió', 'Otro motivo'] as const;
/** CU-C02: solo estas se descartan; las demás ya terminaron o tienen cotización. */
const DESCARTABLES = ['Nueva', 'En espera de cita', 'Atendida'];

const nombreCliente = (c: { tipoPersona: string; razonSocial: string | null; nombres: string; apellidos: string }) =>
  c.tipoPersona === 'empresa' && c.razonSocial ? c.razonSocial : `${c.nombres} ${c.apellidos}`.trim();

const diasDesde = (fecha: Date) => {
  const hoy = leerFecha(hoyNegocio())!.getTime();
  const d = leerFecha(fecha.toISOString().slice(0, 10))!.getTime();
  return Math.max(0, Math.round((hoy - d) / 86_400_000));
};

/**
 * A3 Solicitudes y cotizaciones · bandeja: todas las solicitudes con su etapa, búsqueda por cliente, código o mueble
 * y filtro por fecha de solicitud (`desde`/`hasta` en días de Nueva York, ambos incluidos).
 */
export async function bandeja(filtro: { estado?: string; q?: string; desde?: string; hasta?: string }) {
  const q = filtro.q?.trim();
  const desde = filtro.desde && leerFecha(filtro.desde) ? filtro.desde : undefined;
  const hasta = filtro.hasta && leerFecha(filtro.hasta) ? filtro.hasta : undefined;
  const where: Prisma.SolicitudWhereInput = {
    ...(filtro.estado ? { estado: filtro.estado } : {}),
    ...(desde || hasta ? { fechaSolicitud: { ...(desde ? { gte: instanteNY(desde) } : {}), ...(hasta ? { lt: instanteNY(sumarDias(hasta, 1)) } : {}) } } : {}),
    ...(q ? {
      OR: [
        { codigo: { contains: q, mode: 'insensitive' } },
        { cliente: { nombres: { contains: q, mode: 'insensitive' } } },
        { cliente: { apellidos: { contains: q, mode: 'insensitive' } } },
        { cliente: { razonSocial: { contains: q, mode: 'insensitive' } } },
        { cliente: { email: { contains: q, mode: 'insensitive' } } },
        { muebles: { some: { tipoMueble: { nombre: { contains: q, mode: 'insensitive' } } } } },
      ],
    } : {}),
  };
  const [lista, porEstado, diasAtraso] = await Promise.all([
    prisma.solicitud.findMany({
      where, orderBy: { fechaSolicitud: 'desc' }, take: 300,
      include: { cliente: true, direccion: true, muebles: { orderBy: { orden: 'asc' }, include: { tipoMueble: true, _count: { select: { adjuntos: true } } } }, citas: { where: { estado: 'Programada' } }, pedidos: { select: { codigo: true }, take: 1 } },
    }),
    prisma.solicitud.groupBy({ by: ['estado'], _count: { _all: true } }),
    parametroNumero(prisma, 'solicitud.dias_atraso'),
  ]);
  return {
    diasAtraso,
    conteo: Object.fromEntries(porEstado.map((g) => [g.estado, g._count._all])),
    solicitudes: lista.map((s) => {
      const dias = diasDesde(s.fechaSolicitud);
      const cita = s.citas[0] ? citaDto(s.citas[0]) : null;
      return {
        codigo: s.codigo!, estado: s.estado, estadoVisible: estadoVisible(s.estado, s.telaOpcion, s.pedidos[0]?.codigo), etapa: etapaDe(s.estado, s.pedidos[0]?.codigo),
        canal: s.canal, fecha: s.fechaSolicitud, hora: enNY(s.fechaSolicitud).hora, dias,
        cita: cita ? { id: cita.id, fecha: cita.fecha, hora: cita.hora, franja: cita.franja, tipo: cita.tipo } : null,
        atrasada: s.estado === 'Nueva' && dias >= diasAtraso,
        cliente: nombreCliente(s.cliente),
        ciudad: s.direccion?.ciudad ?? null,
        muebles: s.muebles.map((m) => `${m.cantidad > 1 ? `${m.cantidad} × ` : ''}${m.tipoMueble.nombre}`),
        archivos: s.muebles.reduce((t, m) => t + m._count.adjuntos, 0),
        tela: s.telaOpcion, esperaFotos: s.esperaFotos,
        tieneCita: s.citas.length > 0,
      };
    }),
  };
}

/** A3 · ficha completa, con el contacto del cliente y los enlaces a sus fotos y videos. */
export async function fichaAdmin(codigo: string, almacen: AlmacenArchivos) {
  const s = await prisma.solicitud.findUnique({ where: { codigo }, include: { ...incluirSolicitud, registrador: { include: { rol: true } }, pedidos: { select: { codigo: true }, take: 1 } } });
  if (!s) throw error('No encontramos esa solicitud.', 404);
  const historial = await prisma.bitacora.findMany({
    where: { OR: [{ entidad: 'solicitud', entidadId: s.id }, { entidad: 'cita', entidadId: { in: s.citas.map((c) => c.id) } }] },
    orderBy: { fecha: 'asc' }, include: { usuario: { include: { rol: true } } },
  });
  return {
    ...(await solicitudDto(s, almacen)),
    estadoVisible: estadoVisible(s.estado, s.telaOpcion, s.pedidos[0]?.codigo), etapa: etapaDe(s.estado, s.pedidos[0]?.codigo),
    pedido: s.pedidos[0]?.codigo ?? null,
    cliente: {
      id: s.cliente.id, nombre: nombreCliente(s.cliente), tipoPersona: s.cliente.tipoPersona,
      email: s.cliente.email, telefono: s.cliente.telefono, tieneCuenta: Boolean(await prisma.usuario.count({ where: { clienteId: s.cliente.id } })),
    },
    registradaPor: s.registrador.rol.nombre === 'Cliente' ? 'el cliente' : s.registrador.nombreUsuario,
    puedeDescartarse: DESCARTABLES.includes(s.estado),
    historial: historial.map((h) => ({ accion: h.accion, fecha: h.fecha, quien: h.usuario ? (h.usuario.rol.nombre === 'Cliente' ? 'Cliente' : h.usuario.nombreUsuario) : 'Sistema' })),
  };
}

/** CU-C02 Descartar con motivo: no se borra, queda Descartada con quién y cuándo; la cita programada se cancela. */
export async function descartarSolicitud(usuarioId: number, codigo: string, motivo: string, correo: Correo, ip?: string) {
  const s = await prisma.solicitud.findUnique({ where: { codigo } });
  if (!s) throw error('No encontramos esa solicitud.', 404);
  if (!DESCARTABLES.includes(s.estado)) throw error(`Una solicitud «${s.estado}» no se puede descartar.`);
  let avisos: Aviso[] = [];
  await prisma.$transaction(async (tx) => {
    await tx.solicitud.update({ where: { id: s.id }, data: { estado: 'Descartada', motivoDescarte: motivo, descartadaPor: usuarioId, fechaDescarte: new Date() } });
    await tx.cita.updateMany({ where: { solicitudId: s.id, estado: 'Programada' }, data: { estado: 'Cancelada' } });
    await registrarBitacora(tx, { usuarioId, modulo: 'comercial', accion: 'solicitud_descartada', entidad: 'solicitud', entidadId: s.id, valorAnterior: { estado: s.estado }, valorNuevo: { estado: 'Descartada', motivo }, ip });
    avisos = await avisoAlCliente(tx, s.clienteId,
      { solicitudId: s.id, tipo: 'solicitud_descartada', titulo: `Cerramos su solicitud ${codigo}`, mensaje: `Motivo: ${motivo.toLowerCase()}. Si quiere retomarla, envíe una nueva o llámenos.`, enlace: '/cliente/pedidos/solicitudes' },
      `GARWEB · Cerramos su solicitud ${codigo}`, `Cerramos su solicitud ${codigo}. Motivo: ${motivo.toLowerCase()}.\n\nSi quiere retomarla, envíe una nueva solicitud o llámenos.`);
    await guardarAvisos(tx, avisos);
  });
  await enviarCorreos(correo, avisos);
}

/** A3 · buscar clientes registrados por nombre, correo o teléfono. */
export async function buscarClientes(q: string) {
  const texto = q.trim();
  if (texto.length < 2) return [];
  const digitos = texto.replace(/\D/g, '');
  const clientes = await prisma.cliente.findMany({
    where: {
      activo: true,
      OR: [
        { nombres: { contains: texto, mode: 'insensitive' } },
        { apellidos: { contains: texto, mode: 'insensitive' } },
        { razonSocial: { contains: texto, mode: 'insensitive' } },
        { email: { contains: texto, mode: 'insensitive' } },
        ...(digitos.length >= 3 ? [{ telefono: { contains: digitos } }] : []),
      ],
    },
    take: 8,
    include: { direcciones: { where: { activo: true, guardada: true }, orderBy: [{ esPrincipal: 'desc' }, { fechaCreacion: 'asc' }] }, _count: { select: { solicitudes: true } } },
  });
  return clientes.map((c) => ({
    id: c.id, nombre: nombreCliente(c), tipoPersona: c.tipoPersona, email: c.email, telefono: c.telefono,
    ciudad: c.direcciones[0]?.ciudad ?? null, solicitudes: c._count.solicitudes,
    direcciones: c.direcciones.map((d) => ({ id: d.id, etiqueta: d.etiqueta, direccion: d.direccion, referencia: d.referencia, ciudad: d.ciudad, latitud: d.latitud == null ? null : Number(d.latitud), longitud: d.longitud == null ? null : Number(d.longitud) })),
  }));
}

export interface ClienteNuevo {
  tipoPersona: 'persona' | 'empresa';
  nombres: string;
  apellidos: string;
  razonSocial?: string;
  documento?: string;
  telefono: string;
  email?: string;
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/**
 * CU-H01 por el Administrador (cliente que llama o viene al local). Si tiene correo, se le crea la cuenta
 * con una contraseña al azar y se le envía un enlace para crear la suya (el mismo de CU-S02).
 */
export async function registrarClienteNuevo(tx: Prisma.TransactionClient, c: ClienteNuevo, canal: string, usuarioId: number, ip?: string) {
  const email = c.email?.trim().toLowerCase() || null;
  const empresa = c.tipoPersona === 'empresa';
  if (email && (await tx.usuario.findFirst({ where: { OR: [{ email }, { nombreUsuario: email }] } }) || await tx.cliente.findUnique({ where: { email } }))) {
    throw error('Ya existe un cliente con ese correo: búsquelo y elíjalo.', 409);
  }
  if (empresa && c.documento && await tx.cliente.findUnique({ where: { documento: c.documento } })) {
    throw error('Ya existe un cliente con ese EIN: búsquelo y elíjalo.', 409);
  }
  const cliente = await tx.cliente.create({
    data: {
      tipoPersona: c.tipoPersona, nombres: c.nombres.trim(), apellidos: c.apellidos.trim(),
      razonSocial: empresa ? c.razonSocial?.trim() ?? null : null, documento: empresa ? c.documento ?? null : null,
      email, telefono: c.telefono, canalRegistro: canal === 'local' ? 'local' : 'telefono',
    },
  });
  let invitacion: { email: string; token: string } | null = null;
  if (email) {
    const rol = await tx.rol.findUniqueOrThrow({ where: { nombre: 'Cliente' } });
    const usuario = await tx.usuario.create({
      data: { clienteId: cliente.id, rolId: rol.id, nombreUsuario: email, email, contrasenaHash: await bcrypt.hash(randomBytes(24).toString('base64url'), 12) },
    });
    const dias = await parametroNumero(tx, 'invitacion.dias_vigencia');
    const token = randomBytes(32).toString('base64url');
    await tx.tokenRecuperacion.create({ data: { usuarioId: usuario.id, tokenHash: sha256(token), fechaExpiracion: new Date(Date.now() + dias * 86_400_000) } });
    invitacion = { email, token };
  }
  await registrarBitacora(tx, { usuarioId, modulo: 'historial', accion: 'cliente_registrado', entidad: 'cliente', entidadId: cliente.id, valorNuevo: { tipoPersona: c.tipoPersona, canalRegistro: cliente.canalRegistro, conCuenta: Boolean(email) }, ip });
  return { cliente, invitacion };
}

export const correoInvitacion = (invitacion: { email: string; token: string }, codigo: string) => ({
  para: invitacion.email,
  asunto: 'GARWEB · Cree su contraseña para seguir su solicitud',
  texto: `Registramos su solicitud ${codigo} en Tapicería Garwood.\n\nCree su contraseña para seguirla en la web:\n${env.APP_URL}/restablecer?token=${invitacion.token}\n\nSi no hizo ninguna solicitud, ignore este correo.`,
});

export const esDuplicado = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
