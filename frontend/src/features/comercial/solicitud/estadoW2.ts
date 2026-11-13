// Estado del asistente W2 (CU-C01) y lo que se envía a la API. Las reglas de validación están en validacion.ts.
import { DIAS, MESES } from '../fechas';
import type { Catalogo, CodigoAcabado, CodigoServicio, DireccionEnvio, SolicitudEnvio, TelaApi, TipoMuebleApi } from './solicitudApi';

export type OpcionTelaW2 = SolicitudEnvio['tela'];

export interface MuebleW2 {
  uid: number;
  tipoId: number;
  servicio: CodigoServicio;
  acabado: CodigoAcabado;
  cantidad: number;
  medidas: string;
  archivos: File[];
  modoTela: 'una' | 'partes';
  /** "Una tela para todo": la tela elegida (una sola). */
  telas: number[];
  /** "Distintas telas por partes": id de la parte → id de la tela. */
  telaPorParte: Record<number, number>;
  parteActiva: number;
}

/** Dirección elegida: una guardada del cliente (su id) o una nueva escrita aquí. */
export interface DireccionW2 {
  guardadaId: number | null;
  texto: string;
  ubicacion: google.maps.LatLngLiteral | null;
  referencia: string;
  guardar: boolean;
}

export interface EstadoW2 {
  paso: number;
  muebles: MuebleW2[];
  activo: number;
  mismaTela: boolean;
  tela: OpcionTelaW2;
  familia: string;
  telaTraida: string;
  telaBusca: string;
  telaConocida: string;
  traslado: 'delivery' | 'propio';
  dir: DireccionW2;
  /** W2 · recojo preferido: día y hora elegidos en la cuadrícula (null hasta que elija). */
  recojo: { fecha: string; hora: string; hasta: string } | null;
}

let uid = 1;

export function nuevoMueble(c: Catalogo, codigo = 's3', servicio: CodigoServicio = 'retapizado_espuma'): MuebleW2 {
  const tipo = c.tiposMueble.find((t) => t.codigo === codigo) ?? c.tiposMueble[0]!;
  return {
    uid: uid++, tipoId: tipo.id, servicio, acabado: 'liso', cantidad: 1, medidas: '', archivos: [],
    modoTela: 'una', telas: c.telas[0] ? [c.telas[0].id] : [], telaPorParte: telasPorDefecto(tipo, c.telas), parteActiva: 0,
  };
}

/** Por partes: todas con la primera tela y el asiento con otra, para que se note la diferencia en el dibujo. */
export function telasPorDefecto(tipo: TipoMuebleApi, telas: TelaApi[]): Record<number, number> {
  const a = telas[0]?.id, b = (telas[3] ?? telas[0])?.id;
  return Object.fromEntries(tipo.partes.map((p, i) => [p.id, i === 1 ? b : a]).filter(([, t]) => t != null));
}

export const direccionVacia = (guardadaId: number | null): DireccionW2 => ({ guardadaId, texto: '', ubicacion: null, referencia: '', guardar: true });

export function estadoInicial(c: Catalogo, primeraGuardada: number | null): EstadoW2 {
  return {
    paso: 0, muebles: [nuevoMueble(c)], activo: 0, mismaTela: true, tela: 'local', familia: 'Todas',
    telaTraida: '', telaBusca: '', telaConocida: '',
    traslado: 'delivery', dir: direccionVacia(primeraGuardada), recojo: null,
  };
}

export const tipoDe = (c: Catalogo, m: MuebleW2) => c.tiposMueble.find((t) => t.id === m.tipoId)!;
export const servicioDe = (c: Catalogo, m: MuebleW2) => c.servicios.find((s) => s.codigo === m.servicio)!;
export const necesitaCita = (tela: OpcionTelaW2) => tela === 'local' || tela === 'domicilio';
/** "No lleva tela" solo si ningún mueble necesita tela nueva (solo espuma o estructura). */
export const sinTelaPosible = (c: Catalogo, e: EstadoW2) => e.muebles.every((m) => !servicioDe(c, m).requiereTela);
/** Todos los muebles son nuevos: no hay nada que recoger, solo entregar. */
export const todoFabricacion = (e: EstadoW2) => e.muebles.every((m) => m.servicio === 'fabricacion');
export const hayRecojo = (e: EstadoW2) => e.muebles.some((m) => m.servicio !== 'fabricacion');
/** Con la misma tela para varios muebles de distinto tipo no hay partes comunes: solo "una tela para todo". */
export const porPartesPosible = (e: EstadoW2) => e.muebles.length === 1 || !e.mismaTela;

export function pasosDe(e: EstadoW2) {
  if (e.tela === 'local') return ['Mueble y fotos', 'Tela', 'Cita en el local'];
  if (e.tela === 'domicilio') return ['Mueble y fotos', 'Tela', 'Visita a domicilio'];
  return ['Mueble y fotos', 'Tela', 'Traslado', 'Revisar y enviar'];
}

