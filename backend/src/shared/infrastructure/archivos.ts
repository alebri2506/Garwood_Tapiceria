import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';

/** Archivo recibido y guardado temporalmente por multer. */
export interface ArchivoSubido {
  fieldname: string;
  originalname: string;
  mimetype: string;
  size: number;
  path: string;
}

export type TipoArchivo = 'foto' | 'video';

/** Formatos aceptados: la extensión del navegador no basta, se revisan los primeros bytes (firma) del archivo. */
const FORMATOS: { mime: string; tipo: TipoArchivo; ext: string; firma: (b: Buffer) => boolean }[] = [
  { mime: 'image/jpeg', tipo: 'foto', ext: 'jpg', firma: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', tipo: 'foto', ext: 'png', firma: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', tipo: 'foto', ext: 'webp', firma: (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' },
  { mime: 'image/heic', tipo: 'foto', ext: 'heic', firma: (b) => b.toString('latin1', 4, 8) === 'ftyp' },
  { mime: 'image/heif', tipo: 'foto', ext: 'heif', firma: (b) => b.toString('latin1', 4, 8) === 'ftyp' },
  { mime: 'video/mp4', tipo: 'video', ext: 'mp4', firma: (b) => b.toString('latin1', 4, 8) === 'ftyp' },
  { mime: 'video/quicktime', tipo: 'video', ext: 'mov', firma: (b) => b.toString('latin1', 4, 8) === 'ftyp' || b.toString('latin1', 4, 8) === 'moov' },
  { mime: 'video/webm', tipo: 'video', ext: 'webm', firma: (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
];

export const MIMES_ACEPTADOS = FORMATOS.map((f) => f.mime);
export const formatoDe = (mime: string) => FORMATOS.find((f) => f.mime === mime);

/** Tamaño máximo por tipo de archivo (constante técnica, no de negocio). */
export const LIMITE_BYTES: Record<TipoArchivo, number> = { foto: 10 * 1024 * 1024, video: 50 * 1024 * 1024 };

export const carpetaTemporal = () => path.resolve(env.UPLOADS_DIR, 'tmp');

/** Revisa que el contenido corresponda al tipo declarado. */
export async function firmaValida(a: ArchivoSubido) {
  const formato = formatoDe(a.mimetype);
  if (!formato) return false;
  const f = await open(a.path, 'r');
  try {
    const { buffer, bytesRead } = await f.read(Buffer.alloc(16), 0, 16, 0);
    return bytesRead >= 12 && formato.firma(buffer);
  } finally {
    await f.close();
  }
}

/**
 * Almacén de archivos (patrón Adapter): disco en Docker (volumen `garweb-uploads`) o Supabase Storage
 * (bucket privado). Los casos de uso solo conocen esta interfaz.
 */
export interface AlmacenArchivos {
  /** Mueve el archivo temporal a su lugar definitivo y devuelve la ruta que se guarda en la BD. */
  guardar(a: ArchivoSubido, carpeta: string): Promise<string>;
  eliminar(ruta: string): Promise<void>;
  /** Enlace para ver el archivo que deja de servir pasados `segundos` (los archivos son privados). */
  urlTemporal(ruta: string, segundos: number): Promise<string>;
}

// ---------------------------------------------------------------- Disco: enlaces firmados por la propia API
const claveFirma = () => createHmac('sha256', env.JWT_ACCESS_SECRET).update('garweb-archivos').digest();
const firmar = (ruta: string, vence: number) => createHmac('sha256', claveFirma()).update(`${ruta}|${vence}`).digest('base64url');

/** Revisa la firma y la vigencia de un enlace de /api/archivos. */
export function firmaDeArchivoValida(ruta: string, vence: number, firma: string) {
  if (!Number.isFinite(vence) || vence * 1000 < Date.now()) return false;
  const esperada = Buffer.from(firmar(ruta, vence));
  const recibida = Buffer.from(firma);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

/** Ruta absoluta de un archivo guardado en disco, sin permitir salir de la carpeta de subidas. */
export function rutaEnDisco(ruta: string) {
  const base = path.resolve(env.UPLOADS_DIR);
  const destino = path.resolve(base, ruta);
  if (!destino.startsWith(base + path.sep) || ruta.startsWith('tmp/')) return null;
  return destino;
}

export const almacenEnDisco: AlmacenArchivos = {
  async guardar(a, carpeta) {
    const ext = formatoDe(a.mimetype)?.ext ?? 'bin';
    const ruta = `${carpeta}/${randomUUID()}.${ext}`;
    const destino = path.resolve(env.UPLOADS_DIR, ruta);
    await mkdir(path.dirname(destino), { recursive: true });
    await rename(a.path, destino);
    return ruta;
  },
  async eliminar(ruta) {
    const destino = rutaEnDisco(ruta);
    if (destino) await unlink(destino).catch(() => undefined);
  },
  async urlTemporal(ruta, segundos) {
    const vence = Math.floor(Date.now() / 1000) + segundos;
    return `/api/archivos/${ruta.split('/').map(encodeURIComponent).join('/')}?vence=${vence}&firma=${firmar(ruta, vence)}`;
  },
};

// ---------------------------------------------------------------- Supabase Storage (API REST, sin dependencias nuevas)
export function crearAlmacenSupabase(url: string, clave: string, bucket: string): AlmacenArchivos {
  const base = `${url.replace(/\/$/, '')}/storage/v1`;
  const cabeceras = { Authorization: `Bearer ${clave}`, apikey: clave };
  let bucketListo: Promise<void> | null = null;

  /** Crea el bucket privado la primera vez (con los mismos límites de tamaño y tipo que la API). */
  const asegurarBucket = () => (bucketListo ??= (async () => {
    const r = await fetch(`${base}/bucket/${bucket}`, { headers: cabeceras });
    if (r.ok) return;
    const c = await fetch(`${base}/bucket`, {
      method: 'POST',
      headers: { ...cabeceras, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: bucket, name: bucket, public: false, file_size_limit: LIMITE_BYTES.video, allowed_mime_types: MIMES_ACEPTADOS }),
    });
    if (!c.ok && c.status !== 409) {
      bucketListo = null;
      throw new Error(`Supabase Storage: no se pudo crear el bucket (${c.status})`);
    }
  })());

  const ruta = (r: string) => r.split('/').map(encodeURIComponent).join('/');

  return {
    async guardar(a, carpeta) {
      await asegurarBucket();
      const nombre = `${carpeta}/${randomUUID()}.${formatoDe(a.mimetype)?.ext ?? 'bin'}`;
      const contenido = await readFile(a.path);
      const r = await fetch(`${base}/object/${bucket}/${ruta(nombre)}`, {
        method: 'POST',
        headers: { ...cabeceras, 'Content-Type': a.mimetype, 'x-upsert': 'false' },
        body: contenido,
      });
      if (!r.ok) throw new Error(`Supabase Storage: no se pudo subir el archivo (${r.status})`);
      await unlink(a.path).catch(() => undefined);
      return nombre;
    },
    async eliminar(nombre) {
      await fetch(`${base}/object/${bucket}`, {
        method: 'DELETE',
        headers: { ...cabeceras, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: [nombre] }),
      }).catch(() => undefined);
    },
    async urlTemporal(nombre, segundos) {
      const r = await fetch(`${base}/object/sign/${bucket}/${ruta(nombre)}`, {
        method: 'POST',
        headers: { ...cabeceras, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: segundos }),
      });
      if (!r.ok) throw new Error(`Supabase Storage: no se pudo firmar el enlace (${r.status})`);
      const { signedURL } = (await r.json()) as { signedURL: string };
      return `${base}${signedURL}`;
    },
  };
}

/** Disco o Supabase Storage según `STORAGE` (ver .env.example). */
export function crearAlmacen(): AlmacenArchivos {
  if (env.STORAGE !== 'supabase') return almacenEnDisco;
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    throw new Error('STORAGE=supabase necesita SUPABASE_URL y SUPABASE_SECRET_KEY en el .env.');
  }
  return crearAlmacenSupabase(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, env.STORAGE_BUCKET);
}

/** Borra los temporales que quedaron (p. ej. si la solicitud fue rechazada). */
export const descartarTemporales = (archivos: ArchivoSubido[]) =>
  Promise.all(archivos.map((a) => unlink(a.path).catch(() => undefined)));
