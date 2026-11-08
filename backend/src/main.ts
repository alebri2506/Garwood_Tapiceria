import { env } from './config/env.js';
import { crearApp } from './app.js';
import { logger } from './shared/infrastructure/logger.js';
import { prisma } from './shared/infrastructure/prisma.js';

const servidor = crearApp().listen(env.PORT, () => {
  logger.info(`API de GARWEB escuchando en http://localhost:${env.PORT}`);
});

function apagar() {
  servidor.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
