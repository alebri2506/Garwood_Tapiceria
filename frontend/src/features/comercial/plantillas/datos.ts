// Datos de ejemplo de A16 Plantillas (CU-C06, diseño del 11/11). Vendrán de la plantilla versionada, el Catálogo (A15)
// para los precios de los materiales, las máquinas con su tarifa por hora y Parámetros (A14: tarifa hora, costos fijos y margen).

/** Tarifa por hora de cada máquina (ejemplo; en el sistema, tabla `maquina`). */
export const MAQUINAS: Record<string, number> = { '—': 0, 'Mesa de corte': 4, 'Máquina de coser industrial': 6, 'Cortadora de espuma': 8, 'Engrapadora neumática': 5 };
/** Precio y unidad de cada material (ejemplo; en el sistema, el Catálogo A15). */
export const MATERIALES: Record<string, [number, string]> = {
  'Tela de tapiz': [17, 'yd'], 'Espuma HD 2"': [24, 'planchas'], 'Espuma HD 1.5"': [18, 'planchas'], 'Guata': [3, 'yd'], 'Hilo nylon 40': [6, 'conos'],
  'Cierre': [1.2, 'u'], 'Botones forrados': [0.35, 'u'], 'Pegamento de madera': [20, 'gal'], 'Grapas': [6, 'cajas'], 'Pegamento de contacto': [18, 'gal'],
};
/** Parámetros de ejemplo (A14): tarifa hora persona, costos fijos por plantilla y margen sobre el costo. */
export const COSTOS = { tarifaHora: 15, fijos: 60, margen: 0.75 };

export const MUEBLES = ['Sofá de 2 cuerpos', 'Sofá de 3 cuerpos', 'Sofá seccional (en L)', 'Sofá cama', 'Sillón', 'Silla de comedor', 'Cabecera de cama', 'Cama tapizada', 'Otomán o puf', 'Banco (bench)', 'Banqueta de restaurante', 'Cojín de ventana o asiento empotrado'];
export const SERVICIOS = ['Retapizado completo', 'Retapizado + cambio de espuma', 'Solo cambio de espuma', 'Reparación de estructura', 'Fabricación a medida'];
export const SERVICIOS_CORTOS = ['Retapizado completo', 'Retapizado + espuma', 'Solo espuma', 'Reparación de estructura', 'Fabricación a medida'];

export interface MaterialUso { m: string; q: number | string }
export interface Actividad { n: string; h: number | string; m: string; hm: number | string; mats: MaterialUso[]; nueva?: boolean }
export interface Plantilla { acts: Actividad[]; usos: number; fecha: string }

export const num = (v: number | string) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isNaN(n) ? 0 : n; };
export const copiar = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

/** Precio sugerido = materiales + mano de obra + maquinaria + costos fijos + margen (C08, sin transporte). */
export function costear(acts: Actividad[]) {
  let mat = 0, h = 0, maq = 0;
  for (const a of acts) {
    h += num(a.h);
    maq += num(a.hm) * (MAQUINAS[a.m] ?? 0);
    for (const x of a.mats) mat += num(x.q) * (MATERIALES[x.m]?.[0] ?? 0);
  }
  const mano = h * COSTOS.tarifaHora, fijos = acts.length ? COSTOS.fijos : 0, costo = mat + mano + maq + fijos;
  return { h, mat, mano, maq, fijos, costo, sugerido: Math.round(costo * (1 + COSTOS.margen)) };
}

const A = (n: string, h: number, m: string, hm: number, mats: [string, number][]): Actividad => ({ n, h, m, hm, mats: mats.map(([mm, q]) => ({ m: mm, q })) });
const tapizar = (h: number, hm: number) => A('Tapizar y armar', h, 'Engrapadora neumática', hm, [['Grapas', 1], ['Pegamento de contacto', 0.5]]);

