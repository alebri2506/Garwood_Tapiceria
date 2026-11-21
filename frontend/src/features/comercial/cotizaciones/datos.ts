// Datos de ejemplo de A4 Cotizaciones. Vendrán de la cotización, la plantilla (A16), el Catálogo (A15) y Parámetros (A14) — RG-04.
// Los costos y el precio sugerido solo los ve el administrador (RG-08).

export const RUTA_COTIZAR = '/admin/cotizaciones/cotizar';

export const PLANTILLA = 'Sofá 3 cuerpos · Retapizado completo + espuma (v3)';
export const COSTOS = { tarifaHora: 15, fijos: 60, margen: 0.75 };
export const TRANSPORTE = { costo: 90, direccion: '48 Park St, Montclair', millas: 14 };
export const PROPUESTO_INICIAL = 1050;
export const OBSERVACIONES = 'La tela Lino Navy 204 se pide al aceptar; llega en 1 a 2 días.\nAl recibir el mueble lo revisamos antes de empezar. Si encontramos algo distinto a lo cotizado, no lo tocamos y le enviamos una recotización para que usted decida.\nEl cojín central tiene una mancha: el retapizado la cubre.';

export interface Material { nombre: string; costo: number; tela?: boolean }
export interface Actividad {
  id: number;
  nombre: string;
  horas: number;
  maquina: string;
  tarifaMaquina: number;
  horasMaquina: number | null;
  materiales: Material[];
  nueva?: boolean;
}

export const ACTIVIDADES: Actividad[] = [
  { id: 1, nombre: 'Desmontar tapiz y espuma antigua', horas: 2.5, maquina: '—', tarifaMaquina: 0, horasMaquina: null, materiales: [] },
  { id: 2, nombre: 'Revisar y reforzar estructura', horas: 1.5, maquina: '—', tarifaMaquina: 0, horasMaquina: null, materiales: [{ nombre: 'Pegamento de madera', costo: 8.6 }] },
  { id: 3, nombre: 'Cortar tela', horas: 1.5, maquina: 'Mesa de corte', tarifaMaquina: 4, horasMaquina: 0.5, materiales: [{ nombre: 'Lino Navy 204', costo: 238, tela: true }] },
  { id: 4, nombre: 'Coser fundas y cojines', horas: 4, maquina: 'Máquina de coser industrial', tarifaMaquina: 6, horasMaquina: 4, materiales: [{ nombre: 'Hilo', costo: 6 }, { nombre: 'Cierres · 3', costo: 12 }] },
  { id: 5, nombre: 'Cambiar espuma de asientos', horas: 1.5, maquina: 'Cortadora de espuma', tarifaMaquina: 4, horasMaquina: 0.5, materiales: [{ nombre: 'Espuma HD 2" · 6 planchas', costo: 132 }] },
  { id: 6, nombre: 'Tapizar y armar', horas: 3, maquina: 'Engrapadora neumática', tarifaMaquina: 6, horasMaquina: 2, materiales: [{ nombre: 'Grapas', costo: 8 }, { nombre: 'Pegamento de contacto', costo: 10 }] },
];

/** Precio sugerido (CU-C08): materiales + mano de obra + maquinaria + costos fijos + margen. No incluye transporte. */
export function calcularSugerido(actividades: Actividad[]) {
  const materiales = actividades.reduce((t, a) => t + a.materiales.reduce((m, x) => m + x.costo, 0), 0);
  const horas = actividades.reduce((t, a) => t + a.horas, 0);
  const horasMaquina = actividades.reduce((t, a) => t + (a.horasMaquina ?? 0), 0);
  const maquinaria = actividades.reduce((t, a) => t + (a.horasMaquina ?? 0) * a.tarifaMaquina, 0);
  const mano = horas * COSTOS.tarifaHora;
  const margen = (materiales + mano + maquinaria + COSTOS.fijos) * COSTOS.margen;
  return {
    horas: Math.round(horas * 10) / 10,
    horasMaquina: Math.round(horasMaquina * 10) / 10,
    desglose: [
      { label: 'Margen', value: Math.round(margen) },
      { label: 'Materiales', value: Math.round(materiales) },
      { label: 'Mano de obra', value: Math.round(mano) },
      { label: 'Maquinaria', value: Math.round(maquinaria) },
      { label: 'Costos fijos', value: COSTOS.fijos },
    ],
  };
}

/** `url`: el archivo real (enlace firmado de la API); sin ella se dibuja el ejemplo. */
export interface Medio { nombre: string; origen: 'cliente' | 'cita'; tipo: 'Foto' | 'Video'; detalle: string; fondo: string; duracion?: string; url?: string | null }

