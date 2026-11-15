import { API_URL, ApiError, apiFetch } from '../../../shared/api/http';

// CU-S05 · A14 Parámetros: consultar, guardar varios cambios a la vez e historial (decisiones D.3).

export interface Parametro {
  clave: string; etiqueta: string; valor: string; unidad: string | null;
  tipo: 'entero' | 'decimal' | 'porcentaje' | 'monto' | 'horario' | 'texto' | 'opcion';
  minimo: number | null; maximo: number | null; ayuda: string | null; provisional: boolean;
  /** Solo tipo "opcion" (unidades de telas y medidas): los valores que se pueden elegir. */
  opciones?: { valor: string; etiqueta: string }[];
}
export interface GrupoParametros { nombre: string; parametros: Parametro[] }
export interface CambioHistorial {
  /** Parámetros y máquinas comparten el historial: el id lleva un prefijo (p…, m…). */
  id: string; clave: string; etiqueta: string; unidad: string | null; valorAnterior: string; valorNuevo: string; usuario: string; fecha: string;
  /** Altas y cambios de estado de una máquina: la línea ya escrita. */
  texto?: string;
}
/** A14 › Máquinas: la tarifa por hora que usa el precio sugerido de las plantillas. */
/** A14 › Tamaño de carga de cada tipo de mueble: cuánto suma al transporte (chica, mediana o grande). */
export type TamanoCarga = 'chica' | 'mediana' | 'grande';
export interface CargaMueble { id: number; nombre: string; tamanoCarga: TamanoCarga; sinCambios?: boolean }
export interface Maquina { id: number; nombre: string; tarifaHora: number; activo: boolean; usos: number; sinCambios?: boolean }
export interface CitaFueraDeHorario {
  citaId: number; solicitud: string | null; cliente: string; tipo: 'local' | 'domicilio'; fecha: string; hora: string; franja: string | null;
}
export interface Guardado {
  cambiados: string[];
  grupos: GrupoParametros[];
  avisos: { citasFueraDeHorario: CitaFueraDeHorario[] };
}

interface ParametrosApi {
  listar(): Promise<{ grupos: GrupoParametros[] }>;
  historial(): Promise<CambioHistorial[]>;
  guardar(cambios: { clave: string; valor: string }[]): Promise<Guardado>;
  maquinas(): Promise<Maquina[]>;
  crearMaquina(datos: { nombre: string; tarifaHora: string }): Promise<Maquina>;
  editarMaquina(id: number, datos: { nombre: string; tarifaHora: string }): Promise<Maquina>;
  estadoMaquina(id: number, activo: boolean): Promise<Maquina>;
  cargas(): Promise<CargaMueble[]>;
  cambiarCarga(id: number, tamanoCarga: TamanoCarga): Promise<CargaMueble>;
}

const http: ParametrosApi = {
  listar: () => apiFetch('/admin/parametros'),
  historial: () => apiFetch('/admin/parametros/historial?limite=20'),
  guardar: (cambios) => apiFetch('/admin/parametros', { method: 'PUT', body: JSON.stringify({ cambios }) }),
  maquinas: () => apiFetch('/admin/parametros/maquinas'),
  crearMaquina: (datos) => apiFetch('/admin/parametros/maquinas', { method: 'POST', body: JSON.stringify(datos) }),
  editarMaquina: (id, datos) => apiFetch(`/admin/parametros/maquinas/${id}`, { method: 'PUT', body: JSON.stringify(datos) }),
  estadoMaquina: (id, activo) => apiFetch(`/admin/parametros/maquinas/${id}/estado`, { method: 'PUT', body: JSON.stringify({ activo }) }),
  cargas: () => apiFetch('/admin/parametros/cargas'),
  cambiarCarga: (id, tamanoCarga) => apiFetch(`/admin/parametros/cargas/${id}`, { method: 'PUT', body: JSON.stringify({ tamanoCarga }) }),
};

