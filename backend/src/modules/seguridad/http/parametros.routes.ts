import { Router } from 'express';
import { autenticar, exigirRol, validar } from '../../../shared/http/middlewares.js';
import { guardarParametros, historialParametros, listarParametros } from '../application/parametros.js';
import { guardarParametrosSchema } from './parametros.schemas.js';

/** A14 Parámetros (CU-S05): solo el Administrador. */
export function parametrosRoutes() {
  const r = Router();
  r.use(autenticar, exigirRol('Administrador'));

  r.get('/', async (_req, res) => {
    res.json(await listarParametros());
  });

  r.get('/historial', async (req, res) => {
    const limite = Math.min(Math.max(Number(req.query.limite) || 20, 1), 100);
    res.json(await historialParametros(limite));
  });

  r.put('/', validar(guardarParametrosSchema), async (req, res) => {
    res.json(await guardarParametros(req.usuario!.id, req.body.cambios, req.ip));
  });

  return r;
}
