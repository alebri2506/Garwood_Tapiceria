// Datos de ejemplo del A1 Panel de hoy y de A21 Estadísticas (los del prototipo GARWEB, al martes 13 de octubre de 2026).
// Se reemplazan por la API cuando existan las bandejas de Comercial, Almacén y Despacho.
import type { IconName } from '../../shared/ui/Icon';

type Tono = 'neutral' | 'info' | 'progress' | 'warning' | 'success' | 'danger';

/** El momento del ejemplo: el panel muestra el día de hoy tal como lo registran el conductor, el taller y los pagos. */
export const AHORA = { fecha: 'martes 13 de octubre', hora: '4:20 p. m.', saludo: 'Buenas tardes' };

// ---------------------------------------------------------------- A1 · Atención ahora
export interface Asunto {
  tono: 'danger' | 'warning';
  icono: IconName;
  titulo: string;
  detalle: string;
  acciones: { texto: string; a: string; primaria?: boolean }[];
}

export const ATENCION: Asunto[] = [
  { tono: 'danger', icono: 'truck', titulo: '2 recojos de hoy siguen sin hacerse', detalle: 'Franja 3:00–5:00 p. m. · quedan 40 min · Diego (conductor) va por la 3.ª entrega', acciones: [{ texto: 'Ver la ruta', a: '/admin/salidas', primaria: true }, { texto: 'Pasar a mañana', a: '/admin/salidas' }] },
  { tono: 'danger', icono: 'payment', titulo: 'El banco desconoció un pago con tarjeta · PED-0069 · $420', detalle: 'Rachel Adams · adelanto pagado el 28 sep · el saldo volvió a «pendiente» · hay plazo para enviar pruebas hasta el vie 23', acciones: [{ texto: 'Revisar el caso', a: '/admin/pagos', primaria: true }] },
  { tono: 'warning', icono: 'package', titulo: 'Se acabó la tela Velvet Navy y 2 pedidos la necesitan', detalle: 'PED-0086 (6 yd) y PED-0088 (3 yd) · el proveedor la trae en 2–3 días si se pide hoy', acciones: [{ texto: 'Pedir 9 yd', a: '/admin/inventario', primaria: true }] },
  { tono: 'warning', icono: 'clock', titulo: 'PED-0080 · Banqueta va 4 días atrasado', detalle: 'Prometido para el vie 9 oct · Carlos lo tiene al 70 % · avisar al cliente la nueva fecha', acciones: [{ texto: 'Abrir pedido', a: '/admin/pedidos' }] },
];

// ---------------------------------------------------------------- A1 · El día en números
export interface Contador { etiqueta: string; valor: string; de?: string; avance?: number; pie: string; a: string; mal?: boolean }

export const DIA: Contador[] = [
  { etiqueta: 'Citas', valor: '3', de: 'de 5', avance: 3 / 5, pie: 'atendidas · próxima 4:30 p. m.', a: '/admin/agenda' },
  { etiqueta: 'Recojos', valor: '0', de: 'de 2', avance: 0, pie: 'hechos · franja termina 5:00 p. m.', a: '/admin/salidas', mal: true },
  { etiqueta: 'Entregas', valor: '2', de: 'de 3', avance: 2 / 3, pie: 'hechas · 1 en camino', a: '/admin/salidas' },
  { etiqueta: 'Cobrado hoy', valor: '$1,340', pie: '5 pagos · $1,060 confirmados solos por la pasarela', a: '/admin/pagos' },
  { etiqueta: 'Solicitudes', valor: '4', de: 'nuevas hoy', pie: '6 sin responder · la más antigua de ayer 10:15 a. m.', a: '/admin/solicitudes' },
];

// ---------------------------------------------------------------- A1 · Agenda, salidas, taller, material y pagos
export interface Linea { hora: string; titulo: string; detalle?: string; estado?: string; chip?: { texto: string; tono: Tono }; hecha?: boolean; ahora?: boolean }

export const AGENDA_HOY: Linea[] = [
  { hora: '09:30', titulo: 'Mark Ellison', detalle: 'Sillón · en el taller · eligió tela del libro', estado: 'Atendida', hecha: true },
  { hora: '11:00', titulo: 'Priya Shah', detalle: '6 sillas de comedor · en el taller', estado: 'Atendida', hecha: true },
  { hora: '15:00', titulo: 'Retiro en taller · PED-0078', detalle: 'Daniel Cruz recogió su sofá', chip: { texto: 'Hecho', tono: 'success' }, hecha: true },
  { hora: '16:20', titulo: 'Ahora', ahora: true },
  { hora: '16:30', titulo: 'Tom Becker', detalle: 'Cabecera · en el taller · 2.ª reprogramación', chip: { texto: 'En 10 min', tono: 'info' } },
  { hora: '17:30', titulo: 'Visita a domicilio · Linda Park', detalle: 'Medir sofá en L · llevar 3 libros de telas · 48 Elm St, Montclair', estado: 'Programada' },
];

