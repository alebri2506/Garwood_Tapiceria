// W6 Mis pedidos (CU-C16 y CU-H06). Datos de EJEMPLO del caso PED-0076 para maquetar las tres pestañas:
// cuando exista la API vendrán de los pedidos, solicitudes y cotizaciones del cliente con sesión.
// RG-08: aquí solo hay lo que el cliente puede ver (nada de costos internos ni márgenes).
import type { IconName } from '../../../shared/ui/Icon';

type Tono = 'neutral' | 'info' | 'progress' | 'warning' | 'success' | 'danger';

/** Aviso de "qué sigue": le toca al cliente (you) o al taller (us). */
export interface Aviso {
  quien: 'you' | 'us';
  icono: IconName;
  texto: string;
}

export interface Accion {
  texto: string;
  a: string;
  tipo: 'primary' | 'secondary';
}

/** Tarjeta de las listas de W6a y W6c. */
export interface Tarjeta {
  id: string;
  titulo: string;
  codigo: string;
  icono: IconName;
  thumb: '' | 'b';
  estado: string;
  tono?: Tono;
  pasos: string[];
  pasoActual: number;
  aviso: Aviso;
  monto?: { valor: string; sub: string };
  accion?: Accion;
  necesitaAccion: boolean;
}

// ---------------------------------------------------------------- W6a En curso

export interface Etapa { l: string; d: string }

export interface PedidoEnCurso extends Tarjeta {
  descripcion: string;
  entregaEstimada: string;
  etapas: Etapa[];
  etapaActual: number;
  siguiente: Aviso;
  trabajo: { texto: string; hechos: number; total: number; pie: string; actualizado: string };
  fotos: string;
  datos: { l: string; v: string; a?: string; ok?: boolean }[];
  cuenta: { total: string; pagos: { l: string; v: string }[]; saldo: string };
  entrega: { asignada: boolean; texto: string; pasos?: string[]; accion?: Accion };
  /** Desglose del cargo si cancela ahora (CU-C15). Sin desglose, el taller lo calcula. */
  cancelacion?: { explicacion: string; lineas: { l: string; v: string }[]; cargo: string; adelanto: string; resultado: { l: string; v: string } };
}

const PASOS_PEDIDO = ['Confirmado', 'Recojo', 'En el taller', 'Listo', 'Entrega'];

