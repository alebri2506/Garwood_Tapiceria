import { API_URL, ApiError, apiFetch } from '../../../shared/api/http';

// CU-C01 · lo que el asistente W2 pide a la API y lo que devuelve al enviar.

export type CodigoServicio = 'retapizado' | 'retapizado_espuma' | 'espuma' | 'estructura' | 'fabricacion';
export type CodigoAcabado = 'liso' | 'capitoneado' | 'canales';

export interface TipoMuebleApi { id: number; codigo: string; nombre: string; partes: { id: number; nombre: string }[] }
export interface TelaApi { id: number; nombre: string; familia: string | null; pattern: string | null; numeroColor: string | null; colorHex: string | null; descripcion: string | null }

export interface Catalogo {
  tiposMueble: TipoMuebleApi[];
  servicios: { codigo: CodigoServicio; nombre: string; requiereTela: boolean }[];
  acabados: { codigo: CodigoAcabado; nombre: string; detalle: string }[];
  telas: TelaApi[];
  franjas: { codigo: 'manana' | 'tarde'; nombre: string }[];
  limites: { muebles: number; archivosPorMueble: number; diasRecojo: number; mbFoto: number; mbVideo: number; formatos: string[] };
}

export interface DireccionGuardada { id: number; etiqueta: string | null; direccion: string; referencia: string | null; ciudad: string | null; latitud: number | null; longitud: number | null }

export type DireccionEnvio =
  | { tipo: 'guardada'; id: number }
  | { tipo: 'nueva'; texto: string; referencia?: string; latitud?: number; longitud?: number; guardar: boolean };

export interface SolicitudEnvio {
  muebles: { tipoMuebleId: number; servicio: CodigoServicio; acabado?: CodigoAcabado; cantidad: number; medidas?: string; modoTela?: 'una' | 'partes'; telas: { materialId: number; parteId?: number }[] }[];
  tela: 'trae' | 'catalogo' | 'local' | 'domicilio' | 'sin';
  mismaTela: boolean;
  telaDescripcion?: string;
  telaConocida?: string;
  traslado?: 'delivery' | 'propio';
  direccion?: DireccionEnvio;
  fechaPrefRecojo?: string;
  franjaRecojo?: 'manana' | 'tarde';
  /** W3 / W3b: con cita en el local o visita, la solicitud se envía junto con el turno elegido. */
  cita?: { fecha: string; hora?: string; franja?: 'manana' | 'tarde'; direccion?: DireccionEnvio };
}

export interface SolicitudCreada { codigo: string; estado: string; siguiente: 'cita' | 'visita' | 'cotizacion'; cita: CitaDto | null }

export interface CitaDto {
  id: number;
  tipo: 'local' | 'domicilio';
  fecha: string;
  hora: string | null;
  franja: 'manana' | 'tarde' | null;
  duracionMin: number;
  estado: string;
  reprogramaciones: number;
  direccion?: string | null;
}

/** Lo que el cliente ve de su solicitud (W6c, W3): sin costos ni datos internos (RG-08). */
export interface SolicitudCliente {
  codigo: string;
  estado: string;
  fecha: string;
  canal: string;
  tela: SolicitudEnvio['tela'];
  telaDescripcion: string | null;
  telaConocida: string | null;
  esperaFotos: boolean;
  traslado: 'delivery' | 'propio' | null;
  direccion: string | null;
  fechaPrefRecojo: string | null;
  franjaRecojo: 'manana' | 'tarde' | null;
  motivoDescarte: string | null;
  cita: CitaDto | null;
  inasistencias: number;
  muebles: {
    orden: number; tipo: string; tipoCodigo: string; servicio: CodigoServicio; servicioNombre: string; acabado: CodigoAcabado | null;
    cantidad: number; medidas: string | null; modoTela: 'una' | 'partes' | null;
    telas: { id: number; nombre: string; pattern: string | null; numeroColor: string | null; colorHex: string | null; familia: string | null; parte: string | null }[];
    archivos: { id: number; tipo: 'foto' | 'video'; nombre: string; url: string | null }[];
  }[];
}

