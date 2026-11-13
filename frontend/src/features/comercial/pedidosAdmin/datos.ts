// Datos de ejemplo de A6 Pedidos y A6b Ficha del pedido (diseño del 11/11). Vendrán del pedido (C14, C16),
// la orden de trabajo (A05–A08, T1–T3), los pagos (C12) y el despacho (D01–D06) cuando existan sus módulos.

/** Etapas del taller que marca el equipo desde su celular (T2). */
export const ETAPAS_TALLER = ['Revisión', 'Desarmar', 'Cortar', 'Coser', 'Tapizar', 'Acabado'] as const;

/** 0 por empezar · 1 en el taller · 2 para despacho · 3 entregados con saldo. */
export type Fase = 0 | 1 | 2 | 3;
export type Tono = '' | 'danger' | 'warn' | 'info';

export interface PedidoFila {
  fase: Fase;
  codigo: string;
  mueble: string;
  cliente: string;
  estado: string;
  /** "Sin empezar", "Coser · 3 de 6", "Terminado"… */
  etapa: string;
  avance: number;
  /** Fecha para terminar (o en que terminó, entregó o se retira). */
  fecha: string;
  /** Días que quedan (negativo = vencido; null = no aplica). */
  quedan: number | null;
  traslado: 'Entrega' | 'Retiro';
  aviso?: string;
  tono?: Tono;
  etiquetaFecha?: string;
}

const P = (fase: Fase, codigo: string, mueble: string, cliente: string, estado: string, etapa: string, avance: number, fecha: string, quedan: number | null, traslado: 'Entrega' | 'Retiro', aviso = '', tono: Tono = '', etiquetaFecha?: string): PedidoFila =>
  ({ fase, codigo, mueble, cliente, estado, etapa, avance, fecha, quedan, traslado, aviso, tono, etiquetaFecha });

export const PEDIDOS: PedidoFila[] = [
  P(0, 'PED-0080', 'Banqueta', 'Daniel Cruz', 'Listo para producir', 'Sin empezar', 0, 'vie 9 oct', -4, 'Entrega', '', 'danger'),
  P(0, 'PED-0082', '6 sillas de comedor', 'Priya Shah', 'Esperando material', 'Sin empezar', 0, 'vie 16 oct', 3, 'Retiro', 'Plumas 2 kg · llegan mié 14', 'warn'),
  P(0, 'PED-0084', '12 sillas', 'Hotel Willow', 'Esperando material', 'Sin empezar', 0, 'mar 20 oct', 7, 'Entrega', 'Tela terciopelo gris · llega hoy', 'info'),
  P(0, 'PED-0085', 'Cabecera', 'Grace Lin', 'Esperando mueble', 'Sin empezar', 0, 'sáb 24 oct', 11, 'Retiro', '', 'info'),
  P(1, 'PED-0081', 'Sofá + 3 cojines', 'J. Ortega', 'En producción', 'Tapizar · 4 de 6', 75, 'jue 15 oct', 2, 'Entrega'),
  P(1, 'PED-0076', 'Sofá 3 cuerpos', 'Laura Méndez', 'En producción', 'Coser · 3 de 6', 60, 'mié 21 oct', 8, 'Entrega', '', 'info'),
  P(1, 'PED-0086', 'Butaca', 'Carla Ortiz', 'En producción', 'Tapizar · 3 de 5', 55, 'lun 19 oct', 6, 'Entrega'),
  P(1, 'PED-0077', 'Sillón Berger', 'Robert King', 'En pausa', 'Revisión inicial', 10, 'se recalcula', null, 'Retiro', 'Daño oculto · espera respuesta a la V2', 'warn'),
  P(2, 'PED-0079', 'Mesa de centro tapizada', 'Emily Stone', 'Terminado', 'Terminado', 100, 'lun 5 oct', null, 'Entrega', 'Sin programar salida · 8 días', 'warn', 'Terminó'),
  P(2, 'PED-0078', 'Silla de escritorio', 'Daniel Cruz', 'Listo para retiro', 'Terminado', 100, 'hoy 15:00', null, 'Retiro', '', 'info', 'Retiro'),
  P(3, 'PED-0072', 'Cabecera', 'Hotel Willow', 'Entregado con saldo', 'Entregado', 100, 'lun 5 oct', null, 'Entrega', 'Debe $380 · vence vie 30 oct', 'warn', 'Entregó'),
];

