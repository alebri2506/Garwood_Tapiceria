// A4 Armar cotización (CU-C07 transporte, C08 armar y precio, C11 adelanto) · decisiones K.
// Una cotización por solicitud, con todos sus muebles. Toda escritura queda en la bitácora (RG-02); el cliente nunca ve
// el precio sugerido ni el desglose (RG-08); tarifas, margen, adelanto y vigencia salen de Parámetros (RG-04).
import { Prisma } from '@prisma/client';
import { prisma, type Db } from '../../../shared/infrastructure/prisma.js';
import { parametroNumero, parametroTexto } from '../../../shared/infrastructure/parametros.js';
import { registrarBitacora } from '../../../shared/infrastructure/bitacora.js';
import { avisoAlCliente, enviarCorreos, guardarAvisos } from '../../../shared/infrastructure/avisos.js';
import type { AlmacenArchivos } from '../../../shared/infrastructure/archivos.js';
import type { Correo } from '../../../shared/infrastructure/correo.js';
import type { Rutas } from '../../../shared/infrastructure/rutas.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import { hoyNegocio, leerFecha } from '../domain/calendario.js';
import { sumarDias } from '../domain/agenda.js';
import { SERVICIOS } from '../domain/solicitud.js';
import {
  adelantoSugeridoPct, cargaDe, codigoCotizacion, costearMueble, dinero, montoDePct, revisarAdelanto, transporteDe,
  type TamanoCarga,
} from '../domain/cotizacion.js';

interface Quien { usuarioId: number; ip?: string }
const error = (m: string, status = 400, errores?: Record<string, string>) => new ReglaNegocioError(m, status, errores);
const num = (d: { toString(): string } | null | undefined) => (d == null ? 0 : Number(d.toString()));
const D = (n: number) => new Prisma.Decimal(Math.round(n * 100) / 100);
const SEGUNDOS_ENLACE = 3600;
/** Solo se arma una cotización de una solicitud que está por cotizar (CU-C02, A3 «Por cotizar»). */
// «En atención»: la cita o la visita está en curso y la cotización se arma ahí (decisiones L.2.10).
const COTIZABLES = ['Nueva', 'En atención', 'Atendida'];

const nombreCliente = (c: { tipoPersona: string; razonSocial: string | null; nombres: string; apellidos: string }) =>
  c.tipoPersona === 'empresa' && c.razonSocial ? c.razonSocial : `${c.nombres} ${c.apellidos}`.trim();
const nombreServicio = (codigo: string) => SERVICIOS.find((s) => s.codigo === codigo)?.nombre.replace(' (desde una foto)', '') ?? codigo;
const requiereTela = (codigo: string) => SERVICIOS.find((s) => s.codigo === codigo)?.requiereTela ?? true;

// ---------------------------------------------------------------- Entrada (lo que guarda la pantalla)
export interface ActividadEntrada { nombre: string; horasPersona: number; maquinaId: number | null; horasMaquina: number; materiales: { materialId: number; cantidad: number }[] }
export interface MuebleEntrada {
  solicitudMuebleId: number; actividades: ActividadEntrada[]; telas: { materialId: number; yardas: number }[]; propuesto: number; motivo?: string; revisado: boolean;
  /** Cita o visita con «distintas telas por partes» (como en W2): la tela de cada parte. Las yardas van por tela en `telas`. */
  partes?: { parteId: number; materialId: number }[];
}
export interface CotizacionEntrada {
  muebles: MuebleEntrada[];
  transporte: { manual: boolean; monto?: number; motivo?: string };
  /** null: el adelanto sugerido. */
  adelanto: number | null;
  observaciones: string;
}

// ---------------------------------------------------------------- Lo que se lee de la base
const incluirSolicitud = {
  cliente: true,
  direccion: true,
  muebles: {
    orderBy: { orden: 'asc' as const },
    include: { tipoMueble: true, telas: { orderBy: { orden: 'asc' as const }, include: { material: true, parte: true } }, adjuntos: { orderBy: { id: 'asc' as const } } },
  },
} satisfies Prisma.SolicitudInclude;
export type SolicitudCompleta = Prisma.SolicitudGetPayload<{ include: typeof incluirSolicitud }>;
type MuebleSolicitud = SolicitudCompleta['muebles'][number];

const incluirCotizacion = {
  creador: true,
  publicador: true,
  muebles: {
    include: {
      plantilla: { include: { tipoMueble: true } },
      telas: { include: { material: true } },
      actividades: { orderBy: { orden: 'asc' as const }, include: { maquinaRef: true, materiales: { orderBy: { id: 'asc' as const }, include: { material: true } } } },
    },
  },
} satisfies Prisma.CotizacionInclude;
type CotizacionCompleta = Prisma.CotizacionGetPayload<{ include: typeof incluirCotizacion }>;

