// A8c Movimientos (kardex), «Corregir stock» (CU-A09) y A9 Conteo de inventario (CU-A10).
import { Prisma } from '@prisma/client';
import { prisma } from '../../../shared/infrastructure/prisma.js';
import { registrarBitacora } from '../../../shared/infrastructure/bitacora.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import {
  CATEGORIAS_STOCK, ESTADOS_PEDIDO_EN_PROCESO, MOTIVOS_CON_PEDIDO, MOTIVOS_CONTEO, MOTIVOS_ENTRADA, MOTIVOS_SALIDA, aplicarMovimiento, diferenciasConteo,
  esCategoriaStock, r2,
} from '../domain/inventario.js';
import { num } from './situacion.js';
import { instanteNY } from '../../comercial/domain/agenda.js';

interface Quien { usuarioId: number; ip?: string }

const nombreUsuario = (u: { nombre: string | null; nombreUsuario: string }) => u.nombre ?? u.nombreUsuario;
const nombreCliente = (c: { tipoPersona: string; razonSocial: string | null; nombres: string; apellidos: string }) =>
  c.tipoPersona === 'empresa' && c.razonSocial ? c.razonSocial : `${c.nombres} ${c.apellidos}`.trim();

export interface FiltroMovimientos { materialId?: number; tipo?: 'entrada' | 'salida' | 'ajuste'; desde?: string; hasta?: string; limite?: number }

/**
 * A8c: los movimientos, lo más reciente primero. Con un material elegido es su kardex completo (con saldo y conteos);
 * sin material, solo los últimos y sin las constancias de conteo que coincidió.
 */
export async function listarMovimientos(f: FiltroMovimientos) {
  const where: Prisma.MovimientoInventarioWhereInput = {
    ...(f.materialId ? { materialId: f.materialId } : { tipo: { not: 'conteo' } }),
    ...(f.tipo === 'ajuste' ? { tipo: f.materialId ? { in: ['ajuste', 'conteo'] } : 'ajuste' } : f.tipo ? { tipo: f.tipo } : {}),
    ...(f.desde || f.hasta ? { fecha: { ...(f.desde ? { gte: instanteNY(f.desde) } : {}), ...(f.hasta ? { lte: new Date(instanteNY(f.hasta).getTime() + 86_399_999) } : {}) } } : {}),
  };
  const limite = f.materialId ? 200 : Math.min(f.limite ?? 30, 100);
  const [total, filas] = await Promise.all([
    prisma.movimientoInventario.count({ where }),
    prisma.movimientoInventario.findMany({
      where, orderBy: [{ fecha: 'desc' }, { id: 'desc' }], take: limite,
      include: { material: true, usuario: true, pedido: { select: { codigo: true } } },
    }),
  ]);
  return {
    total,
    movimientos: filas.map((m) => ({
      id: m.id, fecha: m.fecha.toISOString(), tipo: m.tipo, motivo: m.motivo, detalle: m.detalle, material: m.material.nombre, unidad: m.material.unidadMedida,
      pedido: m.pedido?.codigo ?? null, quien: nombreUsuario(m.usuario), cantidad: num(m.cantidad), saldo: num(m.saldo),
    })),
  };
}

/** Pedidos en proceso para elegir en «Corregir stock» (retiro o sobrante de un pedido). */
export async function pedidosEnProceso(q?: string) {
  const texto = q?.trim();
  const pedidos = await prisma.pedido.findMany({
    where: {
      estado: { in: ESTADOS_PEDIDO_EN_PROCESO },
      ...(texto ? { OR: [{ codigo: { contains: texto, mode: 'insensitive' } }, { cliente: { OR: [{ nombres: { contains: texto, mode: 'insensitive' } }, { apellidos: { contains: texto, mode: 'insensitive' } }, { razonSocial: { contains: texto, mode: 'insensitive' } }] } }] } : {}),
    },
    include: { cliente: true }, orderBy: { codigo: 'desc' }, take: 20,
  });
  return { pedidos: pedidos.map((p) => ({ id: p.id, codigo: p.codigo, cliente: nombreCliente(p.cliente), descripcion: p.descripcion, estado: p.estado })) };
}

export interface Correccion { materialId: number; sentido: 'sale' | 'entra'; cantidad: number; motivo: string; otroMotivo?: string; pedidoId?: number }

/**
 * A8c «Corregir stock»: para lo que no se registró solo (las compras entran con «Llegó»).
 *  - Motivo obligatorio; «Otro» exige escribirlo.
 *  - Retiro o sobrante de un pedido exige el pedido (en proceso). El retiro descuenta su reserva.
 *  - Nunca puede salir más de lo que hay en el estante.
 */
