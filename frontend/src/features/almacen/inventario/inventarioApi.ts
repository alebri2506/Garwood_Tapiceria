import { API_URL, ApiError, apiFetch } from '../../../shared/api/http';

// Almacén e Inventario (A15 Stock, A15b Telas, A8 Reponer, A8c Movimientos, A8p Proveedores, A9 Conteo · diseño del 12/11).

export type EstadoStock = 'ok' | 'bajo' | 'falta' | 'pedido';
export interface Opcion { valor: string; etiqueta: string }
export interface ProveedorCorto { id: number; nombre: string; tarda: string }

export interface FilaStock {
  id: number; nombre: string; categoria: string; unidad: string; proveedor: string | null;
  fisico: number; reservado: number; disponible: number; minimo: number; consumoSemanal: number;
  alcanza: string; estado: EstadoStock; porLlegar: number; llegaEl: string | null; reservadoPara: string[];
}
export interface Stock {
  materiales: FilaStock[];
  porReponer: number;
  ultimoMovimiento: { fecha: string; quien: string; motivo: string; material: string; cantidad: number; unidad: string; pedido: string | null } | null;
}
export interface FichaMaterial {
  id: number; nombre: string; categoria: string; unidad: string; ubicacion: string | null;
  fisico: number; reservado: number; disponible: number; minimo: number; consumoSemanal: number; estado: EstadoStock; alcanza: string;
  proveedor: ProveedorCorto | null; precio: number; fechaPrecio: string | null; tieneMovimientos: boolean;
  movimientos: { fecha: string; motivo: string; pedido: string | null; quien: string; cantidad: number }[];
}
export interface DatosMaterial { nombre: string; categoria?: string; unidad?: string; proveedorId: number; minimo: number; precio: number; ubicacion?: string | null }
export interface OpcionesInventario {
  unidades: Opcion[]; categorias: Opcion[]; proveedores: (ProveedorCorto & { tipo: 'stock' | 'telas' })[]; tiposTela: string[]; coloresTela: string[];
}

export interface Tela {
  id: number; nombre: string; tipo: string | null; color: string | null; pattern: string | null; numeroColor: string | null; colorHex: string | null;
  libro: string | null; precio: number; fechaPrecio: string | null; enWeb: boolean; activa: boolean; proveedor: ProveedorCorto | null;
  usos: { pedido: string; cliente: string; detalle: string }[];
}
export interface DatosTela { proveedorId: number; tipo: string; color: string; pattern: string; numeroColor: string; precio: number; enWeb: boolean; nombre?: string | null; libro?: string | null; colorHex?: string | null }

export interface Reponer {
  semanas: number; unidadTelas: string;
  telasParaEncargar: { materialId: number; nombre: string; modelo: string | null; cantidad: number; precio: number; subtotal: number; proveedor: { nombre: string; tarda: string } | null; necesitaEl: string | null; urgente: boolean; pedidos: { codigo: string; cantidad: number }[] }[];
  porProveedor: { id: number; nombre: string; canal: string; contacto: string; tarda: string; lineas: { materialId: number; nombre: string; unidad: string; precio: number; sugerido: number; calculo: string; razon: string; urgente: boolean }[] }[];
  sinProveedor: string[];
  porLlegar: { compraId: number; codigo: string; nombre: string; proveedor: string; pedidoEl: string; llegaEl: string | null; cantidad: number; unidad: string; para: string; esTela: boolean; tiempo: 'a_tiempo' | 'tarde' | 'reposicion'; necesitaEl: string | null }[];
}

export interface Movimiento { id: number; fecha: string; tipo: 'entrada' | 'salida' | 'ajuste' | 'conteo'; motivo: string; detalle: string | null; material: string; unidad: string; pedido: string | null; quien: string; cantidad: number; saldo: number }
export interface FiltroMovimientos { materialId?: number; tipo?: 'entrada' | 'salida' | 'ajuste'; desde?: string; hasta?: string }
export interface Correccion { materialId: number; sentido: 'sale' | 'entra'; cantidad: number; motivo: string; otroMotivo?: string; pedidoId?: number }
export interface PedidoEnProceso { id: number; codigo: string; cliente: string; descripcion: string; estado: string }

