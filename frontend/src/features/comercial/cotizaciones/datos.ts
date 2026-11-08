// Datos de ejemplo de A4 Cotizaciones. Vendrán de la cotización, la plantilla (A16), el Catálogo (A15) y Parámetros (A14) — RG-04.
// Los costos y el precio sugerido solo los ve el administrador (RG-08).

export const RUTA_COTIZAR = '/admin/cotizaciones/cotizar';

export const ESTADOS_COTIZACION = ['Borrador', 'Pendiente de respuesta', 'Aceptada', 'Rechazada', 'Vencida', 'Reemplazada'] as const;
export type EstadoCotizacion = (typeof ESTADOS_COTIZACION)[number];

export interface Cotizacion {
  codigo: string;
  version: string;
  cliente: string;
  origen: string;
  mueble: string;
  total: number;
  estado: EstadoCotizacion;
  detalle: string;
  fecha: string;
  fechaTono?: 'pronto' | 'tarde';
  accion: { texto: string; a: string };
}

export const COTIZACIONES: Cotizacion[] = [
  { codigo: 'COT-0076', version: 'V1 · borrador', cliente: 'Laura Méndez', origen: 'SOL-0076 · cita hoy', mueble: 'Sofá 3 cuerpos', total: 1140, estado: 'Borrador', detalle: 'Armando hace 11 min', fecha: 'sin publicar', accion: { texto: 'Seguir armando', a: RUTA_COTIZAR } },
  { codigo: 'COT-0077', version: 'V2 · recotización', cliente: 'Robert King', origen: 'PED-0077 · revisión inicial', mueble: 'Sillón Berger', total: 960, estado: 'Pendiente de respuesta', detalle: 'Orden OS-0077 anulada', fecha: 'responde dom 18 oct', fechaTono: 'pronto', accion: { texto: 'Ver recotización', a: `${RUTA_COTIZAR}?modo=v2` } },
  { codigo: 'COT-0078', version: 'V1', cliente: 'Kevin Park', origen: 'SOL-0078', mueble: 'Sillón reclinable · espuma', total: 420, estado: 'Pendiente de respuesta', detalle: 'Publicada el 4 oct', fecha: 'vence mié 4 nov', accion: { texto: 'Registrar respuesta', a: `${RUTA_COTIZAR}?modo=respuesta` } },
  { codigo: 'COT-0081', version: 'V1', cliente: 'Hotel Willow', origen: 'SOL-0081', mueble: '12 sillas · 2 telas por partes', total: 3360, estado: 'Pendiente de respuesta', detalle: 'Publicada el 5 oct', fecha: 'vence jue 5 nov', accion: { texto: 'Registrar respuesta', a: `${RUTA_COTIZAR}?modo=respuesta` } },
  { codigo: 'COT-0083', version: 'V1', cliente: 'Ana Ruiz', origen: 'SOL-0083', mueble: 'Puff', total: 780, estado: 'Aceptada', detalle: 'Falta el adelanto (40 %)', fecha: 'aceptó vie 2 oct', accion: { texto: 'Ver pago', a: '/admin/pagos' } },
  { codigo: 'COT-0075', version: 'V1', cliente: 'Sara Cohen', origen: 'SOL-0075', mueble: 'Loveseat', total: 890, estado: 'Aceptada', detalle: 'Pedido PED-0075 generado', fecha: 'aceptó 28 sep', accion: { texto: 'Ver pedido', a: '/admin/pedidos' } },
  { codigo: 'COT-0071', version: 'V1', cliente: 'Tom Becker', origen: 'SOL-0071', mueble: 'Cabecera', total: 360, estado: 'Vencida', detalle: 'Motivo: sin respuesta', fecha: 'venció 1 oct', fechaTono: 'tarde', accion: { texto: 'Renovar', a: `${RUTA_COTIZAR}?modo=recalcular` } },
  { codigo: 'COT-0069', version: 'V1', cliente: 'Nora Díaz', origen: 'SOL-0069', mueble: 'Silla de comedor × 4', total: 520, estado: 'Rechazada', detalle: 'Motivo: precio', fecha: 'rechazó 30 sep', accion: { texto: 'Ver cliente', a: '/admin/clientes' } },
  { codigo: 'COT-0077', version: 'V1 · reemplazada', cliente: 'Robert King', origen: 'PED-0077', mueble: 'Sillón Berger', total: 780, estado: 'Reemplazada', detalle: 'Por la V2 tras la revisión', fecha: '13 oct', accion: { texto: 'Ver V2', a: `${RUTA_COTIZAR}?modo=v2` } },
];

export const POR_ARMAR = [
  { codigo: 'SOL-0084', cliente: 'Rosa Díaz', mueble: 'Sillón · 2 telas · comparar precios', etiqueta: 'Nueva · hace 3 días', tono: 'tarde' },
  { codigo: 'SOL-0080', cliente: 'Grace Lin', mueble: 'Cabecera · la trae la clienta', etiqueta: 'Nueva · hoy', tono: '' },
  { codigo: 'SOL-0074', cliente: 'Mark Ellison', mueble: 'Sillón · tela elegida en la cita', etiqueta: 'Atendida lun 5', tono: 'ok' },
];

// ---------------------------------------------------------------- Armar cotización (COT-0076)
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
  { id: 3, nombre: 'Cortar tela', horas: 1.5, maquina: 'Mesa de corte', tarifaMaquina: 4, horasMaquina: 0.5, materiales: [{ nombre: 'Lino Navy 204 · 14 yd', costo: 238, tela: true }] },
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

export interface Medio { nombre: string; origen: 'cliente' | 'cita'; tipo: 'Foto' | 'Video'; detalle: string; fondo: string; duracion?: string }

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
