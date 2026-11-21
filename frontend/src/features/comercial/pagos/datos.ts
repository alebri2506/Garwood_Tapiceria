// Datos de ejemplo de A5 y W5 Pagos (diseño del 14/11): se ven solo sin backend (VITE_API_URL vacío).
// Con backend las pantallas usan pagosApi.ts; de aquí se reutilizan los textos de los métodos y los datos de Zelle.

/** Saldo = total − pagos confirmados: siempre calculado, nunca escrito (C12). */
export const dinero = (v: number) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

// ---------------------------------------------------------------- A5 (Administrador)
export const METODOS_MANUALES = ['Efectivo', 'Cheque', 'Zelle', 'Transferencia', 'Tarjeta'] as const;
export const REFERENCIA_POR_METODO = ['N.º del recibo entregado', 'N.º de cheque y banco', 'Código de confirmación de Zelle', 'N.º de operación', 'Últimos 4 dígitos o n.º de autorización'];
export const AYUDA_POR_METODO = [
  'Cuente el dinero y entregue el recibo.',
  'Guarde el cheque para depositarlo. Si el banco lo devuelve, anule el pago.',
  'Revise en la app del banco que el dinero llegó.',
  'Revise en la cuenta del banco que el dinero llegó.',
  'Cobrado con el terminal del taller, fuera de la pasarela.',
];

/** Lo que el conductor cobró en la entrega: el Administrador lo confirma cuando recibe el dinero en el taller. */
export interface CobroConductor { id: string; ped: string; cli: string; con: string; met: string; amt: number; when: string; ref: string }
export const COBROS_CONDUCTOR: CobroConductor[] = [
  { id: 'c1', ped: 'PED-0081', cli: 'J. Ortega', con: 'Saldo', met: 'Cheque', amt: 520, when: 'ayer 16:20, en la entrega', ref: 'Cheque n.º 1043 · Chase' },
  { id: 'c2', ped: 'PED-0079', cli: 'Rosa Díaz', con: 'Saldo', met: 'Efectivo', amt: 380, when: 'ayer 11:05, en la entrega', ref: 'Recibo de entrega n.º 0079' },
];

/** Pedidos con dinero por cobrar. `adelanto`: el adelanto pedido (40 %) cuando aún no paga nada. */
/** `id`: el pago confirmado (CONFIRMADOS) al que corresponde, para que anularlo suba el saldo. */
export interface PagoHecho { l: string; s: string; v: number; id?: string }
export interface PedidoCobro { ped: string; cli: string; total: number; adelanto?: number; est: string; pagos: PagoHecho[]; cobro?: string }
export const PEDIDOS_COBRO: PedidoCobro[] = [
  { ped: 'PED-0092', cli: 'María López', total: 1040, adelanto: 416, est: 'Cotización aceptada', pagos: [] },
  { ped: 'PED-0090', cli: 'Emily Carter', total: 775, est: 'En producción', pagos: [{ l: 'Adelanto · pasarela', s: 'hoy 08:52', v: 310, id: 'h1' }] },
  { ped: 'PED-0083', cli: 'Ana Ruiz', total: 780, est: 'En producción', pagos: [{ l: 'Adelanto · efectivo (manual)', s: 'ayer 17:40', v: 312, id: 'h3' }] },
  { ped: 'PED-0076', cli: 'Laura Méndez', total: 1140, est: 'En producción', pagos: [{ l: 'Adelanto · pasarela', s: 'mar 6 oct', v: 456, id: 'h4' }] },
  { ped: 'PED-0086', cli: 'Laura Méndez', total: 480, est: 'Terminado', pagos: [{ l: 'Adelanto · pasarela', s: 'mié 7 oct', v: 192 }] },
  { ped: 'PED-0071', cli: 'Laura Méndez', total: 240, est: 'Terminado', pagos: [{ l: 'Adelanto · pasarela', s: 'lun 28 sep', v: 144 }] },
  { ped: 'PED-0088', cli: 'Hotel Willow', total: 1620, est: 'En producción · adelanto 0 %', pagos: [] },
  { ped: 'PED-0081', cli: 'J. Ortega', total: 1300, est: 'Entregado', pagos: [{ l: 'Adelanto · pasarela', s: 'jue 24 sep', v: 780 }], cobro: 'c1' },
  { ped: 'PED-0079', cli: 'Rosa Díaz', total: 950, est: 'Entregado', pagos: [{ l: 'Adelanto · pasarela', s: 'mar 22 sep', v: 570 }], cobro: 'c2' },
];