/** RG-04: todo lo que usa el cálculo sale de Parámetros. */
async function parametrosCotizacion(db: Db = prisma) {
  const n = (clave: string) => parametroNumero(db, clave);
  const [tarifaHora, costosFijos, margenPct, porMilla, chica, mediana, grande, sinHistorial, conHistorial, vigenciaDias, taller, maxAdelanto] = await Promise.all([
    n('tarifa.hora_persona'), n('tarifa.costos_fijos_pedido'), n('cotizacion.margen_pct'), n('transporte.por_milla'),
    n('transporte.carga_chica'), n('transporte.carga_mediana'), n('transporte.carga_grande'),
    n('pago.adelanto_sin_historial_pct'), n('pago.adelanto_con_historial_pct'), n('cotizacion.vigencia_dias'),
    parametroTexto(db, 'taller.direccion'),
    db.parametro.findUnique({ where: { clave: 'pago.adelanto_sin_historial_pct' } }),
  ]);
  return {
    costos: { tarifaHora, costosFijos, margenPct },
    porMilla, tarifasCarga: { chica, mediana, grande } as Record<TamanoCarga, number>,
    adelanto: { sinHistorial, conHistorial, maxPct: maxAdelanto?.maximo != null ? Number(maxAdelanto.maximo) : 50 },
    vigenciaDias, taller,
  };
}
type ParametrosCot = Awaited<ReturnType<typeof parametrosCotizacion>>;

/**
 * La tela de cada mueble según lo que eligió el cliente (decisiones K):
 *  - servicio sin tela o «sin tela» → no lleva · la trae el cliente → la brinda él ($0)
 *  - catálogo en línea → las que eligió (el taller solo escribe las yardas)
 *  - cita en el local o visita → se elige ahí, del muestrario (`eligeAqui`): viaja en el borrador de la cotización.
 */
type TelaElegida = { materialId: number; material: { nombre: string; precio: Prisma.Decimal | null; activo: boolean } };
export const eligeEnCita = (telaOpcion: string) => telaOpcion === 'local' || telaOpcion === 'domicilio';
function telaDe(s: SolicitudCompleta, m: MuebleSolicitud, elegidas: TelaElegida[] = []): { tipo: 'no' | 'cliente' | 'taller' | 'pendiente'; nota: string; telas: TelaElegida[]; eligeAqui: boolean } {
  if (!requiereTela(m.servicio) || s.telaOpcion === 'sin') return { tipo: 'no', nota: 'Este trabajo no lleva tela', telas: [], eligeAqui: false };
  if (s.telaOpcion === 'trae') return { tipo: 'cliente', nota: 'Lo brinda el cliente', telas: [], eligeAqui: false };
  if (s.telaOpcion === 'catalogo') {
    // «Misma tela para todos»: si este mueble no guardó la suya, usa la del primero que la tiene.
    const telas = m.telas.length ? m.telas : s.mismaTela ? (s.muebles.find((x) => x.telas.length)?.telas ?? []) : [];
    // Una sola fila por tela (con «distintas telas por partes» la misma tela puede repetirse en dos partes).
    const unicas = telas.filter((t, i) => telas.findIndex((x) => x.materialId === t.materialId) === i);
    return unicas.length ? { tipo: 'taller', nota: 'La eligió el cliente en línea · la pone el taller', telas: unicas, eligeAqui: false } : { tipo: 'pendiente', nota: 'El cliente no eligió la tela', telas: [], eligeAqui: false };
  }
  const donde = s.telaOpcion === 'domicilio' ? 'en la visita a domicilio' : 'en la cita en el local';
  return elegidas.length
    ? { tipo: 'taller', nota: `La eligió ${donde} · la pone el taller`, telas: elegidas, eligeAqui: true }
    : { tipo: 'pendiente', nota: `Se elige ${donde}`, telas: [], eligeAqui: true };
}

/** El muestrario (A15b) para elegir la tela en la cita o la visita: telas activas con su precio. */
async function muestrario() {
  const telas = await prisma.material.findMany({ where: { categoria: 'tela', activo: true }, orderBy: [{ familia: 'asc' }, { nombre: 'asc' }] });
  return telas.map((t) => ({ id: t.id, nombre: t.nombre, familia: t.familia, colorHex: t.colorHex, libro: t.libro, precio: t.precio == null ? null : num(t.precio) }));
}

export async function cargarSolicitud(codigo: string) {
  const s = await prisma.solicitud.findUnique({ where: { codigo }, include: incluirSolicitud });
  if (!s) throw error('No encontramos esa solicitud.', 404);
  return s;
}

/** Catálogo para agregar actividades y materiales: máquinas y materiales de stock activos, con su precio de hoy. */
async function catalogo() {
  const [maquinas, materiales] = await Promise.all([
    prisma.maquina.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
    prisma.material.findMany({ where: { activo: true, categoria: { not: 'tela' } }, orderBy: { nombre: 'asc' } }),
  ]);
  return {
    maquinas: maquinas.map((m) => ({ id: m.id, nombre: m.nombre, tarifaHora: num(m.tarifaHora) })),
    materiales: materiales.map((m) => ({ id: m.id, nombre: m.nombre, unidad: m.unidadMedida, precio: num(m.precio) })),
  };
}