/** Plantillas de ejemplo por "mueble|servicio" (índices de MUEBLES y SERVICIOS). */
export function plantillasEjemplo(): Record<string, Plantilla> {
  const s3e = [A('Desmontar tapiz y espuma antigua', 2.5, '—', 0, []), A('Revisar y reforzar estructura', 1.5, '—', 0, [['Pegamento de madera', 0.1]]), A('Cortar tela', 1.5, 'Mesa de corte', 0.5, [['Tela de tapiz', 14]]), A('Coser fundas y cojines', 4, 'Máquina de coser industrial', 4, [['Hilo nylon 40', 2], ['Cierre', 3]]), A('Cambiar espuma de asientos', 1.5, 'Cortadora de espuma', 0.5, [['Espuma HD 2"', 6]]), tapizar(3, 2)];
  const s3 = [A('Desmontar tapiz', 1.5, '—', 0, []), A('Cortar tela', 1.5, 'Mesa de corte', 0.5, [['Tela de tapiz', 14]]), A('Coser fundas y cojines', 4, 'Máquina de coser industrial', 4, [['Hilo nylon 40', 2], ['Cierre', 3]]), tapizar(3, 2)];
  const s3f = [A('Abrir cojines', 0.5, '—', 0, []), A('Cortar espuma nueva', 1, 'Cortadora de espuma', 0.5, [['Espuma HD 2"', 6]]), A('Rellenar y cerrar cojines', 1, '—', 0, [['Guata', 2]])];
  const s2e = copiar(s3e); s2e[2]!.mats[0]!.q = 11; s2e[3]!.h = 3.5; s2e[3]!.hm = 3.5; s2e[4]!.mats[0]!.q = 4;
  const sc = [A('Desmontar tapiz', 1.5, '—', 0, []), A('Revisar mecanismo de cama', 1, '—', 0, []), A('Cortar tela', 1.5, 'Mesa de corte', 0.5, [['Tela de tapiz', 12]]), A('Coser fundas y cojines', 3.5, 'Máquina de coser industrial', 3.5, [['Hilo nylon 40', 2], ['Cierre', 2]]), tapizar(3, 2)];
  const ar = [A('Desmontar tapiz', 1, '—', 0, []), A('Cortar tela', 0.75, 'Mesa de corte', 0.25, [['Tela de tapiz', 6]]), A('Coser fundas', 1.5, 'Máquina de coser industrial', 1.5, [['Hilo nylon 40', 1], ['Cierre', 1]]), tapizar(1.5, 1)];
  const are = copiar(ar); are.splice(3, 0, A('Cambiar espuma', 0.5, 'Cortadora de espuma', 0.25, [['Espuma HD 2"', 2]]));
  const arr = [A('Desarmar y revisar', 1, '—', 0, []), A('Reforzar uniones y patas', 2, '—', 0, [['Pegamento de madera', 0.2]]), A('Volver a armar', 1, 'Engrapadora neumática', 0.5, [['Grapas', 0.5]])];
  const ch = [A('Desmontar asiento', 0.25, '—', 0, []), A('Cortar tela', 0.25, 'Mesa de corte', 0.1, [['Tela de tapiz', 0.75]]), A('Cambiar espuma', 0.25, 'Cortadora de espuma', 0.1, [['Espuma HD 2"', 0.25]]), A('Tapizar asiento', 0.5, 'Engrapadora neumática', 0.25, [['Grapas', 0.1]])];
  const hb = [A('Desmontar tapiz', 0.5, '—', 0, []), A('Cortar tela', 0.5, 'Mesa de corte', 0.25, [['Tela de tapiz', 3], ['Guata', 2]]), A('Cambiar espuma', 0.5, 'Cortadora de espuma', 0.25, [['Espuma HD 2"', 1]]), A('Tapizar', 1.5, 'Engrapadora neumática', 1, [['Grapas', 0.5], ['Pegamento de contacto', 0.25]])];
  const ot = [A('Desmontar tapiz', 0.5, '—', 0, []), A('Cortar tela', 0.5, 'Mesa de corte', 0.2, [['Tela de tapiz', 2.5]]), A('Coser funda', 1, 'Máquina de coser industrial', 1, [['Hilo nylon 40', 0.5]]), A('Tapizar', 1, 'Engrapadora neumática', 0.5, [['Grapas', 0.25]])];
  const T: Record<string, Plantilla> = {};
  const poner = (m: number, s: number, acts: Actividad[], usos: number, fecha: string) => { T[`${m}|${s}`] = { acts, usos, fecha }; };
  poner(1, 0, s3, 9, '15 ago 2026'); poner(1, 1, s3e, 14, '1 oct 2026'); poner(1, 2, s3f, 3, '20 jul 2026');
  poner(0, 1, s2e, 7, '2 sep 2026'); poner(3, 0, sc, 2, '28 sep 2026');
  poner(4, 0, ar, 11, '20 sep 2026'); poner(4, 1, are, 5, '20 sep 2026'); poner(4, 3, arr, 1, '30 sep 2026');
  poner(5, 0, ch, 6, '10 jun 2026'); poner(6, 0, hb, 4, '1 oct 2026'); poner(8, 0, ot, 3, '12 ago 2026');
  return T;
}
