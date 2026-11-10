export const API_URL: string = import.meta.env.VITE_API_URL ?? '';

/** Error devuelto por la API con un mensaje listo para mostrar al usuario y, si aplica, el error de cada campo. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly errores: Record<string, string> = {}) {
    super(message);
  }
}

// El access token vive solo en memoria (no en localStorage) para que un script inyectado no pueda leerlo.
// Al recargar la página se recupera con la cookie HttpOnly de refresh.
let accessToken: string | null = null;
let renovar: (() => Promise<string | null>) | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};
/** Registra cómo renovar el access token cuando la API responde 401 (lo hace AuthProvider). */
export const configurarRenovacion = (fn: () => Promise<string | null>) => {
  renovar = fn;
};

async function pedir<T>(path: string, init: RequestInit, conToken: boolean): Promise<T> {
  const headers = new Headers(init.headers);
  // Con FormData (fotos) el navegador pone el Content-Type con su separador.
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (conToken && accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: 'include' });
  } catch {
    throw new ApiError('No pudimos conectar con GARWEB. Revise su conexión e intente de nuevo.', 0);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errores = data.errores && typeof data.errores === 'object' && !Array.isArray(data.errores) ? data.errores : {};
    throw new ApiError(data.mensaje ?? 'Ocurrió un error inesperado. Intente de nuevo.', res.status, errores);
  }
  return data as T;
}

/** Petición pública (login, registro, recuperación). */
export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return pedir<T>(path, { method: 'POST', body: JSON.stringify(body) }, false);
}

/**
 * Descarga autenticada de un archivo (p. ej. el CSV de A20): si el access token venció, lo renueva una vez y
 * reintenta. Guarda el archivo con el nombre que manda la API (o `nombrePorDefecto`).
 */
export async function apiDescargar(path: string, nombrePorDefecto: string): Promise<void> {
  const traer = async () => {
    try {
      return await fetch(`${API_URL}${path}`, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}, credentials: 'include' });
    } catch {
      throw new ApiError('No pudimos conectar con GARWEB. Revise su conexión e intente de nuevo.', 0);
    }
  };
  let res = await traer();
  if (res.status === 401 && renovar && (await renovar())) res = await traer();
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.mensaje ?? 'No pudimos descargar el archivo. Intente de nuevo.', res.status);
  }
  const nombre = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? nombrePorDefecto;
  guardarArchivo(await res.blob(), nombre);
}

/** Entrega un archivo al navegador para que lo guarde (Descargas). */
export function guardarArchivo(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Petición autenticada: si el access token venció, lo renueva una vez y reintenta. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await pedir<T>(path, init, true);
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401 || !renovar) throw e;
    if (!(await renovar())) throw e;
    return pedir<T>(path, init, true);
  }
}