export const MEDIOS_MUEBLE: Medio[] = [
  { nombre: 'sofa-frente.jpg', origen: 'cliente', tipo: 'Foto', detalle: 'Enviada por el cliente · 2 oct', fondo: 'linear-gradient(135deg,#1E3A8A,#0B1B3A)' },
  { nombre: 'sofa-lateral.jpg', origen: 'cliente', tipo: 'Foto', detalle: 'Enviada por el cliente · 2 oct', fondo: 'linear-gradient(135deg,#2563EB,#1E3A8A)' },
  { nombre: 'cojines.jpg', origen: 'cliente', tipo: 'Foto', detalle: 'Enviada por el cliente · 2 oct', fondo: 'linear-gradient(135deg,#0EA5E9,#1E3A8A)' },
  { nombre: 'brazo.mp4', origen: 'cliente', tipo: 'Video', detalle: 'Enviado por el cliente · 2 oct', fondo: 'linear-gradient(135deg,#475569,#0B1B3A)', duracion: '0:42' },
  { nombre: 'sofa-local-1.jpg', origen: 'cita', tipo: 'Foto', detalle: 'Tomada en la cita · mar 6 oct', fondo: 'linear-gradient(135deg,#0F766E,#0B1B3A)' },
  { nombre: 'medidas.jpg', origen: 'cita', tipo: 'Foto', detalle: 'Tomada en la cita · mar 6 oct', fondo: 'linear-gradient(135deg,#7C3AED,#1E1B4B)' },
];

// ---------------------------------------------------------------- Recotización V2 por daño oculto (COT-0077)
export const V2 = {
  totalV1: 780,
  adelantoPagado: 312,
  cobroInicial: 180,
  cargoRevision: 45,
  plazo: 'dom 18 oct, 18:00',
  fotos: ['resortes-1.jpg', 'resortes-2.jpg', 'marco.jpg'],
};

export interface Adicional { id: number; nombre: string; horas: number; materiales: Material[]; nueva?: boolean }

export const ADICIONALES: Adicional[] = [
  { id: 1, nombre: 'Reemplazar resortes del asiento', horas: 2, materiales: [{ nombre: 'Resortes zigzag 8 u', costo: 22 }, { nombre: 'Clips de resorte', costo: 6 }] },
  { id: 2, nombre: 'Reforzar el marco del asiento', horas: 1.5, materiales: [{ nombre: 'Pegamento de madera', costo: 4 }, { nombre: 'Escuadras 4 u', costo: 8 }] },
];

export const sugeridoAdicional = (filas: Adicional[]) => {
  const costo = filas.reduce((t, f) => t + f.horas * COSTOS.tarifaHora + f.materiales.reduce((m, x) => m + x.costo, 0), 0);
  return Math.round(costo * (1 + COSTOS.margen));
};

// ---------------------------------------------------------------- Registrar respuesta (COT-0078)
export const MEDIOS_RESPUESTA = ['Teléfono', 'En persona', 'Correo', 'Mensaje de texto'];
export const MOTIVOS_RECHAZO = ['Precio', 'Plazo de entrega', 'Eligió otro taller', 'Otro'];

export interface CotizacionRespuesta { codigo: string; cliente: string; mueble: string; total: number; publicada: string; vigencia: string }

export const RESPUESTA_EJEMPLO: CotizacionRespuesta = { codigo: 'COT-0078', cliente: 'Kevin Park', mueble: 'Sillón reclinable', total: 420, publicada: 'dom 4 oct', vigencia: 'hasta mié 4 nov' };
/** La que se acaba de armar, cuando el cliente responde en el momento. */
export const RESPUESTA_ARMADA: Omit<CotizacionRespuesta, 'total'> = { codigo: 'COT-0076', cliente: 'Laura Méndez', mueble: 'Sofá 3 cuerpos', publicada: 'mar 6 oct · ahora', vigencia: 'hasta vie 6 nov' };

// ---------------------------------------------------------------- Renovar vencida (COT-0071)
export const RENOVACION = {
  sugeridoAnterior: 392,
  sugeridoNuevo: 474,
  propuesto: 460,
  vigencia: 'hasta vie 13 nov',
  materiales: [
    { nombre: 'Cuero sintético negro · 6 yd', nota: '', antes: '$90', hoy: '—', estado: 'Inactiva · elegir otra', tono: 'danger', subio: false },
    { nombre: 'Terciopelo gris · 6 yd', nota: 'reemplazo propuesto', antes: '—', hoy: '$132', estado: 'Activa', tono: 'success', subio: false },
    { nombre: 'Espuma HD 2" · 2 planchas', nota: '', antes: '$44', hoy: '$48', estado: 'Subió', tono: 'warning', subio: true },
    { nombre: 'Mano de obra · 6 h', nota: '', antes: '$90', hoy: '$90', estado: 'Igual', tono: 'neutral', subio: false },
  ],
} as const;

// ---------------------------------------------------------------- Varios muebles en una cotización (diseño del 14/11)
// Cada mueble tiene su plantilla, su tela, sus fotos, sus actividades y su precio; el total se suma solo y el
// transporte se cobra una sola vez, porque todos se recogen y entregan en el mismo viaje.

