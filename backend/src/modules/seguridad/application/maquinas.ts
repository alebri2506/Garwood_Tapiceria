// A14 Parámetros › Máquinas: la tarifa por hora de cada máquina del taller (CU-C06 la usa en el precio sugerido).
// Toda escritura queda en la bitácora (RG-02); las máquinas no se borran, se desactivan (RG-03); la tarifa es un valor
// de negocio que el Administrador ajusta aquí, no en el código ni a mano en la base (RG-04).
import { Prisma, type Maquina } from '@prisma/client';
import { prisma } from '../../../shared/infrastructure/prisma.js';
import { registrarBitacora } from '../../../shared/infrastructure/bitacora.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';

interface Quien { usuarioId: number; ip?: string }

const tarifa = (m: Pick<Maquina, 'tarifaHora'>) => Number(m.tarifaHora.toString());
const D = (n: number) => new Prisma.Decimal(Math.round(n * 100) / 100);
const dos = (n: number) => n.toFixed(2);

/** Plantillas vigentes que usan la máquina (para avisar antes de desactivarla). */
const usos = (maquinaId: number) => prisma.plantilla.count({ where: { activa: true, actividades: { some: { maquinaId } } } });

async function maquinaDto(m: Maquina) {
  return { id: m.id, nombre: m.nombre, tarifaHora: tarifa(m), activo: m.activo, usos: await usos(m.id) };
}

/** Todas las máquinas: primero las activas, por nombre. */
export async function listarMaquinas() {
  const filas = await prisma.maquina.findMany({ orderBy: [{ activo: 'desc' }, { nombre: 'asc' }] });
  return Promise.all(filas.map(maquinaDto));
}

async function revisarNombre(nombre: string, excepto?: number) {
  const otra = await prisma.maquina.findFirst({ where: { nombre: { equals: nombre, mode: 'insensitive' }, ...(excepto ? { id: { not: excepto } } : {}) } });
  if (otra) throw new ReglaNegocioError('Ya existe una máquina con ese nombre.', 409, { nombre: 'Ya existe una máquina con ese nombre.' });
}

async function buscar(id: number) {
  const m = Number.isInteger(id) && id > 0 ? await prisma.maquina.findUnique({ where: { id } }) : null;
  if (!m) throw new ReglaNegocioError('No encontramos esa máquina.', 404);
  return m;
}

export async function crearMaquina(datos: { nombre: string; tarifaHora: number }, q: Quien) {
  await revisarNombre(datos.nombre);
  const m = await prisma.$transaction(async (tx) => {
    const nueva = await tx.maquina.create({ data: { nombre: datos.nombre, tarifaHora: D(datos.tarifaHora) } });
    await registrarBitacora(tx, {
      usuarioId: q.usuarioId, modulo: 'configuracion', accion: 'maquina_creada', entidad: 'maquina', entidadId: nueva.id,
      valorNuevo: { nombre: nueva.nombre, tarifaHora: dos(tarifa(nueva)) }, ip: q.ip,
    });
    return nueva;
  });
  return maquinaDto(m);
}

/**
 * Cambia el nombre o la tarifa. Lo que no cambió no se registra. La tarifa nueva se usa desde ya en el precio
 * sugerido de las plantillas (precios de hoy).
 */
export async function editarMaquina(id: number, datos: { nombre?: string; tarifaHora?: number }, q: Quien) {
  const m = await buscar(id);
  const anterior: Record<string, string> = {};
  const nuevo: Record<string, string> = {};
  if (datos.nombre !== undefined && datos.nombre !== m.nombre) {
    await revisarNombre(datos.nombre, id);
    anterior.nombre = m.nombre; nuevo.nombre = datos.nombre;
  }
  if (datos.tarifaHora !== undefined && dos(datos.tarifaHora) !== dos(tarifa(m))) {
    anterior.tarifaHora = dos(tarifa(m)); nuevo.tarifaHora = dos(datos.tarifaHora);
  }
  if (!Object.keys(nuevo).length) return { ...(await maquinaDto(m)), sinCambios: true };

  const editada = await prisma.$transaction(async (tx) => {
    const e = await tx.maquina.update({
      where: { id },
      data: { ...(nuevo.nombre ? { nombre: nuevo.nombre } : {}), ...(nuevo.tarifaHora ? { tarifaHora: D(Number(nuevo.tarifaHora)) } : {}) },
    });
    await registrarBitacora(tx, {
      usuarioId: q.usuarioId, modulo: 'configuracion', accion: 'maquina_modificada', entidad: 'maquina', entidadId: id,
      valorAnterior: anterior, valorNuevo: nuevo, ip: q.ip,
    });
    return e;
  });
  return { ...(await maquinaDto(editada)), sinCambios: false };
}