// ---------------------------------------------------------------- Transporte (CU-C07)
async function transporteDeSolicitud(s: SolicitudCompleta, p: ParametrosCot, rutas: Rutas, guardado?: { millas: number | null; manual: boolean; monto: number; motivo: string | null }, recalcular = true) {
  const tamanos = s.muebles.map((m) => m.tipoMueble.tamanoCarga as TamanoCarga);
  const carga = cargaDe(tamanos, p.tarifasCarga);
  const cargaTexto = s.muebles.map((m) => `${m.tipoMueble.nombre.toLowerCase()} (${m.tipoMueble.tamanoCarga})`).join(' + ');
  const base = { porMilla: p.porMilla, carga, cargaTexto, origen: p.taller };
  if (s.traslado !== 'delivery') {
    return { ...base, aplica: false, porDefinir: s.traslado == null, direccion: null, millas: null, distancia: null, calculado: null, manual: false, monto: 0, motivo: '' };
  }
  let millas = guardado?.millas ?? null;
  if (millas == null && recalcular && s.direccion) {
    millas = await rutas.millas({ texto: p.taller }, { texto: s.direccion.direccion, latitud: s.direccion.latitud ? num(s.direccion.latitud) : null, longitud: s.direccion.longitud ? num(s.direccion.longitud) : null });
  }
  const t = millas != null ? transporteDe(millas, p.porMilla, carga) : null;
  const manual = guardado?.manual ?? false;
  return {
    ...base, aplica: true, porDefinir: false, direccion: s.direccion?.direccion ?? null,
    millas, distancia: t?.distancia ?? null, calculado: t?.total ?? null,
    manual, monto: manual ? guardado!.monto : (t?.total ?? 0), motivo: guardado?.motivo ?? '',
  };
}

// ---------------------------------------------------------------- Armar (GET): el borrador guardado o una propuesta nueva
async function muebleDesdePlantilla(s: SolicitudCompleta, m: MuebleSolicitud, i: number) {
  const plantilla = await prisma.plantilla.findFirst({
    where: { tipoMuebleId: m.tipoMuebleId, servicio: m.servicio, activa: true },
    include: { actividades: { orderBy: { orden: 'asc' }, include: { maquina: true, materiales: { orderBy: { id: 'asc' }, include: { material: true } } } } },
  });
  const tela = telaDe(s, m);
  return {
    plantilla: plantilla ? { id: plantilla.id, nombre: `${m.tipoMueble.nombre} · ${nombreServicio(m.servicio)} (v${plantilla.version})` } : null,
    actividades: (plantilla?.actividades ?? []).map((a) => ({
      nombre: a.nombre, horasPersona: num(a.horasPersona), maquinaId: a.maquinaId, maquina: a.maquina?.nombre ?? null,
      tarifaMaquina: a.maquina ? num(a.maquina.tarifaHora) : 0, horasMaquina: num(a.horasMaquina),
      materiales: a.materiales.map((x) => ({ materialId: x.materialId, nombre: x.material.nombre, unidad: x.material.unidadMedida, precio: num(x.material.precio), cantidad: num(x.cantidad) })),
    })),
    telas: tela.telas.map((t) => ({ materialId: t.materialId, nombre: t.material.nombre, precio: t.material.precio == null ? null : num(t.material.precio), yardas: 0, activa: t.material.activo })),
    propuesto: 0, motivo: '', revisado: i === 0,
  };
}

/** El mueble de una cotización ya publicada: con los precios congelados al publicar. */
function muebleGuardado(c: CotizacionCompleta['muebles'][number]) {
  return {
    plantilla: c.plantilla ? { id: c.plantilla.id, nombre: `${c.plantilla.tipoMueble.nombre} · ${nombreServicio(c.plantilla.servicio)} (v${c.plantilla.version})` } : null,
    actividades: c.actividades.map((a) => ({
      nombre: a.nombre, horasPersona: num(a.horasPersona), maquinaId: a.maquinaId, maquina: a.maquina, tarifaMaquina: num(a.tarifaMaquina), horasMaquina: num(a.horasMaquina),
      materiales: a.materiales.map((x) => ({ materialId: x.materialId, nombre: x.material.nombre, unidad: x.material.unidadMedida, precio: num(x.precio), cantidad: num(x.cantidad) })),
    })),
    telas: c.telas.map((t) => ({ materialId: t.materialId, nombre: t.material.nombre, precio: num(t.precio), yardas: num(t.yardas), activa: t.material.activo })),
    propuesto: num(c.precioPropuesto), motivo: c.motivoPrecio ?? '', revisado: c.revisado,
  };
}

type Busqueda = { maquinas: Map<number, { nombre: string; tarifaHora: Prisma.Decimal; activo: boolean }>; materiales: Map<number, { nombre: string; unidadMedida: string; precio: Prisma.Decimal | null; activo: boolean }> };
/** Lo que el borrador necesita leer del Inventario y de las máquinas para mostrarse con los precios de HOY. */
async function buscarParaBorrador(e: CotizacionEntrada): Promise<Busqueda> {
  const idsMaq = [...new Set(e.muebles.flatMap((m) => m.actividades.map((a) => a.maquinaId)).filter((x): x is number => x != null))];
  const idsMat = [...new Set([...e.muebles.flatMap((m) => m.actividades.flatMap((a) => a.materiales.map((x) => x.materialId))), ...e.muebles.flatMap((m) => m.telas.map((t) => t.materialId))])];
  const [maquinas, materiales] = await Promise.all([
    prisma.maquina.findMany({ where: { id: { in: idsMaq } } }),
    prisma.material.findMany({ where: { id: { in: idsMat } } }),
  ]);
  return { maquinas: new Map(maquinas.map((m) => [m.id, m])), materiales: new Map(materiales.map((m) => [m.id, m])) };
}

