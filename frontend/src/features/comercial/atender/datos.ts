// Datos de ejemplo de A2b Atender cita (caso PED-0076 del prototipo: Laura Méndez, sofá de 3 cuerpos).
// Los costos y parámetros vendrán del Catálogo (A15), Plantillas (A16) y Parámetros (A14) — RG-04.

export const CITA = {
  cliente: 'Laura Méndez',
  solicitud: 'SOL-0076',
  cotizacion: 'COT-0076',
  orden: 'OS-0076',
  pedido: 'PED-0076',
  cuando: 'mar 6 oct · 10:00',
  detalle: 'Sofá 3 cuerpos · retapizado + espuma',
  telefono: '(973) 555-0142',
  clienteNueva: true,
  enviada: '2 oct',
};

export const PASOS = ['Recibir y revisar', 'Telas', 'Traslado', 'Cotización', 'Respuesta'];
export const SIGUIENTE = ['Empezar: elegir telas', 'Siguiente: traslado', 'Siguiente: armar la cotización', 'Mostrar a la clienta y pedir respuesta'];

export const PEDIDO_SOLICITUD = [
  { l: 'Mueble', v: 'Sofá de 3 cuerpos' },
  { l: 'Servicio', v: 'Retapizado completo + cambio de espuma' },
  { l: 'Tela', v: 'Quiere verla en el local' },
  { l: 'Medidas', v: 'No indicó' },
];

/** Fotos y video de la solicitud (color de la miniatura de ejemplo; vendrán de Supabase Storage). */
export const ADJUNTOS = [
  { nombre: 'sofa-frente.jpg', color: '#1E3A8A' },
  { nombre: 'sofa-lateral.jpg', color: '#2563EB' },
  { nombre: 'cojines.jpg', color: '#0EA5E9' },
  { nombre: 'brazo.mp4', color: '#475569', duracion: '0:42' },
];

export const PLANTILLA = 'Sofá 3 cuerpos · Retapizado completo + espuma (v3)';

/** Costo por yarda del proveedor, por id de tela de W2 (solo lo ve el administrador: RG-08). */
export const COSTO_YARDA = [17, 17, 22, 24, 24, 28, 31, 31];
/** Familias de tela que toman más tiempo: se sugiere +20 % de horas en coser y tapizar. */
export const FAMILIAS_DIFICILES = ['Terciopelo', 'Cuero sint.'];
export const EXTRA_TELA_DIFICIL = 0.2;
export const YARDAS_UNA_TELA = 14;

export interface Actividad {
  id: number;
  nombre: string;
  horas: number;
  maquina: string;
  horasMaquina: number | null;
  /** 'TELAS' = las telas elegidas en el paso 2. */
  materiales: string[];
  /** Horas escritas a mano: ya no se les suma el extra por tela difícil. */
  manual?: boolean;
}

export const ACTIVIDADES: Actividad[] = [
  { id: 1, nombre: 'Desmontar tapiz y espuma antigua', horas: 2.5, maquina: '—', horasMaquina: null, materiales: [] },
  { id: 2, nombre: 'Revisar y reforzar estructura', horas: 1.5, maquina: '—', horasMaquina: null, materiales: ['Pegamento de madera'] },
  { id: 3, nombre: 'Cortar tela', horas: 1.5, maquina: 'Mesa de corte', horasMaquina: 0.5, materiales: ['TELAS'] },
  { id: 4, nombre: 'Coser fundas y cojines', horas: 4, maquina: 'Máquina de coser industrial', horasMaquina: 4, materiales: ['Hilo', 'Cierres · 3'] },
  { id: 5, nombre: 'Cambiar espuma de asientos', horas: 1.5, maquina: 'Cortadora de espuma', horasMaquina: 0.5, materiales: ['Espuma HD 2" · 6 planchas'] },
  { id: 6, nombre: 'Tapizar y armar', horas: 3, maquina: 'Engrapadora neumática', horasMaquina: 2, materiales: ['Grapas', 'Pegamento de contacto'] },
];
export const LLEVA_EXTRA = /^(Coser|Tapizar)/;

/** Valores de ejemplo para el precio sugerido (CU-C08): materiales + mano de obra + maquinaria + costos fijos + margen. */
export const COSTOS = {
  otrosMateriales: 176.6, // espuma, hilo, cierres, grapas e insumos a precios del Catálogo
  tarifaHora: 15,
  maquinaria: 40,
  fijos: 60,
  margen: 0.75,
};

export const TRANSPORTE = { costo: 90, millas: 14 };
export const ADELANTO = 0.4;
export const VIGENCIA = '1 mes · hasta vie 6 nov';
export const OBSERVACIONES = 'Las telas se piden al aceptar; llegan en 1 a 2 días.\nAl recibir el sofá lo revisamos antes de empezar. Si encontramos algo distinto a lo cotizado, no lo tocamos y le enviamos una recotización.';

export const METODOS_ADELANTO = ['Efectivo', 'Tarjeta', 'Zelle', 'Cheque'];
export const MOTIVOS_RECHAZO = ['Precio', 'Plazo de entrega', 'Elegirá otro taller', 'Otro motivo'];
export const PLAZO_ADELANTO = '7 días';
