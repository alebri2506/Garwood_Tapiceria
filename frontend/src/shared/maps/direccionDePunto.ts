// Dirección de un punto del mapa con OpenStreetMap (Nominatim): gratis y sin clave, en lugar de la Geocoding API de Google.
// Política de uso de Nominatim: como máximo 1 consulta por segundo, solo por acción del usuario y citando a OpenStreetMap.
// https://operations.osmfoundation.org/policies/nominatim/

const URL_NOMINATIM = 'https://nominatim.openstreetmap.org/reverse';
const ESPERA_MIN_MS = 1100;

interface DireccionOsm {
  house_number?: string;
  road?: string;
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  suburb?: string;
  postcode?: string;
  'ISO3166-2-lvl4'?: string; // p. ej. "US-NJ"
  country_code?: string;
}

/** Arma la dirección al estilo de EE. UU.: "123 Elm St, Elizabeth, NJ 07201". Devuelve null si no hay calle. */
export function formatearDireccionOsm(a: DireccionOsm): string | null {
  if (!a.road) return null;
  const calle = a.house_number ? `${a.house_number} ${a.road}` : a.road;
  const ciudad = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.suburb;
  const estado = a['ISO3166-2-lvl4']?.split('-')[1];
  const estadoYCodigo = [estado, a.postcode].filter(Boolean).join(' ');
  return [calle, ciudad, estadoYCodigo].filter(Boolean).join(', ');
}

let ultima = 0;

/**
 * Busca la dirección del punto tocado. Lanza un error con un mensaje para el usuario si no se puede.
 * Si se toca muy seguido, espera lo necesario para respetar el límite de 1 consulta por segundo.
 */
export async function direccionDePunto(punto: google.maps.LatLngLiteral): Promise<string> {
  const espera = ultima + ESPERA_MIN_MS - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultima = Date.now();

  const params = new URLSearchParams({
    format: 'jsonv2', lat: String(punto.lat), lon: String(punto.lng), zoom: '18', addressdetails: '1', 'accept-language': 'en',
  });
  let datos: { address?: DireccionOsm; error?: string };
  try {
    const r = await fetch(`${URL_NOMINATIM}?${params}`, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(String(r.status));
    datos = await r.json();
  } catch {
    throw new Error('No pudimos buscar la dirección ahora. Escríbala en el campo.');
  }
  if (datos.address?.country_code && datos.address.country_code !== 'us') {
    throw new Error('Ese punto está fuera de EE. UU. Toque una dirección en New Jersey o alrededores.');
  }
  const texto = datos.address ? formatearDireccionOsm(datos.address) : null;
  if (!texto) throw new Error('No encontramos una calle en ese punto. Acerque el mapa y toque sobre la casa o la calle.');
  return texto;
}
