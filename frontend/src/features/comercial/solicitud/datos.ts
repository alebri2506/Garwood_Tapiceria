// Datos de ejemplo para maquetar W2. Cuando exista la API vendrán de:
//   tipos de mueble y servicios → tipo_mueble / plantilla · telas → catálogo de materiales (A15, solo activas)
//   unidad de medida y franjas → parámetros (A14) · direcciones → direccion del cliente · feriados → agenda_bloqueo
import type { IconName } from '../../../shared/ui/Icon';

export interface TipoMueble {
  id: string;
  nombre: string;
  /** Cómo se nombra en una frase ("Un sofá de 3 cuerpos usa…"). */
  enFrase: string;
  yardasRef: string;
  partes: { nombre: string; yardas: number }[];
}

export const TIPOS_MUEBLE: TipoMueble[] = [
  {
    id: 'sofa3', nombre: 'Sofá de 3 cuerpos', enFrase: 'sofá de 3 cuerpos', yardasRef: '14 a 16 yardas',
    partes: [
      { nombre: 'Respaldo', yardas: 5 }, { nombre: 'Asiento (cojines)', yardas: 4 }, { nombre: 'Brazo izquierdo', yardas: 2 },
      { nombre: 'Brazo derecho', yardas: 2 }, { nombre: 'Base y faldón', yardas: 3 }, { nombre: 'Parte trasera', yardas: 3 },
    ],
  },
  {
    id: 'sillon', nombre: 'Sillón', enFrase: 'sillón', yardasRef: '6 a 8 yardas',
    partes: [{ nombre: 'Respaldo', yardas: 2 }, { nombre: 'Asiento', yardas: 2 }, { nombre: 'Brazos', yardas: 2 }, { nombre: 'Base', yardas: 1 }],
  },
  {
    id: 'silla', nombre: 'Silla de comedor', enFrase: 'silla de comedor', yardasRef: '1 a 2 yardas',
    partes: [{ nombre: 'Asiento', yardas: 1 }, { nombre: 'Respaldo', yardas: 1 }],
  },
  {
    id: 'cabecera', nombre: 'Cabecera', enFrase: 'cabecera', yardasRef: '3 a 5 yardas',
    partes: [{ nombre: 'Frente', yardas: 3 }, { nombre: 'Bordes', yardas: 1 }],
  },
];

export const SERVICIOS = [
  { id: 'completo', nombre: 'Retapizado completo + cambio de espuma', corto: 'Retapizado + espuma' },
  { id: 'retapizado', nombre: 'Solo retapizado', corto: 'Solo retapizado' },
  { id: 'espuma', nombre: 'Solo cambio de espuma', corto: 'Solo espuma' },
  { id: 'estructura', nombre: 'Reparación de estructura', corto: 'Reparación de estructura' },
];

export type OpcionTela = 'trae' | 'catalogo' | 'local' | 'sin';

export const OPCIONES_TELA: { id: OpcionTela; titulo: string; detalle: string; icono: IconName; requiereCita: boolean }[] = [
  { id: 'trae', titulo: 'La traigo yo', detalle: 'Sin costo de tela · la entrega con el mueble', icono: 'package', requiereCita: false },
  { id: 'catalogo', titulo: 'Telas en línea', detalle: 'Elija aquí · solo telas disponibles', icono: 'image', requiereCita: false },
  { id: 'local', titulo: 'Ver en el local', detalle: 'Véala y tóquela · requiere cita', icono: 'calendar', requiereCita: true },
  { id: 'sin', titulo: 'No lleva tela', detalle: 'Solo espuma o estructura', icono: 'x', requiereCita: false },
];

export type Traslado = 'delivery' | 'propio';

export const OPCIONES_TRASLADO: { id: Traslado; titulo: string; detalle: string; icono: IconName }[] = [
  { id: 'delivery', titulo: 'Delivery (recojo y entrega)', detalle: 'Ida y vuelta, un solo costo', icono: 'truck' },
  { id: 'propio', titulo: 'Lo llevo y lo recojo yo', detalle: 'Con turno libre de la agenda', icono: 'map-pin' },
];

export type Familia = 'Lino' | 'Pana' | 'Chenille' | 'Cuero sint.' | 'Terciopelo';
export const FAMILIAS: ('Todas' | Familia)[] = ['Todas', 'Lino', 'Pana', 'Chenille', 'Cuero sint.', 'Terciopelo'];

export interface Tela {
  id: number;
  nombre: string;
  color: string;
  familia: Familia;
  composicion: string;
}

