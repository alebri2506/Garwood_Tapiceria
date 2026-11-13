import { Router, type Request, type Response } from 'express';
import { autenticar, exigirRol } from '../../../shared/http/middlewares.js';
import { descartarTemporales, type AlmacenArchivos, type ArchivoSubido } from '../../../shared/infrastructure/archivos.js';
import type { Correo } from '../../../shared/infrastructure/correo.js';
import { prisma } from '../../../shared/infrastructure/prisma.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import { consultarCatalogo, direccionesDelCliente } from '../application/catalogoSolicitud.js';
import { disponibilidadRecojo } from '../application/recojo.js';
import { registrarSolicitud } from '../application/registrarSolicitud.js';
import { miSolicitud, misSolicitudes, subirFotosPendientes } from '../application/seguimientoSolicitud.js';
import { solicitudSchema } from './solicitud.schemas.js';
import { erroresSubida, leerDatos, subida } from './subida.js';

interface Deps { almacen: AlmacenArchivos; correo: Correo }

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

  // W2 · horas de recojo de las próximas semanas, cruzadas con la agenda del taller.
  r.get('/recojo/disponibilidad', exigirRol('Cliente', 'Administrador'), async (_req, res) => {
    res.json(await disponibilidadRecojo());
  });

  r.use(exigirRol('Cliente'));

  r.get('/direcciones', async (req, res) => {
    res.json(await direccionesDelCliente(await clienteDe(req.usuario!.id)));
  });

  r.get('/', async (req, res) => {
    res.json(await misSolicitudes(req.usuario!.id, deps.almacen));
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
