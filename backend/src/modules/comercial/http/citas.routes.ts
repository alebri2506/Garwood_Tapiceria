import { Router } from 'express';
import { autenticar, exigirRol, validar } from '../../../shared/http/middlewares.js';
import type { Correo } from '../../../shared/infrastructure/correo.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import { agendarCita, cancelarCita, disponibilidad, registrarResultado, reprogramarCita, type Quien } from '../application/citas.js';
import { agendarSchema, reprogramarSchema, resultadoSchema } from './comercial.schemas.js';

const quien = (req: { usuario?: { id: number; rol: Quien['rol'] }; ip?: string }): Quien => ({ usuarioId: req.usuario!.id, rol: req.usuario!.rol, ip: req.ip });
const idDe = (v: unknown) => {
  const id = Number(v);
  if (!Number.isInteger(id) || id <= 0) throw new ReglaNegocioError('No encontramos esa cita.', 404);
  return id;
};

/** CU-C03/C04: turnos libres, programar, reprogramar y cancelar citas en el local y visitas a domicilio. */
export function citasRoutes(deps: { correo: Correo }) {
  const r = Router();
  r.use(autenticar, exigirRol('Cliente', 'Administrador'));

  r.get('/disponibilidad', async (req, res) => {
    const tipo = req.query.tipo === 'domicilio' ? 'domicilio' : 'local';
    res.json(await disponibilidad(tipo, String(req.query.desde ?? ''), Number(req.query.dias ?? 42) || 42));
  });

  r.post('/', validar(agendarSchema), async (req, res) => {
    res.status(201).json(await agendarCita(quien(req), req.body, deps.correo));
  });

  r.post('/:id/reprogramar', validar(reprogramarSchema), async (req, res) => {
    res.json(await reprogramarCita(quien(req), idDe(req.params.id), req.body, deps.correo));
  });

  r.post('/:id/cancelar', async (req, res) => {
    res.json(await cancelarCita(quien(req), idDe(req.params.id), deps.correo));
  });

  // CU-C04/C05: cómo terminó la cita (solo el taller).
  r.post('/:id/resultado', exigirRol('Administrador'), validar(resultadoSchema), async (req, res) => {
    res.json(await registrarResultado(quien(req), idDe(req.params.id), req.body.resultado, deps.correo));
  });

  return r;
}
