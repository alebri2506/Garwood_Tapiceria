import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './shared/infrastructure/logger.js';
import { crearCorreo, type Correo } from './shared/infrastructure/correo.js';
import { manejarErrores } from './shared/http/middlewares.js';
import { authRoutes } from './modules/seguridad/http/auth.routes.js';
import { solicitudRoutes } from './modules/comercial/http/solicitud.routes.js';
import { citasRoutes } from './modules/comercial/http/citas.routes.js';
import { adminComercialRoutes } from './modules/comercial/http/admin.routes.js';
import { notificacionesRoutes } from './modules/seguridad/http/notificaciones.routes.js';
import { parametrosRoutes } from './modules/seguridad/http/parametros.routes.js';
import { auditoriaRoutes } from './modules/seguridad/http/auditoria.routes.js';
import { usuariosRoutes } from './modules/seguridad/http/usuarios.routes.js';
import { perfilRoutes } from './modules/historial/http/perfil.routes.js';
import { crearAlmacen, firmaDeArchivoValida, rutaEnDisco, type AlmacenArchivos } from './shared/infrastructure/archivos.js';

export interface Dependencias {
  correo: Correo;
  almacen: AlmacenArchivos;
}

export function crearApp({ correo = crearCorreo(), almacen = crearAlmacen() }: Partial<Dependencias> = {}) {
  const deps: Dependencias = { correo, almacen };
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.APP_URL, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));

  app.get('/api/salud', (_req, res) => {
    res.json({ estado: 'ok' });
  });
  app.use('/api/auth', authRoutes(deps));
  app.use('/api/solicitudes', solicitudRoutes(deps));
  app.use('/api/citas', citasRoutes(deps));
  app.use('/api/admin/parametros', parametrosRoutes());
  app.use('/api/admin/auditoria', auditoriaRoutes());
  app.use('/api/admin/usuarios', usuariosRoutes());
  app.use('/api/cliente/perfil', perfilRoutes(deps));
  app.use('/api/admin', adminComercialRoutes(deps));
  app.use('/api/notificaciones', notificacionesRoutes());

  // Archivos guardados en disco: solo con un enlace firmado y vigente (los entrega la API al ver una solicitud).
  app.get('/api/archivos/*ruta', (req, res) => {
    const ruta = ([] as string[]).concat(req.params.ruta as string | string[]).join('/');
    const destino = rutaEnDisco(ruta);
    if (!destino || !firmaDeArchivoValida(ruta, Number(req.query.vence), String(req.query.firma ?? ''))) {
      res.status(403).json({ mensaje: 'El enlace al archivo venció. Vuelva a abrir la solicitud.' });
      return;
    }
    res.sendFile(destino, { headers: { 'Cache-Control': 'private, max-age=600', 'X-Content-Type-Options': 'nosniff' } }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ mensaje: 'No encontramos ese archivo.' });
    });
  });

  app.use((_req, res) => {
    res.status(404).json({ mensaje: 'Ruta no encontrada.' });
  });
  app.use(manejarErrores);
  return app;
}
