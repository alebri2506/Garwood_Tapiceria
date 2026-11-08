import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ZodSchema } from 'zod';
import { ReglaNegocioError, NoAutorizadoError } from '../domain/errores.js';
import { logger } from '../infrastructure/logger.js';
import { verificarAccessToken, type NombreRol, type UsuarioToken } from '../../modules/seguridad/application/tokens.js';

declare module 'express-serve-static-core' {
  interface Request {
    usuario?: UsuarioToken;
  }
}

/** Valida el body con Zod; responde 400 con el primer mensaje y los errores por campo. */
export const validar =
  (schema: ZodSchema): RequestHandler =>
  (req, res, next) => {
    const r = schema.safeParse(req.body);
    if (!r.success) {
      const errores = r.error.flatten().fieldErrors;
      res.status(400).json({ mensaje: r.error.issues[0]?.message ?? 'Datos inválidos', errores });
      return;
    }
    req.body = r.data;
    next();
  };

/** Exige un access token válido en `Authorization: Bearer`. */
export const autenticar: RequestHandler = (req, _res, next) => {
  const [tipo, token] = (req.headers.authorization ?? '').split(' ');
  if (tipo !== 'Bearer' || !token) return next(new NoAutorizadoError());
  req.usuario = verificarAccessToken(token);
  next();
};

/** RG-07: cada rol ve solo lo suyo. */
export const exigirRol =
  (...roles: NombreRol[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      return next(new ReglaNegocioError('No tiene permiso para esta acción.', 403));
    }
    next();
  };

export const manejarErrores: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ReglaNegocioError) {
    res.status(err.status).json({ mensaje: err.message });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ mensaje: 'El cuerpo de la petición no es JSON válido.' });
    return;
  }
  logger.error({ err, url: req.originalUrl }, 'Error no controlado');
  res.status(500).json({ mensaje: 'Ocurrió un error inesperado. Intente de nuevo.' });
};
