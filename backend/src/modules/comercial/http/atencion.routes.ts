import { Router, type Request } from 'express';
import { z } from 'zod';
import { autenticar, exigirRol, validar } from '../../../shared/http/middlewares.js';
import type { Dependencias } from '../../../app.js';
import { METODOS_PAGO, MOTIVOS_RECHAZO, datosAtencion, definirRecojo, definirTraslado, disponibilidadRecojo, responderEnAtencion } from '../application/atencion.js';
import { cotizacionSchema } from './cotizaciones.routes.js';
import { direccionSchema } from './solicitud.schemas.js';

const trasladoSchema = z.object({
  traslado: z.enum(['delivery', 'propio'], { errorMap: () => ({ message: 'Elija delivery o que lo lleva el cliente.' }) }),
  direccion: direccionSchema.optional(),
});
const respuestaSchema = z.object({
  cotizacion: cotizacionSchema,
  respuesta: z.enum(['acepta', 'pensara', 'rechaza'], { errorMap: () => ({ message: 'Elija qué decide el cliente.' }) }),
  pagaAhora: z.boolean().optional(),
  metodo: z.enum(METODOS_PAGO, { errorMap: () => ({ message: 'Elija el medio de pago del adelanto.' }) }).optional(),
  motivo: z.enum(MOTIVOS_RECHAZO, { errorMap: () => ({ message: 'Elija el motivo del rechazo.' }) }).optional(),
});
const recojoSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('agendado'), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elija el día del recojo.'), hora: z.string().regex(/^\d{2}:\d{2}$/, 'Elija la hora del recojo.') }),
  z.object({ tipo: z.literal('en_visita') }),
]);

const quien = (req: Request) => ({ usuarioId: req.usuario!.id, ip: req.ip });

/** A2b Atender la cita en el local o la visita a domicilio: solo el Administrador. */
export function atencionRoutes(deps: Dependencias) {
  const r = Router();
  r.use(autenticar, exigirRol('Administrador'));
  // Rutas fijas antes que /:solicitud.
  r.get('/recojos/disponibilidad', async (_req, res) => { res.json(await disponibilidadRecojo()); });
  r.post('/pedidos/:pedido/recojo', validar(recojoSchema), async (req, res) => {
    const codigo = await definirRecojo(String(req.params.pedido), req.body, quien(req), deps.correo);
    res.json(await datosAtencion(codigo, deps.almacen));
  });
  r.get('/:solicitud', async (req, res) => { res.json(await datosAtencion(String(req.params.solicitud), deps.almacen)); });
  r.put('/:solicitud/traslado', validar(trasladoSchema), async (req, res) => {
    await definirTraslado(String(req.params.solicitud), req.body.traslado, req.body.direccion, quien(req));
    res.json(await datosAtencion(String(req.params.solicitud), deps.almacen));
  });
  r.post('/:solicitud/respuesta', validar(respuestaSchema), async (req, res) => {
    res.json(await responderEnAtencion(String(req.params.solicitud), req.body, quien(req), deps.rutas, deps.correo));
  });
  return r;
}