export interface TelaMueble {
  tipo: 'taller' | 'cliente' | 'no';
  nombre: string;
  /** Quién la pone, como se lee en la ficha («la pone el taller», «la misma del sofá»). */
  detalle: string;
  precioYd: number;
  yd: number;
  rango: string;
}
export interface MuebleCotizacion {
  clave: string; titulo: string; corto: string; servicio: string; plantilla: string;
  tela: TelaMueble; actividades: Actividad[]; medios: Medio[]; propuesto: number; sugerencia: string;
}

const TELA_NAVY = 'Lino Navy 204';
const MEDIOS_OTOMAN: Medio[] = [
  { nombre: 'otoman-1.jpg', origen: 'cliente', tipo: 'Foto', detalle: 'Enviada por el cliente · 2 oct', fondo: 'linear-gradient(135deg,#334155,#0B1B3A)' },
  { nombre: 'otoman-local.jpg', origen: 'cita', tipo: 'Foto', detalle: 'Tomada en la cita · mar 6 oct', fondo: 'linear-gradient(135deg,#0F766E,#134E4A)' },
];
const MEDIOS_COJINES: Medio[] = [
  { nombre: 'cojines-4.jpg', origen: 'cliente', tipo: 'Foto', detalle: 'Enviada por el cliente · 2 oct', fondo: 'linear-gradient(135deg,#B45309,#451A03)' },
];

export const MUEBLES_COTIZACION: MuebleCotizacion[] = [
  {
    clave: 'Mueble 1', titulo: 'Sofá de 3 cuerpos', corto: 'sofá', servicio: 'Retapizado + cambio de espuma',
    plantilla: 'Sofá 3 cuerpos · Retapizado completo + espuma (v3)',
    tela: { tipo: 'taller', nombre: TELA_NAVY, detalle: 'la pone el taller', precioYd: 24, yd: 14, rango: 'Sugerido por la plantilla del sofá de 3 cuerpos: 14 a 16 yd. Si hubo cita o visita, aquí llega lo que se midió.' },
    actividades: ACTIVIDADES, medios: MEDIOS_MUEBLE, propuesto: PROPUESTO_INICIAL,
    sugerencia: 'En los últimos 3 pedidos de sofá 3 cuerpos se usó 12 % más tela de lo cotizado.',
  },
  {
    clave: 'Mueble 2', titulo: 'Otomán', corto: 'otomán', servicio: 'Retapizado · misma tela del sofá',
    plantilla: 'Otomán o puf · Retapizado completo (v1)',
    tela: { tipo: 'taller', nombre: TELA_NAVY, detalle: 'la misma del sofá', precioYd: 24, yd: 2, rango: 'Sugerido por la plantilla del otomán: 2 a 3 yd.' },
    actividades: [
      { id: 1, nombre: 'Desmontar tapiz antiguo', horas: 0.5, maquina: '—', tarifaMaquina: 0, horasMaquina: null, materiales: [] },
      { id: 2, nombre: 'Cortar tela', horas: 0.5, maquina: 'Mesa de corte', tarifaMaquina: 4, horasMaquina: 0.2, materiales: [{ nombre: TELA_NAVY, costo: 34, tela: true }] },
      { id: 3, nombre: 'Coser y tapizar', horas: 1.5, maquina: 'Máquina de coser industrial', tarifaMaquina: 6, horasMaquina: 1, materiales: [{ nombre: 'Hilo', costo: 3 }, { nombre: 'Grapas', costo: 2 }] },
      { id: 4, nombre: 'Control de calidad', horas: 0.2, maquina: '—', tarifaMaquina: 0, horasMaquina: null, materiales: [] },
    ],
    medios: MEDIOS_OTOMAN, propuesto: 180, sugerencia: 'Precio del otomán dentro de la misma cotización.',
  },
  {
    clave: 'Mueble 3', titulo: 'Cojines decorativos × 4', corto: 'cojines', servicio: 'Fundas nuevas · 4 iguales',
    plantilla: 'Cojín decorativo · Retapizado (× 4)',
    tela: { tipo: 'taller', nombre: 'Lino Arena 110', detalle: 'la pone el taller', precioYd: 22, yd: 3, rango: 'Sugerido por la plantilla: 0.75 yd por cojín × 4 = 3 yd.' },
    actividades: [
      { id: 1, nombre: 'Cortar tela', horas: 0.5, maquina: 'Mesa de corte', tarifaMaquina: 4, horasMaquina: 0.2, materiales: [{ nombre: 'Lino Arena 110', costo: 66, tela: true }] },
      { id: 2, nombre: 'Coser 4 fundas con cierre', horas: 2, maquina: 'Máquina de coser industrial', tarifaMaquina: 6, horasMaquina: 1.5, materiales: [{ nombre: 'Hilo', costo: 3 }, { nombre: 'Cierres · 4', costo: 16 }] },
      { id: 3, nombre: 'Rellenar con fibra nueva', horas: 0.5, maquina: '—', tarifaMaquina: 0, horasMaquina: null, materiales: [{ nombre: 'Relleno de fibra · 4', costo: 24 }] },
    ],
    medios: MEDIOS_COJINES, propuesto: 160, sugerencia: 'Los 4 cojines son iguales: la plantilla de un cojín se multiplica por 4.',
  },
];
