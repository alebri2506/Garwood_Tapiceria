import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { autenticar, exigirRol, validar } from '../../../shared/http/middlewares.js';
import { descartarTemporales, type AlmacenArchivos, type ArchivoSubido } from '../../../shared/infrastructure/archivos.js';
import type { Correo } from '../../../shared/infrastructure/correo.js';
import { prisma } from '../../../shared/infrastructure/prisma.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import { consultarCatalogo, direccionesDelCliente } from '../application/catalogoSolicitud.js';
import { registrarSolicitud } from '../application/registrarSolicitud.js';
import { miSolicitud, misSolicitudes, subirFotosPendientes } from '../application/seguimientoSolicitud.js';
import { MOTIVOS_RECHAZO } from '../application/atencion.js';
import { agendarMiRecojo, disponibilidadParaCliente, responderMiCotizacion, verMiCotizacion } from '../application/miCotizacion.js';
import { confirmarPagoAdelanto, iniciarPagoAdelanto } from '../application/pagoEnLinea.js';
import { misPedidosEnCurso } from '../application/misPedidos.js';
import { METODOS_INFORMADOS, comprobanteDePago, confirmarPagoEnLinea, iniciarPagoEnLinea, informarPago, misPagos } from '../application/pagos.js';
import type { Pasarela } from '../../../shared/infrastructure/pasarela.js';
import { solicitudSchema } from './solicitud.schemas.js';
import { erroresSubida, leerDatos, subida, subidaComprobante } from './subida.js';

interface Deps { almacen: AlmacenArchivos; correo: Correo; pasarela: Pasarela | null }

// W4: el cliente responde su cotización. Aceptar con adelanto espera la pasarela de pago (el backend lo rechaza).
const comentario = z.string().trim().max(500, 'Escriba hasta 500 caracteres.').optional();
const respuestaClienteSchema = z.discriminatedUnion('respuesta', [
  z.object({ respuesta: z.literal('rechaza'), motivo: z.enum(MOTIVOS_RECHAZO, { errorMap: () => ({ message: 'Elija el motivo del rechazo.' }) }), comentario }),
  z.object({ respuesta: z.literal('acepta'), comentario }),
], { errorMap: () => ({ message: 'Elija si acepta o rechaza la cotización.' }) });
// W5 · pago por Zelle (captura obligatoria) o cheque (foto opcional): queda «Por confirmar».
const pagoInformadoSchema = z.object({
  metodo: z.enum(METODOS_INFORMADOS, { errorMap: () => ({ message: 'Elija Zelle o cheque.' }) }),
  monto: z.number({ invalid_type_error: 'Escriba el monto.' }).positive('El monto debe ser mayor que cero.').max(1_000_000),
  detalle: z.string().trim().max(120, 'Escriba hasta 120 caracteres.').optional(),
  reemplaza: z.number().int().positive().optional(),
});
const idPago = (v: unknown) => {
  const id = Number(v);
  if (!Number.isInteger(id) || id <= 0) throw new ReglaNegocioError('No encontramos ese pago.', 404);
  return id;
};
const recojoClienteSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elija el día del recojo.'),
  hora: z.string().regex(/^\d{2}:\d{2}$/, 'Elija la hora del recojo.'),
});

async function clienteDe(usuarioId: number) {
  const u = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!u?.clienteId) throw new ReglaNegocioError('Solo un cliente puede enviar solicitudes desde la web.', 403);
  return u.clienteId;
}

