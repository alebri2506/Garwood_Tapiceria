import 'dotenv/config';
import { z } from 'zod';

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET debe tener al menos 32 caracteres'),
  JWT_ACCESS_MINUTOS: z.coerce.number().default(15),
  JWT_REFRESH_DIAS: z.coerce.number().default(30),
  // URL del frontend: se usa en el enlace de recuperación y en CORS.
  APP_URL: z.string().url().default('http://localhost:5173'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('GARWEB <no-reply@garwood.com>'),
  // Carpeta de fotos y videos subidos (en Docker, el volumen garweb-uploads).
  UPLOADS_DIR: z.string().default('uploads'),
  // disco (Docker) | supabase (bucket privado en Supabase Storage).
  STORAGE: z.enum(['disco', 'supabase']).default('disco'),
  SUPABASE_URL: z.string().url().optional(),
  // Clave secreta (sb_secret_…) solo en el servidor; nunca en el frontend.
  SUPABASE_SECRET_KEY: z.string().optional(),
  STORAGE_BUCKET: z.string().default('garweb-archivos'),
});

export const env = esquema.parse(process.env);
export const esProduccion = env.NODE_ENV === 'production';
