// Clave de navegador de Google Maps (restringida por dominio en Google Cloud; no es un secreto del servidor).
// APIs que necesita: "Maps JavaScript API" y "Places API (New)".
export const GOOGLE_MAPS_API_KEY: string = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
// Los marcadores avanzados exigen un Map ID; DEMO_MAP_ID sirve para desarrollo.
export const GOOGLE_MAPS_MAP_ID: string = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';
export const mapsHabilitado = GOOGLE_MAPS_API_KEY.length > 0;

/** Vista inicial cuando aún no hay dirección: norte de New Jersey, donde trabaja el taller. */
export const CENTRO_POR_DEFECTO: google.maps.LatLngLiteral = { lat: 40.82, lng: -74.21 };