export interface Proveedor {
  id: number; nombre: string; canal: 'telefono' | 'whatsapp'; contacto: string; diasMin: number; diasMax: number; tarda: string; tipo: 'stock' | 'telas'; activo: boolean;
  pendiente: string | null;
  materiales: { id: number; nombre: string; precio: number; unidad: string; estado: EstadoStock | null }[];
  compras: { codigo: string; estado: string; fechaPedido: string; fechaEstimada: string | null; fechaLlegada: string | null; detalle: string }[];
}
export type DatosProveedor = Pick<Proveedor, 'nombre' | 'canal' | 'contacto' | 'diasMin' | 'diasMax' | 'tipo'>;

export interface ListaConteo { ultimoConteo: string | null; grupos: { categoria: string; nombre: string; materiales: { id: number; nombre: string; unidad: string }[] }[]; motivos: string[] }
export interface Diferencia { materialId: number; nombre: string; unidad: string; sistema: number; contado: number; diferencia: number }

interface InventarioApi {
  opciones(): Promise<OpcionesInventario>;
  stock(): Promise<Stock>;
  material(id: number): Promise<FichaMaterial>;
  crearMaterial(d: DatosMaterial): Promise<FichaMaterial>;
  editarMaterial(id: number, d: DatosMaterial): Promise<FichaMaterial>;
  telas(): Promise<{ telas: Tela[]; unidadTelas: string }>;
  crearTela(d: DatosTela): Promise<Tela>;
  editarTela(id: number, d: DatosTela): Promise<Tela>;
  ofertaTela(id: number, activa: boolean): Promise<Tela>;
  proveedores(): Promise<{ proveedores: Proveedor[] }>;
  crearProveedor(d: DatosProveedor): Promise<{ id: number }>;
  editarProveedor(id: number, d: DatosProveedor): Promise<{ id: number }>;
  reponer(): Promise<Reponer>;
  marcarPedido(proveedorId: number, lineas: { materialId: number; cantidad: number }[]): Promise<{ codigo: string; llegaEl: string | null }>;
  encargarTela(materialId: number): Promise<{ codigo: string; llegaEl: string | null }>;
  llego(compraId: number): Promise<{ codigo: string; efectos: string[] }>;
  movimientos(f: FiltroMovimientos): Promise<{ total: number; movimientos: Movimiento[] }>;
  corregir(c: Correccion): Promise<{ saldo: number; unidad: string }>;
  pedidosEnProceso(q: string): Promise<{ pedidos: PedidoEnProceso[] }>;
  listaConteo(): Promise<ListaConteo>;
  comparar(contados: { materialId: number; contado: number }[]): Promise<{ total: number; diferencias: Diferencia[] }>;
  guardarConteo(contados: { materialId: number; contado: number; motivo?: string; otroMotivo?: string }[]): Promise<{ contados: number; coincidieron: number; ajustados: number }>;
}

