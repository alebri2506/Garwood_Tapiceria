// Cálculo de la situación de cada material de stock: reservado, por llegar y consumo (lo usan A15, A8, A8c y el panel).
// Nada de esto se guarda: se calcula de las reservas, las compras y los movimientos (una sola fuente de verdad).
import type { Material, Proveedor } from '@prisma/client';
import type { Db } from '../../../shared/infrastructure/prisma.js';
import { parametroNumero } from '../../../shared/infrastructure/parametros.js';
import { consumoSemanal, esCategoriaStock, r2, type SituacionMaterial } from '../domain/inventario.js';

export const num = (d: { toString(): string } | null | undefined) => (d == null ? 0 : Number(d.toString()));
export const fechaIso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export interface MaterialConSituacion extends SituacionMaterial {
  material: Material & { proveedor: Proveedor | null };
  /** Pedidos con reserva pendiente: código y cantidad. */
  reservas: { pedido: string; cantidad: number }[];
  /** Próxima llegada de una compra en camino ('AAAA-MM-DD'). */
  llegaEl: string | null;
}

/** Situación de los materiales de stock activos (o de los indicados en `ids`). */
export async function situacionMateriales(db: Db, ids?: number[]): Promise<MaterialConSituacion[]> {
  const semanas = await parametroNumero(db, 'inventario.semanas_promedio');
  const desde = new Date(Date.now() - semanas * 7 * 24 * 3600 * 1000);
  const filtro = ids ? { id: { in: ids } } : { activo: true };
  const materiales = (await db.material.findMany({ where: { ...filtro, categoria: { not: 'tela' } }, include: { proveedor: true }, orderBy: { nombre: 'asc' } }))
    .filter((m) => esCategoriaStock(m.categoria));
  const idsM = materiales.map((m) => m.id);

  const [reservas, enCamino, consumos] = await Promise.all([
    db.reservaMaterial.findMany({ where: { activa: true, materialId: { in: idsM } }, include: { pedido: { select: { codigo: true } } }, orderBy: { fecha: 'asc' } }),
    db.compraLinea.findMany({ where: { materialId: { in: idsM }, encargoId: null, compra: { estado: 'por_llegar' } }, include: { compra: true } }),
    // Consumo neto: retiros (−) y devoluciones (+) ligados a un pedido.
    db.movimientoInventario.groupBy({ by: ['materialId'], where: { materialId: { in: idsM }, pedidoId: { not: null }, fecha: { gte: desde } }, _sum: { cantidad: true } }),
  ]);

  return materiales.map((m) => {
    const propias = reservas
      .filter((r) => r.materialId === m.id)
      .map((r) => ({ pedido: r.pedido.codigo, cantidad: r2(Math.max(0, num(r.cantidad) - num(r.retirado))) }))
      .filter((r) => r.cantidad > 0);
    const compras = enCamino.filter((l) => l.materialId === m.id);
    const llegadas = compras.map((l) => fechaIso(l.compra.fechaEstimada)).filter((f): f is string => !!f).sort();
    const consumo = consumos.find((c) => c.materialId === m.id);
    return {
      material: m,
      fisico: num(m.stockFisico),
      reservado: r2(propias.reduce((t, r) => t + r.cantidad, 0)),
      minimo: num(m.stockMinimo),
      porLlegar: r2(compras.reduce((t, l) => t + num(l.cantidad), 0)),
      consumoSemanal: consumoSemanal(-num(consumo?._sum.cantidad), semanas),
      reservas: propias,
      llegaEl: llegadas[0] ?? null,
    };
  });
}