/**
 * Desactivar: deja de ofrecerse al armar plantillas. Las plantillas que ya la usan la siguen mostrando con su
 * tarifa; al guardarlas otra vez hay que elegir otra máquina. Reactivar la vuelve a ofrecer.
 */
export async function cambiarEstadoMaquina(id: number, activo: boolean, q: Quien) {
  const m = await buscar(id);
  if (m.activo === activo) return maquinaDto(m);
  const e = await prisma.$transaction(async (tx) => {
    const x = await tx.maquina.update({ where: { id }, data: { activo } });
    await registrarBitacora(tx, {
      usuarioId: q.usuarioId, modulo: 'configuracion', accion: activo ? 'maquina_activada' : 'maquina_desactivada', entidad: 'maquina', entidadId: id,
      valorAnterior: { activo: m.activo }, valorNuevo: { activo }, ip: q.ip,
    });
    return x;
  });
  return maquinaDto(e);
}

const ACCIONES = ['maquina_creada', 'maquina_modificada', 'maquina_activada', 'maquina_desactivada'];

/** Los cambios de máquinas como líneas del historial de A14 (lo último primero). */
export async function historialMaquinas(limite: number) {
  const filas = await prisma.bitacora.findMany({
    where: { entidad: 'maquina', accion: { in: ACCIONES } },
    orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
    take: limite,
    include: { usuario: true },
  });
  const nombres = new Map((await prisma.maquina.findMany({ where: { id: { in: filas.map((f) => f.entidadId!).filter(Boolean) } } })).map((m) => [m.id, m.nombre]));
  return filas.flatMap((f) => {
    const antes = (f.valorAnterior ?? {}) as Record<string, string>;
    const despues = (f.valorNuevo ?? {}) as Record<string, string>;
    const nombre = nombres.get(f.entidadId!) ?? despues.nombre ?? 'Máquina';
    const base = { usuario: f.usuario?.nombre ?? f.usuario?.nombreUsuario ?? 'Sistema', fecha: f.fecha.toISOString() };
    const linea = (sufijo: string, x: { clave: string; etiqueta: string; unidad: string | null; valorAnterior: string; valorNuevo: string; texto?: string }) =>
      ({ id: `m${f.id}${sufijo}`, ...x, ...base });
    if (f.accion === 'maquina_creada') {
      return [linea('', { clave: 'maquina', etiqueta: 'Máquina nueva', unidad: 'USD/h', valorAnterior: '', valorNuevo: despues.tarifaHora ?? '', texto: `Máquina nueva: ${despues.nombre} · $${despues.tarifaHora} / h` })];
    }
    if (f.accion !== 'maquina_modificada') {
      return [linea('', { clave: 'maquina', etiqueta: nombre, unidad: null, valorAnterior: '', valorNuevo: '', texto: `${f.accion === 'maquina_activada' ? 'Máquina reactivada' : 'Máquina desactivada'}: ${nombre}` })];
    }
    const lineas = [];
    if (despues.nombre) lineas.push(linea('n', { clave: 'maquina.nombre', etiqueta: 'Nombre de la máquina', unidad: null, valorAnterior: antes.nombre ?? '', valorNuevo: despues.nombre }));
    if (despues.tarifaHora) lineas.push(linea('t', { clave: 'maquina.tarifa', etiqueta: `Tarifa · ${nombre}`, unidad: 'USD/h', valorAnterior: antes.tarifaHora ?? '', valorNuevo: despues.tarifaHora }));
    return lineas;
  });
}
