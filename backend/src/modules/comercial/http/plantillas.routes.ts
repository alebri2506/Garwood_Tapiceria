import { Router, type Request } from 'express';
import { z } from 'zod';
import { autenticar, exigirRol, validar } from '../../../shared/http/middlewares.js';
import { CODIGOS_SERVICIO } from '../domain/solicitud.js';
import { catalogoPlantillas, crearPlantilla, detallePlantilla, guardarPlantilla } from '../application/plantillas.js';

// CU-C06 A16 · lo que llega al crear o guardar una plantilla (mensajes en español, listos para mostrar).
const horas = (campo: string) => z.coerce.number({ invalid_type_error: `Escriba las ${campo} con números.` }).finite().min(0, `Las ${campo} no pueden ser negativas.`).max(999, `Son demasiadas ${campo}.`);
const actividadSchema = z.object({
  nombre: z.string({ required_error: 'Escriba el nombre de la actividad.' }).trim().min(1, 'Escriba el nombre de la actividad.').max(80, 'El nombre es muy largo: máximo 80 caracteres.'),
  horasPersona: horas('horas persona'),
  maquinaId: z.number().int().positive().nullable().default(null),
  horasMaquina: horas('horas de máquina').default(0),
  // Solo materiales de stock del Inventario: la tela la elige el cliente en la cotización.
  materiales: z.array(z.object({
    materialId: z.number({ required_error: 'Elija el material.', invalid_type_error: 'Elija el material.' }).int().positive(),
    cantidad: z.coerce.number({ invalid_type_error: 'Escriba la cantidad con números.' }).finite().positive('La cantidad debe ser mayor que 0.').max(100000),
  })).max(30, 'Son demasiados materiales en una actividad.').default([]),
});
const actividadesSchema = z.array(actividadSchema).min(1, 'Agregue al menos una actividad con horas.').max(40, 'Son demasiadas actividades.');

export const crearPlantillaSchema = z.object({
  tipoMuebleId: z.number({ required_error: 'Elija el tipo de mueble.' }).int().positive(),
  servicio: z.enum(CODIGOS_SERVICIO, { errorMap: () => ({ message: 'Elija el servicio.' }) }),
  actividades: actividadesSchema,
});
export const guardarPlantillaSchema = z.object({ actividades: actividadesSchema });

const quien = (req: Request) => ({ usuarioId: req.usuario!.id, ip: req.ip });

/** A16 Plantillas de cotización: solo el Administrador. */
export function plantillasRoutes() {
  const r = Router();
  r.use(autenticar, exigirRol('Administrador'));
  r.get('/', async (_req, res) => { res.json(await catalogoPlantillas()); });
  r.get('/:id', async (req, res) => { res.json(await detallePlantilla(Number(req.params.id))); });
  r.post('/', validar(crearPlantillaSchema), async (req, res) => {
    res.status(201).json(await crearPlantilla(req.body.tipoMuebleId, req.body.servicio, req.body.actividades, quien(req)));
  });
  r.put('/:id', validar(guardarPlantillaSchema), async (req, res) => { res.json(await guardarPlantilla(Number(req.params.id), req.body.actividades, quien(req))); });
  return r;
}