export const PEDIDOS_EN_CURSO: PedidoEnCurso[] = [
  {
    id: 'PED-0071', titulo: 'Cojines decorativos × 4', codigo: 'PED-0071 · retapizado · Lino Navy 204', icono: 'sofa', thumb: '',
    estado: 'Terminado', pasos: PASOS_PEDIDO, pasoActual: 4, necesitaAccion: true,
    aviso: { quien: 'you', icono: 'calendar', texto: 'Le toca a usted: el taller asignó la entrega al jue 15 oct entre 10:00 y 12:00. Confírmela o reprográmela hasta el mié 14, 10:00.' },
    monto: { valor: '$96', sub: 'saldo a pagar al recibir' },
    accion: { texto: 'Confirmar o reprogramar', a: '/cliente/entrega', tipo: 'primary' },
    descripcion: 'PED-0071 · retapizado · Lino Navy 204', entregaEstimada: 'jue 15 oct',
    etapas: [{ l: 'Pedido confirmado', d: '2 oct' }, { l: 'Recojo', d: 'lun 5 oct · 4 piezas' }, { l: 'Revisión inicial', d: '5 oct · sin sorpresas' }, { l: 'En el taller', d: '6–9 oct' }, { l: 'Listo', d: 'vie 9 oct' }, { l: 'Entrega', d: 'jue 15 oct · 10:00–12:00' }],
    etapaActual: 5,
    siguiente: { quien: 'you', icono: 'calendar', texto: 'Confirme la entrega del jue 15 oct entre 10:00 y 12:00, o reprográmela hasta el mié 14, 10:00.' },
    trabajo: { texto: 'Terminamos el retapizado de los 4 cojines. Ya están empacados y listos para salir.', hechos: 2, total: 2, pie: '2 de 2 trabajos · terminado el vie 9 oct', actualizado: 'vie 9 oct 17:30' },
    fotos: 'Fotos del recojo (lun 5 oct) · 4 piezas contadas: 4 cojines decorativos. Las mismas 4 vuelven en la entrega.',
    datos: [{ l: 'Trabajo', v: 'Retapizado' }, { l: 'Tela', v: 'Lino Navy 204 · 3 yd' }, { l: 'Traslado', v: 'Recojo y entrega' }, { l: 'Dirección', v: '48 Park St, Montclair' }, { l: 'Orden de servicio', v: 'OS-0071 · PDF', a: '/cliente/cotizacion' }, { l: 'Revisión inicial', v: 'Sin sorpresas · 5 oct', ok: true }],
    cuenta: { total: '$160', pagos: [{ l: 'Adelanto pagado · Zelle', v: '$64' }], saldo: '$96' },
    entrega: { asignada: true, texto: 'jue 15 oct entre 10:00 y 12:00, en 48 Park St, Montclair. Puede confirmarla o reprogramarla hasta 24 h antes.', accion: { texto: 'Confirmar o reprogramar', a: '/cliente/entrega', tipo: 'primary' } },
  },
  {
    id: 'PED-0076', titulo: 'Sofá de 3 cuerpos', codigo: 'PED-0076 · retapizado + espuma · Lino Navy 204', icono: 'sofa', thumb: '',
    estado: 'En producción', pasos: PASOS_PEDIDO, pasoActual: 2, necesitaAccion: false,
    aviso: { quien: 'us', icono: 'info', texto: 'Estamos cambiando la espuma de los asientos (3 de 6 trabajos). Terminamos el vie 16 oct (estimado).' },
    monto: { valor: '$684', sub: 'saldo pendiente' },
    descripcion: 'PED-0076 · retapizado + espuma · Lino Navy 204', entregaEstimada: 'semana del 19 oct',
    etapas: [{ l: 'Pedido confirmado', d: '7 oct' }, { l: 'Recojo', d: 'jue 8 oct · 9 piezas' }, { l: 'Revisión inicial', d: '8 oct · sin sorpresas' }, { l: 'En el taller', d: 'desde lun 12 oct' }, { l: 'Listo', d: 'vie 16 oct (est.)' }, { l: 'Entrega', d: 'fecha por asignar' }],
    etapaActual: 3,
    siguiente: { quien: 'us', icono: 'info', texto: 'Por ahora no necesita hacer nada. Cuando su sofá esté terminado y asignado a una salida, le avisaremos la fecha y hora de entrega para que la confirme o la reprograme.' },
    trabajo: { texto: 'El equipo del taller está cambiando la espuma de los asientos. Ya terminamos de desmontar, revisar la estructura y cortar la tela.', hechos: 3, total: 6, pie: '3 de 6 trabajos · terminamos el vie 16 oct (estimado)', actualizado: 'hoy 10:05' },
    fotos: 'Fotos del recojo (jue 8 oct) · 9 piezas contadas: estructura, 3 cojines de asiento, 3 de respaldo y 2 decorativos. Las mismas 9 vuelven en la entrega.',
    datos: [{ l: 'Trabajo', v: 'Retapizado + espuma' }, { l: 'Tela', v: 'Lino Navy 204 · 14 yd' }, { l: 'Traslado', v: 'Recojo y entrega' }, { l: 'Dirección', v: '48 Park St, Montclair' }, { l: 'Orden de servicio', v: 'OS-0076 · PDF', a: '/cliente/cotizacion' }, { l: 'Revisión inicial', v: 'Sin sorpresas · 8 oct', ok: true }],
    cuenta: { total: '$1,140', pagos: [{ l: 'Adelanto pagado · Zelle', v: '$456' }], saldo: '$684' },
    entrega: {
      asignada: false,
      texto: 'La fecha se asigna cuando su sofá esté terminado y el taller lo incluya en una salida de reparto.',
      pasos: ['Terminamos su pedido (est. vie 16 oct).', 'El taller arma la salida y le asigna día y franja horaria.', 'Le avisamos aquí y por correo: usted confirma o reprograma hasta 24 h antes.'],
      accion: { texto: 'Ver cómo funciona', a: '/cliente/entrega', tipo: 'secondary' },
    },
    cancelacion: {
      explicacion: 'Como ya recogimos su sofá y empezamos el trabajo, se cobra solo lo hecho (horas, materiales y traslado) y se le devuelve el resto. El taller confirma el monto final con usted.',
      lineas: [{ l: 'Horas trabajadas · 5.8 h', v: '$87' }, { l: 'Tela comprada para su pedido', v: '$238' }, { l: 'Espuma usada', v: '$144' }, { l: 'Recojo realizado', v: '$45' }],
      cargo: '≈ $514', adelanto: '− $456', resultado: { l: 'Le faltaría pagar', v: '≈ $58' },
    },
  },
  {
    id: 'PED-0086', titulo: 'Puff a juego (nuevo)', codigo: 'PED-0086 · fabricación nueva · Lino Navy 204', icono: 'package', thumb: 'b',
    estado: 'Esperando material', pasos: ['Confirmado', 'Material', 'En el taller', 'Listo', 'Entrega'], pasoActual: 1, necesitaAccion: false,
    aviso: { quien: 'us', icono: 'clock', texto: 'La tela llega el jue 15 oct. Ese día empezamos a fabricarlo; no hace falta recoger nada en su casa.' },
    monto: { valor: '$288', sub: 'saldo pendiente · adelanto $192 pagado' },
    descripcion: 'PED-0086 · fabricación nueva · Lino Navy 204', entregaEstimada: 'semana del 26 oct',
    etapas: [{ l: 'Pedido confirmado', d: '9 oct' }, { l: 'Material', d: 'tela llega jue 15 oct' }, { l: 'En el taller', d: 'desde jue 15 oct' }, { l: 'Listo', d: 'vie 23 oct (est.)' }, { l: 'Entrega', d: 'fecha por asignar' }],
    etapaActual: 1,
    siguiente: { quien: 'us', icono: 'clock', texto: 'Estamos esperando la tela. Cuando llegue, empezamos a fabricar su puff y le avisamos el avance aquí.' },
    trabajo: { texto: 'Su puff aún no entra al taller: compramos la tela Lino Navy 204 y llega el jue 15 oct.', hechos: 0, total: 5, pie: '0 de 5 trabajos · empezamos el jue 15 oct', actualizado: 'ayer 16:20' },
    fotos: 'Es una fabricación nueva: no recogemos nada en su casa. Le mostraremos fotos del avance cuando empecemos.',
    datos: [{ l: 'Trabajo', v: 'Fabricación nueva' }, { l: 'Tela', v: 'Lino Navy 204 · 2 yd' }, { l: 'Traslado', v: 'Solo entrega' }, { l: 'Dirección', v: '48 Park St, Montclair' }, { l: 'Orden de servicio', v: 'OS-0086 · PDF', a: '/cliente/cotizacion' }, { l: 'Medidas', v: '45 × 45 × 42 cm' }],
    cuenta: { total: '$480', pagos: [{ l: 'Adelanto pagado · Zelle', v: '$192' }], saldo: '$288' },
    entrega: {
      asignada: false,
      texto: 'La fecha se asigna cuando su puff esté terminado y el taller lo incluya en una salida de reparto.',
      pasos: ['Fabricamos su puff (est. vie 23 oct).', 'El taller arma la salida y le asigna día y franja horaria.', 'Le avisamos aquí y por correo: usted confirma o reprograma hasta 24 h antes.'],
      accion: { texto: 'Ver cómo funciona', a: '/cliente/entrega', tipo: 'secondary' },
    },
  },
];