export const TELAS: Tela[] = [
  { id: 0, nombre: 'Lino Navy 204', color: '#1E2A4A', familia: 'Lino', composicion: '100 % lino · azul marino' },
  { id: 1, nombre: 'Lino Arena 110', color: '#CDBA96', familia: 'Lino', composicion: 'Lino y algodón · arena' },
  { id: 2, nombre: 'Pana Gris 318', color: '#6B7280', familia: 'Pana', composicion: 'Pana de algodón · gris' },
  { id: 3, nombre: 'Chenille Verde 52', color: '#3F6B4E', familia: 'Chenille', composicion: 'Chenille · verde bosque' },
  { id: 4, nombre: 'Chenille Marfil 12', color: '#E7DFCF', familia: 'Chenille', composicion: 'Chenille · marfil' },
  { id: 5, nombre: 'Cuero sint. Café', color: '#6B4226', familia: 'Cuero sint.', composicion: 'Fácil de limpiar · café' },
  { id: 6, nombre: 'Terciopelo Vino', color: '#6D1F3A', familia: 'Terciopelo', composicion: 'Terciopelo · vino' },
  { id: 7, nombre: 'Terciopelo Mostaza', color: '#B8860B', familia: 'Terciopelo', composicion: 'Terciopelo · mostaza' },
];

/** Textura dibujada con CSS por familia de tela, sobre el color de la tela. */
const TEXTURA: Record<Familia, string> = {
  Lino: 'repeating-linear-gradient(0deg,#FFFFFF14 0 1px,transparent 1px 3px),repeating-linear-gradient(90deg,#0000001A 0 1px,transparent 1px 3px)',
  Pana: 'repeating-linear-gradient(90deg,#FFFFFF1F 0 3px,#0000001F 3px 4px,transparent 4px 7px)',
  Chenille: 'radial-gradient(#FFFFFF24 1px,transparent 1.6px) 0 0/5px 5px,radial-gradient(#00000024 1px,transparent 1.6px) 2.5px 2.5px/5px 5px',
  'Cuero sint.': 'radial-gradient(120% 90% at 25% 15%,#FFFFFF33,transparent 55%),radial-gradient(#0000001F 0.8px,transparent 1.2px) 0 0/4px 4px',
  Terciopelo: 'linear-gradient(125deg,#FFFFFF38 0%,transparent 35%,transparent 60%,#00000040 100%)',
};
export const fondoTela = (t: Tela) => `${TEXTURA[t.familia]},${t.color}`;

/** Textura por familia para las telas que vienen de la API (cualquier familia; las nuevas sin textura propia van lisas). */
const TEXTURA_EXTRA: Record<string, string> = {
  Estampado: 'radial-gradient(circle at 30% 30%,#F3D9C9 0 4px,transparent 5px) 0 0/18px 18px,radial-gradient(circle at 70% 70%,#5E7D5A 0 3px,transparent 4px) 0 0/18px 18px',
};
export const fondoDe = (familia: string | null, color: string | null) => {
  const textura = (TEXTURA as Record<string, string>)[familia ?? ''] ?? TEXTURA_EXTRA[familia ?? ''];
  return textura ? `${textura},${color ?? '#94A3B8'}` : color ?? '#94A3B8';
};

/** Unidad de medida de las telas (parámetro del taller). */
export const UNIDAD = { corta: 'yd', larga: 'yardas', nota: 'Se vende por yarda (0.91 m) · unidad configurada por el taller' };

export const FRANJAS = ['Mañana · 9:00–12:00', 'Tarde · 13:00–17:00'];

/** Como la tabla `direccion`: el texto y sus coordenadas, guardadas al elegirla con Google Maps. */
export interface Direccion {
  id: string;
  etiqueta: string;
  texto: string;
  ciudad: string;
  ubicacion: google.maps.LatLngLiteral;
}

// Coordenadas aproximadas, solo para el ejemplo.
export const DIRECCIONES_GUARDADAS: Direccion[] = [
  { id: 'casa', etiqueta: 'Casa', texto: '48 Park St, Montclair, NJ 07042', ciudad: 'Montclair, NJ', ubicacion: { lat: 40.8223, lng: -74.2146 } },
  { id: 'oficina', etiqueta: 'Oficina', texto: '200 Bloomfield Ave, Montclair', ciudad: 'Montclair, NJ', ubicacion: { lat: 40.8137, lng: -74.2203 } },
];