export interface Fila { punto: 'ok' | 'bad' | 'warn' | 'info'; titulo: string; detalle: string; chip: { texto: string; tono: Tono }; a?: string }

export const SALIDA_HOY = { camion: 'Camión 1 · Diego Ramos · salió 9:05 a. m. · 5 paradas' };
export const PARADAS_HOY: Fila[] = [
  { punto: 'ok', titulo: 'Entrega · PED-0083 · Ana Torres', detalle: 'Hecha 10:40 a. m. · firmó y pagó saldo con tarjeta', chip: { texto: 'Hecha', tono: 'success' } },
  { punto: 'ok', titulo: 'Entrega · PED-0084 · Hotel Willow', detalle: 'Hecha 12:15 p. m. · 8 sillas', chip: { texto: 'Hecha', tono: 'success' } },
  { punto: 'info', titulo: 'Entrega · PED-0087 · Kevin Moss', detalle: 'En camino · llega aprox. 4:35 p. m.', chip: { texto: 'En camino', tono: 'info' } },
  { punto: 'bad', titulo: 'Recojo · SOL-0142 · Sarah Kim', detalle: 'Sofá 3 cuerpos · franja 3:00–5:00 p. m.', chip: { texto: 'Sin hacer', tono: 'danger' } },
  { punto: 'bad', titulo: 'Recojo · SOL-0145 · Paul Grant', detalle: '2 sillones · franja 3:00–5:00 p. m.', chip: { texto: 'Sin hacer', tono: 'danger' } },
];

export const TALLER_HOY = { enTrabajo: 7, terminados: 2, enRiesgo: 3 };
export const TALLER_ALERTAS: Fila[] = [
  { punto: 'bad', titulo: 'PED-0080 · Banqueta', detalle: 'Prometido vie 9 oct · avance 70 %', chip: { texto: 'Atrasado 4 días', tono: 'danger' }, a: '/admin/pedidos' },
  { punto: 'warn', titulo: 'PED-0086 · Sofá · Velvet Navy', detalle: 'No puede empezar: falta la tela', chip: { texto: 'Espera tela', tono: 'warning' }, a: '/admin/pedidos' },
  { punto: 'warn', titulo: 'PED-0079 · Mesa de centro tapizada', detalle: 'Terminado hace 8 días · sin salida asignada', chip: { texto: 'Asignar salida', tono: 'warning' }, a: '/admin/salidas' },
];

export const MATERIAL_ESCASO: { nombre: string; hay: string; reservado: string; llega: string; pedir: boolean; tono: 'bad' | 'warn' }[] = [
  { nombre: 'Velvet Navy', hay: '0 yd', reservado: '9 yd · 2 pedidos', llega: '2–3 días', pedir: true, tono: 'bad' },
  { nombre: 'Plumas (relleno)', hay: '1 kg', reservado: '3 kg · PED-0082', llega: 'mié 14 · pedido', pedir: false, tono: 'warn' },
  { nombre: 'Espuma HD 2"', hay: '7 u', reservado: '5 u · 3 pedidos', llega: '3–5 días', pedir: true, tono: 'warn' },
];

export const PAGOS_POR_CONFIRMAR: Fila[] = [
  { punto: 'warn', titulo: 'PED-0085 · Grace Lin · $280', detalle: 'Adelanto 40 % · Zelle · captura subida hoy 08:40', chip: { texto: 'Por confirmar', tono: 'warning' }, a: '/admin/pagos' },
  { punto: 'warn', titulo: 'PED-0081 · J. Ortega · $520', detalle: 'Saldo · cheque cobrado por el conductor', chip: { texto: 'Por confirmar', tono: 'warning' }, a: '/admin/pagos' },
];

// ---------------------------------------------------------------- A21 · Estadísticas del mes
export const PERIODO = { titulo: '¿Cómo va octubre?', detalle: 'Del 1 al 13 de octubre, comparado con los mismos días de septiembre y de octubre del año pasado.', antes: '1–13 sep', anioPasado: '1–13 oct 2025' };

export interface Metrica { etiqueta: string; valor: string; acento?: boolean; vsMes: { pct: string; antes: string }; vsAnio: { pct: string; antes: string }; pie: [string, string?, string?, string?] }

export const METRICAS: Metrica[] = [
  { etiqueta: 'Cobrado', valor: '$63,900', vsMes: { pct: '+9 %', antes: '$58,600' }, vsAnio: { pct: '+23 %', antes: '$52,100' }, pie: ['Adelantos ', '$21,500', ' · saldos ', '$42,400'] },
  { etiqueta: 'Ventas cerradas', valor: '99', vsMes: { pct: '+9 %', antes: '91' }, vsAnio: { pct: '+18 %', antes: '84' }, pie: ['Cotizaciones aceptadas · ', '82 %', ' de las enviadas'] },
  { etiqueta: 'Venta promedio por pedido', valor: '$640', vsMes: { pct: '+4 %', antes: '$615' }, vsAnio: { pct: '+8 %', antes: '$590' }, pie: ['Lo que paga en promedio un cliente por pedido'] },
  { etiqueta: 'Margen bruto', valor: '$23,750', acento: true, vsMes: { pct: '+8 %', antes: '$21,900' }, vsAnio: { pct: '+22 %', antes: '$19,400' }, pie: ['Cobrado de 95 pedidos cerrados − materiales − transporte'] },
];