export const FASES = [
  { titulo: 'Por empezar', detalle: 'Esperan mueble o material, o están listos para el taller', color: '#38BDF8' },
  { titulo: 'En el taller', detalle: 'El equipo marca el avance desde su celular', color: 'var(--primary)' },
  { titulo: 'Para despacho', detalle: 'Terminados: salida programada o retiro en el taller', color: 'var(--warning-500)' },
  { titulo: 'Entregados con saldo', detalle: 'Pasan al Historial cuando terminan de pagar', color: 'var(--success-500)' },
];

/** A6b · ficha de ejemplo (PED-0076). */
export const FICHA = {
  fechaHoy: 'mar 13 oct',
  telefono: '(973) 555-0142',
  direccion: '48 Park St, Montclair',
  traslado: 'delivery ida y vuelta',
  saldoCliente: '$684',
  pedidosAbiertos: 1,
  terminarPara: 'mié 21 oct',
  plazoEstandar: 14,
  etapaCiclo: 'En producción',
  fechasCiclo: ['2 oct', '6–8 oct', '8 oct', 'desde 12 oct'],
  cancelacion: {
    lineas: [['Horas trabajadas · 5.8 h × $15', '$87'], ['Tela comprada (Lino Navy 204 · 14 yd)', '$238'], ['Espuma usada · 7 planchas', '$168'], ['Transporte hecho (recojo)', '$45']],
    cargo: '$538', adelanto: '$456', acordado: '456.00',
  },
  versiones: [
    { codigo: 'V1 · COT-0076', detalle: 'Publicada 6 oct · aceptada 6 oct por la web', total: '$1,140', estado: 'Aceptada' },
  ],
  precios: { sugerido: '$1,268', propuesto: '$1,050', transporte: '$90' },
  pagos: { total: '$1,140', pagado: '$456', saldo: '$684' },
  movPagos: [
    { cuando: '7 oct 09:10', texto: 'Adelanto 40 % · Zelle · comprobante subido por la clienta', estado: 'Confirmado' },
    { cuando: 'al entregar', texto: 'Saldo · se cobra en la entrega', estado: 'Pendiente' },
  ],
  produccion: {
    tela: 'Tela del cliente · Lino Navy 204 · 14 yd', telaEstado: 'Pedida mié 7 · Llegó jue 8 ✓',
    actividades: '3 de 6', avance: 60, horas: '5.8 h / 14 h', quedan: 8,
    movimientos: [
      { cuando: 'lun 12, 08:40', texto: 'Carlos retiró 6 planchas de espuma', marca: 'plan' },
      { cuando: 'hoy 10:05', texto: 'Carlos retiró 1 plancha más', marca: 'Consumo adicional' },
    ],
  },
  despacho: [
    { cuando: 'jue 8 oct', texto: 'Recojo a domicilio · 9 piezas · 4 fotos · conductor', estado: 'Realizada' },
    { cuando: 'por definir', texto: 'Entrega en salida grupal cuando esté terminado', estado: 'Pendiente' },
  ],
  actividad: [
    { cuando: 'hoy 10:05', texto: 'Carlos (producción) registró consumo adicional: +1 plancha de espuma', chip: 'Aviso', tono: 'warning' as const },
    { cuando: 'lun 12 · 08:40', texto: 'Estado: Listo para producir → En producción · Carlos inició la orden', chip: 'En producción' },
    { cuando: 'jue 8 · 11:31', texto: 'Sistema: mueble y materiales completos → Listo para producir · la orden aparece en el celular del taller', chip: 'Automático', tono: 'info' as const },
    { cuando: 'jue 8 · 11:30', texto: 'Luis (conductor) registró el recojo: 9 piezas y 4 fotos', chip: 'Realizada' },
    { cuando: 'mié 7 · 09:20', texto: 'Administrador confirmó el adelanto de $456 · se generó PED-0076 con fecha para terminar mié 21 oct, materiales reservados y orden de trabajo', chip: 'Confirmado' },
    { cuando: 'mar 6 · 11:20', texto: 'Laura Méndez aceptó la cotización COT-0076 en la web', chip: 'Aceptada' },
  ],
};
