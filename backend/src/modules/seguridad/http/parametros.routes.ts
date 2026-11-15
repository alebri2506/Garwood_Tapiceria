import { Router } from 'express';
import { autenticar, exigirRol, validar } from '../../../shared/http/middlewares.js';
import { guardarParametros, historialParametros, listarParametros } from '../application/parametros.js';
import { cambiarEstadoMaquina, crearMaquina, editarMaquina, listarMaquinas } from '../application/maquinas.js';
import { cambiarCarga, listarCargas } from '../application/cargas.js';
import { cargaSchema, crearMaquinaSchema, editarMaquinaSchema, estadoMaquinaSchema, guardarParametrosSchema } from './parametros.schemas.js';

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

  // A14 › Máquinas: la tarifa por hora de cada máquina (se desactivan, no se borran).
  r.get('/maquinas', async (_req, res) => {
    res.json(await listarMaquinas());
  });
  r.post('/maquinas', validar(crearMaquinaSchema), async (req, res) => {
    res.status(201).json(await crearMaquina(req.body, { usuarioId: req.usuario!.id, ip: req.ip }));
  });
  r.put('/maquinas/:id', validar(editarMaquinaSchema), async (req, res) => {
    res.json(await editarMaquina(Number(req.params.id), req.body, { usuarioId: req.usuario!.id, ip: req.ip }));
  });
  r.put('/maquinas/:id/estado', validar(estadoMaquinaSchema), async (req, res) => {
    res.json(await cambiarEstadoMaquina(Number(req.params.id), req.body.activo, { usuarioId: req.usuario!.id, ip: req.ip }));
  });

  // A14 › Tamaño de carga por tipo de mueble (transporte de la cotización).
  r.get('/cargas', async (_req, res) => {
    res.json(await listarCargas());
  });
  r.put('/cargas/:id', validar(cargaSchema), async (req, res) => {
    res.json(await cambiarCarga(Number(req.params.id), req.body.tamanoCarga, { usuarioId: req.usuario!.id, ip: req.ip }));
  });

  return r;
}