export async function corregirStock(c: Correccion, q: Quien) {
  const motivos: readonly string[] = c.sentido === 'sale' ? MOTIVOS_SALIDA : MOTIVOS_ENTRADA;
  if (!motivos.includes(c.motivo)) throw new ReglaNegocioError('Elija el motivo.', 400, { motivo: 'Elija el motivo.' });
  const otro = c.motivo === 'Otro' ? c.otroMotivo?.trim() : undefined;
  if (c.motivo === 'Otro' && !otro) throw new ReglaNegocioError('Escriba el motivo.', 400, { otroMotivo: 'Escriba el motivo.' });
  const conPedido = MOTIVOS_CON_PEDIDO.includes(c.motivo);
  if (conPedido && !c.pedidoId) throw new ReglaNegocioError('Elija el pedido.', 400, { pedidoId: 'Elija el pedido.' });

  return prisma.$transaction(async (tx) => {
    const m = await tx.material.findUnique({ where: { id: c.materialId } });
    if (!m || !m.activo || !esCategoriaStock(m.categoria)) throw new ReglaNegocioError('Elija un material de stock.', 400, { materialId: 'Elija un material de stock.' });
    const pedido = conPedido ? await tx.pedido.findUnique({ where: { id: c.pedidoId } }) : null;
    if (conPedido && (!pedido || !ESTADOS_PEDIDO_EN_PROCESO.includes(pedido.estado))) {
      throw new ReglaNegocioError('Ese pedido ya no está en proceso.', 400, { pedidoId: 'Elija un pedido en proceso.' });
    }
    const cantidad = r2(c.sentido === 'sale' ? -c.cantidad : c.cantidad);
    const r = aplicarMovimiento(num(m.stockFisico), cantidad);
    if ('error' in r) throw new ReglaNegocioError(r.error, 400, { cantidad: r.error });

    await tx.material.update({ where: { id: m.id }, data: { stockFisico: new Prisma.Decimal(r.saldo) } });
    // El retiro para un pedido baja lo reservado (hasta lo que quedaba pendiente); lo que pasa de ahí es consumo adicional.
    if (pedido && c.sentido === 'sale') {
      const reserva = await tx.reservaMaterial.findUnique({ where: { pedidoId_materialId: { pedidoId: pedido.id, materialId: m.id } } });
      if (reserva?.activa) {
        const pendiente = Math.max(0, num(reserva.cantidad) - num(reserva.retirado));
        await tx.reservaMaterial.update({ where: { id: reserva.id }, data: { retirado: new Prisma.Decimal(r2(num(reserva.retirado) + Math.min(pendiente, c.cantidad))) } });
      }
    }
    const tipo = conPedido ? (c.sentido === 'sale' ? 'salida' : 'entrada') : 'ajuste';
    const mov = await tx.movimientoInventario.create({
      data: {
        materialId: m.id, tipo, motivo: c.motivo === 'Otro' ? 'Otro' : c.motivo, detalle: otro ?? null, cantidad: new Prisma.Decimal(cantidad),
        saldo: new Prisma.Decimal(r.saldo), pedidoId: pedido?.id ?? null, usuarioId: q.usuarioId,
      },
    });
    await registrarBitacora(tx, {
      usuarioId: q.usuarioId, modulo: 'almacen', accion: 'stock_corregido', entidad: 'material', entidadId: m.id, ip: q.ip,
      valorAnterior: { enEstante: num(m.stockFisico) }, valorNuevo: { enEstante: r.saldo, cantidad, motivo: otro ?? c.motivo, pedido: pedido?.codigo ?? null, movimientoId: mov.id },
    });
    return { saldo: r.saldo, unidad: m.unidadMedida };
  });
}

// ---------------------------------------------------------------- A9 Conteo de inventario

/** A9 paso 1: la lista para contar, agrupada, SIN la cantidad del sistema (conteo a ciegas). */
export async function listaConteo() {
  const materiales = await prisma.material.findMany({ where: { activo: true, categoria: { in: Object.keys(CATEGORIAS_STOCK) } }, orderBy: [{ categoria: 'asc' }, { nombre: 'asc' }] });
  const ultimo = await prisma.conteo.findFirst({ orderBy: { fecha: 'desc' } });
  return {
    ultimoConteo: ultimo?.fecha.toISOString() ?? null,
    grupos: Object.entries(CATEGORIAS_STOCK)
      .map(([categoria, nombre]) => ({ categoria, nombre, materiales: materiales.filter((m) => m.categoria === categoria).map((m) => ({ id: m.id, nombre: m.nombre, unidad: m.unidadMedida })) }))
      .filter((g) => g.materiales.length > 0),
    motivos: MOTIVOS_CONTEO,
  };
}