/** El mueble de un borrador guardado, con los precios de HOY (todavía no se congelan). */
async function muebleDeBorrador(s: SolicitudCompleta, m: MuebleSolicitud, e: MuebleEntrada, b: Busqueda) {
  const { plantilla } = await muebleDesdePlantilla(s, m, 0);
  const elegidas = eligeEnCita(s.telaOpcion)
    ? e.telas.map((t) => ({ materialId: t.materialId, material: b.materiales.get(t.materialId) ?? { nombre: 'Tela', precio: null, activo: false } }))
    : [];
  const tela = telaDe(s, m, elegidas);
  return {
    plantilla,
    actividades: e.actividades.map((a) => {
      const maq = a.maquinaId != null ? b.maquinas.get(a.maquinaId) : undefined;
      return {
        nombre: a.nombre, horasPersona: a.horasPersona, maquinaId: a.maquinaId, maquina: maq?.nombre ?? null, tarifaMaquina: num(maq?.tarifaHora), horasMaquina: a.horasMaquina,
        materiales: a.materiales.map((x) => {
          const mat = b.materiales.get(x.materialId);
          return { materialId: x.materialId, nombre: mat?.nombre ?? 'Material', unidad: mat?.unidadMedida ?? '', precio: num(mat?.precio), cantidad: x.cantidad };
        }),
      };
    }),
    // Las telas son las que eligió el cliente (en línea, o en la cita o la visita); del borrador vienen las yardas.
    telas: tela.telas.map((t) => ({
      materialId: t.materialId, nombre: t.material.nombre, precio: t.material.precio == null ? null : num(t.material.precio),
      yardas: e.telas.find((x) => x.materialId === t.materialId)?.yardas ?? 0, activa: t.material.activo,
    })),
    propuesto: e.propuesto, motivo: e.motivo ?? '', revisado: e.revisado,
  };
}

export async function armarCotizacion(codigoSolicitud: string, almacen: AlmacenArchivos, rutas: Rutas) {
  const s = await cargarSolicitud(codigoSolicitud);
  const [p, cot, cerrados, cat] = await Promise.all([
    parametrosCotizacion(),
    prisma.cotizacion.findFirst({ where: { solicitudId: s.id }, orderBy: { version: 'desc' }, include: incluirCotizacion }),
    prisma.pedido.count({ where: { clienteId: s.clienteId, estado: 'Cerrado' } }),
    catalogo(),
  ]);
  const editable = !cot || cot.estado === 'Borrador';
  if (!cot && !COTIZABLES.includes(s.estado)) {
    throw error(s.estado === 'En espera de cita' ? 'Esta solicitud espera su cita o visita: se cotiza después de atenderla.' : `Esta solicitud está «${s.estado}»: ya no se puede cotizar.`, 409);
  }

  const borrador = editable && cot?.borrador ? (cot.borrador as unknown as CotizacionEntrada) : null;
  const busqueda = borrador ? await buscarParaBorrador(borrador) : null;
  const partesTipo = await prisma.tipoMuebleParte.findMany({ where: { tipoMuebleId: { in: s.muebles.map((m) => m.tipoMuebleId) } }, orderBy: { orden: 'asc' } });
  const muebles = await Promise.all(s.muebles.map(async (m, i) => {
    const publicado = !editable ? cot?.muebles.find((x) => x.solicitudMuebleId === m.id) : undefined;
    const enBorrador = borrador?.muebles.find((x) => x.solicitudMuebleId === m.id);
    const datos = publicado ? muebleGuardado(publicado)
      : enBorrador ? await muebleDeBorrador(s, m, enBorrador, busqueda!)
        : await muebleDesdePlantilla(s, m, i);
    const tela = telaDe(s, m, datos.telas.map((t) => ({ materialId: t.materialId, material: { nombre: t.nombre, precio: t.precio == null ? null : new Prisma.Decimal(t.precio), activo: t.activa } })));
    return {
      solicitudMuebleId: m.id, orden: m.orden, clave: `Mueble ${i + 1}`,
      titulo: `${m.cantidad > 1 ? `${m.cantidad} × ` : ''}${m.tipoMueble.nombre}`, corto: m.tipoMueble.nombre.toLowerCase(),
      servicio: m.servicio, servicioNombre: nombreServicio(m.servicio), cantidad: m.cantidad, medidas: m.medidas, acabado: m.acabado,
      tamanoCarga: m.tipoMueble.tamanoCarga,
      tela: { tipo: tela.tipo, nota: tela.nota, eligeAqui: tela.eligeAqui, telas: datos.telas },
      // Para «una tela para todo / distintas telas por partes» en la cita o la visita (el mismo dibujo que W2).
      tipoCodigo: m.tipoMueble.codigo,
      partesMueble: partesTipo.filter((x) => x.tipoMuebleId === m.tipoMuebleId).map((x) => ({ id: x.id, nombre: x.nombre })),
      partes: enBorrador?.partes ?? m.telas.filter((t) => t.parteId != null).map((t) => ({ parteId: t.parteId!, materialId: t.materialId })),
      medios: await Promise.all(m.adjuntos.map(async (a) => ({ nombre: a.nombreOriginal, tipo: a.tipo, url: await almacen.urlTemporal(a.ruta, SEGUNDOS_ENLACE).catch(() => null) }))),
      ...datos,
    };
  }));

  const pct = cot ? num(cot.adelantoPctSugerido) : adelantoSugeridoPct(cerrados, p.adelanto);
  return {
    solicitud: { codigo: s.codigo!, estado: s.estado, fecha: s.fechaSolicitud, esperaFotos: s.esperaFotos },
    cotizacion: {
      codigo: cot?.codigo ?? null, estado: cot?.estado ?? 'Borrador', editable,
      vigenciaHasta: cot?.vigenciaHasta?.toISOString().slice(0, 10) ?? null,
      fechaModificacion: cot?.fechaModificacion ?? null, editadoPor: cot ? (cot.publicador ?? cot.creador).nombre ?? (cot.publicador ?? cot.creador).nombreUsuario : null,
      fechaPublicacion: cot?.fechaPublicacion ?? null, total: cot ? num(cot.total) : null,
    },
    cliente: {
      nombre: nombreCliente(s.cliente), ciudad: s.direccion?.ciudad ?? null, pedidosCerrados: cerrados,
      historial: cerrados > 0 ? `${cerrados} ${cerrados === 1 ? 'pedido cerrado' : 'pedidos cerrados'}` : 'sin pedidos cerrados',
    },
    muebles,
    transporte: await transporteDeSolicitud(s, p,  rutas, cot ? { millas: cot.millas == null ? null : num(cot.millas), manual: cot.transporteManual, monto: num(cot.transporte), motivo: cot.motivoTransporte } : undefined, editable),
    condiciones: {
      vigenciaDias: p.vigenciaDias, adelantoPct: pct, adelantoMaxPct: p.adelanto.maxPct,
      adelanto: cot?.adelantoModificado ? num(cot.adelanto) : null,
      razon: cerrados > 0 ? 'con pedidos cerrados' : 'sin pedidos cerrados',
    },
    observaciones: cot?.observaciones ?? '',
    costos: p.costos,
    catalogo: cat,
    // En la cita o la visita la tela se elige del muestrario.
    muestrario: eligeEnCita(s.telaOpcion) ? await muestrario() : [],
  };
}