export const etiquetaMueble = (c: Catalogo, m: MuebleW2) => `${m.cantidad > 1 ? `${m.cantidad} × ` : ''}${tipoDe(c, m).nombre}`;
export const nombreServicio = (c: Catalogo, m: MuebleW2) => servicioDe(c, m).nombre.replace(' (desde una foto)', '');

/** El mueble cuyas telas se editan: con la misma tela, siempre el primero. */
export const muebleDeTela = (e: EstadoW2) => (e.mismaTela ? 0 : e.activo);

export function textoTelaW2(c: Catalogo, e: EstadoW2) {
  const m = e.muebles[muebleDeTela(e)]!;
  switch (e.tela) {
    case 'trae': return 'La trae el cliente';
    case 'local': return 'La elige en el local (cita)';
    case 'domicilio': return 'La elige en su casa (visita)';
    case 'sin': return 'No lleva tela';
    default: {
      if (m.modoTela === 'partes' && porPartesPosible(e)) {
        const n = new Set(Object.values(m.telaPorParte)).size;
        return `${n} ${n === 1 ? 'tela' : 'telas'} por partes`;
      }
      return c.telas.find((t) => t.id === m.telas[0])?.nombre ?? 'Elija una tela';
    }
  }
}

export function textoTraslado(e: EstadoW2) {
  if (e.tela === 'local') return 'Lo definimos en la cita';
  if (e.tela === 'domicilio') return 'Lo definimos en la visita';
  if (todoFabricacion(e)) return e.traslado === 'delivery' ? 'Entrega a domicilio' : 'Lo recojo en el taller';
  return e.traslado === 'delivery' ? 'Delivery (recojo y entrega)' : 'Lo llevo y lo recojo yo';
}

/** "mar 10 nov · 10:00–11:00" */
export const textoRecojo = (_c: Catalogo, e: EstadoW2) => {
  if (!e.recojo) return 'Elija el día y la hora';
  const [y, m, d] = e.recojo.fecha.split('-').map(Number);
  const f = new Date(y!, m! - 1, d!);
  return `${DIAS[f.getDay()]!.slice(0, 3)} ${d} ${MESES[m! - 1]!.slice(0, 3)} · ${e.recojo.hora}–${e.recojo.hasta}`;
};

export function direccionEnvio(d: DireccionW2): DireccionEnvio {
  if (d.guardadaId != null) return { tipo: 'guardada', id: d.guardadaId };
  return {
    tipo: 'nueva', texto: d.texto.trim(), referencia: d.referencia.trim() || undefined, guardar: d.guardar,
    ...(d.ubicacion ? { latitud: d.ubicacion.lat, longitud: d.ubicacion.lng } : {}),
  };
}

/**
 * Lo que se envía a POST /solicitudes. Solo viaja lo que corresponde a la opción elegida.
 * Con cita en el local o visita, va también el turno elegido en W3 / W3b (último paso).
 */
export function construirEnvio(c: Catalogo, e: EstadoW2, cita?: SolicitudEnvio['cita']): { datos: SolicitudEnvio; fotos: File[][] } {
  const catalogo = e.tela === 'catalogo';
  const base = e.muebles[0]!;
  const datos: SolicitudEnvio = {
    tela: e.tela,
    mismaTela: e.muebles.length === 1 || e.mismaTela,
    muebles: e.muebles.map((m) => {
      const fuente = e.mismaTela ? base : m;
      const partes = catalogo && fuente.modoTela === 'partes' && porPartesPosible(e);
      return {
        tipoMuebleId: m.tipoId,
        servicio: m.servicio,
        acabado: m.servicio === 'fabricacion' ? m.acabado : undefined,
        cantidad: m.cantidad,
        medidas: m.medidas.trim() || undefined,
        modoTela: catalogo ? (partes ? 'partes' : 'una') : undefined,
        telas: !catalogo ? [] : partes
          ? tipoDe(c, m).partes.map((p) => ({ materialId: m.telaPorParte[p.id]!, parteId: p.id }))
          : fuente.telas.slice(0, 1).map((materialId) => ({ materialId })),
      };
    }),
  };
  if (e.tela === 'trae') datos.telaDescripcion = e.telaTraida.trim() || undefined;
  if (necesitaCita(e.tela)) datos.telaDescripcion = e.telaBusca.trim() || undefined;
  if (catalogo) datos.telaConocida = e.telaConocida.trim() || undefined;
  if (necesitaCita(e.tela) && cita) datos.cita = cita;
  if (!necesitaCita(e.tela)) {
    datos.traslado = e.traslado;
    if (e.traslado === 'delivery') {
      datos.direccion = direccionEnvio(e.dir);
      if (hayRecojo(e)) {
        datos.fechaPrefRecojo = e.recojo?.fecha;
        datos.horaPrefRecojo = e.recojo?.hora;
      }
    }
  }
  return { datos, fotos: e.muebles.map((m) => m.archivos) };
}
