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
import { inventarioRoutes } from './modules/almacen/http/inventario.routes.js';
import { plantillasRoutes } from './modules/comercial/http/plantillas.routes.js';
import { cotizacionesRoutes } from './modules/comercial/http/cotizaciones.routes.js';
import { atencionRoutes } from './modules/comercial/http/atencion.routes.js';
import { pagosRoutes } from './modules/comercial/http/pagos.routes.js';
import { crearRutas, type Rutas } from './shared/infrastructure/rutas.js';
import { crearPasarela, type Pasarela } from './shared/infrastructure/pasarela.js';
import { registrarPagoAprobado } from './modules/comercial/application/pagoEnLinea.js';
import { crearAlmacen, firmaDeArchivoValida, rutaEnDisco, type AlmacenArchivos } from './shared/infrastructure/archivos.js';

export interface Dependencias {
  correo: Correo;
  almacen: AlmacenArchivos;
  /** Distancias para el transporte (OpenStreetMap; en las pruebas, fijas). */
  rutas: Rutas;
  /** Pasarela de pago (Stripe). null si no está configurada: el pago en línea queda deshabilitado. */
  pasarela: Pasarela | null;
}

export function crearApp({ correo = crearCorreo(), almacen = crearAlmacen(), rutas = crearRutas(), pasarela = crearPasarela() }: Partial<Dependencias> = {}) {
  const deps: Dependencias = { correo, almacen, rutas, pasarela };
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.APP_URL, credentials: true }));
  // Aviso de la pasarela (webhook de Stripe): va ANTES de express.json porque la firma se verifica sobre el cuerpo tal
  // cual llegó. No lleva sesión: lo autentica la firma (STRIPE_WEBHOOK_SECRET).
  app.post('/api/pagos/stripe/aviso', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    if (!deps.pasarela) { res.status(503).json({ mensaje: 'La pasarela no está configurada.' }); return; }
    let pago;
    try {
      pago = await deps.pasarela.leerAviso(req.body as Buffer, req.header('stripe-signature'));
    } catch (e) {
      logger.warn({ err: e }, 'Aviso de Stripe rechazado (firma no válida)');
      res.status(400).json({ mensaje: 'Firma no válida.' });
      return;
    }
    if (pago) await registrarPagoAprobado(pago, deps.correo);
    res.json({ recibido: true });
  });
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
  app.use('/api/admin/inventario', inventarioRoutes());
  app.use('/api/admin/plantillas', plantillasRoutes());
  app.use('/api/admin/cotizaciones', cotizacionesRoutes(deps));
  app.use('/api/admin/atencion', atencionRoutes(deps));
  app.use('/api/admin/pagos', pagosRoutes(deps));
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