// ---------------------------------------------------------------- Guardar y publicar
export interface Calculo {
  muebles: {
    entrada: MuebleEntrada; plantillaId: number | null;
    actividades: (ActividadEntrada & { maquina: string | null; tarifaMaquina: number; materialesConPrecio: { materialId: number; cantidad: number; precio: number }[] })[];
    telas: { materialId: number; yardas: number; precio: number }[];
    costeo: ReturnType<typeof costearMueble>;
  }[];
  transporte: number; millas: number | null; manual: boolean; motivoTransporte: string | null;
  total: number; adelanto: number; adelantoModificado: boolean; adelantoPct: number;
}

/** Revisa la entrada contra la solicitud y el Inventario, y calcula todo en el servidor (los precios no vienen del navegador). */
export async function calcular(s: SolicitudCompleta, e: CotizacionEntrada, p: ParametrosCot, rutas: Rutas, previo: { millas: number | null } | null, pedidosCerrados: number, publicar: boolean): Promise<Calculo> {
  const errores: Record<string, string> = {};
  const ids = s.muebles.map((m) => m.id);
  if (e.muebles.length !== ids.length || !ids.every((id) => e.muebles.some((m) => m.solicitudMuebleId === id))) {
    throw error('La cotización tiene que traer todos los muebles de la solicitud. Recargue la página.', 409);
  }
  const idsMaq = [...new Set(e.muebles.flatMap((m) => m.actividades.map((a) => a.maquinaId)).filter((x): x is number => x != null))];
  const idsMat = [...new Set(e.muebles.flatMap((m) => m.actividades.flatMap((a) => a.materiales.map((x) => x.materialId))))];
  const idsTela = [...new Set(e.muebles.flatMap((m) => m.telas.map((t) => t.materialId)))];
  const [maquinas, materiales, telas, partesTipo] = await Promise.all([
    prisma.maquina.findMany({ where: { id: { in: idsMaq }, activo: true } }),
    prisma.material.findMany({ where: { id: { in: idsMat }, activo: true, categoria: { not: 'tela' } } }),
    prisma.material.findMany({ where: { id: { in: idsTela }, categoria: 'tela' } }),
    prisma.tipoMuebleParte.findMany({ where: { tipoMuebleId: { in: s.muebles.map((m) => m.tipoMuebleId) } } }),
  ]);

  const muebles = await Promise.all(s.muebles.map(async (m, i) => {
    const entrada = e.muebles.find((x) => x.solicitudMuebleId === m.id)!;
    const k = `muebles.${i}`;
    const tela = telaDe(s, m);
    const permitidas = tela.eligeAqui && tela.tipo !== 'no' ? entrada.telas.map((t) => t.materialId) : tela.telas.map((t) => t.materialId);
    if (entrada.partes?.length) {
      const delMueble = partesTipo.filter((x) => x.tipoMuebleId === m.tipoMuebleId);
      if (!tela.eligeAqui) errores[`${k}.tela`] = 'Las telas por partes se eligen en la cita o la visita.';
      else if (entrada.partes.some((x) => !delMueble.some((y) => y.id === x.parteId))) errores[`${k}.tela`] = 'Alguna parte no es de este mueble. Recargue la página.';
      else if (entrada.partes.some((x) => !permitidas.includes(x.materialId))) errores[`${k}.tela`] = 'Falta la tela de alguna parte en la lista de yardas.';
      else if (publicar && delMueble.some((y) => !entrada.partes!.some((x) => x.parteId === y.id))) errores[`${k}.tela`] = 'Elija una tela para cada parte.';
    }
    const actividades = entrada.actividades.map((a, j) => {
      const maq = a.maquinaId != null ? maquinas.find((x) => x.id === a.maquinaId) : null;
      if (a.maquinaId != null && !maq) errores[`${k}.actividades.${j}.maquinaId`] = 'Esa máquina ya no está disponible.';
      if (a.maquinaId == null && a.horasMaquina > 0) errores[`${k}.actividades.${j}.horasMaquina`] = 'Sin máquina no lleva horas de máquina.';
      if (publicar && !a.nombre.trim()) errores[`${k}.actividades.${j}.nombre`] = 'Escriba el nombre de la actividad.';
      const materialesConPrecio = a.materiales.map((x, n) => {
        const mat = materiales.find((y) => y.id === x.materialId);
        if (!mat) errores[`${k}.actividades.${j}.materiales.${n}`] = 'Ese material ya no está en el inventario.';
        return { ...x, precio: num(mat?.precio) };
      });
      return { ...a, maquina: maq?.nombre ?? null, tarifaMaquina: num(maq?.tarifaHora), materialesConPrecio };
    });
    const telasCalc = entrada.telas.map((t, j) => {
      const mat = telas.find((x) => x.id === t.materialId);
      if (!mat || !permitidas.includes(t.materialId)) errores[`${k}.telas.${j}`] = 'Esa tela no es la que eligió el cliente.';
      else if (publicar && !mat.activo) errores[`${k}.telas.${j}`] = `La tela ${mat.nombre} está descontinuada: hay que elegir otra con el cliente.`;
      else if (publicar && mat.precio == null) errores[`${k}.telas.${j}`] = `La tela ${mat.nombre} no tiene precio: cárguelo en Inventario › Telas.`;
      if (publicar && t.yardas <= 0) errores[`${k}.telas.${j}.yardas`] = 'Escriba las yardas que se van a usar.';
      return { materialId: t.materialId, yardas: t.yardas, precio: num(mat?.precio) };
    });
    if (publicar) {
      if (tela.eligeAqui ? tela.tipo !== 'no' && entrada.telas.length === 0 : tela.tipo === 'pendiente') errores[`${k}.tela`] = `Falta la tela: ${tela.eligeAqui ? 'elíjala del muestrario' : tela.nota.toLowerCase()}.`;
      if (!tela.eligeAqui && tela.tipo === 'taller' && permitidas.some((id) => !entrada.telas.some((t) => t.materialId === id))) errores[`${k}.tela`] = 'Faltan las yardas de alguna tela.';
      if (!actividades.some((a) => a.horasPersona > 0)) errores[`${k}.actividades`] = 'Agregue al menos una actividad con horas.';
      if (entrada.propuesto <= 0) errores[`${k}.propuesto`] = 'Indique el precio propuesto.';
      if (s.muebles.length > 1 && !entrada.revisado) errores[`${k}.revisado`] = 'Revise el precio de este mueble.';
    }
    const costeo = costearMueble(
      actividades.map((a) => ({ horasPersona: a.horasPersona, horasMaquina: a.maquinaId ? a.horasMaquina : 0, tarifaMaquina: a.tarifaMaquina, materiales: a.materialesConPrecio })),
      telasCalc, p.costos, i === 0, m.cantidad,
    );
    const plantilla = await prisma.plantilla.findFirst({ where: { tipoMuebleId: m.tipoMuebleId, servicio: m.servicio, activa: true }, select: { id: true } });
    return { entrada, plantillaId: plantilla?.id ?? null, actividades, telas: telasCalc, costeo };
  }));

  // Transporte: el calculado, o a mano con motivo cuando no se pudo calcular (queda registrado quién y por qué).
  let transporte = 0, millas: number | null = null, manual = false, motivoTransporte: string | null = null;
  if (s.traslado === 'delivery') {
    if (e.transporte.manual) {
      manual = true;
      transporte = e.transporte.monto ?? 0;
      motivoTransporte = e.transporte.motivo?.trim() || null;
      if (publicar && transporte <= 0) errores['transporte.monto'] = 'Escriba el costo del transporte.';
      if (publicar && !motivoTransporte) errores['transporte.motivo'] = 'Escriba por qué se ingresa a mano.';
    } else {
      const t = await transporteDeSolicitud(s, p, rutas, previo ? { millas: previo.millas, manual: false, monto: 0, motivo: null } : undefined);
      millas = t.millas;
      transporte = t.calculado ?? 0;
      if (publicar && t.calculado == null) errores['transporte.monto'] = 'No se pudo calcular el transporte: ingréselo a mano.';
    }
  } else if (publicar && s.traslado == null) {
    errores['transporte'] = 'Falta definir el traslado (delivery o lo lleva el cliente).';
  }

  const total = muebles.reduce((t, m) => t + m.entrada.propuesto, 0) + transporte;
  const adelantoPct = adelantoSugeridoPct(pedidosCerrados, p.adelanto);
  const adelanto = e.adelanto ?? montoDePct(total, adelantoPct);
  if (e.adelanto != null) {
    const problema = revisarAdelanto(e.adelanto, total, p.adelanto.maxPct);
    if (problema) errores.adelanto = problema;
  }
  if (Object.keys(errores).length) {
    const n = Object.keys(errores).length;
    throw error(n === 1 ? `${Object.values(errores)[0]} No se ${publicar ? 'publicó' : 'guardó'} la cotización.` : `Revise los ${n} puntos marcados. No se ${publicar ? 'publicó' : 'guardó'} la cotización.`, 400, errores);
  }
  return { muebles, transporte, millas, manual, motivoTransporte, total, adelanto, adelantoModificado: e.adelanto != null, adelantoPct };
}