export interface SolicitudApi {
  catalogo(): Promise<Catalogo>;
  direcciones(): Promise<DireccionGuardada[]>;
  /** Las fotos de cada mueble van en el orden de `muebles`. */
  enviar(datos: SolicitudEnvio, fotos: File[][]): Promise<SolicitudCreada>;
  mias(): Promise<SolicitudCliente[]>;
  detalle(codigo: string): Promise<SolicitudCliente>;
  subirFotos(codigo: string, fotos: File[][]): Promise<SolicitudCliente>;
}

const formulario = (fotos: File[][], datos?: unknown) => {
  const fd = new FormData();
  if (datos) fd.append('datos', JSON.stringify(datos));
  fotos.forEach((archivos, i) => archivos.forEach((a) => fd.append(`mueble_${i}`, a, a.name)));
  return fd;
};

const httpSolicitudApi: SolicitudApi = {
  catalogo: () => apiFetch<Catalogo>('/solicitudes/catalogo'),
  direcciones: () => apiFetch<DireccionGuardada[]>('/solicitudes/direcciones'),
  enviar: (datos, fotos) => apiFetch<SolicitudCreada>('/solicitudes', { method: 'POST', body: formulario(fotos, datos) }),
  mias: () => apiFetch<SolicitudCliente[]>('/solicitudes'),
  detalle: (codigo) => apiFetch<SolicitudCliente>(`/solicitudes/${encodeURIComponent(codigo)}`),
  subirFotos: (codigo, fotos) => apiFetch<SolicitudCliente>(`/solicitudes/${encodeURIComponent(codigo)}/fotos`, { method: 'POST', body: formulario(fotos) }),
};

