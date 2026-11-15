// CU-C06 A16 Plantillas de cotización: la matriz tipo de mueble × servicio, ver, crear y guardar una versión nueva.
// Toda escritura queda en la bitácora (RG-02); las versiones anteriores no se borran (RG-03).
import { Prisma } from '@prisma/client';
import { prisma, type Db } from '../../../shared/infrastructure/prisma.js';
import { registrarBitacora } from '../../../shared/infrastructure/bitacora.js';
import { parametroNumero } from '../../../shared/infrastructure/parametros.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import { SERVICIOS } from '../domain/solicitud.js';
import { costearPlantilla, mismasActividades, tieneHoras, type ActividadEntrada, type ParametrosCosto } from '../domain/plantillas.js';

interface Quien { usuarioId: number; ip?: string }

const error = (m: string, status = 400, errores?: Record<string, string>) => new ReglaNegocioError(m, status, errores);
const num = (d: { toString(): string } | null | undefined) => (d == null ? 0 : Number(d.toString()));
const D = (n: number) => new Prisma.Decimal(Math.round(n * 100) / 100);
/** Nombres cortos de los servicios para las columnas de la matriz (diseño A16). */
const CORTOS: Record<string, string> = { retapizado: 'Retapizado completo', retapizado_espuma: 'Retapizado + espuma', espuma: 'Solo espuma', estructura: 'Reparación de estructura', fabricacion: 'Fabricación a medida' };
const nombreServicio = (codigo: string) => SERVICIOS.find((s) => s.codigo === codigo)?.nombre.replace(' (desde una foto)', '') ?? codigo;

/** RG-04: tarifa por hora, costos fijos y margen salen de Parámetros. */
export async function parametrosCosto(db: Db = prisma): Promise<ParametrosCosto> {
  const [tarifaHora, costosFijos, margenPct] = await Promise.all([
    parametroNumero(db, 'tarifa.hora_persona'),
    parametroNumero(db, 'tarifa.costos_fijos_pedido'),
    parametroNumero(db, 'cotizacion.margen_pct'),
  ]);
  return { tarifaHora, costosFijos, margenPct };
}

const incluirPlantilla = {
  tipoMueble: true,
  creador: true,
  actividades: { orderBy: { orden: 'asc' as const }, include: { maquina: true, materiales: { orderBy: { id: 'asc' as const }, include: { material: true } } } },
} satisfies Prisma.PlantillaInclude;
type PlantillaCompleta = Prisma.PlantillaGetPayload<{ include: typeof incluirPlantilla }>;

/** El costeo de una plantilla guardada, con los precios de HOY (Inventario, máquinas y Parámetros). */
function costeoDe(p: PlantillaCompleta, c: ParametrosCosto) {
  return costearPlantilla(p.actividades.map((a) => ({
    horasPersona: num(a.horasPersona), horasMaquina: num(a.horasMaquina), tarifaMaquina: a.maquina ? num(a.maquina.tarifaHora) : 0,
    materiales: a.materiales.map((m) => ({ cantidad: num(m.cantidad), precio: num(m.material.precio) })),
  })), c);
}

const actividadesDto = (p: PlantillaCompleta): ActividadEntrada[] => p.actividades.map((a) => ({
  nombre: a.nombre, horasPersona: num(a.horasPersona), maquinaId: a.maquinaId, horasMaquina: num(a.horasMaquina),
  materiales: a.materiales.map((m) => ({ materialId: m.materialId, cantidad: num(m.cantidad) })),
}));

/**
 * A16: la matriz y todo lo que la pantalla necesita para editar y calcular en vivo (máquinas con tarifa, materiales
 * del Inventario con su precio y los parámetros del costo).
 */
