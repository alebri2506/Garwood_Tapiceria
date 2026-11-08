import type { Correo } from './correo.js';
import { logger } from './logger.js';
import { prisma, type Db } from './prisma.js';

/** Un aviso para un usuario: siempre queda como notificación y, si trae correo, también se envía (RG-05). */
export interface Aviso {
  usuarioId: number;
  solicitudId?: number;
  tipo: string;
  titulo: string;
  mensaje: string;
  enlace?: string;
  correo?: { para: string; asunto: string; texto: string };
}

/** Guarda las notificaciones (dentro de la transacción del caso de uso). */
export async function guardarAvisos(db: Db, avisos: Aviso[]) {
  if (!avisos.length) return;
  await db.notificacion.createMany({
    data: avisos.map(({ correo: _c, ...a }) => ({ ...a, solicitudId: a.solicitudId ?? null, enlace: a.enlace ?? null })),
  });
}

/** Envía los correos después de confirmar la transacción: si el correo falla, lo hecho no se deshace. */
export async function enviarCorreos(correo: Correo, avisos: Aviso[]) {
  for (const a of avisos) {
    if (!a.correo) continue;
    try {
      await correo.enviar(a.correo);
    } catch (err) {
      logger.error({ err, tipo: a.tipo, usuarioId: a.usuarioId }, 'No se pudo enviar el correo del aviso (la notificación sí quedó)');
    }
  }
}

/** Usuarios activos con rol Administrador: reciben los avisos del taller. */
export async function administradores(db: Db = prisma) {
  return db.usuario.findMany({ where: { activo: true, rol: { nombre: 'Administrador' } }, select: { id: true } });
}

/** Avisos para todos los administradores (solo notificación en la plataforma). */
export async function avisosAlTaller(db: Db, a: Omit<Aviso, 'usuarioId' | 'correo'>): Promise<Aviso[]> {
  return (await administradores(db)).map((u) => ({ ...a, usuarioId: u.id }));
}

/** Aviso al cliente de una solicitud: notificación si tiene usuario y correo si lo tiene y acepta avisos. */
export async function avisoAlCliente(db: Db, clienteId: number, a: Omit<Aviso, 'usuarioId' | 'correo'>, asunto: string, texto: string): Promise<Aviso[]> {
  const cliente = await db.cliente.findUnique({ where: { id: clienteId }, include: { usuario: true } });
  if (!cliente?.usuario) return [];
  const correo = cliente.email && cliente.aceptaAvisosCorreo ? { para: cliente.email, asunto, texto } : undefined;
  return [{ ...a, usuarioId: cliente.usuario.id, correo }];
}
