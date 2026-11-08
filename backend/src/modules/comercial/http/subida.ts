import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler } from 'express';
import multer from 'multer';
import type { z, ZodTypeAny } from 'zod';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import { LIMITE_BYTES, MIMES_ACEPTADOS, carpetaTemporal, descartarTemporales, type ArchivoSubido } from '../../../shared/infrastructure/archivos.js';

// Topes técnicos de la subida; los de negocio (muebles y archivos por mueble) están en `parametro`.
const MAX_ARCHIVOS_PETICION = 100;

/** Multer en disco (carpeta temporal), solo fotos y videos aceptados. */
export function subida() {
  const tmp = carpetaTemporal();
  mkdirSync(tmp, { recursive: true });
  return multer({
    storage: multer.diskStorage({ destination: tmp, filename: (_req, _f, cb) => cb(null, randomUUID()) }),
    limits: { fileSize: LIMITE_BYTES.video, files: MAX_ARCHIVOS_PETICION, fields: 5, fieldSize: 64 * 1024 },
    fileFilter: (_req, f, cb) => {
      if (MIMES_ACEPTADOS.includes(f.mimetype)) cb(null, true);
      else cb(new ReglaNegocioError(`«${f.originalname}» no es una foto ni un video aceptado (JPG, PNG, WEBP, HEIC, MP4, MOV o WEBM).`));
    },
  });
}

/** Errores de multer en mensajes para el usuario. */
export const erroresSubida: ErrorRequestHandler = (err, req, res, next) => {
  if (!(err instanceof multer.MulterError)) return next(err);
  descartarTemporales((req.files as ArchivoSubido[] | undefined) ?? []);
  const mensajes: Record<string, string> = {
    LIMIT_FILE_SIZE: `Un archivo pesa más de ${LIMITE_BYTES.video / 1024 / 1024} MB.`,
    LIMIT_FILE_COUNT: 'Envió demasiados archivos en una sola solicitud.',
    LIMIT_FIELD_VALUE: 'Los datos de la solicitud son demasiado largos.',
  };
  res.status(400).json({ mensaje: mensajes[err.code] ?? 'No se pudieron recibir los archivos. Intente de nuevo.' });
};

/** Lee el campo `datos` (JSON) y lo valida; los errores traen la ruta de cada campo (p. ej. "muebles.0.medidas"). */
export function leerDatos<S extends ZodTypeAny>(texto: unknown, schema: S): { datos?: z.output<S>; error?: { mensaje: string; errores: Record<string, string> } } {
  let json: unknown;
  try {
    json = JSON.parse(String(texto ?? ''));
  } catch {
    return { error: { mensaje: 'Faltan los datos de la solicitud.', errores: {} } };
  }
  return validarConRutas(json, schema);
}

export function validarConRutas<S extends ZodTypeAny>(json: unknown, schema: S): { datos?: z.output<S>; error?: { mensaje: string; errores: Record<string, string> } } {
  const r = schema.safeParse(json);
  if (r.success) return { datos: r.data };
  const errores: Record<string, string> = {};
  for (const i of r.error.issues) errores[i.path.join('.')] ??= i.message;
  return { error: { mensaje: r.error.issues[0]?.message ?? 'Datos inválidos', errores } };
}