export async function catalogoPlantillas() {
  const [tipos, maquinas, materiales, costos, activas] = await Promise.all([
    prisma.tipoMueble.findMany({ where: { activo: true }, orderBy: { orden: 'asc' } }),
    // Todas: las desactivadas no se ofrecen, pero las plantillas que ya las usan las siguen mostrando con su tarifa.
    prisma.maquina.findMany({ orderBy: { nombre: 'asc' } }),
    prisma.material.findMany({ where: { activo: true, categoria: { not: 'tela' } }, orderBy: { nombre: 'asc' } }),
    parametrosCosto(),
    prisma.plantilla.findMany({ where: { activa: true }, include: incluirPlantilla }),
  ]);
  return {
    tiposMueble: tipos.map((t) => ({ id: t.id, nombre: t.nombre })),
    servicios: SERVICIOS.map((s) => ({ codigo: s.codigo, nombre: nombreServicio(s.codigo), corto: CORTOS[s.codigo] ?? s.nombre })),
    maquinas: maquinas.map((m) => ({ id: m.id, nombre: m.nombre, tarifaHora: num(m.tarifaHora), activo: m.activo })),
    materiales: materiales.map((m) => ({ id: m.id, nombre: m.nombre, unidad: m.unidadMedida, precio: num(m.precio) })),
    costos,
    plantillas: activas.map((p) => {
      const c = costeoDe(p, costos);
      return { id: p.id, tipoMuebleId: p.tipoMuebleId, servicio: p.servicio, version: p.version, sugerido: c.sugerido, horas: c.horas };
    }),
  };
}

/** A16 · una plantilla: sus actividades, el costeo y quién la editó por última vez. */
export async function detallePlantilla(id: number) {
  const p = await prisma.plantilla.findUnique({ where: { id }, include: incluirPlantilla });
  if (!p) throw error('No encontramos esa plantilla.', 404);
  const [costos, versiones] = await Promise.all([
    parametrosCosto(),
    prisma.plantilla.count({ where: { tipoMuebleId: p.tipoMuebleId, servicio: p.servicio } }),
  ]);
  return {
    id: p.id, tipoMuebleId: p.tipoMuebleId, tipoMueble: p.tipoMueble.nombre, servicio: p.servicio, servicioNombre: nombreServicio(p.servicio),
    version: p.version, versiones, activa: p.activa,
    fecha: p.fechaCreacion.toISOString(), editadoPor: p.creador.nombre ?? p.creador.nombreUsuario,
    // Cuántas cotizaciones la usaron: se calcula cuando exista el backend de Cotizaciones (A4).
    usos: 0,
    actividades: actividadesDto(p),
    costeo: costeoDe(p, costos),
  };
}

/** Revisa que las máquinas y los materiales existan y estén activos (la tela va sin material). */
async function revisarActividades(actividades: ActividadEntrada[]) {
  if (!tieneHoras(actividades)) throw error('Agregue al menos una actividad con horas.', 400, { actividades: 'Agregue al menos una actividad con horas.' });
  const errores: Record<string, string> = {};
  const idsMaq = [...new Set(actividades.map((a) => a.maquinaId).filter((x): x is number => x != null))];
  const idsMat = [...new Set(actividades.flatMap((a) => a.materiales.map((m) => m.materialId)))];
  const [maquinas, materiales] = await Promise.all([
    prisma.maquina.findMany({ where: { id: { in: idsMaq }, activo: true } }),
    prisma.material.findMany({ where: { id: { in: idsMat }, activo: true, categoria: { not: 'tela' } } }),
  ]);
  actividades.forEach((a, i) => {
    if (a.maquinaId != null && !maquinas.some((m) => m.id === a.maquinaId)) errores[`actividades.${i}.maquinaId`] = 'Esa máquina ya no está disponible.';
    if (a.maquinaId == null && a.horasMaquina > 0) errores[`actividades.${i}.horasMaquina`] = 'Sin máquina no lleva horas de máquina.';
    const vistos = new Set<string>();
    a.materiales.forEach((m, j) => {
      const k = String(m.materialId);
      if (vistos.has(k)) errores[`actividades.${i}.materiales.${j}`] = 'Ese material ya está en la actividad.';
      vistos.add(k);
      if (!materiales.some((x) => x.id === m.materialId)) errores[`actividades.${i}.materiales.${j}`] = 'Ese material ya no está en el inventario.';
    });
  });
  const claves = Object.keys(errores);
  if (claves.length) throw error(claves.length === 1 ? errores[claves[0]!]! : `Revise los ${claves.length} datos marcados.`, 400, errores);
}

