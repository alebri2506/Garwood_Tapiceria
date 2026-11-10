import { Router, type Request } from 'express';
import { z } from 'zod';
import { autenticar, exigirRol } from '../../../shared/http/middlewares.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import { MODULOS } from '../domain/auditoria.js';
import { exportarActividad, listarActividad } from '../application/auditoria.js';

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha no es válida').optional();
const filtrosSchema = z.object({
  desde: fecha,
  hasta: fecha,
  usuarioId: z.coerce.number().int().positive('Elija un usuario de la lista').optional(),
  modulo: z.enum(MODULOS.map((m) => m.codigo) as [string, ...string[]], { errorMap: () => ({ message: 'Elija un módulo de la lista' }) }).optional(),
  q: z.string().trim().max(100, 'La búsqueda es muy larga').optional(),
  pagina: z.coerce.number().int().min(1).max(1000).default(1),
});

/** Filtros de la URL (?desde=&hasta=&usuarioId=&modulo=&q=&pagina=); los vacíos se ignoran. */
function leerFiltros(req: Request) {
  const query = Object.fromEntries(Object.entries(req.query).filter(([, v]) => typeof v === 'string' && v.trim() !== ''));
  const r = filtrosSchema.safeParse(query);
  if (!r.success) throw new ReglaNegocioError(r.error.issues[0]?.message ?? 'Los filtros no son válidos.');
  return r.data;
}

/** A20 › Registro de actividad (CU-S06): solo el Administrador. */
export function auditoriaRoutes() {
  const r = Router();
  r.use(autenticar, exigirRol('Administrador'));

  r.get('/', async (req, res) => {
    const { pagina, ...filtros } = leerFiltros(req);
    res.json(await listarActividad(filtros, pagina));
  });

  r.get('/exportar', async (req, res) => {
    const { pagina: _, ...filtros } = leerFiltros(req);
    const { csv, nombre, truncado } = await exportarActividad(req.usuario!.id, filtros, req.ip);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.setHeader('Cache-Control', 'no-store');
    if (truncado) res.setHeader('X-Registro-Truncado', '1');
    res.send(csv);
  });

  return r;
}
