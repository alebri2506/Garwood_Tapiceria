import { API_URL, apiFetch } from '../../../shared/api/http';
import { MEDIOS_MUEBLE, MUEBLES_COTIZACION } from './datos';

// A4 Armar cotización (CU-C07, C08, C11 · decisiones K): la propuesta o el borrador, guardar y publicar.

export interface MaterialArmado { materialId: number; nombre: string; unidad: string; precio: number; cantidad: number }
export interface ActividadArmada { nombre: string; horasPersona: number; maquinaId: number | null; maquina: string | null; tarifaMaquina: number; horasMaquina: number; materiales: MaterialArmado[] }
export interface TelaArmada { materialId: number; nombre: string; precio: number | null; yardas: number; activa: boolean }
export interface MuebleArmado {
  solicitudMuebleId: number; orden: number; clave: string; titulo: string; corto: string;
  servicio: string; servicioNombre: string; cantidad: number; medidas: string | null; acabado: string | null; tamanoCarga: string;
  plantilla: { id: number; nombre: string } | null;
  /** taller: la pone el taller (la eligió el cliente) · cliente: la brinda el cliente · pendiente: se elige en la cita · no: no lleva. */
  /** `eligeAqui`: la tela se elige en la cita o la visita, del muestrario. */
  tela: { tipo: 'taller' | 'cliente' | 'pendiente' | 'no'; nota: string; eligeAqui?: boolean; telas: TelaArmada[] };
  medios: { nombre: string; tipo: string; url: string | null }[];
  actividades: ActividadArmada[];
  propuesto: number; motivo: string; revisado: boolean;
  /** Para elegir la tela en la cita o la visita con el mismo dibujo que W2. */
  tipoCodigo?: string;
  partesMueble?: { id: number; nombre: string }[];
  /** «Distintas telas por partes»: la tela de cada parte (vacío = una tela para todo). */
  partes?: { parteId: number; materialId: number }[];
}
export interface Armado {
  solicitud: { codigo: string; estado: string; fecha: string; esperaFotos: boolean };
  cotizacion: { codigo: string | null; estado: string; editable: boolean; vigenciaHasta: string | null; fechaModificacion: string | null; editadoPor: string | null; fechaPublicacion: string | null; total: number | null };
  cliente: { nombre: string; ciudad: string | null; pedidosCerrados: number; historial: string };
  muebles: MuebleArmado[];
  transporte: {
    aplica: boolean; porDefinir: boolean; direccion: string | null; origen: string; millas: number | null; porMilla: number;
    distancia: number | null; carga: number; cargaTexto: string; calculado: number | null; manual: boolean; monto: number; motivo: string;
  };
  condiciones: { vigenciaDias: number; adelantoPct: number; adelantoMaxPct: number; adelanto: number | null; razon: string };
  observaciones: string;
  costos: { tarifaHora: number; costosFijos: number; margenPct: number };
  catalogo: { maquinas: { id: number; nombre: string; tarifaHora: number }[]; materiales: { id: number; nombre: string; unidad: string; precio: number }[] };
  /** Telas del muestrario (A15b), cuando se eligen en la cita o la visita. */
  muestrario?: { id: number; nombre: string; familia: string | null; colorHex: string | null; libro: string | null; precio: number | null }[];
}
export interface EntradaCotizacion {
  muebles: { solicitudMuebleId: number; actividades: { nombre: string; horasPersona: number; maquinaId: number | null; horasMaquina: number; materiales: { materialId: number; cantidad: number }[] }[]; telas: { materialId: number; yardas: number }[]; partes?: { parteId: number; materialId: number }[]; propuesto: number; motivo: string; revisado: boolean }[];
  transporte: { manual: boolean; monto?: number; motivo?: string };
  adelanto: number | null;
  observaciones: string;
}

interface CotizacionesApi {
  armar(solicitud: string): Promise<Armado>;
  guardar(solicitud: string, e: EntradaCotizacion): Promise<{ codigo: string; total: number }>;
  publicar(solicitud: string, e: EntradaCotizacion): Promise<{ codigo: string; total: number; vigenciaHasta: string }>;
}

const http: CotizacionesApi = {
  armar: (s) => apiFetch(`/admin/cotizaciones/armar/${encodeURIComponent(s)}`),
  guardar: (s, e) => apiFetch(`/admin/cotizaciones/armar/${encodeURIComponent(s)}`, { method: 'PUT', body: JSON.stringify(e) }),
  publicar: (s, e) => apiFetch(`/admin/cotizaciones/armar/${encodeURIComponent(s)}/publicar`, { method: 'POST', body: JSON.stringify(e) }),
};

