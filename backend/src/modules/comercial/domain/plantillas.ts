// CU-C06 A16 Plantillas de cotización: cómo se calcula el precio sugerido de una plantilla. Sin Express ni Prisma.
//   Costo = materiales + mano de obra (horas persona × tarifa hora) + maquinaria (horas máquina × tarifa de cada máquina)
//           + costos fijos (una vez por plantilla, si tiene actividades).
//   Precio sugerido = costo × (1 + margen %), redondeado al dólar (no incluye transporte: CU-C08).
// Los valores salen de Parámetros (A14), del Inventario (precio de cada material) y de la tabla `maquina` (RG-04).

export interface ParametrosCosto {
  /** USD por hora persona (`tarifa.hora_persona`). */
  tarifaHora: number;
  /** USD por plantilla (`tarifa.costos_fijos_pedido`). */
  costosFijos: number;
  /** Margen sobre el costo, en % (`cotizacion.margen_pct`). */
  margenPct: number;
}

export interface ActividadACostear {
  horasPersona: number;
  horasMaquina: number;
  /** USD por hora de la máquina; 0 sin máquina. */
  tarifaMaquina: number;
  /** Precio por unidad × cantidad de cada material (la tela con el precio de referencia). */
  materiales: { precio: number; cantidad: number }[];
}

export interface Costeo {
  horas: number;
  materiales: number;
  manoObra: number;
  maquinaria: number;
  fijos: number;
  costo: number;
  sugerido: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function costearPlantilla(actividades: ActividadACostear[], p: ParametrosCosto): Costeo {
  let horas = 0, materiales = 0, maquinaria = 0;
  for (const a of actividades) {
    horas += a.horasPersona;
    maquinaria += a.horasMaquina * a.tarifaMaquina;
    for (const m of a.materiales) materiales += m.precio * m.cantidad;
  }
  const manoObra = horas * p.tarifaHora;
  const fijos = actividades.length ? p.costosFijos : 0;
  const costo = materiales + manoObra + maquinaria + fijos;
  return {
    horas: r2(horas), materiales: r2(materiales), manoObra: r2(manoObra), maquinaria: r2(maquinaria), fijos: r2(fijos),
    costo: r2(costo), sugerido: Math.round(costo * (1 + p.margenPct / 100)),
  };
}

/** Para crear o guardar una plantilla: al menos una actividad con horas persona (diseño A16). */
export const tieneHoras = (actividades: { horasPersona: number }[]) => actividades.some((a) => a.horasPersona > 0);

export interface ActividadEntrada {
  nombre: string;
  horasPersona: number;
  maquinaId: number | null;
  horasMaquina: number;
  materiales: { materialId: number; cantidad: number }[];
}

/** ¿Cambió algo respecto a la versión guardada? Si no, «Guardar cambios» no crea una versión nueva. */
export function mismasActividades(a: ActividadEntrada[], b: ActividadEntrada[]) {
  const clave = (x: ActividadEntrada[]) =>
    JSON.stringify(x.map((y) => [y.nombre.trim(), r2(y.horasPersona), y.maquinaId, r2(y.horasMaquina), [...y.materiales].map((m) => [m.materialId, r2(m.cantidad)]).sort()]));
  return clave(a) === clave(b);
}