async function guardarActividades(tx: Prisma.TransactionClient, plantillaId: number, actividades: ActividadEntrada[]) {
  for (const [orden, a] of actividades.entries()) {
    await tx.plantillaActividad.create({
      data: {
        plantillaId, orden: orden + 1, nombre: a.nombre.trim(), horasPersona: D(a.horasPersona), maquinaId: a.maquinaId, horasMaquina: D(a.maquinaId ? a.horasMaquina : 0),
        materiales: { create: a.materiales.map((m) => ({ materialId: m.materialId, cantidad: D(m.cantidad) })) },
      },
    });
  }
}

const plantillaUnica = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/** A16 «Crear plantilla»: versión 1 para un tipo de mueble + servicio que todavía no tiene. */
export async function crearPlantilla(tipoMuebleId: number, servicio: string, actividades: ActividadEntrada[], q: Quien) {
  const tipo = await prisma.tipoMueble.findUnique({ where: { id: tipoMuebleId } });
  if (!tipo || !tipo.activo) throw error('Elija un tipo de mueble de la lista.', 400, { tipoMuebleId: 'Elija un tipo de mueble de la lista.' });
  if (await prisma.plantilla.findFirst({ where: { tipoMuebleId, servicio, activa: true } })) {
    throw error(`${tipo.nombre} · ${nombreServicio(servicio)} ya tiene plantilla. Ábrala y edítela.`, 409);
  }
  await revisarActividades(actividades);
  const anteriores = await prisma.plantilla.count({ where: { tipoMuebleId, servicio } });
  try {
    const p = await prisma.$transaction(async (tx) => {
      const nueva = await tx.plantilla.create({ data: { tipoMuebleId, servicio, version: anteriores + 1, creadoPor: q.usuarioId } });
      await guardarActividades(tx, nueva.id, actividades);
      await registrarBitacora(tx, {
        usuarioId: q.usuarioId, modulo: 'comercial', accion: 'plantilla_creada', entidad: 'plantilla', entidadId: nueva.id, ip: q.ip,
        valorNuevo: { tipoMueble: tipo.nombre, servicio, version: nueva.version, actividades: actividades.length },
      });
      return nueva;
    });
    return detallePlantilla(p.id);
  } catch (err) {
    if (plantillaUnica(err)) throw error('Otra persona acaba de crear esta plantilla. Recargue la página.', 409);
    throw err;
  }
}

/**
 * A16 «Guardar cambios»: crea una versión nueva (la anterior queda inactiva, no se borra). Las cotizaciones nuevas usan
 * la versión nueva; las ya armadas conservan la suya. Si no cambió nada, no crea versión.
 */
export async function guardarPlantilla(id: number, actividades: ActividadEntrada[], q: Quien) {
  const actual = await prisma.plantilla.findUnique({ where: { id }, include: incluirPlantilla });
  if (!actual) throw error('No encontramos esa plantilla.', 404);
  if (!actual.activa) throw error('Esta versión ya fue reemplazada por otra. Recargue la página para ver la vigente.', 409);
  await revisarActividades(actividades);
  if (mismasActividades(actividadesDto(actual), actividades)) return { ...(await detallePlantilla(id)), sinCambios: true };
  try {
    const p = await prisma.$transaction(async (tx) => {
      // Solo una versión activa: si otra persona guardó a la vez, este update no encuentra la fila activa.
      const { count } = await tx.plantilla.updateMany({ where: { id, activa: true }, data: { activa: false } });
      if (!count) throw error('Esta versión ya fue reemplazada por otra. Recargue la página para ver la vigente.', 409);
      const nueva = await tx.plantilla.create({ data: { tipoMuebleId: actual.tipoMuebleId, servicio: actual.servicio, version: actual.version + 1, creadoPor: q.usuarioId } });
      await guardarActividades(tx, nueva.id, actividades);
      await registrarBitacora(tx, {
        usuarioId: q.usuarioId, modulo: 'comercial', accion: 'plantilla_modificada', entidad: 'plantilla', entidadId: nueva.id, ip: q.ip,
        valorAnterior: { version: actual.version, actividades: actividadesDto(actual) } as unknown as Prisma.InputJsonObject,
        valorNuevo: { version: nueva.version, actividades } as unknown as Prisma.InputJsonObject,
      });
      return nueva;
    });
    return { ...(await detallePlantilla(p.id)), sinCambios: false };
  } catch (err) {
    if (plantillaUnica(err)) throw error('Otra persona acaba de guardar esta plantilla. Recargue la página.', 409);
    throw err;
  }
}
