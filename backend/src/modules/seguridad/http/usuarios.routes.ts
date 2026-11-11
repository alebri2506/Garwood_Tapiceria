import { Router, type Request } from 'express';
import { autenticar, exigirRol, validar } from '../../../shared/http/middlewares.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import {
  crearUsuario, desactivarUsuario, editarUsuario, listarUsuarios, nuevaContrasenaTemporal, reactivarUsuario, type Quien,
} from '../application/usuarios.js';
import { crearUsuarioSchema, editarUsuarioSchema } from './usuarios.schemas.js';

const quien = (req: Request): Quien => ({ usuarioId: req.usuario!.id, ip: req.ip });
const idDe = (req: Request) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ReglaNegocioError('No encontramos ese usuario del personal.', 404);
  return id;
};

/** A20 › Usuarios (CU-S03): solo el Administrador. */
export function usuariosRoutes() {
  const r = Router();
  r.use(autenticar, exigirRol('Administrador'));

  r.get('/', async (_req, res) => {
    res.json(await listarUsuarios());
  });

  // La contraseña temporal viene solo en esta respuesta (D.1.3): no se guarda en caché.
  r.post('/', validar(crearUsuarioSchema), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json(await crearUsuario(quien(req), req.body));
  });

  r.patch('/:id', validar(editarUsuarioSchema), async (req, res) => {
    res.json(await editarUsuario(quien(req), idDe(req), req.body));
  });

  r.post('/:id/desactivar', async (req, res) => {
    res.json(await desactivarUsuario(quien(req), idDe(req)));
  });

  r.post('/:id/reactivar', async (req, res) => {
    res.json(await reactivarUsuario(quien(req), idDe(req)));
  });

  r.post('/:id/contrasena-temporal', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await nuevaContrasenaTemporal(quien(req), idDe(req)));
  });

  return r;
}
