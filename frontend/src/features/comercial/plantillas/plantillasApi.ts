import { API_URL, ApiError, apiFetch } from '../../../shared/api/http';
import { COSTOS, MAQUINAS, MATERIALES, MUEBLES, SERVICIOS, SERVICIOS_CORTOS, num, plantillasEjemplo } from './datos';

// CU-C06 · A16 Plantillas de cotización: la matriz, ver, crear y guardar una versión nueva.

export interface ActividadApi {
  nombre: string;
  horasPersona: number;
  maquinaId: number | null;
  horasMaquina: number;
  /** Solo materiales de stock del Inventario: la tela se agrega en la cotización. */
  materiales: { materialId: number; cantidad: number }[];
}
export interface Costeo { horas: number; materiales: number; manoObra: number; maquinaria: number; fijos: number; costo: number; sugerido: number }
export interface CatalogoPlantillas {
  tiposMueble: { id: number; nombre: string }[];
  servicios: { codigo: string; nombre: string; corto: string }[];
  /** Todas: las desactivadas (activo false) no se ofrecen, pero se siguen mostrando en las plantillas que ya las usan. */
  maquinas: { id: number; nombre: string; tarifaHora: number; activo: boolean }[];
  materiales: { id: number; nombre: string; unidad: string; precio: number }[];
  costos: { tarifaHora: number; costosFijos: number; margenPct: number };
  plantillas: { id: number; tipoMuebleId: number; servicio: string; version: number; sugerido: number; horas: number }[];
}
export interface DetallePlantilla {
  id: number; tipoMuebleId: number; tipoMueble: string; servicio: string; servicioNombre: string;
  version: number; versiones: number; activa: boolean; fecha: string; editadoPor: string; usos: number;
  actividades: ActividadApi[]; costeo: Costeo; sinCambios?: boolean;
}

interface PlantillasApi {
  catalogo(): Promise<CatalogoPlantillas>;
  detalle(id: number): Promise<DetallePlantilla>;
  crear(tipoMuebleId: number, servicio: string, actividades: ActividadApi[]): Promise<DetallePlantilla>;
  guardar(id: number, actividades: ActividadApi[]): Promise<DetallePlantilla>;
}

const http: PlantillasApi = {
  catalogo: () => apiFetch('/admin/plantillas'),
  detalle: (id) => apiFetch(`/admin/plantillas/${id}`),
  crear: (tipoMuebleId, servicio, actividades) => apiFetch('/admin/plantillas', { method: 'POST', body: JSON.stringify({ tipoMuebleId, servicio, actividades }) }),
  guardar: (id, actividades) => apiFetch(`/admin/plantillas/${id}`, { method: 'PUT', body: JSON.stringify({ actividades }) }),
};

// ---------------------------------------------------------------- Sin API: las plantillas de ejemplo del diseño.
const CODIGOS = ['retapizado', 'retapizado_espuma', 'espuma', 'estructura', 'fabricacion'];
const maquinas = Object.entries(MAQUINAS).filter(([n]) => n !== '—').map(([nombre, tarifaHora], i) => ({ id: i + 1, nombre, tarifaHora, activo: true }));
// La tela no va en las plantillas (la elige el cliente en la cotización).
const materiales = Object.entries(MATERIALES).filter(([n]) => n !== 'Tela de tapiz').map(([nombre, [precio, unidad]], i) => ({ id: i + 1, nombre, unidad, precio }));
const catalogo: CatalogoPlantillas = {
  tiposMueble: MUEBLES.map((nombre, i) => ({ id: i + 1, nombre })),
  servicios: SERVICIOS.map((nombre, i) => ({ codigo: CODIGOS[i]!, nombre, corto: SERVICIOS_CORTOS[i]! })),
  maquinas, materiales,
  costos: { tarifaHora: COSTOS.tarifaHora, costosFijos: COSTOS.fijos, margenPct: COSTOS.margen * 100 },
  plantillas: [],
};
const detalles = new Map<number, DetallePlantilla>();
let siguienteId = 1;

export function costearCon(c: CatalogoPlantillas, acts: ActividadApi[]): Costeo {
  let horas = 0, mat = 0, maq = 0;
  for (const a of acts) {
    horas += num(a.horasPersona);
    maq += num(a.horasMaquina) * (c.maquinas.find((m) => m.id === a.maquinaId)?.tarifaHora ?? 0);
    for (const m of a.materiales) mat += num(m.cantidad) * (c.materiales.find((x) => x.id === m.materialId)?.precio ?? 0);
  }
  const manoObra = horas * c.costos.tarifaHora, fijos = acts.length ? c.costos.costosFijos : 0, costo = mat + manoObra + maq + fijos;
  return { horas, materiales: mat, manoObra, maquinaria: maq, fijos, costo, sugerido: Math.round(costo * (1 + c.costos.margenPct / 100)) };
}

function guardarSimulada(tipoMuebleId: number, servicio: string, actividades: ActividadApi[], version: number, anterior?: number): DetallePlantilla {
  if (anterior != null) { const a = detalles.get(anterior)!; a.activa = false; }
  const d: DetallePlantilla = {
    id: siguienteId++, tipoMuebleId, tipoMueble: MUEBLES[tipoMuebleId - 1]!, servicio, servicioNombre: catalogo.servicios.find((s) => s.codigo === servicio)!.nombre,
    version, versiones: version, activa: true, fecha: new Date().toISOString(), editadoPor: 'Administrador', usos: 0,
    actividades: structuredClone(actividades), costeo: costearCon(catalogo, actividades),
  };
  detalles.set(d.id, d);
  catalogo.plantillas = catalogo.plantillas.filter((p) => !(p.tipoMuebleId === tipoMuebleId && p.servicio === servicio))
    .concat({ id: d.id, tipoMuebleId, servicio, version, sugerido: d.costeo.sugerido, horas: d.costeo.horas });
  return d;
}
for (const [clave, p] of Object.entries(plantillasEjemplo())) {
  const [mi, si] = clave.split('|').map(Number) as [number, number];
  guardarSimulada(mi + 1, CODIGOS[si]!, p.acts.map((a) => ({
    nombre: a.n, horasPersona: num(a.h), maquinaId: maquinas.find((m) => m.nombre === a.m)?.id ?? null, horasMaquina: num(a.hm),
    materiales: a.mats.filter((m) => m.m !== 'Tela de tapiz').map((m) => ({ materialId: materiales.find((x) => x.nombre === m.m)!.id, cantidad: num(m.q) })),
  })), 1);
}

const simulada: PlantillasApi = {
  catalogo: async () => structuredClone(catalogo),
  detalle: async (id) => structuredClone(detalles.get(id)!),
  crear: async (tipoMuebleId, servicio, actividades) => {
    if (!actividades.some((a) => num(a.horasPersona) > 0)) throw new ApiError('Agregue al menos una actividad con horas.', 400);
    return structuredClone(guardarSimulada(tipoMuebleId, servicio, actividades, 1));
  },
  guardar: async (id, actividades) => {
    const a = detalles.get(id)!;
    return structuredClone({ ...guardarSimulada(a.tipoMuebleId, a.servicio, actividades, a.version + 1, id), sinCambios: false });
  },
};

export const plantillasApi: PlantillasApi = API_URL ? http : simulada;
