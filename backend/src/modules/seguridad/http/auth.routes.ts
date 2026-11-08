import { Router, type CookieOptions, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env, esProduccion } from '../../../config/env.js';
import { prisma } from '../../../shared/infrastructure/prisma.js';
import type { Correo } from '../../../shared/infrastructure/correo.js';
import { autenticar, validar } from '../../../shared/http/middlewares.js';
import { NoAutorizadoError } from '../../../shared/domain/errores.js';
import { iniciarSesion } from '../application/iniciarSesion.js';
import { solicitarRecuperacion, restablecerContrasena } from '../application/recuperarContrasena.js';
import { refrescarSesion } from '../application/refrescarSesion.js';
import { nombreVisible } from '../application/tokens.js';
import { registrarCliente } from '../../historial/application/registrarCliente.js';
import { loginSchema, recuperarSchema, registroSchema, restablecerSchema } from './auth.schemas.js';

const COOKIE_REFRESH = 'garweb_refresh';
const cookieBase: CookieOptions = { httpOnly: true, sameSite: 'lax', secure: esProduccion, path: '/api/auth' };

/** "Recordarme": cookie persistente; si no, la cookie muere al cerrar el navegador. */
function guardarRefresh(res: Response, token: string, recordarme: boolean) {
  res.cookie(COOKIE_REFRESH, token, recordarme ? { ...cookieBase, maxAge: env.JWT_REFRESH_DIAS * 86_400_000 } : cookieBase);
}

export function authRoutes(deps: { correo: Correo }) {
  const r = Router();
  // Freno a ataques de fuerza bruta por IP (el bloqueo por cuenta está en CU-S01).
  const limitador = rateLimit({
    windowMs: 15 * 60_000,
    limit: env.NODE_ENV === 'test' ? 1000 : 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { mensaje: 'Demasiados intentos desde esta red. Espere unos minutos e intente de nuevo.' },
  });

  // CU-S01
  r.post('/login', limitador, validar(loginSchema), async (req, res) => {
    const { sesion, refreshToken } = await iniciarSesion(req.body, req.ip);
    guardarRefresh(res, refreshToken, req.body.recordarme);
    res.json(sesion);
  });

  // CU-H01
  r.post('/registro', limitador, validar(registroSchema), async (req, res) => {
    const { sesion, refreshToken } = await registrarCliente(req.body, req.ip);
    guardarRefresh(res, refreshToken, false);
    res.status(201).json(sesion);
  });

  // CU-S02
  r.post('/recuperar', limitador, validar(recuperarSchema), async (req, res) => {
    await solicitarRecuperacion(req.body.email, deps.correo, req.ip);
    res.json({ mensaje: 'Si el correo está registrado, recibirá el enlace en unos minutos.' });
  });

  r.post('/restablecer', limitador, validar(restablecerSchema), async (req, res) => {
    await restablecerContrasena(req.body.token, req.body.contrasena, req.ip);
    res.json({ mensaje: 'Contraseña actualizada. Ya puede iniciar sesión.' });
  });

  r.post('/refresh', async (req, res) => {
    const { sesion, refreshToken, recordarme } = await refrescarSesion(req.cookies?.[COOKIE_REFRESH]);
    guardarRefresh(res, refreshToken, recordarme);
    res.json(sesion);
  });

  r.post('/logout', (_req, res) => {
    res.clearCookie(COOKIE_REFRESH, cookieBase);
    res.status(204).end();
  });

  r.get('/me', autenticar, async (req, res) => {
    const u = await prisma.usuario.findUnique({ where: { id: req.usuario!.id }, include: { rol: true, cliente: true } });
    if (!u || !u.activo) throw new NoAutorizadoError();
    res.json({ id: String(u.id), nombre: nombreVisible(u), rol: u.rol.nombre, email: u.email });
  });

  return r;
}
