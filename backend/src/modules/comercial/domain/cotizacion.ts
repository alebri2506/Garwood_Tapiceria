// A4 Armar cotización (CU-C07, C08, C11): reglas puras, sin base de datos.

export const TAMANOS_CARGA = ['chica', 'mediana', 'grande'] as const;
export type TamanoCarga = (typeof TAMANOS_CARGA)[number];
export const NOMBRE_TAMANO: Record<TamanoCarga, string> = { chica: 'chica', mediana: 'mediana', grande: 'grande' };

export const codigoCotizacion = (id: number) => `COT-${String(id).padStart(4, '0')}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * CU-C07 Transporte ida y vuelta, un solo cobro (como una app de taxi):
 * millas por calle desde el taller × 2 viajes × tarifa por milla + carga de todos los muebles juntos.
 * Con varios muebles las cargas se suman (decisiones K): cada mueble ocupa su lugar en el camión.
 */
export function cargaDe(tamanos: TamanoCarga[], tarifas: Record<TamanoCarga, number>) {
  return r2(tamanos.reduce((t, x) => t + (tarifas[x] ?? 0), 0));
}
export function transporteDe(millas: number, porMilla: number, carga: number) {
  return { distancia: Math.round(millas * 2 * porMilla), carga, total: Math.round(millas * 2 * porMilla + carga) };
}

/**
 * CU-C11 Adelanto sugerido: sin pedidos cerrados → el porcentaje «sin historial»; con al menos uno → «con historial».
 * Sobre el total con transporte. El Administrador lo puede cambiar solo para este pedido, entre 0 y el máximo de Parámetros.
 */
export function adelantoSugeridoPct(pedidosCerrados: number, pcts: { sinHistorial: number; conHistorial: number }) {
  return pedidosCerrados > 0 ? pcts.conHistorial : pcts.sinHistorial;
}
export const montoDePct = (total: number, pct: number) => Math.round((total * pct) / 100);
export function revisarAdelanto(monto: number, total: number, maxPct: number): string | null {
  const max = montoDePct(total, maxPct);
  if (monto < 0) return 'El adelanto no puede ser negativo.';
  if (monto > max) return `El adelanto no puede pasar del ${maxPct} % del total (${dinero(max)}).`;
  return null;
}
export const dinero = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export interface ActividadACotizar { horasPersona: number; horasMaquina: number; tarifaMaquina: number; materiales: { precio: number; cantidad: number }[] }
export interface CostosCotizacion { tarifaHora: number; costosFijos: number; margenPct: number }

/**
 * CU-C08 Precio sugerido de un mueble = materiales + tela + mano de obra + maquinaria + costos fijos + margen (sin transporte).
 * Los costos fijos son POR PEDIDO: se cargan una sola vez, al primer mueble de la cotización (`conFijos`).
 */
export function costearMueble(actividades: ActividadACotizar[], telas: { yardas: number; precio: number }[], p: CostosCotizacion, conFijos: boolean) {
  let horas = 0, materiales = 0, maquinaria = 0;
  for (const a of actividades) {
    horas += a.horasPersona;
    maquinaria += a.horasMaquina * a.tarifaMaquina;
    for (const m of a.materiales) materiales += m.cantidad * m.precio;
  }
  for (const t of telas) materiales += t.yardas * t.precio;
  const manoObra = horas * p.tarifaHora;
  const fijos = conFijos ? p.costosFijos : 0;
  const costo = materiales + manoObra + maquinaria + fijos;
  return {
    horas: r2(horas), materiales: r2(materiales), manoObra: r2(manoObra), maquinaria: r2(maquinaria), fijos: r2(fijos),
    margen: r2(costo * (p.margenPct / 100)), sugerido: Math.round(costo * (1 + p.margenPct / 100)),
  };
}
