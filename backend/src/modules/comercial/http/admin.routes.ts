import { Router, type Request, type Response } from 'express';
import { autenticar, exigirRol, validar } from '../../../shared/http/middlewares.js';
import { descartarTemporales, type AlmacenArchivos, type ArchivoSubido } from '../../../shared/infrastructure/archivos.js';
import { enviarCorreos } from '../../../shared/infrastructure/avisos.js';
import type { Correo } from '../../../shared/infrastructure/correo.js';
import { prisma } from '../../../shared/infrastructure/prisma.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import { registrarSolicitud } from '../application/registrarSolicitud.js';
import { agendaSemana, bloquearTurnos } from '../application/agendaAdmin.js';
import { vencerSolicitud, type Quien } from '../application/citas.js';
import {
  MOTIVOS_DESCARTE, bandeja, buscarClientes, correoInvitacion, descartarSolicitud, esDuplicado, fichaAdmin, registrarClienteNuevo,
} from '../application/solicitudesAdmin.js';
import { bloqueosSchema, descartarSchema, solicitudAdminSchema } from './comercial.schemas.js';
import { erroresSubida, leerDatos, subida } from './subida.js';

interface Deps { almacen: AlmacenArchivos; correo: Correo }

const quien = (req: { usuario?: { id: number; rol: Quien['rol'] }; ip?: string }): Quien => ({ usuarioId: req.usuario!.id, rol: req.usuario!.rol, ip: req.ip });

/** A3 Solicitudes (CU-C01 por el Administrador y CU-C02 bandeja). */
export function adminComercialRoutes(deps: Deps) {
  const r = Router();
  r.use(autenticar, exigirRol('Administrador'));

  r.get('/solicitudes', async (req, res) => {
    res.json({ ...(await bandeja({ estado: req.query.estado ? String(req.query.estado) : undefined, q: req.query.q ? String(req.query.q) : undefined })), motivosDescarte: MOTIVOS_DESCARTE });
  });

  r.get('/solicitudes/:codigo', async (req, res) => {
    res.json(await fichaAdmin(String(req.params.codigo), deps.almacen));
  });

  r.post('/solicitudes/:codigo/descartar', validar(descartarSchema), async (req, res) => {
    await descartarSolicitud(req.usuario!.id, String(req.params.codigo), req.body.motivo, deps.correo, req.ip);
    res.json(await fichaAdmin(String(req.params.codigo), deps.almacen));
  });

  // A2 Agenda: la semana (lunes a sábado) con citas, visitas y bloqueos.
  r.get('/agenda', async (req, res) => {
    res.json(await agendaSemana(req.query.desde ? String(req.query.desde) : undefined));
  });

  // CU-C03: bloquear turnos libres (uno o varios).
  r.post('/agenda/bloqueos', validar(bloqueosSchema), async (req, res) => {
    res.status(201).json(await bloquearTurnos(quien(req), req.body.bloques, req.body.motivo));
  });

  // A2f: tras la segunda inasistencia, el Administrador la da por vencida.
  r.post('/solicitudes/:codigo/vencer', async (req, res) => {
    await vencerSolicitud(quien(req), String(req.params.codigo), deps.correo);
    res.json(await fichaAdmin(String(req.params.codigo), deps.almacen));
  });

  r.get('/clientes', async (req, res) => {
    res.json(await buscarClientes(String(req.query.q ?? '')));
  });

  // CU-C01 por el Administrador: el cliente llamó, escribió o vino al local. Mismo multipart que la web.
  r.post('/solicitudes', subida().any(), erroresSubida, async (req: Request, res: Response) => {
    const archivos = (req.files as ArchivoSubido[] | undefined) ?? [];
    try {
      const { datos, error } = leerDatos(req.body?.datos, solicitudAdminSchema);
      if (error) {
        res.status(400).json(error);
        return;
      }
      const e = datos!;
      let clienteId: number;
      let invitacion: { email: string; token: string } | null = null;
      if ('id' in e.cliente) {
        const c = await prisma.cliente.findFirst({ where: { id: e.cliente.id, activo: true } });
        if (!c) throw new ReglaNegocioError('Ese cliente no existe o está desactivado.', 400);
        clienteId = c.id;
      } else {
        try {
          const nuevo = await prisma.$transaction((tx) => registrarClienteNuevo(tx, (e.cliente as { nuevo: Parameters<typeof registrarClienteNuevo>[1] }).nuevo, e.canal, req.usuario!.id, req.ip));
          clienteId = nuevo.cliente.id;
          invitacion = nuevo.invitacion;
        } catch (err) {
          if (esDuplicado(err)) throw new ReglaNegocioError('Ya existe un cliente con ese correo o EIN: búsquelo y elíjalo.', 409);
          throw err;
        }
      }
      const creada = await registrarSolicitud(e.solicitud, archivos, { usuarioId: req.usuario!.id, clienteId, canal: e.canal, esperaFotos: e.esperaFotos, avisar: e.avisar }, deps, req.ip);
      if (invitacion && e.avisar) await enviarCorreos(deps.correo, [{ usuarioId: 0, tipo: 'invitacion', titulo: '', mensaje: '', correo: correoInvitacion(invitacion, creada.codigo) }]);
      res.status(201).json({ ...creada, clienteId, cuentaCreada: Boolean(invitacion) });
    } finally {
      await descartarTemporales(archivos);
    }
  });

  return r;
}