// ---------------------------------------------------------------- Sin API: algunos parámetros de ejemplo por grupo.
const PROV = 'Provisional: por confirmar con el dueño.';
const p = (clave: string, etiqueta: string, valor: string, tipo: Parametro['tipo'], unidad: string | null, minimo: number | null, maximo: number | null, ayuda: string | null = null): Parametro =>
  ({ clave, etiqueta, valor, tipo, unidad, minimo, maximo, ayuda, provisional: Boolean(ayuda?.includes('Provisional')) });
const ejemplo: GrupoParametros[] = [
  { nombre: 'Cotización y pagos', parametros: [
    p('cotizacion.vigencia_dias', 'Vigencia de la cotización', '30', 'entero', 'días', 1, 90, PROV),
    p('pago.adelanto_sin_historial_pct', 'Adelanto sugerido · sin pedidos cerrados o con saldo vencido', '40', 'porcentaje', '%', 0, 50, PROV),
    p('cotizacion.margen_pct', 'Margen sobre costo', '75', 'porcentaje', '%', 0, 200, PROV),
  ] },
  { nombre: 'Unidades de la solicitud y la cotización', parametros: [
    { ...p('unidad.telas', 'Telas', 'yd', 'opcion', null, null, null), opciones: [{ valor: 'yd', etiqueta: 'Yarda' }, { valor: 'm', etiqueta: 'Metro' }] },
    { ...p('unidad.medidas', 'Medidas del mueble', 'in', 'opcion', null, null, null), opciones: [{ valor: 'in', etiqueta: 'Pulgada' }, { valor: 'cm', etiqueta: 'Centímetro' }] },
  ] },
  { nombre: 'Tarifas', parametros: [
    p('tarifa.hora_persona', 'Hora persona', '15.00', 'monto', 'USD/h', 0, null, PROV),
    p('transporte.por_milla', 'Transporte · por milla', '1.60', 'monto', 'USD/milla', 0, null, PROV),
  ] },
  { nombre: 'Agenda y despacho', parametros: [
    p('cita.duracion_min', 'Duración del turno de cita', '30', 'entero', 'min', 1, null, 'Las citas ya agendadas conservan su duración.'),
    p('agenda.turnos_manana', 'Horario de citas · mañana', '09:30-12:00', 'horario', null, null, null),
    p('agenda.turnos_tarde', 'Horario de citas · tarde', '15:00-17:00', 'horario', null, null, null),
  ] },
  { nombre: 'Seguridad', parametros: [
    p('login.max_intentos', 'Intentos fallidos antes de bloquear', '5', 'entero', 'intentos', 1, null),
  ] },
];
const historialEjemplo: CambioHistorial[] = [];
const cargasEjemplo: CargaMueble[] = ([
  ['Sofá de 2 cuerpos', 'grande'], ['Sofá de 3 cuerpos', 'grande'], ['Sofá seccional (en L)', 'grande'], ['Sofá cama', 'grande'], ['Sillón', 'mediana'],
  ['Silla de comedor', 'chica'], ['Cabecera de cama', 'mediana'], ['Cama tapizada', 'grande'], ['Otomán o puf', 'chica'], ['Banco (bench)', 'mediana'],
  ['Banqueta de restaurante', 'mediana'], ['Cojín de ventana o asiento empotrado', 'chica'],
] as [string, TamanoCarga][]).map(([nombre, tamanoCarga], i) => ({ id: i + 1, nombre, tamanoCarga }));
const maquinasEjemplo: Maquina[] = [
  { id: 1, nombre: 'Cortadora de espuma', tarifaHora: 8, activo: true, usos: 3 },
  { id: 2, nombre: 'Engrapadora neumática', tarifaHora: 5, activo: true, usos: 6 },
  { id: 3, nombre: 'Mesa de corte', tarifaHora: 4, activo: true, usos: 6 },
  { id: 4, nombre: 'Máquina de coser industrial', tarifaHora: 6, activo: true, usos: 4 },
];
/** Las mismas reglas que el backend: nombre único y tarifa entre 0 y 1000. */
function revisarMaquina(d: { nombre: string; tarifaHora: string }, excepto?: number) {
  const errores: Record<string, string> = {};
  const nombre = d.nombre.trim(), tarifa = Number(d.tarifaHora);
  if (nombre.length < 2) errores.nombre = 'Escriba el nombre de la máquina.';
  else if (maquinasEjemplo.some((m) => m.id !== excepto && m.nombre.toLowerCase() === nombre.toLowerCase())) errores.nombre = 'Ya existe una máquina con ese nombre.';
  if (d.tarifaHora.trim() === '' || Number.isNaN(tarifa)) errores.tarifaHora = 'Escriba la tarifa con números.';
  else if (tarifa < 0) errores.tarifaHora = 'La tarifa no puede ser negativa.';
  else if (tarifa > 1000) errores.tarifaHora = 'La tarifa no puede pasar de $1,000 por hora.';
  if (Object.keys(errores).length) throw new ApiError(Object.values(errores)[0]!, 400, errores);
  return { nombre, tarifaHora: Math.round(tarifa * 100) / 100 };
}
const simulada: ParametrosApi = {
  listar: async () => ({ grupos: structuredClone(ejemplo) }),
  historial: async () => structuredClone(historialEjemplo),
  guardar: async (cambios) => {
    const todos = ejemplo.flatMap((g) => g.parametros);
    const errores: Record<string, string> = {};
    for (const c of cambios) {
      const x = todos.find((t) => t.clave === c.clave);
      const n = Number(c.valor);
      if (!x) errores[c.clave] = 'Este parámetro no existe o no se puede cambiar desde aquí.';
      else if (x.tipo !== 'horario' && x.tipo !== 'opcion' && (Number.isNaN(n) || (x.minimo != null && n < x.minimo) || (x.maximo != null && n > x.maximo))) {
        errores[c.clave] = x.maximo != null ? `Debe estar entre ${x.minimo} y ${x.maximo} ${x.unidad ?? ''}.`.replace(' .', '.') : `No puede ser menor que ${x.minimo ?? 0}.`;
      }
    }
    if (Object.keys(errores).length) throw new ApiError('Revise los valores marcados. No se guardó ningún cambio.', 400, errores);
    const cambiados: string[] = [];
    for (const c of cambios) {
      const x = todos.find((t) => t.clave === c.clave)!;
      if (x.valor === c.valor) continue;
      historialEjemplo.unshift({ id: 'p' + (historialEjemplo.length + 1), clave: x.clave, etiqueta: x.etiqueta, unidad: x.unidad, valorAnterior: x.valor, valorNuevo: c.valor, usuario: 'Administrador', fecha: new Date().toISOString() });
      x.valor = c.valor;
      cambiados.push(c.clave);
    }
    return { cambiados, grupos: structuredClone(ejemplo), avisos: { citasFueraDeHorario: [] } };
  },
  maquinas: async () => structuredClone(maquinasEjemplo),
  crearMaquina: async (datos) => {
    const d = revisarMaquina(datos);
    const m: Maquina = { id: Math.max(0, ...maquinasEjemplo.map((x) => x.id)) + 1, ...d, activo: true, usos: 0 };
    maquinasEjemplo.push(m);
    return structuredClone(m);
  },
  editarMaquina: async (id, datos) => {
    const m = maquinasEjemplo.find((x) => x.id === id)!;
    const d = revisarMaquina(datos, id);
    const sinCambios = d.nombre === m.nombre && d.tarifaHora === m.tarifaHora;
    Object.assign(m, d);
    return { ...structuredClone(m), sinCambios };
  },
  cargas: async () => structuredClone(cargasEjemplo),
  cambiarCarga: async (id, tamanoCarga) => {
    const c = cargasEjemplo.find((x) => x.id === id)!;
    const sinCambios = c.tamanoCarga === tamanoCarga;
    c.tamanoCarga = tamanoCarga;
    return { ...structuredClone(c), sinCambios };
  },
  estadoMaquina: async (id, activo) => {
    const m = maquinasEjemplo.find((x) => x.id === id)!;
    m.activo = activo;
    return structuredClone(m);
  },
};

export const parametrosApi: ParametrosApi = API_URL ? http : simulada;
