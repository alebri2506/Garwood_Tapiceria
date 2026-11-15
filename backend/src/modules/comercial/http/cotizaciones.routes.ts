import { Router, type Request } from 'express';
import { z } from 'zod';
import { autenticar, exigirRol, validar } from '../../../shared/http/middlewares.js';
import type { Dependencias } from '../../../app.js';
import { armarCotizacion, guardarBorrador, publicarCotizacion } from '../application/cotizaciones.js';

const numero = (que: string, max = 100000) => z.coerce.number({ invalid_type_error: `Escriba ${que} con números.` }).finite().min(0, `${que[0]!.toUpperCase()}${que.slice(1)} no puede ser negativo.`).max(max);
const actividadSchema = z.object({
  nombre: z.string().trim().max(80, 'El nombre de la actividad es muy largo: máximo 80 caracteres.').default(''),
  horasPersona: numero('las horas persona', 999),
  maquinaId: z.number().int().positive().nullable().default(null),
  horasMaquina: numero('las horas de máquina', 999).default(0),
  materiales: z.array(z.object({
    materialId: z.number({ required_error: 'Elija el material.' }).int().positive(),
    cantidad: z.coerce.number().finite().positive('La cantidad debe ser mayor que 0.').max(100000),
  })).max(30).default([]),
});
const muebleSchema = z.object({
  solicitudMuebleId: z.number().int().positive(),
  actividades: z.array(actividadSchema).max(40, 'Son demasiadas actividades.'),
  telas: z.array(z.object({ materialId: z.number().int().positive(), yardas: numero('las yardas', 999) })).max(12).default([]),
  propuesto: numero('el precio propuesto', 1_000_000),
  motivo: z.string().trim().max(160, 'El motivo es muy largo: máximo 160 caracteres.').optional(),
  revisado: z.boolean().default(false),
});
export const cotizacionSchema = z.object({
  muebles: z.array(muebleSchema).min(1).max(20),
  transporte: z.object({
    manual: z.boolean().default(false),
    monto: numero('el transporte', 100000).optional(),
    motivo: z.string().trim().max(160, 'El motivo es muy largo: máximo 160 caracteres.').optional(),
  }).default({ manual: false }),
  adelanto: numero('el adelanto', 1_000_000).nullable().default(null),
  observaciones: z.string().max(1000, 'Las observaciones son muy largas: máximo 1000 caracteres.').default(''),
});

const quien = (req: Request) => ({ usuarioId: req.usuario!.id, ip: req.ip });
const codigo = (req: Request) => String(req.params.solicitud);

/** A4 Armar cotización (CU-C07, C08, C11): solo el Administrador. */
export function cotizacionesRoutes(deps: Dependencias) {
  const r = Router();
  r.use(autenticar, exigirRol('Administrador'));
  r.get('/armar/:solicitud', async (req, res) => { res.json(await armarCotizacion(codigo(req), deps.almacen, deps.rutas)); });
  r.put('/armar/:solicitud', validar(cotizacionSchema), async (req, res) => { res.json(await guardarBorrador(codigo(req), req.body, quien(req), deps.rutas)); });
  r.post('/armar/:solicitud/publicar', validar(cotizacionSchema), async (req, res) => {
    res.json(await publicarCotizacion(codigo(req), req.body, quien(req), deps.rutas, deps.correo));
  });
  return r;
}