// ---------------------------------------------------------------- W6b Anteriores

export const MUEBLES = ['Sofá', 'Sillas', 'Cabecera', 'Otros'] as const;
export const SERVICIOS_ANTERIORES = ['Retapizado', 'Fabricación nueva'] as const;

export interface PedidoAnterior {
  codigo: string;
  titulo: string;
  mueble: (typeof MUEBLES)[number];
  servicio: (typeof SERVICIOS_ANTERIORES)[number];
  anio: number;
  iso: string;
  entregado: string;
  total: number;
  tela: string;
  yardas: string;
  piezas: string;
  traslado: string;
  duracion: string;
  antes: string;
  medios: string;
  trabajo: string;
  estado: 'Entregado' | 'Cerrado';
  /** Plazo de reclamo (CU-D08: 7 días desde la entrega). */
  reclamo: { tono: 'open' | 'off' | 'warn'; icono: IconName; corto: string; largo: string; caja: 'ok' | 'no'; puede: boolean };
  eventos: { d: string; t: string }[];
  pagos: { c: string; m: string; a: string }[];
  documentos: string[];
}

const CERRADO = { tono: 'off', icono: 'lock', corto: 'Plazo de reclamo cerrado', largo: 'Sin reclamos.', caja: 'no', puede: false } as const;