const B = '/admin/inventario';
const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });
const qs = (o: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v != null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

const http: InventarioApi = {
  opciones: () => apiFetch(`${B}/opciones`),
  stock: () => apiFetch(`${B}/stock`),
  material: (id) => apiFetch(`${B}/materiales/${id}`),
  crearMaterial: (d) => apiFetch(`${B}/materiales`, json('POST', d)),
  editarMaterial: (id, d) => apiFetch(`${B}/materiales/${id}`, json('PUT', d)),
  telas: () => apiFetch(`${B}/telas`),
  crearTela: (d) => apiFetch(`${B}/telas`, json('POST', d)),
  editarTela: (id, d) => apiFetch(`${B}/telas/${id}`, json('PUT', d)),
  ofertaTela: (id, activa) => apiFetch(`${B}/telas/${id}/oferta`, json('PUT', { activa })),
  proveedores: () => apiFetch(`${B}/proveedores`),
  crearProveedor: (d) => apiFetch(`${B}/proveedores`, json('POST', d)),
  editarProveedor: (id, d) => apiFetch(`${B}/proveedores/${id}`, json('PUT', d)),
  reponer: () => apiFetch(`${B}/reponer`),
  marcarPedido: (proveedorId, lineas) => apiFetch(`${B}/compras`, json('POST', { proveedorId, lineas })),
  encargarTela: (materialId) => apiFetch(`${B}/encargos`, json('POST', { materialId })),
  llego: (compraId) => apiFetch(`${B}/compras/${compraId}/llegada`, { method: 'POST' }),
  movimientos: (f) => apiFetch(`${B}/movimientos${qs({ ...f })}`),
  corregir: (c) => apiFetch(`${B}/movimientos`, json('POST', c)),
  pedidosEnProceso: (q) => apiFetch(`${B}/pedidos-en-proceso${qs({ q })}`),
  listaConteo: () => apiFetch(`${B}/conteo`),
  comparar: (contados) => apiFetch(`${B}/conteo/comparar`, json('POST', { contados })),
  guardarConteo: (contados) => apiFetch(`${B}/conteo`, json('POST', { contados })),
};

// ---------------------------------------------------------------- Sin API: datos de ejemplo del diseño (solo para ver las pantallas).
const ahora = () => new Date().toISOString();
const dia = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const PROV: OpcionesInventario['proveedores'] = [
  { id: 1, nombre: 'Proveedor de espumas', tarda: '3–5 días', tipo: 'stock' },
  { id: 2, nombre: 'Proveedor de insumos', tarda: '4–6 días', tipo: 'stock' },
  { id: 3, nombre: 'Proveedor de telas', tarda: '2–3 días', tipo: 'telas' },
];
type Mat = Omit<FilaStock, 'disponible' | 'alcanza' | 'estado' | 'reservadoPara'> & { reservas: [string, number][]; precio: number; ubicacion: string };
const MATS: Mat[] = (
  [
    [1, 'Espuma HD 2"', 'espuma', 'planchas', 7, 10, 6, 1, 24, 'Estante A1', [['PED-0076', 1]], 0],
    [2, 'Espuma HD 4"', 'espuma', 'planchas', 8, 4, 2, 1, 39, 'Estante A2', [['PED-0081', 2]], 0],
    [3, 'Espuma HD 1.5"', 'espuma', 'planchas', 5, 4, 2, 1, 18, 'Estante A3', [], 0],
    [4, 'Plumas (relleno)', 'relleno', 'kg', 3, 4, 1, 1, 18.5, 'Estante B1', [['PED-0082', 5]], 4],
    [5, 'Guata', 'relleno', 'yd', 8, 10, 6, 2, 3, 'Estante B2', [], 0],
    [6, 'Hilo nylon 40', 'insumo', 'conos', 10, 6, 4, 2, 6, 'Gaveta C1', [], 0],
    [7, 'Cierres 60 cm', 'insumo', 'u', 39, 15, 9, 2, 1.2, 'Gaveta C2', [['PED-0084', 6]], 0],
    [8, 'Grapas 71/10', 'insumo', 'cajas', 7, 8, 3, 2, 6, 'Gaveta C3', [], 10],
    [9, 'Botones forrables', 'insumo', 'u', 120, 50, 10, 2, 0.35, 'Gaveta C4', [['PED-0084', 24]], 0],
    [10, 'Pegamento de contacto', 'pegamento', 'gal', 3, 2, 1, 2, 18, 'Estante D1', [], 0],
    [11, 'Pegamento de madera', 'pegamento', 'gal', 2, 1, 0.25, 2, 20, 'Estante D1', [], 0],
  ] as const
).map(([id, nombre, categoria, unidad, fisico, minimo, consumoSemanal, p, precio, ubicacion, reservas, porLlegar]) => ({
  id, nombre, categoria, unidad, fisico, minimo, consumoSemanal, proveedor: PROV[p - 1]!.nombre, precio, ubicacion,
  reservas: reservas.map(([a, b]) => [a, b] as [string, number]), reservado: reservas.reduce((t, [, q]) => t + q, 0), porLlegar, llegaEl: porLlegar ? dia(3) : null,
}));
const MOVS: Movimiento[] = MATS.flatMap((m, i) => [
  { id: i * 2 + 1, fecha: new Date(Date.now() - 5 * 864e5).toISOString(), tipo: 'salida' as const, motivo: 'Retiro para un pedido', detalle: null, material: m.nombre, unidad: m.unidad, pedido: 'PED-0076', quien: 'Carlos', cantidad: -m.consumoSemanal, saldo: m.fisico },
  { id: i * 2 + 2, fecha: new Date(Date.now() - 35 * 864e5).toISOString(), tipo: 'entrada' as const, motivo: 'Compra recibida', detalle: m.proveedor, material: m.nombre, unidad: m.unidad, pedido: null, quien: 'Administrador', cantidad: m.fisico + m.consumoSemanal, saldo: m.fisico + m.consumoSemanal },
]);
const r2 = (n: number) => Math.round(n * 100) / 100;
function situacion(m: Mat): FilaStock {
  const disponible = r2(m.fisico - m.reservado);
  const estado: EstadoStock = m.porLlegar > 0 ? 'pedido' : disponible < 0 ? 'falta' : disponible < m.minimo ? 'bajo' : 'ok';
  const sem = m.consumoSemanal ? disponible / m.consumoSemanal : 99;
  const alcanza = disponible < 0 ? `Faltan ${-disponible} ${m.unidad}` : !m.consumoSemanal ? 'Sin consumo reciente' : sem >= 8 ? 'Más de 2 meses' : sem < 1.5 ? '~1 semana' : `~${Math.round(sem)} semanas`;
  const { reservas, precio: _p, ubicacion: _u, ...resto } = m;
  return { ...resto, disponible, estado, alcanza, reservadoPara: reservas.map(([c]) => c) };
}
const TELAS: Tela[] = [
  ['Lino Navy 204', 'Lino', 'Azul', '204', '4', '#1E2A4A', 'Libro Linos', 17, true, [['PED-0076', 'Laura Méndez', '12 yd · llegó']]],
  ['Pana Gris 318', 'Pana', 'Gris', '318', '2', '#6B7280', 'Libro Panas', 18, true, [['PED-0084', 'Hotel Willow', '22 yd · encargada · por llegar']]],
  ['Terciopelo Vino', 'Terciopelo', 'Rojo', '220', '9', '#6D1F3A', 'Libro Terciopelos', 21, true, [['PED-0086', 'Carla Ortiz', '6 yd · por encargar'], ['PED-0088', 'Mark Diaz', '3 yd · por encargar']]],
  ['Chenille Verde 52', 'Chenille', 'Verde', '52', '7', '#3F6B4E', 'Libro Chenille', 22, true, []],
  ['Estampado Floral', 'Estampado', 'Rojo', '760', '2', '#9C6B5B', 'Libro Prints', 25, false, []],
].map(([nombre, tipo, color, pattern, numeroColor, colorHex, libro, precio, enWeb, usos], i) => ({
  id: 100 + i, nombre, tipo, color, pattern, numeroColor, colorHex, libro, precio, enWeb, activa: true, fechaPrecio: dia(-60), proveedor: PROV[2]!,
  usos: (usos as string[][]).map(([pedido, cliente, detalle]) => ({ pedido: pedido!, cliente: cliente!, detalle: detalle! })),
})) as Tela[];

const simulada: InventarioApi = {
  opciones: async () => ({
    unidades: [['planchas', 'Plancha'], ['yd', 'Yarda (yd)'], ['m', 'Metro (m)'], ['kg', 'Kilogramo (kg)'], ['lb', 'Libra (lb)'], ['u', 'Unidad (u)'], ['cajas', 'Caja'], ['conos', 'Cono'], ['gal', 'Galón (gal)'], ['rollos', 'Rollo']].map(([valor, etiqueta]) => ({ valor: valor!, etiqueta: etiqueta! })),
    categorias: [['espuma', 'Espumas'], ['relleno', 'Rellenos'], ['insumo', 'Insumos pequeños'], ['pegamento', 'Pegamentos']].map(([valor, etiqueta]) => ({ valor: valor!, etiqueta: etiqueta! })),
    proveedores: PROV, tiposTela: ['Terciopelo', 'Chenille', 'Estampado', 'Lisa (plain)', 'Lino', 'Pana', 'Bouclé', 'Cuero sintético'], coloresTela: ['Azul', 'Gris', 'Beige', 'Verde', 'Café', 'Rojo', 'Negro', 'Blanco', 'Amarillo'],
  }),
  stock: async () => ({ materiales: MATS.map(situacion), porReponer: MATS.map(situacion).filter((m) => m.estado === 'bajo' || m.estado === 'falta').length, ultimoMovimiento: { fecha: ahora(), quien: 'Carlos', motivo: 'Retiro para un pedido', material: 'Espuma HD 2"', cantidad: -1, unidad: 'planchas', pedido: 'PED-0076' } }),
  material: async (id) => {
    const m = MATS.find((x) => x.id === id)!;
    const s = situacion(m);
    return { ...s, ubicacion: m.ubicacion, proveedor: PROV.find((p) => p.nombre === m.proveedor) ?? null, precio: m.precio, fechaPrecio: dia(-60), tieneMovimientos: true, movimientos: MOVS.filter((x) => x.material === m.nombre) };
  },
  crearMaterial: async (d) => {
    const m: Mat = { id: MATS.length + 1, nombre: d.nombre, categoria: d.categoria ?? 'insumo', unidad: d.unidad ?? 'u', proveedor: PROV.find((p) => p.id === d.proveedorId)?.nombre ?? null, fisico: 0, reservado: 0, minimo: d.minimo, consumoSemanal: 0, porLlegar: 0, llegaEl: null, reservas: [], precio: d.precio, ubicacion: d.ubicacion ?? '' };
    MATS.push(m);
    return simulada.material(m.id);
  },
  editarMaterial: async (id, d) => {
    const m = MATS.find((x) => x.id === id)!;
    Object.assign(m, { nombre: d.nombre, minimo: d.minimo, precio: d.precio, proveedor: PROV.find((p) => p.id === d.proveedorId)?.nombre ?? m.proveedor });
    return simulada.material(id);
  },
  telas: async () => ({ telas: structuredClone(TELAS), unidadTelas: 'yd' }),
  crearTela: async (d) => {
    const t: Tela = { id: 100 + TELAS.length, nombre: d.nombre || `${d.tipo} · Pattern ${d.pattern} · color ${d.numeroColor}`, tipo: d.tipo, color: d.color, pattern: d.pattern, numeroColor: d.numeroColor, colorHex: d.colorHex ?? '#8A8D93', libro: d.libro ?? null, precio: d.precio, enWeb: d.enWeb, activa: true, fechaPrecio: dia(0), proveedor: PROV[2]!, usos: [] };
    TELAS.push(t);
    return t;
  },
  editarTela: async (id, d) => {
    const t = TELAS.find((x) => x.id === id)!;
    Object.assign(t, { ...d, nombre: d.nombre || t.nombre });
    return t;
  },
  ofertaTela: async (id, activa) => {
    const t = TELAS.find((x) => x.id === id)!;
    t.activa = activa;
    return t;
  },
  proveedores: async () => ({
    proveedores: PROV.map((p, i) => ({
      id: p.id, nombre: p.nombre, canal: i === 2 ? 'telefono' : 'whatsapp', contacto: ['(973) 555-0110', '(908) 555-0177', '(201) 555-0142'][i]!, diasMin: [3, 4, 2][i]!, diasMax: [5, 6, 3][i]!, tarda: p.tarda, tipo: p.tipo, activo: true,
      pendiente: i === 2 ? '1 tela por encargar' : '1 por pedir',
      materiales: MATS.filter((m) => m.proveedor === p.nombre).map((m) => ({ id: m.id, nombre: m.nombre, precio: m.precio, unidad: m.unidad, estado: situacion(m).estado })),
      compras: [{ codigo: `OC-000${i + 1}`, estado: 'Llegó', fechaPedido: new Date(Date.now() - 38 * 864e5).toISOString(), fechaEstimada: dia(-35), fechaLlegada: new Date(Date.now() - 35 * 864e5).toISOString(), detalle: 'Compra inicial' }],
    })),
  }),
  crearProveedor: async () => ({ id: 99 }),
  editarProveedor: async (id) => ({ id }),
  reponer: async () => ({
    semanas: 2, unidadTelas: 'yd',
    telasParaEncargar: [{ materialId: 102, nombre: 'Terciopelo Vino', modelo: 'Pattern 220 · color 9', cantidad: 9, precio: 21, subtotal: 189, proveedor: { nombre: 'Proveedor de telas', tarda: '2–3 días' }, necesitaEl: dia(4), urgente: true, pedidos: [{ codigo: 'PED-0086', cantidad: 6 }, { codigo: 'PED-0088', cantidad: 3 }] }],
    porProveedor: [
      { id: 1, nombre: 'Proveedor de espumas', canal: 'WhatsApp', contacto: '(973) 555-0110', tarda: '3–5 días', lineas: [{ materialId: 1, nombre: 'Espuma HD 2"', unidad: 'planchas', precio: 24, sugerido: 6, calculo: 'Usa 6/sem × 2 semanas = 12 − disponible 6 = 6', razon: 'Se acaba en ~1 semana', urgente: false }] },
      { id: 2, nombre: 'Proveedor de insumos', canal: 'WhatsApp', contacto: '(908) 555-0177', tarda: '4–6 días', lineas: [{ materialId: 5, nombre: 'Guata', unidad: 'yd', precio: 3, sugerido: 4, calculo: 'Usa 6/sem × 2 semanas = 12 − disponible 8 = 4', razon: 'Se acaba en ~1 semana', urgente: false }] },
    ],
    sinProveedor: [],
    porLlegar: [
      { compraId: 6, codigo: 'OC-0006', nombre: 'Tela Pana Gris 318 · Pattern 318 · color 2', proveedor: 'Proveedor de telas', pedidoEl: new Date(Date.now() - 3 * 864e5).toISOString(), llegaEl: dia(0), cantidad: 22, unidad: 'yd', para: 'Encargada para PED-0084 · no entra al stock', esTela: true, tiempo: 'a_tiempo', necesitaEl: dia(1) },
      { compraId: 4, codigo: 'OC-0004', nombre: 'Plumas (relleno)', proveedor: 'Proveedor de espumas', pedidoEl: new Date(Date.now() - 2 * 864e5).toISOString(), llegaEl: dia(2), cantidad: 4, unidad: 'kg', para: 'Reposición del stock', esTela: false, tiempo: 'reposicion', necesitaEl: null },
    ],
  }),
  marcarPedido: async () => ({ codigo: 'OC-0007', llegaEl: dia(5) }),
  encargarTela: async () => ({ codigo: 'OC-0008', llegaEl: dia(3) }),
  llego: async (id) => ({ codigo: `OC-000${id}`, efectos: ['Se sumó al stock'] }),
  movimientos: async (f) => {
    const m = f.materialId ? MATS.find((x) => x.id === f.materialId) : null;
    const lista = MOVS.filter((x) => (!m || x.material === m.nombre) && (!f.tipo || x.tipo === f.tipo)).sort((a, b) => b.fecha.localeCompare(a.fecha));
    return { total: lista.length, movimientos: m ? lista : lista.slice(0, 30) };
  },
  corregir: async (c) => {
    const m = MATS.find((x) => x.id === c.materialId)!;
    const saldo = r2(m.fisico + (c.sentido === 'sale' ? -c.cantidad : c.cantidad));
    if (saldo < 0) throw new ApiError('No puede salir más de lo que hay en el estante.', 400, { cantidad: 'No puede salir más de lo que hay en el estante.' });
    m.fisico = saldo;
    MOVS.unshift({ id: MOVS.length + 1, fecha: ahora(), tipo: c.pedidoId ? (c.sentido === 'sale' ? 'salida' : 'entrada') : 'ajuste', motivo: c.motivo, detalle: c.otroMotivo ?? null, material: m.nombre, unidad: m.unidad, pedido: c.pedidoId ? 'PED-0076' : null, quien: 'Administrador', cantidad: c.sentido === 'sale' ? -c.cantidad : c.cantidad, saldo });
    return { saldo, unidad: m.unidad };
  },
  pedidosEnProceso: async (q) => ({
    pedidos: [[1, 'PED-0076', 'Laura Méndez', 'Sofá de 3 cuerpos', 'En producción'], [2, 'PED-0081', 'J. Ortega', 'Sofá + 3 cojines', 'En producción'], [3, 'PED-0084', 'Hotel Willow', '12 sillas', 'Esperando material']]
      .map(([id, codigo, cliente, descripcion, estado]) => ({ id: id as number, codigo: codigo as string, cliente: cliente as string, descripcion: descripcion as string, estado: estado as string }))
      .filter((p) => !q || `${p.codigo} ${p.cliente}`.toLowerCase().includes(q.toLowerCase())),
  }),
  listaConteo: async () => ({
    ultimoConteo: null, motivos: ['Se dañó', 'Uso sin anotar', 'Error al anotar', 'Otro'],
    grupos: [['espuma', 'Espumas'], ['relleno', 'Rellenos'], ['insumo', 'Insumos pequeños'], ['pegamento', 'Pegamentos']].map(([categoria, nombre]) => ({ categoria: categoria!, nombre: nombre!, materiales: MATS.filter((m) => m.categoria === categoria).map((m) => ({ id: m.id, nombre: m.nombre, unidad: m.unidad })) })),
  }),
  comparar: async (contados) => {
    const lineas = contados.map((c) => { const m = MATS.find((x) => x.id === c.materialId)!; return { materialId: m.id, nombre: m.nombre, unidad: m.unidad, sistema: m.fisico, contado: c.contado, diferencia: r2(c.contado - m.fisico) }; });
    return { total: lineas.length, diferencias: lineas.filter((l) => l.diferencia !== 0) };
  },
  guardarConteo: async (contados) => {
    const { diferencias } = await simulada.comparar(contados);
    for (const d of diferencias) MATS.find((x) => x.id === d.materialId)!.fisico = d.contado;
    return { contados: contados.length, coincidieron: contados.length - diferencias.length, ajustados: diferencias.length };
  },
};

export const inventarioApi: InventarioApi = API_URL ? http : simulada;
