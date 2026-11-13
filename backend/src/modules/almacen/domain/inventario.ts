// Reglas del inventario (CU-A01, A02, A03, A09, A10 · diseño A15, A8, A8c, A9 del 12/11). Sin Express ni Prisma.
//  - En el estante (físico) = lo que hay; Reservado = comprometido para pedidos; Disponible = físico − reservado.
//  - Solo las telas se compran bajo pedido: no tienen stock (encargo_tela).

/** Categorías de los materiales de stock y cómo se agrupan en el conteo (A9). */
export const CATEGORIAS_STOCK = { espuma: 'Espumas', relleno: 'Rellenos', insumo: 'Insumos pequeños', pegamento: 'Pegamentos' } as const;
export type CategoriaStock = keyof typeof CATEGORIAS_STOCK;
export const esCategoriaStock = (c: string): c is CategoriaStock => c in CATEGORIAS_STOCK;

/** Unidades con que se registra un material (A15 · Nuevo material). No se cambia cuando ya tiene movimientos. */
export const UNIDADES: { valor: string; etiqueta: string }[] = [
  { valor: 'planchas', etiqueta: 'Plancha' }, { valor: 'yd', etiqueta: 'Yarda (yd)' }, { valor: 'm', etiqueta: 'Metro (m)' },
  { valor: 'kg', etiqueta: 'Kilogramo (kg)' }, { valor: 'lb', etiqueta: 'Libra (lb)' }, { valor: 'u', etiqueta: 'Unidad (u)' },
  { valor: 'cajas', etiqueta: 'Caja' }, { valor: 'conos', etiqueta: 'Cono' }, { valor: 'gal', etiqueta: 'Galón (gal)' }, { valor: 'rollos', etiqueta: 'Rollo' },
];

/** A8c «Corregir stock»: motivos según si sale o entra. Los de pedido exigen elegir el pedido. */
export const MOTIVOS_SALIDA = ['Retiro para un pedido', 'Se dañó', 'Llegó menos de lo pedido', 'Otro'] as const;
export const MOTIVOS_ENTRADA = ['Sobró de un pedido', 'Había más de lo registrado', 'Otro'] as const;
export const MOTIVOS_CON_PEDIDO = ['Retiro para un pedido', 'Sobró de un pedido'];
/** A9: motivo de cada diferencia del conteo. */
export const MOTIVOS_CONTEO = ['Se dañó', 'Uso sin anotar', 'Error al anotar', 'Otro'] as const;

/** Pedidos a los que todavía se les puede retirar o devolver material (no terminados ni cerrados). */
export const ESTADOS_PEDIDO_EN_PROCESO = ['Generado', 'Esperando mueble', 'Esperando material', 'Listo para producir', 'En producción', 'En pausa'];

/** Tipos de tela y colores para buscar en el muestrario (A15b). */
export const TIPOS_TELA = ['Terciopelo', 'Chenille', 'Estampado', 'Lisa (plain)', 'Lino', 'Pana', 'Bouclé', 'Cuero sintético'];
export const COLORES_TELA = ['Azul', 'Gris', 'Beige', 'Verde', 'Café', 'Rojo', 'Negro', 'Blanco', 'Amarillo'];

/** Redondea a 2 decimales (cantidades y montos). */
export const r2 = (n: number) => Math.round(n * 100) / 100;

export type EstadoStock = 'ok' | 'bajo' | 'falta' | 'pedido';

export interface SituacionMaterial {
  fisico: number;
  reservado: number;
  minimo: number;
  /** Lo que ya viene en compras «Por llegar». */
  porLlegar: number;
  /** Consumo promedio por semana. */
  consumoSemanal: number;
}

export const disponible = (m: Pick<SituacionMaterial, 'fisico' | 'reservado'>) => r2(m.fisico - m.reservado);

/**
 * Estado del material en A15:
 *  - Pedido: ya hay una compra en camino (no se vuelve a pedir);
 *  - Falta para un pedido: lo reservado supera lo que hay (disponible negativo);
 *  - Bajo el mínimo: lo disponible quedó por debajo del mínimo;
 *  - OK.
 */
export function estadoStock(m: SituacionMaterial): EstadoStock {
  if (m.porLlegar > 0) return 'pedido';
  const d = disponible(m);
  if (d < 0) return 'falta';
  return d < m.minimo ? 'bajo' : 'ok';
}

/** «Alcanza para»: semanas de consumo que cubre lo disponible. */
export function alcanzaPara(m: SituacionMaterial, unidad: string): string {
  const d = disponible(m);
  if (d < 0) return `Faltan ${r2(-d)} ${unidad}`;
  if (m.consumoSemanal <= 0) return 'Sin consumo reciente';
  const semanas = d / m.consumoSemanal;
  if (semanas >= 8) return 'Más de 2 meses';
  if (semanas < 1.5) return '~1 semana';
  return `~${Math.round(semanas)} semanas`;
}