export const PEDIDOS_ANTERIORES: PedidoAnterior[] = [
  {
    codigo: 'PED-0158', titulo: 'Puff tapizado (nuevo)', mueble: 'Otros', servicio: 'Fabricación nueva', anio: 2027, iso: '2027-04-15', entregado: 'jue 15 abr 2027', total: 480,
    tela: 'Cuero sintético Camel', yardas: '2 yd · tela difícil', piezas: '1 pieza', traslado: 'Entrega a domicilio', duracion: '3 semanas', antes: 'diseño aprobado', medios: 'tarjeta',
    trabajo: 'Fabricamos un puff nuevo de 60 × 60 cm con estructura de madera, espuma de alta densidad y tapiz en cuero sintético Camel.',
    estado: 'Entregado',
    reclamo: { tono: 'open', icono: 'clock', corto: 'Puede reportar un problema hasta el jue 22 abr · quedan 2 días', largo: 'Sin reclamos. Si nota algún problema, puede reportarlo hasta el jue 22 abr.', caja: 'ok', puede: true },
    eventos: [{ d: '22 mar', t: 'Solicitud con medidas y 2 fotos de referencia' }, { d: '24 mar', t: 'Cotización aceptada · sin adelanto (cliente frecuente)' }, { d: '25 mar', t: 'Pagó $480 con tarjeta en línea' }, { d: '29 mar–12 abr', t: 'Fabricación en el taller' }, { d: '15 abr', t: 'Entregado · 1 pieza · firmó conforme' }],
    pagos: [{ c: 'Pago total', m: 'Tarjeta en línea · 25 mar', a: '$480' }],
    documentos: ['Orden de servicio OS-0158', 'Recibo REC-0158-1', 'Comprobante final', 'Constancia de entrega firmada'],
  },
  {
    codigo: 'PED-0131', titulo: 'Sillas de comedor × 4', mueble: 'Sillas', servicio: 'Retapizado', anio: 2027, iso: '2027-02-19', entregado: 'vie 19 feb 2027', total: 520,
    tela: 'Lino Arena 110', yardas: '4 yd', piezas: '4 piezas', traslado: 'Recojo y entrega', duracion: '2 semanas', antes: 'recojo', medios: 'Zelle',
    trabajo: 'Retapizado del asiento de las 4 sillas de comedor ($130 por silla), con cambio de espuma.',
    estado: 'Cerrado', reclamo: CERRADO,
    eventos: [{ d: '1 feb', t: 'Solicitud con 3 fotos' }, { d: '2 feb', t: 'Cotización aceptada' }, { d: '4 feb', t: 'Recojo · 4 piezas' }, { d: '5–17 feb', t: 'Producción' }, { d: '19 feb', t: 'Entregado · pagó el total por Zelle' }],
    pagos: [{ c: 'Pago total', m: 'Zelle · 19 feb · confirmado por el taller', a: '$520' }],
    documentos: ['Orden de servicio OS-0131', 'Recibo REC-0131-1', 'Comprobante final', 'Constancia de entrega firmada'],
  },
  {
    codigo: 'PED-0102', titulo: 'Cabecera', mueble: 'Cabecera', servicio: 'Retapizado', anio: 2026, iso: '2026-12-09', entregado: 'mié 9 dic 2026', total: 360,
    tela: 'Terciopelo gris', yardas: '3 yd · tela difícil', piezas: '1 pieza', traslado: 'Ella la trajo y la recogió', duracion: '10 días', antes: 'recepción en el taller', medios: 'cheque',
    trabajo: 'Retapizado de la cabecera de cama queen en terciopelo gris, con capitoné de 12 botones.',
    estado: 'Cerrado', reclamo: CERRADO,
    eventos: [{ d: '25 nov', t: 'Solicitud con 2 fotos' }, { d: '26 nov', t: 'Cotización aceptada · sin adelanto' }, { d: '29 nov', t: 'Dejó la cabecera en el taller' }, { d: '30 nov–8 dic', t: 'Producción' }, { d: '9 dic', t: 'Retiro en el taller · pagó con cheque' }],
    pagos: [{ c: 'Pago total', m: 'Cheque · 9 dic · depositado', a: '$360' }],
    documentos: ['Orden de servicio OS-0102', 'Recibo REC-0102-1', 'Comprobante final'],
  },
  {
    codigo: 'PED-0094', titulo: 'Silla de escritorio', mueble: 'Otros', servicio: 'Retapizado', anio: 2026, iso: '2026-11-03', entregado: 'mar 3 nov 2026', total: 210,
    tela: 'Microfibra Grafito', yardas: '1.5 yd', piezas: '1 pieza', traslado: 'Recojo y entrega', duracion: '9 días', antes: 'recojo', medios: 'tarjeta (lector)',
    trabajo: 'Retapizado del asiento y respaldo de la silla de escritorio, con la tela elegida del catálogo en línea.',
    estado: 'Cerrado', reclamo: CERRADO,
    eventos: [{ d: '13 oct', t: 'Solicitud con 3 fotos · tela del catálogo' }, { d: '19 oct', t: 'Cotización aceptada' }, { d: '26 oct', t: 'Recojo' }, { d: '27 oct–2 nov', t: 'Producción' }, { d: '3 nov', t: 'Entregado · pagó con tarjeta al conductor' }],
    pagos: [{ c: 'Pago total', m: 'Tarjeta con lector · 3 nov', a: '$210' }],
    documentos: ['Orden de servicio OS-0094', 'Recibo REC-0094-1', 'Comprobante final', 'Constancia de entrega firmada'],
  },
  {
    codigo: 'PED-0076', titulo: 'Sofá de 3 cuerpos', mueble: 'Sofá', servicio: 'Retapizado', anio: 2026, iso: '2026-10-22', entregado: 'jue 22 oct 2026', total: 1140,
    tela: 'Lino Navy 204', yardas: '14 yd', piezas: '9 piezas', traslado: 'Recojo y entrega', duracion: '2 semanas', antes: 'recojo', medios: 'Zelle + tarjeta',
    trabajo: 'Retapizado completo del sofá de 3 cuerpos con Lino Navy 204 y cambio de espuma de los asientos.',
    estado: 'Cerrado',
    reclamo: { tono: 'warn', icono: 'check', corto: 'Reclamo REC-0012 resuelto', largo: 'REC-0012 · costura abierta en el cojín central (27 oct). Resuelto: el taller repuso la costura sin costo y lo devolvió el 2 nov.', caja: 'ok', puede: false },
    eventos: [{ d: '2 oct', t: 'Solicitud con 4 fotos' }, { d: '6 oct', t: 'Cita en el local · cotización $1,140 aceptada' }, { d: '7 oct', t: 'Adelanto $456 por Zelle confirmado' }, { d: '8 oct', t: 'Recojo · 9 piezas · revisión sin sorpresas' }, { d: '12–16 oct', t: 'Producción' }, { d: '22 oct', t: 'Entregado · saldo con tarjeta' }, { d: '27 oct–2 nov', t: 'Reclamo de costura resuelto' }],
    pagos: [{ c: 'Adelanto 40 %', m: 'Zelle · 7 oct', a: '$456' }, { c: 'Saldo', m: 'Tarjeta con lector · 22 oct', a: '$684' }],
    documentos: ['Orden de servicio OS-0076', 'Recibo REC-0076-1 (adelanto)', 'Recibo REC-0076-2 (saldo)', 'Comprobante final', 'Constancia de entrega firmada'],
  },
];

export const dolares = (n: number) => '$' + n.toLocaleString('en-US');
