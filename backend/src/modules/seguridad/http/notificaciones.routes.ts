import { Router } from 'express';
import { autenticar } from '../../../shared/http/middlewares.js';
import { prisma } from '../../../shared/infrastructure/prisma.js';

/** RG-05 · W11 Notificaciones: cada usuario ve solo las suyas. */
export function notificacionesRoutes() {
  const r = Router();
  r.use(autenticar);

  r.get('/', async (req, res) => {
    const [lista, sinLeer] = await Promise.all([
      prisma.notificacion.findMany({ where: { usuarioId: req.usuario!.id }, orderBy: { fecha: 'desc' }, take: 50, include: { solicitud: { select: { codigo: true } } } }),
      prisma.notificacion.count({ where: { usuarioId: req.usuario!.id, leida: false } }),
    ]);
    res.json({
      sinLeer,
      notificaciones: lista.map((n) => ({ id: n.id, tipo: n.tipo, titulo: n.titulo, mensaje: n.mensaje, enlace: n.enlace, leida: n.leida, fecha: n.fecha, solicitud: n.solicitud?.codigo ?? null })),
    });
  });

  r.post('/leer-todas', async (req, res) => {
    await prisma.notificacion.updateMany({ where: { usuarioId: req.usuario!.id, leida: false }, data: { leida: true } });
    res.status(204).end();
  });

  r.post('/:id/leida', async (req, res) => {
    await prisma.notificacion.updateMany({ where: { id: Number(req.params.id) || 0, usuarioId: req.usuario!.id }, data: { leida: true } });
    res.status(204).end();
  });

  return r;
}