/** Pagos confirmados. `pasarela`: entró solo por la pasarela (tarjeta o cuenta bancaria en línea). */
export interface PagoConfirmado {
  id: string; ped: string; cli: string; con: string; met: string; pasarela: boolean; amt: number; when: string; who: string; rec: string;
  /** Comisión y neto de la pasarela (solo informativo). */
  comision?: string; neto?: string;
}
export const CONFIRMADOS: PagoConfirmado[] = [
  { id: 'h1', ped: 'PED-0090', cli: 'Emily Carter', con: 'Adelanto 40 %', met: 'Tarjeta en línea', pasarela: true, amt: 310, when: 'hoy 08:52', who: 'Pasarela · confirmado al instante', rec: 'REC-0131', comision: '$9.29', neto: '$300.71' },
  { id: 'h2', ped: 'PED-0091', cli: 'Daniel Brooks', con: 'Saldo', met: 'Tarjeta en línea', pasarela: true, amt: 184, when: 'hoy 07:40', who: 'Pasarela · confirmado al instante', rec: 'REC-0130', comision: '$5.64', neto: '$178.36' },
  { id: 'h3', ped: 'PED-0083', cli: 'Ana Ruiz', con: 'Adelanto 40 %', met: 'Efectivo', pasarela: false, amt: 312, when: 'ayer 17:40', who: 'Administrador · en el local', rec: 'REC-0129' },
  { id: 'h4', ped: 'PED-0076', cli: 'Laura Méndez', con: 'Adelanto 40 %', met: 'Tarjeta en línea', pasarela: true, amt: 456, when: 'mar 6 oct', who: 'Pasarela · confirmado al instante', rec: 'REC-0126', comision: '$13.52', neto: '$442.48' },
  { id: 'h5', ped: 'PED-0084', cli: 'Hotel Willow', con: 'Saldo · adelanto 0 %', met: 'Transferencia', pasarela: false, amt: 1200, when: 'lun 5 oct', who: 'Administrador · revisó su cuenta', rec: 'REC-0127' },
];
/** Saldo de pedidos que no están en PEDIDOS_COBRO (ya pagaron todo). */
export const SALDO_CERRADO: Record<string, number> = { 'PED-0091': 0, 'PED-0084': 0 };

// ---------------------------------------------------------------- W5 (Cliente)
export type EstadoPagoCliente = 'Pendiente' | 'Por confirmar' | 'Confirmado' | 'Rechazado' | 'En proceso';
export interface PagoCliente { id: string; concepto: string; monto: number; sub: string; estado: EstadoPagoCliente; motivo?: string; reemplazado?: boolean }
export interface CuentaCliente {
  pedido: string; titulo: string; total: number; proximo: string;
  pagos: PagoCliente[];
  recibos: { codigo: string; texto: string }[];
}

export const CUENTAS_CLIENTE: CuentaCliente[] = [
  {
    pedido: 'PED-0076', titulo: 'Sofá de 3 cuerpos', total: 1140, proximo: 'Saldo · al entregar',
    pagos: [
      { id: 'p1', concepto: 'Adelanto 40 % · 1.er comprobante', monto: 456, sub: 'Zelle · 6 oct', estado: 'Rechazado', motivo: 'No se lee el monto. Reemplazado el 7 oct.', reemplazado: true },
      { id: 'p2', concepto: 'Adelanto 40 %', monto: 456, sub: 'Zelle · 7 oct', estado: 'Confirmado' },
      { id: 'p3', concepto: 'Saldo', monto: 684, sub: 'Antes de la entrega o al recibir', estado: 'Pendiente' },
    ],
    recibos: [{ codigo: 'REC-0076-1', texto: 'Adelanto · $456 · 7 oct' }],
  },
  {
    pedido: 'PED-0086', titulo: 'Puff a juego (nuevo)', total: 480, proximo: 'Saldo · al entregar',
    pagos: [
      { id: 'p1', concepto: 'Adelanto 40 %', monto: 192, sub: 'Zelle · 7 oct', estado: 'Confirmado' },
      { id: 'p2', concepto: 'Saldo', monto: 288, sub: 'Cheque · 21 oct', estado: 'Rechazado', motivo: 'La foto del cheque está cortada. Vuelva a subirla.' },
    ],
    recibos: [{ codigo: 'REC-0086-1', texto: 'Adelanto · $192 · 7 oct' }],
  },
  {
    pedido: 'PED-0071', titulo: 'Cojines decorativos × 4', total: 160, proximo: 'Saldo · al recibir',
    pagos: [
      { id: 'p1', concepto: 'Adelanto 40 %', monto: 64, sub: 'Zelle · 28 sep', estado: 'Confirmado' },
      { id: 'p2', concepto: 'Saldo', monto: 96, sub: 'Antes de la entrega o al recibir', estado: 'Pendiente' },
    ],
    recibos: [{ codigo: 'REC-0071-1', texto: 'Adelanto · $64 · 28 sep' }],
  },
];

/** Datos para pagar por Zelle (los define el taller; por confirmar con el dueño). */
export const ZELLE = { destino: '[correo o teléfono Zelle]', titular: 'Garwood LLC' };