/** Consumo semanal = consumo neto (retiros − devoluciones de pedidos) en las últimas `semanas` ÷ semanas. */
export function consumoSemanal(consumoNeto: number, semanas: number) {
  return semanas > 0 ? r2(Math.max(0, consumoNeto) / semanas) : 0;
}

/**
 * CU-A03 · cantidad sugerida en Reponer:
 *   consumo × semanas − disponible − lo que ya viene, nunca menos de lo que falta para el mínimo.
 * Se redondea hacia arriba (no se compra media plancha).
 */
export function cantidadSugerida(m: SituacionMaterial, semanas: number) {
  const d = disponible(m);
  const porConsumo = m.consumoSemanal * semanas - d - m.porLlegar;
  const porMinimo = m.minimo - d - m.porLlegar;
  return Math.max(0, Math.ceil(r2(Math.max(porConsumo, porMinimo))));
}

/** Entra a la lista de reposición si está bajo el mínimo o falta para un pedido (y no viene nada en camino). */
export const necesitaReponer = (m: SituacionMaterial) => ['bajo', 'falta'].includes(estadoStock(m));

/** Por qué se sugiere reponer (etiqueta de cada línea en A8). */
export function razonReposicion(m: SituacionMaterial, unidad: string, pedidos: string[]): { texto: string; urgente: boolean } {
  const d = disponible(m);
  if (d < 0) return { texto: `Faltan ${r2(-d)} ${unidad}${pedidos.length ? ` para ${pedidos.join(', ')}` : ''}`, urgente: true };
  if (m.consumoSemanal > 0 && d / m.consumoSemanal < 1.5) return { texto: 'Se acaba en ~1 semana', urgente: false };
  return { texto: `Bajo el mínimo (${r2(m.minimo)} ${unidad})`, urgente: false };
}

/** El cálculo explicado, como en el diseño: «Usa 6/sem × 2 semanas = 12 − disponible 6 = 6». */
export function explicarSugerido(m: SituacionMaterial, semanas: number) {
  const d = disponible(m);
  const sugerido = cantidadSugerida(m, semanas);
  const viene = m.porLlegar > 0 ? ` − ya viene ${r2(m.porLlegar)}` : '';
  if (m.consumoSemanal <= 0) return `Mínimo ${r2(m.minimo)} − disponible ${d}${viene} = ${sugerido}`;
  return `Usa ${r2(m.consumoSemanal)}/sem × ${semanas} semanas = ${r2(m.consumoSemanal * semanas)} − disponible ${d}${viene} = ${sugerido}`;
}

/** Aplica un movimiento al estante: nunca puede quedar en negativo (A8c «No puede salir más de lo que hay»). */
export function aplicarMovimiento(fisico: number, cantidad: number): { saldo: number } | { error: string } {
  const saldo = r2(fisico + cantidad);
  if (saldo < 0) return { error: 'No puede salir más de lo que hay en el estante.' };
  return { saldo };
}

/** A9: diferencias entre lo contado y lo que dice el sistema (solo las que no coinciden). */
export function diferenciasConteo<T extends { sistema: number; contado: number }>(lineas: T[]) {
  return lineas.filter((l) => r2(l.contado) !== r2(l.sistema)).map((l) => ({ ...l, diferencia: r2(l.contado - l.sistema) }));
}

/** Siguiente código correlativo: siguienteCodigo('OC', 'OC-0007') → 'OC-0008'. */
export function siguienteCodigo(prefijo: string, ultimo: string | null | undefined) {
  const n = Number(ultimo?.split('-')[1] ?? 0);
  return `${prefijo}-${String((Number.isFinite(n) ? n : 0) + 1).padStart(4, '0')}`;
}

/** Fecha estimada de llegada: hoy + los días máximos que tarda el proveedor ('AAAA-MM-DD'). */
export function fechaEstimada(hoy: string, diasMax: number) {
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + diasMax);
  return d.toISOString().slice(0, 10);
}

/** ¿La compra llega a tiempo para cuando se necesita? Sin fecha necesaria es una reposición. */
export function aTiempo(llega: string | null, necesita: string | null): 'a_tiempo' | 'tarde' | 'reposicion' {
  if (!necesita) return 'reposicion';
  if (!llega) return 'a_tiempo';
  return llega <= necesita ? 'a_tiempo' : 'tarde';
}

/** Nombre de una tela cuando no se le da uno: «Terciopelo · Pattern 214 · color 3». */
export const nombreTela = (tipo: string, pattern: string, color: string) => `${tipo} · Pattern ${pattern} · color ${color}`;
