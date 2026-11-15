import { TELAS, TIPOS_MUEBLE } from '../solicitud/datos';
import {
  ACTIVIDADES, ADELANTO, COSTOS, COSTO_YARDA, EXTRA_TELA_DIFICIL, FAMILIAS_DIFICILES, LLEVA_EXTRA, OBSERVACIONES,
  TRANSPORTE, YARDAS_UNA_TELA, type Actividad,
} from './datos';

export const PARTES = TIPOS_MUEBLE.find((t) => t.id === 'sofa3')!.partes.map((p) => p.nombre);

/** Lo que se va llenando durante la atención. En el sistema se guarda en la solicitud a cada paso. */
/** local: cita en el taller · domicilio: visita en la casa del cliente (A2b · decisiones L). */
export type Lugar = 'local' | 'domicilio';
/** Recojo elegido al final, con el cliente: día (aaaa-mm-dd) y hora de inicio. */
export interface RecojoElegido { fecha: string; hora: string }

export interface Atencion {
  lugar: Lugar;
  /** Adelanto sugerido según el historial (CU-C11): 40 % sin pedidos cerrados, 0 % con al menos uno. */
  adelantoPct: number;
  paso: number;
  adjunto: number;
  extra: boolean;
  medidas: { ancho: string; fondo: string; alto: string };
  fotos: File[];
  modo: 'una' | 'partes';
  parteActiva: number;
  telaPorParte: number[];
  yardasPorParte: number[];
  telaUna: number;
  yardasUna: number;
  traslado: 'delivery' | 'propio';
  direccionId: string;
  usarDireccionNueva: boolean;
  direccionNueva: string;
  ubicacionNueva: google.maps.LatLngLiteral | null;
  referencia: string;
  guardarDireccion: boolean;
  actividades: Actividad[];
  observaciones: string;
  /** null = sigue al sugerido mientras no se edite. */
  propuesto: number | null;
  motivoPrecio: string;
  respuesta: 0 | 1 | 2;
  /** El cliente acepta: paga el adelanto ahora o después (desde su cuenta o en el local). */
  pagaAhora: boolean;
  metodo: number;
  motivoRechazo: number;
  resultado: null | 'pagado' | 'despues' | 'publicada' | 'rechazo';
  /** Último paso (decisiones L): agendar el recojo con el cliente o llevárselo en la visita (solo a domicilio). */
  recojo: 'agendar' | 'llevar';
  recojoElegido: RecojoElegido | null;
  recojoHecho: null | 'agendado' | 'llevado';
}

export type CambioAtencion = Partial<Atencion>;

export const atencionInicial = (lugar: Lugar = 'local', conHistorial = false): Atencion => ({
  lugar, adelantoPct: conHistorial ? 0 : ADELANTO,
  paso: 0, adjunto: 0, extra: false, medidas: { ancho: '', fondo: '', alto: '' }, fotos: [],
  modo: 'partes', parteActiva: 0, telaPorParte: [0, 3, 0, 0, 0, 0], yardasPorParte: [5, 4, 2, 2, 3, 2], telaUna: 0, yardasUna: YARDAS_UNA_TELA,
  traslado: 'delivery', direccionId: 'casa', usarDireccionNueva: false, direccionNueva: '', ubicacionNueva: null, referencia: '', guardarDireccion: true,
  actividades: ACTIVIDADES.map((a) => ({ ...a, materiales: [...a.materiales] })), observaciones: OBSERVACIONES,
  propuesto: null, motivoPrecio: '',
  respuesta: 0, pagaAhora: true, metodo: 0, motivoRechazo: -1, resultado: null,
  recojo: 'agendar', recojoElegido: null, recojoHecho: null,
});

/** Telas usadas con sus yardas, horas (con el extra por tela difícil) y el precio sugerido. */
export function calcular(a: Atencion) {
  const usadas = a.modo === 'partes' ? [...new Set(a.telaPorParte)] : [a.telaUna];
  const yardasDe = (id: number) => (a.modo === 'partes'
    ? a.telaPorParte.reduce((t, f, k) => t + (f === id ? a.yardasPorParte[k]! : 0), 0)
    : a.yardasUna);
  const telas = usadas.map((id) => ({ tela: TELAS[id]!, yardas: yardasDe(id) }));
  const costoTelas = telas.reduce((t, x) => t + x.yardas * COSTO_YARDA[x.tela.id]!, 0);
  const dificiles = telas.filter((x) => FAMILIAS_DIFICILES.includes(x.tela.familia)).map((x) => x.tela.nombre);
  const extraDe = (act: Actividad) => (dificiles.length && !act.manual && LLEVA_EXTRA.test(act.nombre) ? Math.round(act.horas * EXTRA_TELA_DIFICIL * 10) / 10 : 0);
  const horas = Math.round(a.actividades.reduce((t, x) => t + x.horas + extraDe(x), 0) * 10) / 10;

  const materiales = Math.round(COSTOS.otrosMateriales + costoTelas);
  const mano = Math.round(horas * COSTOS.tarifaHora);
  const costos = materiales + mano + COSTOS.maquinaria + COSTOS.fijos;
  const margen = Math.round(costos * COSTOS.margen);
  const sugerido = costos + margen;
  const propuesto = a.propuesto ?? sugerido;
  const transporte = a.traslado === 'delivery' ? TRANSPORTE.costo : 0;
  const total = propuesto + transporte;

  return {
    telas, dificiles, extraDe, horas, sugerido, propuesto, transporte, total,
    adelanto: Math.round(total * a.adelantoPct),
    yardasTotal: telas.reduce((t, x) => t + x.yardas, 0),
    desglose: [
      { label: 'Margen', value: margen },
      { label: 'Materiales', value: materiales },
      { label: 'Mano de obra', value: mano },
      { label: 'Maquinaria', value: COSTOS.maquinaria },
      { label: 'Costos fijos', value: COSTOS.fijos },
    ],
  };
}

export type Calculo = ReturnType<typeof calcular>;

export const dolares = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;