/**
 * Escribe la cotización. En borrador, lo armado se guarda en `borrador` (sin filas que luego haya que borrar, RG-03).
 * Al publicar se crean los muebles, actividades, materiales y telas con los precios de ese momento (quedan congelados).
 */
export async function escribir(tx: Db, s: SolicitudCompleta, c: Calculo, e: CotizacionEntrada, q: Quien, existente: { id: number } | null, publicar: boolean) {
  const datos = {
    estado: 'Borrador', millas: c.millas == null ? null : D(c.millas), transporte: D(c.transporte), transporteManual: c.manual, motivoTransporte: c.motivoTransporte,
    adelantoPctSugerido: D(c.adelantoPct), adelanto: D(c.adelanto), adelantoModificado: c.adelantoModificado,
    observaciones: e.observaciones.trim() || null, total: D(c.total), fechaModificacion: new Date(),
    borrador: publicar ? Prisma.DbNull : (e as unknown as Prisma.InputJsonValue),
  };
  let cot: { id: number; codigo: string };
  if (existente) {
    cot = await tx.cotizacion.update({ where: { id: existente.id }, data: datos, select: { id: true, codigo: true } });
  } else {
    const creada = await tx.cotizacion.create({ data: { ...datos, codigo: `TMP-${Date.now() % 1e8}`, solicitudId: s.id, version: 1, creadoPor: q.usuarioId }, select: { id: true } });
    cot = await tx.cotizacion.update({ where: { id: creada.id }, data: { codigo: codigoCotizacion(creada.id) }, select: { id: true, codigo: true } });
  }
  if (!publicar) return cot;
  if (eligeEnCita(s.telaOpcion)) {
    for (const m of c.muebles) {
      const sm = s.muebles.find((x) => x.id === m.entrada.solicitudMuebleId)!;
      if (sm.telas.length || !m.telas.length) continue; // ya tenía su tela, o el trabajo no lleva tela
      const partes = m.entrada.partes ?? [];
      await tx.solicitudMueble.update({
        where: { id: sm.id },
        data: {
          modoTela: partes.length ? 'partes' : 'una',
          telas: { create: partes.length
            ? partes.map((x, k) => ({ materialId: x.materialId, parteId: x.parteId, orden: k + 1 }))
            : m.telas.map((t, k) => ({ materialId: t.materialId, parteId: null, orden: k + 1 })) },
        },
      });
    }
  }
  for (const m of c.muebles) {
    await tx.cotizacionMueble.create({
      data: {
        cotizacionId: cot.id, solicitudMuebleId: m.entrada.solicitudMuebleId, plantillaId: m.plantillaId,
        materiales: D(m.costeo.materiales), manoObra: D(m.costeo.manoObra), maquinaria: D(m.costeo.maquinaria), costosFijos: D(m.costeo.fijos),
        precioSugerido: D(m.costeo.sugerido), precioPropuesto: D(m.entrada.propuesto), motivoPrecio: m.entrada.motivo?.trim() || null, revisado: m.entrada.revisado,
        telas: { create: m.telas.map((t) => ({ materialId: t.materialId, yardas: D(t.yardas), precio: D(t.precio) })) },
        actividades: {
          create: m.actividades.map((a, orden) => ({
            orden: orden + 1, nombre: a.nombre.trim() || 'Actividad', horasPersona: D(a.horasPersona), maquinaId: a.maquinaId, maquina: a.maquina,
            tarifaMaquina: D(a.tarifaMaquina), horasMaquina: D(a.maquinaId ? a.horasMaquina : 0),
            materiales: { create: a.materialesConPrecio.map((x) => ({ materialId: x.materialId, cantidad: D(x.cantidad), precio: D(x.precio) })) },
          })),
        },
      },
    });
  }
  return cot;
}