/** CU-C01 y su seguimiento por el cliente (W2, W6c). */
export function solicitudRoutes(deps: Deps) {
  const r = Router();
  r.use(autenticar);

  // El catálogo también lo usa el Administrador al registrar una solicitud (A3).
  r.get('/catalogo', exigirRol('Cliente', 'Administrador'), async (req, res) => {
    res.json(await consultarCatalogo(req.usuario!.rol === 'Cliente'));
  });


  r.use(exigirRol('Cliente'));

  r.get('/direcciones', async (req, res) => {
    res.json(await direccionesDelCliente(await clienteDe(req.usuario!.id)));
  });

  r.get('/', async (req, res) => {
    res.json(await misSolicitudes(req.usuario!.id, deps.almacen));
  });

  // W6a · sus pedidos en curso (antes de «/:codigo»: «pedidos» no es un código de solicitud).
  r.get('/pedidos/en-curso', async (req, res) => {
    res.json(await misPedidosEnCurso(req.usuario!.id, deps.almacen));
  });

  // W5 · Pagos del pedido: la cuenta, informar Zelle o cheque, pagar con tarjeta (Stripe) y ver su comprobante.
  r.get('/pedidos/:codigo/pagos', async (req, res) => {
    res.json(await misPagos(req.usuario!.id, String(req.params.codigo), deps.pasarela));
  });
  r.post('/pedidos/:codigo/pagos/informar', subidaComprobante().single('comprobante'), erroresSubida, async (req: Request, res: Response) => {
    const archivo = req.file as ArchivoSubido | undefined;
    try {
      const { datos, error } = leerDatos(req.body?.datos, pagoInformadoSchema);
      if (error) {
        res.status(400).json(error);
        return;
      }
      res.status(201).json(await informarPago(req.usuario!.id, String(req.params.codigo), datos!, archivo, deps, req.ip));
    } finally {
      await descartarTemporales(archivo ? [archivo] : []);
    }
  });
  r.post('/pedidos/:codigo/pagos/en-linea', async (req, res) => {
    res.json(await iniciarPagoEnLinea(req.usuario!.id, String(req.params.codigo), deps.pasarela));
  });
  r.post('/pedidos/:codigo/pagos/en-linea/confirmar', validar(z.object({ sesion: z.string().min(5).max(200) })), async (req, res) => {
    res.json(await confirmarPagoEnLinea(req.usuario!.id, String(req.params.codigo), req.body.sesion, deps.pasarela, deps.correo));
  });
  r.get('/pedidos/pagos/:id/comprobante', async (req, res) => {
    res.json(await comprobanteDePago(idPago(req.params.id), deps.almacen, req.usuario!.id));
  });

  // W4 · horas libres del camión para el recojo de su pedido.
  r.get('/recojos/disponibilidad', async (_req, res) => {
    res.json(await disponibilidadParaCliente());
  });

  r.get('/:codigo/cotizacion', async (req, res) => {
    res.json(await verMiCotizacion(req.usuario!.id, String(req.params.codigo), deps.almacen));
  });

  r.post('/:codigo/cotizacion/respuesta', validar(respuestaClienteSchema), async (req, res) => {
    res.json(await responderMiCotizacion(req.usuario!.id, String(req.params.codigo), req.body, { usuarioId: req.usuario!.id, ip: req.ip }, deps.correo));
  });

  // W4 · «Aceptar y pagar el adelanto»: abre la página segura de la pasarela.
  // `incrustado`: el formulario de Stripe se muestra dentro de W4 (devuelve el clientSecret en vez de la página).
  r.post('/:codigo/cotizacion/pago', validar(z.object({ comentario: comentario, incrustado: z.boolean().optional() }).default({})), async (req, res) => {
    res.json(await iniciarPagoAdelanto(req.usuario!.id, String(req.params.codigo), deps.pasarela, req.body.comentario, req.body.incrustado ?? false));
  });
  // Al volver de la pasarela: confirma el cobro sin esperar el aviso de Stripe (lo que llegue primero cuenta una vez).
  r.post('/:codigo/cotizacion/pago/confirmar', validar(z.object({ sesion: z.string().min(5).max(200) })), async (req, res) => {
    res.json(await confirmarPagoAdelanto(req.usuario!.id, String(req.params.codigo), req.body.sesion, deps.pasarela, deps.correo));
  });

  r.post('/:codigo/recojo', validar(recojoClienteSchema), async (req, res) => {
    res.json(await agendarMiRecojo(req.usuario!.id, String(req.params.codigo), req.body, { usuarioId: req.usuario!.id, ip: req.ip }, deps.correo));
  });

  r.get('/:codigo', async (req, res) => {
    res.json(await miSolicitud(req.usuario!.id, String(req.params.codigo), deps.almacen));
  });

  // CU-C01: multipart con el campo "datos" (JSON) y las fotos de cada mueble en "mueble_0", "mueble_1"…
  r.post('/', subida().any(), erroresSubida, async (req: Request, res: Response) => {
    const archivos = (req.files as ArchivoSubido[] | undefined) ?? [];
    try {
      const { datos, error } = leerDatos(req.body?.datos, solicitudSchema);
      if (error) {
        res.status(400).json(error);
        return;
      }
      const clienteId = await clienteDe(req.usuario!.id);
      res.status(201).json(await registrarSolicitud(datos!, archivos, { usuarioId: req.usuario!.id, clienteId, canal: 'web' }, deps, req.ip));
    } finally {
      // Los que se guardaron ya no están en la carpeta temporal; el resto se borra.
      await descartarTemporales(archivos);
    }
  });

  // Fotos que el taller le pidió por enlace.
  r.post('/:codigo/fotos', subida().any(), erroresSubida, async (req: Request, res: Response) => {
    const archivos = (req.files as ArchivoSubido[] | undefined) ?? [];
    try {
      res.json(await subirFotosPendientes(req.usuario!.id, String(req.params.codigo), archivos, deps, req.ip));
    } finally {
      await descartarTemporales(archivos);
    }
  });

  return r;
}