// ---------------------------------------------------------------- API simulada (sin VITE_API_URL), con los datos del diseño.
const PARTES: Record<string, string[]> = {
  s2: ['Respaldo', 'Asiento (cojines)', 'Brazo izquierdo', 'Brazo derecho', 'Base y faldón', 'Parte trasera'],
  s3: ['Respaldo', 'Asiento (cojines)', 'Brazo izquierdo', 'Brazo derecho', 'Base y faldón', 'Parte trasera'],
  sL: ['Respaldo', 'Asiento (cojines)', 'Chaise (extensión)', 'Brazo izquierdo', 'Brazo derecho', 'Base y faldón'],
  sc: ['Respaldo', 'Asiento (cojines)', 'Brazo izquierdo', 'Brazo derecho', 'Base y faldón', 'Parte trasera'],
  ar: ['Respaldo', 'Asiento', 'Brazo izquierdo', 'Brazo derecho', 'Base y faldón'],
  ch: ['Respaldo', 'Asiento'],
  hb: ['Frente', 'Bordes y ribete'],
  bed: ['Cabecera', 'Laterales y piecera', 'Faldón'],
  ot: ['Tapa (arriba)', 'Lados'],
  bn: ['Asiento', 'Lados'],
  bq: ['Respaldo', 'Asiento', 'Base (frente)'],
  wn: ['Cojín del asiento', 'Frente del cojín', 'Cojines del respaldo'],
  gen: ['Parte principal', 'Otra parte'],
};
const NOMBRES: [string, string][] = [
  ['s2', 'Sofá de 2 cuerpos'], ['s3', 'Sofá de 3 cuerpos'], ['sL', 'Sofá seccional (en L)'], ['sc', 'Sofá cama'], ['ar', 'Sillón'], ['ch', 'Silla de comedor'],
  ['hb', 'Cabecera de cama'], ['bed', 'Cama tapizada'], ['ot', 'Otomán o puf'], ['bn', 'Banco (bench)'], ['bq', 'Banqueta de restaurante'],
  ['wn', 'Cojín de ventana o asiento empotrado'], ['gen', 'Otro mueble de interior'],
];
let idParte = 100;
const CATALOGO_EJEMPLO: Catalogo = {
  tiposMueble: NOMBRES.map(([codigo, nombre], i) => ({ id: i + 1, codigo, nombre, partes: PARTES[codigo]!.map((p) => ({ id: idParte++, nombre: p })) })),
  servicios: [
    { codigo: 'retapizado', nombre: 'Retapizado completo', requiereTela: true },
    { codigo: 'retapizado_espuma', nombre: 'Retapizado + cambio de espuma', requiereTela: true },
    { codigo: 'espuma', nombre: 'Solo cambio de espuma', requiereTela: false },
    { codigo: 'estructura', nombre: 'Reparación de estructura', requiereTela: false },
    { codigo: 'fabricacion', nombre: 'Fabricación a medida (desde una foto)', requiereTela: true },
  ],
  acabados: [
    { codigo: 'liso', nombre: 'Liso', detalle: 'Tela lisa, sin costuras extra' },
    { codigo: 'capitoneado', nombre: 'Capitoneado', detalle: 'Con botones hundidos · más trabajo' },
    { codigo: 'canales', nombre: 'Con canales', detalle: 'Costuras en franjas · más trabajo' },
  ],
  telas: ([
    ['Lino Navy 204', 'Lino', '204', '4', '#1E2A4A', 'azul marino'], ['Lino Arena 110', 'Lino', '110', '11', '#CDBA96', 'arena'],
    ['Pana Gris 318', 'Pana', '318', '2', '#6B7280', 'gris'], ['Chenille Verde 52', 'Chenille', '52', '7', '#3F6B4E', 'verde bosque'],
    ['Chenille Marfil 12', 'Chenille', '12', '1', '#E7DFCF', 'marfil'], ['Cuero sint. Café', 'Cuero sint.', '640', '5', '#6B4226', 'café'],
    ['Terciopelo Vino', 'Terciopelo', '220', '9', '#6D1F3A', 'vino'], ['Terciopelo Mostaza', 'Terciopelo', '224', '3', '#B8860B', 'mostaza'],
    ['Estampado Floral', 'Estampado', '760', '2', '#9C6B5B', 'floral'],
  ] as const).map(([nombre, familia, pattern, numeroColor, colorHex, color], i) => ({ id: i + 1, nombre, familia, pattern, numeroColor, colorHex, descripcion: color })),
  franjas: [{ codigo: 'manana', nombre: 'Mañana · 9:00–12:00' }, { codigo: 'tarde', nombre: 'Tarde · 15:00–17:00' }],
  limites: { muebles: 8, archivosPorMueble: 10, diasRecojo: 60, mbFoto: 10, mbVideo: 50, formatos: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime', 'video/webm'] },
};
let siguienteCodigo = 88;
/** Solicitudes de la API simulada: las de ejemplo del diseño más las que se envían en esta visita. */
export const SOLICITUDES_SIMULADAS: SolicitudCliente[] = [];
const base = (codigo: string, cambio: Partial<SolicitudCliente>): SolicitudCliente => ({
  codigo, estado: 'Nueva', fecha: new Date().toISOString(), canal: 'web', tela: 'catalogo', telaDescripcion: null, telaConocida: null,
  esperaFotos: false, traslado: 'propio', direccion: null, fechaPrefRecojo: null, franjaRecojo: null, motivoDescarte: null,
  cita: null, inasistencias: 0,
  muebles: [{ orden: 1, tipo: 'Silla de comedor', tipoCodigo: 'ch', servicio: 'retapizado', servicioNombre: 'Retapizado completo', acabado: null, cantidad: 1, medidas: null, modoTela: 'una', telas: [], archivos: [] }],
  ...cambio,
});
SOLICITUDES_SIMULADAS.push(
  base('SOL-0090', {
    muebles: [{ orden: 1, tipo: 'Sofá de 3 cuerpos', tipoCodigo: 's3', servicio: 'retapizado', servicioNombre: 'Retapizado completo', acabado: null, cantidad: 1, medidas: null, modoTela: 'una',
      telas: [{ id: 7, nombre: 'Terciopelo Vino', pattern: '220', numeroColor: '9', colorHex: '#6D1F3A', familia: 'Terciopelo', parte: null }], archivos: [] }],
  }),
  base('SOL-0088', { muebles: [{ orden: 1, tipo: 'Silla de comedor', tipoCodigo: 'ch', servicio: 'retapizado', servicioNombre: 'Retapizado completo', acabado: null, cantidad: 6, medidas: null, modoTela: 'una', telas: [], archivos: [] }] }),
);
const buscar = (codigo: string) => {
  const s = SOLICITUDES_SIMULADAS.find((x) => x.codigo === codigo);
  if (!s) throw new ApiError('No encontramos esa solicitud.', 404);
  return s;
};
const mockSolicitudApi: SolicitudApi = {
  mias: async () => [...SOLICITUDES_SIMULADAS],
  detalle: async (codigo) => buscar(codigo),
  subirFotos: async (codigo, fotos) => {
    const s = buscar(codigo);
    s.esperaFotos = false;
    s.muebles.forEach((m, i) => { m.archivos = (fotos[i] ?? []).map((f, k) => ({ id: k, tipo: f.type.startsWith('video/') ? 'video' : 'foto', nombre: f.name, url: null })); });
    return s;
  },
  catalogo: async () => CATALOGO_EJEMPLO,
  direcciones: async () => [
    { id: 1, etiqueta: 'Casa', direccion: '48 Park St, Montclair, NJ 07042', referencia: null, ciudad: 'Montclair', latitud: 40.8223, longitud: -74.2146 },
    { id: 2, etiqueta: 'Oficina', direccion: '200 Bloomfield Ave, Montclair', referencia: null, ciudad: 'Montclair', latitud: 40.8137, longitud: -74.2203 },
  ],
  enviar: async (datos, fotos) => {
    await new Promise((r) => setTimeout(r, 400));
    if (fotos.some((f) => f.length === 0)) throw new ApiError('Suba al menos una foto.', 400);
    const cita = datos.tela === 'local' || datos.tela === 'domicilio';
    const c = datos.cita;
    const creada: SolicitudCreada = {
      codigo: `SOL-${String(siguienteCodigo++).padStart(4, '0')}`,
      estado: cita ? 'En espera de cita' : 'Nueva',
      siguiente: datos.tela === 'local' ? 'cita' : datos.tela === 'domicilio' ? 'visita' : 'cotizacion',
      cita: cita && c ? {
        id: siguienteCodigo, tipo: datos.tela === 'local' ? 'local' : 'domicilio', fecha: c.fecha, hora: c.hora ?? null, franja: c.franja ?? null,
        duracionMin: datos.tela === 'local' ? 30 : 60, estado: 'Programada', reprogramaciones: 0,
        direccion: c.direccion?.tipo === 'nueva' ? c.direccion.texto : c.direccion ? '48 Park St, Montclair, NJ 07042' : null,
      } : null,
    };
    const tipos = CATALOGO_EJEMPLO.tiposMueble;
    SOLICITUDES_SIMULADAS.unshift(base(creada.codigo, {
      estado: creada.estado, tela: datos.tela, telaDescripcion: datos.telaDescripcion ?? null, cita: creada.cita,
      muebles: datos.muebles.map((m, i) => ({
        orden: i + 1, tipo: tipos.find((t) => t.id === m.tipoMuebleId)?.nombre ?? 'Mueble', tipoCodigo: tipos.find((t) => t.id === m.tipoMuebleId)?.codigo ?? 'gen',
        servicio: m.servicio, servicioNombre: CATALOGO_EJEMPLO.servicios.find((x) => x.codigo === m.servicio)!.nombre, acabado: m.acabado ?? null,
        cantidad: m.cantidad, medidas: m.medidas ?? null, modoTela: m.modoTela ?? null, telas: [],
        archivos: (fotos[i] ?? []).map((f, k) => ({ id: k, tipo: f.type.startsWith('video/') ? 'video' : 'foto', nombre: f.name, url: null })),
      })),
    }));
    return creada;
  },
};

export const solicitudApi: SolicitudApi = API_URL ? httpSolicitudApi : mockSolicitudApi;
