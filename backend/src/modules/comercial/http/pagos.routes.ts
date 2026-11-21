import { Router, type Request } from 'express';
import { z } from 'zod';
import { autenticar, exigirRol, validar } from '../../../shared/http/middlewares.js';
import type { AlmacenArchivos } from '../../../shared/infrastructure/archivos.js';
import type { Correo } from '../../../shared/infrastructure/correo.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import {
  METODOS_MANUALES, anularPago, comprobanteDePago, confirmarPago, pagosConfirmados, pagosPorConfirmar, rechazarPago,
  registrarPagoManual, resumenPagos, saldosPendientes,
} from '../application/pagos.js';

const motivoSchema = z.object({ motivo: z.string().trim().min(3, 'Escriba el motivo.').max(200, 'Escriba hasta 200 caracteres.') });
const pagoManualSchema = z.object({
  pedido: z.string().trim().max(12).optional(),
  cotizacion: z.string().trim().max(12).optional(),
  monto: z.number({ invalid_type_error: 'Escriba el monto recibido.', required_error: 'Escriba el monto recibido.' }).positive('El monto debe ser mayor que cero.').max(1_000_000),
  metodo: z.enum(METODOS_MANUALES, { errorMap: () => ({ message: 'Elija el método de pago.' }) }),
  detalle: z.string().trim().max(120, 'Escriba hasta 120 caracteres.').optional(),
}).refine((x) => Boolean(x.pedido) !== Boolean(x.cotizacion), { message: 'Elija el pedido (o la cotización aceptada) al que corresponde el pago.', path: ['pedido'] });

const quien = (req: Request) => ({ usuarioId: req.usuario!.id, ip: req.ip });
const idDe = (v: unknown) => {
  const id = Number(v);
  if (!Number.isInteger(id) || id <= 0) throw new ReglaNegocioError('No encontramos ese pago.', 404);
  return id;
};

/** A5 Pagos (CU-C12, C13): por confirmar, confirmados, saldos pendientes y pagos manuales. Solo el Administrador. */
export function pagosRoutes(deps: { correo: Correo; almacen: AlmacenArchivos }) {
  const r = Router();
  r.use(autenticar, exigirRol('Administrador'));

  r.get('/resumen', async (_req, res) => { res.json(await resumenPagos()); });
  r.get('/por-confirmar', async (_req, res) => { res.json(await pagosPorConfirmar()); });
  r.get('/confirmados', async (req, res) => {
    const origen = req.query.origen === 'pasarela' || req.query.origen === 'manual' ? req.query.origen : undefined;
    res.json(await pagosConfirmados(origen));
  });
  r.get('/saldos', async (_req, res) => { res.json(await saldosPendientes()); });

  r.post('/', validar(pagoManualSchema), async (req, res) => {
    res.status(201).json(await registrarPagoManual(req.body, quien(req), deps.correo));
  });
  r.post('/:id/confirmar', async (req, res) => {
    res.json(await confirmarPago(idDe(req.params.id), quien(req), deps.correo));
  });
  r.post('/:id/rechazar', validar(motivoSchema), async (req, res) => {
    res.json(await rechazarPago(idDe(req.params.id), req.body.motivo, quien(req), deps.correo));
  });
  r.post('/:id/anular', validar(motivoSchema), async (req, res) => {
    res.json(await anularPago(idDe(req.params.id), req.body.motivo, quien(req), deps.correo));
  });
  r.get('/:id/comprobante', async (req, res) => {
    res.json(await comprobanteDePago(idDe(req.params.id), deps.almacen));
  });
  return r;
}