export async function prepararEscritura(codigoSolicitud: string) {
  const s = await cargarSolicitud(codigoSolicitud);
  const [p, existente, cerrados] = await Promise.all([
    parametrosCotizacion(),
    prisma.cotizacion.findFirst({ where: { solicitudId: s.id }, orderBy: { version: 'desc' } }),
    prisma.pedido.count({ where: { clienteId: s.clienteId, estado: 'Cerrado' } }),
  ]);
  if (existente && existente.estado !== 'Borrador') throw error(`La cotización ${existente.codigo} ya se publicó: no se puede cambiar.`, 409);
  if (!COTIZABLES.includes(s.estado)) throw error(`La solicitud está «${s.estado}»: no se puede cotizar.`, 409);
  if (s.esperaFotos) throw error('Esta solicitud espera las fotos del cliente: se cotiza cuando lleguen.', 409);
  return { s, p, existente, cerrados };
}

/** Guardar el borrador: se puede guardar a medias (sin precio, sin yardas). */
export async function guardarBorrador(codigoSolicitud: string, e: CotizacionEntrada, q: Quien, rutas: Rutas) {
  const { s, p, existente, cerrados } = await prepararEscritura(codigoSolicitud);
  const c = await calcular(s, e, p, rutas, existente ? { millas: existente.millas == null ? null : num(existente.millas) } : null, cerrados, false);
  const cot = await prisma.$transaction(async (tx) => {
    const cot = await escribir(tx, s, c, e, q, existente, false);
    await registrarBitacora(tx, {
      usuarioId: q.usuarioId, modulo: 'comercial', accion: existente ? 'cotizacion_guardada' : 'cotizacion_creada', entidad: 'cotizacion', entidadId: cot.id,
      valorNuevo: { solicitud: s.codigo, total: c.total, adelanto: c.adelanto, muebles: c.muebles.map((m) => ({ id: m.entrada.solicitudMuebleId, propuesto: m.entrada.propuesto, sugerido: m.costeo.sugerido })) }, ip: q.ip,
    });
    return cot;
  });
  return { codigo: cot.codigo, total: c.total };
}