export const MINI: { a: string; icono: IconName; titulo: string; texto: string; valor: string; tono?: 'wr' }[] = [
  { a: '/admin/solicitudes?etapa=esperando-al-cliente', icono: 'quote', titulo: 'Cotizaciones sin respuesta', texto: '11 publicadas · vencen en 5 días', valor: '$7,040' },
  { a: '/admin/pedidos', icono: 'package', titulo: 'Material usado vs. cotizado', texto: 'Se gastó más de lo previsto', valor: '+2.1 %', tono: 'wr' },
];

export const FORMAS_PAGO: { nombre: string; pct: number; monto: string; vs: string; color: string }[] = [
  { nombre: 'Tarjeta (pasarela)', pct: 38, monto: '$24,282', vs: '+3 pts', color: '#2563EB' },
  { nombre: 'Zelle', pct: 27, monto: '$17,253', vs: '−2 pts', color: '#7C3AED' },
  { nombre: 'Cheque', pct: 13, monto: '$8,307', vs: '−1 pts', color: '#0EA5E9' },
  { nombre: 'Cuenta bancaria · ACH (pasarela)', pct: 12, monto: '$7,668', vs: '+2 pts', color: '#14B8A6' },
  { nombre: 'Efectivo', pct: 10, monto: '$6,390', vs: '−2 pts', color: '#F59E0B' },
];

export interface Puesto { nombre: string; valor: string; pct?: number; ancho: number }
const ranking = (filas: [string, number][], total: number): Puesto[] =>
  filas.map(([nombre, n]) => ({ nombre, valor: String(n), pct: Math.round((n / total) * 100), ancho: Math.round((n / filas[0]![1]) * 100) }));

export const POR_MUEBLE = ranking([['Sillas de comedor', 31], ['Sofás', 22], ['Sillones', 18], ['Cabeceras', 11], ['Banquetas de restaurante', 9], ['Otros (otomán, bancos, cojines)', 8]], 99);
export const POR_SERVICIO = ranking([['Retapizado completo', 46], ['Retapizado + espuma', 24], ['Solo cambio de espuma', 12], ['Fabricación a medida', 10], ['Reparación de estructura', 8]], 100);
export const TELAS_USADAS: Puesto[] = ([['Velvet Navy', 64], ['Lino natural', 48], ['Cuero sintético negro', 41], ['Chenille gris', 33]] as [string, number][])
  .map(([nombre, yd]) => ({ nombre, valor: `${yd} yd`, ancho: Math.round((yd / 64) * 100) }));

/** Un punto del gráfico: valor, etiqueta del eje, título y nota del tooltip. */
export interface Punto { v: number; x: string; t: string; n: string }
export interface Serie { puntos: Punto[]; lo: number; hi: number; proyeccion: boolean; nota: string }

const DIAS = ['jue', 'vie', 'sáb', 'dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom', 'lun', 'mar'];
const VALORES_DIA = [2250, 2750, 1250, 0, 2500, 2000, 3000, 2250, 3250, 1500, 0, 1750, 1250];

export const SERIE_DIA: Serie = {
  puntos: VALORES_DIA.map((v, i) => ({
    v,
    x: i === 12 ? 'Hoy' : `${DIAS[i]} ${i + 1}`,
    t: `${DIAS[i]} ${i + 1} oct${i === 12 ? ' · hoy (en curso)' : ''}`,
    n: v ? `${v / 250} pedidos cerrados` : 'Domingo · taller cerrado',
  })),
  lo: 0, hi: 3500, proyeccion: false,
  nota: 'Domingos en $0: el taller no atiende',
};

const MESES: [string, number][] = [['nov', 46800], ['dic', 52400], ['ene', 38900], ['feb', 41200], ['mar', 47600], ['abr', 50250], ['may', 53800], ['jun', 49100], ['jul', 44300], ['ago', 47900], ['sep', 51750], ['oct', 58300]];

export const SERIE_ANIO: Serie = {
  puntos: MESES.map(([m, v], i) => ({
    v,
    x: m + (i === 0 || m === 'ene' ? (i < 2 ? ' 25' : ' 26') : ''),
    t: `${m} ${i < 2 ? '2025' : '2026'}${i === 11 ? ' · proyección' : ''}`,
    n: i === 11 ? 'Al día 13: $23,750 (95 pedidos)' : `${Math.round(v / 250)} pedidos cerrados`,
  })),
  lo: 30000, hi: 62000, proyeccion: true,
  nota: 'Octubre en curso: el tramo punteado es la proyección ($58,300 = 233 pedidos × $250, a 27 días hábiles)',
};