async function compararConLoRegistrado(db: Prisma.TransactionClient | typeof prisma, contados: { materialId: number; contado: number }[]) {
  const materiales = await db.material.findMany({ where: { id: { in: contados.map((c) => c.materialId) } } });
  return contados.map((c) => {
    const m = materiales.find((x) => x.id === c.materialId);
    if (!m || !esCategoriaStock(m.categoria)) throw new ReglaNegocioError('Uno de los materiales contados no es de stock.', 400);
    if (c.contado < 0) throw new ReglaNegocioError(`«${m.nombre}»: lo contado no puede ser negativo.`, 400);
    return { materialId: m.id, nombre: m.nombre, unidad: m.unidadMedida, sistema: num(m.stockFisico), contado: r2(c.contado) };
  });
}

/** A9 paso 2: compara lo contado con lo que dice el sistema y devuelve solo las diferencias. */
export async function compararConteo(contados: { materialId: number; contado: number }[]) {
  const lineas = await compararConLoRegistrado(prisma, contados);
  return { total: lineas.length, diferencias: diferenciasConteo(lineas) };
}

/**
 * A9 paso 3 «Guardar»: el saldo queda igual a lo contado. Cada diferencia es un ajuste con su motivo; lo que coincide
 * queda como «Conteo de inventario · coincide» (constancia de que se revisó). Se compara contra el saldo de ESTE
 * momento, por si hubo un movimiento entre comparar y guardar.
 */
export async function guardarConteo(contados: { materialId: number; contado: number; motivo?: string; otroMotivo?: string }[], q: Quien) {
  if (!contados.length) throw new ReglaNegocioError('No hay materiales contados.', 400);
  return prisma.$transaction(async (tx) => {
    const lineas = await compararConLoRegistrado(tx, contados);
    const diferencias = diferenciasConteo(lineas);
    const faltan: Record<string, string> = {};
    for (const d of diferencias) {
      const c = contados.find((x) => x.materialId === d.materialId)!;
      if (!c.motivo || !(MOTIVOS_CONTEO as readonly string[]).includes(c.motivo)) faltan[String(d.materialId)] = 'Elija un motivo';
      else if (c.motivo === 'Otro' && !c.otroMotivo?.trim()) faltan[String(d.materialId)] = 'Escriba el motivo';
    }
    if (Object.keys(faltan).length) throw new ReglaNegocioError('Elija el motivo de cada diferencia.', 400, faltan);

    const conteo = await tx.conteo.create({ data: { usuarioId: q.usuarioId } });
    for (const l of lineas) {
      const c = contados.find((x) => x.materialId === l.materialId)!;
      const d = diferencias.find((x) => x.materialId === l.materialId);
      const motivo = d ? (c.motivo === 'Otro' ? c.otroMotivo!.trim() : c.motivo!) : null;
      await tx.conteoLinea.create({ data: { conteoId: conteo.id, materialId: l.materialId, sistema: new Prisma.Decimal(l.sistema), contado: new Prisma.Decimal(l.contado), motivo } });
      if (d) await tx.material.update({ where: { id: l.materialId }, data: { stockFisico: new Prisma.Decimal(l.contado) } });
      await tx.movimientoInventario.create({
        data: {
          materialId: l.materialId, tipo: d ? 'ajuste' : 'conteo', motivo: d ? 'Ajuste de conteo' : 'Conteo de inventario · coincide', detalle: motivo,
          cantidad: new Prisma.Decimal(d ? d.diferencia : 0), saldo: new Prisma.Decimal(l.contado), conteoId: conteo.id, usuarioId: q.usuarioId,
        },
      });
    }
    await registrarBitacora(tx, {
      usuarioId: q.usuarioId, modulo: 'almacen', accion: 'conteo_guardado', entidad: 'conteo', entidadId: conteo.id, ip: q.ip,
      valorNuevo: { materiales: lineas.length, ajustes: diferencias.map((d) => ({ material: d.nombre, sistema: d.sistema, contado: d.contado })) },
    });
    return { conteoId: conteo.id, contados: lineas.length, coincidieron: lineas.length - diferencias.length, ajustados: diferencias.length };
  });
}