/**
 * Publicar y avisar al cliente (CU-C08): revisa todo, congela los precios de hoy, fija la vigencia, pasa la solicitud
 * a «Cotizada» y avisa al cliente (notificación y correo, RG-05).
 */
/**
 * Publica dentro de una transacción: escribe con los precios congelados, deja la cotización «Pendiente de respuesta» con
 * su vigencia y pasa la solicitud a «Cotizada». Lo usan «Publicar» (A4) y la respuesta en la cita o la visita (A2b).
 */
export async function publicarEn(tx: Db, s: SolicitudCompleta, c: Calculo, e: CotizacionEntrada, q: Quien, existente: { id: number } | null, vigencia: string) {
  const cot = await escribir(tx, s, c, e, q, existente, true);
  await tx.cotizacion.update({ where: { id: cot.id }, data: { estado: 'Pendiente de respuesta', publicadoPor: q.usuarioId, fechaPublicacion: new Date(), vigenciaHasta: leerFecha(vigencia)! } });
  // Máquina de estados de la solicitud: solo Nueva o Atendida pasan a Cotizada (y nadie la cambió mientras tanto).
  const cambio = await tx.solicitud.updateMany({ where: { id: s.id, estado: { in: COTIZABLES } }, data: { estado: 'Cotizada' } });
  if (!cambio.count) throw error('La solicitud cambió mientras armaba la cotización. Recargue la página.', 409);
  await registrarBitacora(tx, {
    usuarioId: q.usuarioId, modulo: 'comercial', accion: 'cotizacion_publicada', entidad: 'cotizacion', entidadId: cot.id,
    valorAnterior: { estado: 'Borrador' }, valorNuevo: { estado: 'Pendiente de respuesta', total: c.total, transporte: c.transporte, adelanto: c.adelanto, adelantoModificado: c.adelantoModificado, vigenciaHasta: vigencia }, ip: q.ip,
  });
  await registrarBitacora(tx, {
    usuarioId: q.usuarioId, modulo: 'comercial', accion: 'solicitud_cotizada', entidad: 'solicitud', entidadId: s.id,
    valorAnterior: { estado: s.estado }, valorNuevo: { estado: 'Cotizada', cotizacion: cot.codigo }, ip: q.ip,
  });
  // La cita o la visita «En atención» termina aquí: con la cotización publicada pasa a «Atendida».
  const enCurso = await tx.cita.findMany({ where: { solicitudId: s.id, estado: 'En atención' }, select: { id: true } });
  for (const c of enCurso) {
    await tx.cita.update({ where: { id: c.id }, data: { estado: 'Atendida' } });
    await registrarBitacora(tx, {
      usuarioId: q.usuarioId, modulo: 'comercial', accion: 'cita_atendida', entidad: 'cita', entidadId: c.id,
      valorAnterior: { cita: 'En atención' }, valorNuevo: { cita: 'Atendida', cotizacion: cot.codigo }, ip: q.ip,
    });
  }
  return cot;
}

export async function publicarCotizacion(codigoSolicitud: string, e: CotizacionEntrada, q: Quien, rutas: Rutas, correo: Correo) {
  const { s, p, existente, cerrados } = await prepararEscritura(codigoSolicitud);
  const c = await calcular(s, e, p, rutas, existente ? { millas: existente.millas == null ? null : num(existente.millas) } : null, cerrados, true);
  const vigencia = sumarDias(hoyNegocio(), p.vigenciaDias);
  const { cot, avisos } = await prisma.$transaction(async (tx) => {
    const cot = await publicarEn(tx, s, c, e, q, existente, vigencia);
    const fecha = leerFecha(vigencia)!.toLocaleDateString('es-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    const avisos = await avisoAlCliente(tx, s.clienteId, {
      solicitudId: s.id, tipo: 'cotizacion_publicada', titulo: `Su cotización ${cot.codigo} está lista`,
      mensaje: `Total ${dinero(c.total)}. Puede aceptarla o rechazarla hasta el ${fecha}.`, enlace: '/cliente/pedidos/solicitudes',
    }, `Su cotización ${cot.codigo} está lista`, `Hola ${s.cliente.nombres}: ya está lista la cotización de su solicitud ${s.codigo}. Total: ${dinero(c.total)}${c.adelanto > 0 ? ` (adelanto ${dinero(c.adelanto)})` : ''}. Vigente hasta el ${fecha}. Revísela en su cuenta de GARWEB.`);
    await guardarAvisos(tx, avisos);
    return { cot, avisos };
  });
  await enviarCorreos(correo, avisos);
  return { codigo: cot.codigo, total: c.total, vigenciaHasta: vigencia };
}
