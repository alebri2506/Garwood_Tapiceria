import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../../../config/env.js';
import { autenticar, exigirRol, validar } from '../../../shared/http/middlewares.js';
import type { Correo } from '../../../shared/infrastructure/correo.js';
import { guardarDatos, guardarPreferenciasAvisos, pedirCambioCorreo, verPerfil } from '../application/perfilCliente.js';
import { agregarDireccion, marcarPrincipal, quitarDireccion } from '../application/direccionesPerfil.js';
import { avisosPerfilSchema, cambioCorreoSchema, datosPerfilSchema, direccionPerfilSchema } from './perfil.schemas.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';

const idDe = (valor: string | string[] | undefined) => {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw new ReglaNegocioError('No encontramos esa dirección en su perfil.', 404);
  return id;
};

/**
 * W10 Mi perfil (CU-H02 · decisiones E). Solo el rol Cliente, y siempre sobre SU cuenta: el cliente sale de la sesión,
 * no hay ids en la URL (RG-07).
 */
export function perfilRoutes(deps: { correo: Correo }) {
  const r = Router();
  r.use(autenticar, exigirRol('Cliente'));
  // Pedir el cambio de correo exige la contraseña: freno a quien intente adivinarla con una sesión abierta ajena.
  const limitador = rateLimit({
    windowMs: 15 * 60_000, limit: env.NODE_ENV === 'test' ? 1000 : 10, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { mensaje: 'Demasiados intentos. Espere unos minutos e intente de nuevo.' },
  });

  r.get('/', async (req, res) => {
    res.json(await verPerfil(req.usuario!.id));
  });

  r.patch('/datos', validar(datosPerfilSchema), async (req, res) => {
    res.json(await guardarDatos(req.usuario!.id, req.body, req.ip));
  });

  r.post('/correo', limitador, validar(cambioCorreoSchema), async (req, res) => {
    res.json(await pedirCambioCorreo(req.usuario!.id, req.body.email, req.body.contrasena, deps.correo, req.ip));
  });

  // E.3 Avisos.
  r.patch('/avisos', validar(avisosPerfilSchema), async (req, res) => {
    res.json(await guardarPreferenciasAvisos(req.usuario!.id, req.body, req.ip));
  });

  // E.2 Direcciones de entrega.
  r.post('/direcciones', validar(direccionPerfilSchema), async (req, res) => {
    res.status(201).json(await agregarDireccion(req.usuario!.id, req.body, req.ip));
  });

  r.post('/direcciones/:id/principal', async (req, res) => {
    res.json(await marcarPrincipal(req.usuario!.id, idDe(req.params.id), req.ip));
  });

  r.post('/direcciones/:id/quitar', async (req, res) => {
    res.json(await quitarDireccion(req.usuario!.id, idDe(req.params.id), req.ip));
  });

  return r;
}