// ---------------------------------------------------------------- Sin API: el ejemplo del diseño (sofá, otomán y cojines).
const MAQUINAS = [{ id: 1, nombre: 'Mesa de corte', tarifaHora: 4 }, { id: 2, nombre: 'Máquina de coser industrial', tarifaHora: 6 }, { id: 3, nombre: 'Cortadora de espuma', tarifaHora: 8 }, { id: 4, nombre: 'Engrapadora neumática', tarifaHora: 5 }];
let siguienteMaterial = 100;
const TELAS: Record<string, number> = { 'Lino Navy 204': 1, 'Lino Arena 110': 2 };
function ejemplo(): Armado {
  const muebles: MuebleArmado[] = MUEBLES_COTIZACION.map((m, i) => ({
    solicitudMuebleId: i + 1, orden: i + 1, clave: m.clave, titulo: m.titulo, corto: m.corto, servicio: 'retapizado', servicioNombre: m.servicio,
    cantidad: 1, medidas: null, acabado: null, tamanoCarga: i === 0 ? 'grande' : 'chica',
    plantilla: { id: i + 1, nombre: m.plantilla },
    tela: { tipo: 'taller', nota: 'La eligió el cliente en línea · la pone el taller', telas: [{ materialId: TELAS[m.tela.nombre]!, nombre: m.tela.nombre, precio: m.tela.precioYd, yardas: m.tela.yd, activa: true }] },
    medios: (i === 0 ? MEDIOS_MUEBLE : m.medios).map((x) => ({ nombre: x.nombre, tipo: x.tipo === 'Foto' ? 'foto' : 'video', url: null })),
    actividades: m.actividades.map((a) => ({
      nombre: a.nombre, horasPersona: a.horas, maquinaId: MAQUINAS.find((x) => x.nombre === a.maquina)?.id ?? null, maquina: a.maquina === '—' ? null : a.maquina,
      tarifaMaquina: a.tarifaMaquina, horasMaquina: a.horasMaquina ?? 0,
      materiales: a.materiales.filter((x) => !x.tela).map((x) => ({ materialId: siguienteMaterial++, nombre: x.nombre, unidad: 'u', precio: x.costo, cantidad: 1 })),
    })),
    propuesto: m.propuesto, motivo: i === 0 ? 'Ajuste acordado en la cita' : '', revisado: i === 0,
  }));
  return {
    solicitud: { codigo: 'SOL-0076', estado: 'Atendida', fecha: '2026-10-06T15:00:00Z', esperaFotos: false },
    cotizacion: { codigo: null, estado: 'Borrador', editable: true, vigenciaHasta: null, fechaModificacion: null, editadoPor: null, fechaPublicacion: null, total: null },
    cliente: { nombre: 'Laura Méndez', ciudad: 'Montclair', pedidosCerrados: 0, historial: 'sin pedidos cerrados' },
    muebles,
    transporte: { aplica: true, porDefinir: false, direccion: '48 Park St, Montclair, NJ 07042', origen: '469 South Avenue E B, Westfield, NJ 07090', millas: 14, porMilla: 1.6, distancia: 45, carga: 75, cargaTexto: 'sofá de 3 cuerpos (grande) + otomán (chica) + cojines (chica)', calculado: 120, manual: false, monto: 120, motivo: '' },
    condiciones: { vigenciaDias: 30, adelantoPct: 40, adelantoMaxPct: 50, adelanto: null, razon: 'sin pedidos cerrados' },
    observaciones: '',
    costos: { tarifaHora: 15, costosFijos: 60, margenPct: 75 },
    catalogo: { maquinas: MAQUINAS, materiales: [] },
  };
}
let guardada: Armado | null = null;
const simulada: CotizacionesApi = {
  armar: async () => structuredClone(guardada ?? ejemplo()),
  guardar: async () => ({ codigo: 'COT-0076', total: 0 }),
  publicar: async () => {
    guardada = { ...ejemplo(), cotizacion: { ...ejemplo().cotizacion, codigo: 'COT-0076', estado: 'Pendiente de respuesta', editable: false, vigenciaHasta: '2026-11-06' } };
    return { codigo: 'COT-0076', total: 0, vigenciaHasta: '2026-11-06' };
  },
};

export const cotizacionesApi: CotizacionesApi = API_URL ? http : simulada;
