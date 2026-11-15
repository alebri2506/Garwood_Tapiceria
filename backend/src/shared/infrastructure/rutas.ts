// CU-C07: distancia por calle entre el taller y la dirección del cliente, como una app de taxi.
// Adaptador: OpenStreetMap (Nominatim) para ubicar las direcciones y OSRM para la ruta en auto. Si algo falla devuelve
// null y el Administrador ingresa el transporte a mano (queda registrado quién y por qué).
import { env } from '../../config/env.js';
import { logger } from './logger.js';

export interface Punto { texto: string; latitud?: number | null; longitud?: number | null }

export interface Rutas {
  /** Millas por calle de ida (null si no se pudo calcular). */
  millas(origen: Punto, destino: Punto): Promise<number | null>;
}

const AGENTE = 'GARWEB/1.0 (sistema de taller de tapiceria)';
const ESPERA_MS = 6000;
const METROS_POR_MILLA = 1609.344;
// Las direcciones del taller y de los clientes casi no cambian: se ubican una vez por arranque del servidor.
const ubicadas = new Map<string, { lat: number; lon: number } | null>();

async function pedir(url: string) {
  const r = await fetch(url, { headers: { 'User-Agent': AGENTE, 'Accept-Language': 'es' }, signal: AbortSignal.timeout(ESPERA_MS) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<unknown>;
}

/**
 * Versiones de la dirección para buscar, de la más exacta a la más simple: OpenStreetMap no reconoce el local, la suite
 * o el departamento («469 South Avenue E B», «Apt 2») y sin ellos encuentra la misma calle y número.
 */
export function variantesDireccion(texto: string) {
  const limpia = texto.trim().replace(/\s+/g, ' ');
  const sinUnidad = limpia.replace(/[,\s]+(apt|apartment|suite|ste|unit|fl|floor|piso|depto|dpto|#)\.?\s*[\w-]+/gi, '');
  const [calle = '', ...resto] = sinUnidad.split(',');
  // «469 South Avenue E B»: una letra o un número de local suelto al final de la calle (no «St» ni los puntos cardinales).
  const sinLocal = [calle.replace(/\s+([A-Za-z]|[A-Za-z]?\d{1,3}[A-Za-z]?)$/, (x) => (/^\s+[NSEW]$/i.test(x) ? x : '')), ...resto].join(',');
  return [...new Set([limpia, sinUnidad, sinLocal])];
}

async function ubicar(p: Punto) {
  if (p.latitud != null && p.longitud != null) return { lat: Number(p.latitud), lon: Number(p.longitud) };
  const clave = p.texto.trim().toLowerCase();
  if (ubicadas.has(clave)) return ubicadas.get(clave)!;
  let punto: { lat: number; lon: number } | null = null;
  for (const q of variantesDireccion(p.texto)) {
    const datos = (await pedir(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`)) as { lat: string; lon: string }[];
    if (datos[0]) { punto = { lat: Number(datos[0].lat), lon: Number(datos[0].lon) }; break; }
  }
  ubicadas.set(clave, punto);
  return punto;
}

export const rutasOsm: Rutas = {
  async millas(origen, destino) {
    try {
      const [a, b] = [await ubicar(origen), await ubicar(destino)];
      if (!a || !b) return null;
      const datos = (await pedir(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`)) as { routes?: { distance: number }[] };
      const metros = datos.routes?.[0]?.distance;
      return metros == null ? null : Math.round((metros / METROS_POR_MILLA) * 10) / 10;
    } catch (err) {
      logger.warn({ err }, 'No se pudo calcular la distancia del transporte (se puede ingresar a mano)');
      return null;
    }
  },
};

/** Sin servicio externo (pruebas): siempre las mismas millas, o null para probar el ingreso a mano. */
export const rutasFijas = (millas: number | null): Rutas => ({ millas: async () => millas });

export const crearRutas = (): Rutas => (env.NODE_ENV === 'test' ? rutasFijas(null) : rutasOsm);
