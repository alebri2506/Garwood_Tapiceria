// A8 Reponer (CU-A02, A03, A04): telas para encargar, materiales de stock por reponer y compras por llegar.
// GARWEB no le pide al proveedor: el Administrador pide por teléfono o WhatsApp como siempre y aquí solo lo anota.
import { Prisma } from '@prisma/client';
import { prisma } from '../../../shared/infrastructure/prisma.js';
import { registrarBitacora } from '../../../shared/infrastructure/bitacora.js';
import { parametroNumero, parametroTexto } from '../../../shared/infrastructure/parametros.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import { hoyNegocio } from '../../comercial/domain/calendario.js';
import {
  aTiempo, aplicarMovimiento, cantidadSugerida, explicarSugerido, fechaEstimada, necesitaReponer, r2, razonReposicion, siguienteCodigo,
} from '../domain/inventario.js';
import { fechaIso, num, situacionMateriales } from './situacion.js';

interface Quien { usuarioId: number; ip?: string }

const CANAL: Record<string, string> = { telefono: 'Teléfono', whatsapp: 'WhatsApp' };
const tarda = (p: { diasMin: number; diasMax: number }) => (p.diasMin === p.diasMax ? `${p.diasMax} días` : `${p.diasMin}–${p.diasMax} días`);
const fechaDb = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** A8: las tres listas de la pantalla. */
export async function reponer() {
  const semanas = await parametroNumero(prisma, 'inventario.semanas_compra');
  const [situacion, encargos, enCamino, proveedores] = await Promise.all([
    situacionMateriales(prisma),
    prisma.encargoTela.findMany({ where: { estado: 'por_encargar' }, include: { material: { include: { proveedor: true } }, pedido: { include: { cliente: true } } }, orderBy: { fecha: 'asc' } }),
    prisma.compra.findMany({
      where: { estado: 'por_llegar' }, orderBy: [{ fechaEstimada: 'asc' }, { id: 'asc' }],
      include: { proveedor: true, lineas: { include: { material: true, encargo: { include: { pedido: true } } } } },
    }),
    prisma.proveedor.findMany({ where: { activo: true, tipo: 'stock' }, orderBy: { nombre: 'asc' } }),
  ]);

  // Telas para encargar: una línea por tela, sumando lo cotizado de cada pedido.
  const telas = new Map<number, (typeof encargos)[number][]>();
  for (const e of encargos) telas.set(e.materialId, [...(telas.get(e.materialId) ?? []), e]);
  const hoy = hoyNegocio();
  const telasParaEncargar = [...telas.values()].map((lista) => {
    const t = lista[0]!.material;
    const necesita = lista.map((e) => fechaIso(e.fechaNecesaria)).filter((f): f is string => !!f).sort()[0] ?? null;
    const llegaria = t.proveedor ? fechaEstimada(hoy, t.proveedor.diasMax) : null;
    const cantidad = r2(lista.reduce((s, e) => s + num(e.cantidad), 0));
    return {
      materialId: t.id, nombre: t.nombre, modelo: t.pattern ? `Pattern ${t.pattern} · color ${t.numeroColor}` : null,
      cantidad, precio: num(lista[0]!.precio), subtotal: r2(lista.reduce((s, e) => s + num(e.cantidad) * num(e.precio), 0)),
      proveedor: t.proveedor ? { nombre: t.proveedor.nombre, tarda: tarda(t.proveedor) } : null,
      necesitaEl: necesita, urgente: necesita != null && llegaria != null && llegaria >= necesita,
      pedidos: lista.map((e) => ({ codigo: e.pedido.codigo, cantidad: num(e.cantidad) })),
    };
  });

  // Materiales de stock por reponer, agrupados por proveedor (cada proveedor se pide de una vez).
  const porReponer = situacion.filter(necesitaReponer);
  const porProveedor = proveedores
    .map((p) => {
      const lineas = porReponer.filter((s) => s.material.proveedorId === p.id).map((s) => {
        const razon = razonReposicion(s, s.material.unidadMedida, s.reservas.map((r) => r.pedido));
        return {
          materialId: s.material.id, nombre: s.material.nombre, unidad: s.material.unidadMedida, precio: num(s.material.precio),
          sugerido: cantidadSugerida(s, semanas), calculo: explicarSugerido(s, semanas), razon: razon.texto, urgente: razon.urgente,
        };
      });
      return { id: p.id, nombre: p.nombre, canal: CANAL[p.canal] ?? p.canal, contacto: p.contacto, tarda: tarda(p), lineas };
    })
    .filter((p) => p.lineas.length > 0);
  const sinProveedor = porReponer.filter((s) => !s.material.proveedorId).map((s) => s.material.nombre);

  const porLlegar = enCamino.flatMap((c) =>
    c.lineas.map((l) => {
      const esTela = !!l.encargo;
      const necesita = esTela ? fechaIso(l.encargo!.fechaNecesaria) : null;
      const llega = fechaIso(c.fechaEstimada);
      const tiempo = aTiempo(llega, necesita);
      return {
        compraId: c.id, codigo: c.codigo, nombre: esTela && l.material.pattern ? `Tela ${l.material.nombre} · Pattern ${l.material.pattern} · color ${l.material.numeroColor}` : l.material.nombre,
        proveedor: c.proveedor.nombre, pedidoEl: c.fechaPedido.toISOString(), llegaEl: llega, cantidad: num(l.cantidad), unidad: l.material.unidadMedida,
        para: esTela ? `Encargada para ${l.encargo!.pedido.codigo} · no entra al stock` : 'Reposición del stock',
        esTela, tiempo, necesitaEl: necesita,
      };
    }),
  );

  return { semanas, unidadTelas: await parametroTexto(prisma, 'unidad.telas'), telasParaEncargar, porProveedor, sinProveedor, porLlegar };
}

async function siguienteCodigoCompra(tx: Prisma.TransactionClient) {
  const ultima = await tx.compra.findFirst({ orderBy: { codigo: 'desc' }, select: { codigo: true } });
  return siguienteCodigo('OC', ultima?.codigo);
}

/** A8 «Marcar como pedido»: la compra pasa a «Por llegar» con la fecha estimada según lo que tarda el proveedor. */
export async function marcarComoPedido(proveedorId: number, lineas: { materialId: number; cantidad: number }[], q: Quien) {
  const p = await prisma.proveedor.findUnique({ where: { id: proveedorId } });
  if (!p || !p.activo || p.tipo !== 'stock') throw new ReglaNegocioError('Elija un proveedor de materiales de stock.', 400);
  const validas = lineas.filter((l) => l.cantidad > 0);
  if (!validas.length) throw new ReglaNegocioError('Indique al menos una cantidad mayor que 0.', 400);
  const materiales = await prisma.material.findMany({ where: { id: { in: validas.map((l) => l.materialId) } } });
  for (const l of validas) {
    const m = materiales.find((x) => x.id === l.materialId);
    if (!m || m.categoria === 'tela' || !m.activo) throw new ReglaNegocioError('Uno de los materiales ya no está en el inventario.', 400);
    if (m.proveedorId !== proveedorId) throw new ReglaNegocioError(`«${m.nombre}» se le compra a otro proveedor.`, 400);
  }
  const compra = await prisma.$transaction(async (tx) => {
    const c = await tx.compra.create({
      data: {
        codigo: await siguienteCodigoCompra(tx), proveedorId, estado: 'por_llegar', fechaEstimada: fechaDb(fechaEstimada(hoyNegocio(), p.diasMax)), registradoPor: q.usuarioId,
        lineas: { create: validas.map((l) => ({ materialId: l.materialId, cantidad: new Prisma.Decimal(r2(l.cantidad)), precio: materiales.find((m) => m.id === l.materialId)!.precio ?? new Prisma.Decimal(0) })) },
      },
    });
    await registrarBitacora(tx, { usuarioId: q.usuarioId, modulo: 'almacen', accion: 'compra_pedida', entidad: 'compra', entidadId: c.id, ip: q.ip, valorNuevo: { codigo: c.codigo, proveedor: p.nombre, lineas: validas } });
    return c;
  });
  return { codigo: compra.codigo, llegaEl: fechaIso(compra.fechaEstimada) };
}

/** A8 «Marcar como encargada»: todos los pedidos que esperan esa tela van en un mismo encargo al proveedor de telas. */
export async function encargarTela(materialId: number, q: Quien) {
  const encargos = await prisma.encargoTela.findMany({ where: { materialId, estado: 'por_encargar' }, include: { material: { include: { proveedor: true } }, pedido: true } });
  if (!encargos.length) throw new ReglaNegocioError('Esa tela ya no tiene pedidos por encargar.', 400);
  const t = encargos[0]!.material;
  if (!t.proveedor) throw new ReglaNegocioError('La tela no tiene proveedor: asígnelo en Telas (muestrario).', 400);
  const compra = await prisma.$transaction(async (tx) => {
    const c = await tx.compra.create({
      data: {
        codigo: await siguienteCodigoCompra(tx), proveedorId: t.proveedor!.id, estado: 'por_llegar', fechaEstimada: fechaDb(fechaEstimada(hoyNegocio(), t.proveedor!.diasMax)), registradoPor: q.usuarioId,
        lineas: { create: encargos.map((e) => ({ materialId, cantidad: e.cantidad, precio: e.precio, encargoId: e.id })) },
      },
    });
    await tx.encargoTela.updateMany({ where: { id: { in: encargos.map((e) => e.id) } }, data: { estado: 'encargada' } });
    await registrarBitacora(tx, { usuarioId: q.usuarioId, modulo: 'almacen', accion: 'tela_encargada', entidad: 'compra', entidadId: c.id, ip: q.ip, valorNuevo: { codigo: c.codigo, tela: t.nombre, pedidos: encargos.map((e) => e.pedido.codigo) } });
    return c;
  });
  return { codigo: compra.codigo, llegaEl: fechaIso(compra.fechaEstimada) };
}

/**
 * A8 «Llegó»: los materiales de stock suman al estante (entrada en Movimientos) y la tela queda asignada a su pedido
 * (no entra al stock). Si llegó menos, se corrige después en Movimientos con «Llegó menos de lo pedido» (E4).
 */
export async function registrarLlegada(compraId: number, q: Quien) {
  const c = await prisma.compra.findUnique({ where: { id: compraId }, include: { proveedor: true, lineas: { include: { material: true, encargo: { include: { pedido: true } } } } } });
  if (!c) throw new ReglaNegocioError('No encontramos esa compra.', 404);
  if (c.estado !== 'por_llegar') throw new ReglaNegocioError('Esa compra ya se marcó como recibida.', 409);
  const efectos: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const l of c.lineas) {
      if (l.encargo) {
        await tx.encargoTela.update({ where: { id: l.encargo.id }, data: { estado: 'llego' } });
        efectos.push(`${r2(num(l.cantidad))} yd de ${l.material.nombre} quedaron asignadas a ${l.encargo.pedido.codigo}`);
        continue;
      }
      const m = await tx.material.findUniqueOrThrow({ where: { id: l.materialId } });
      const r = aplicarMovimiento(num(m.stockFisico), num(l.cantidad));
      if ('error' in r) throw new ReglaNegocioError(r.error, 400);
      await tx.material.update({ where: { id: m.id }, data: { stockFisico: new Prisma.Decimal(r.saldo) } });
      await tx.movimientoInventario.create({
        data: { materialId: m.id, tipo: 'entrada', motivo: 'Compra recibida', detalle: `${c.proveedor.nombre} · ${c.codigo}`, cantidad: l.cantidad, saldo: new Prisma.Decimal(r.saldo), compraId: c.id, usuarioId: q.usuarioId },
      });
      efectos.push(`${m.nombre}: +${r2(num(l.cantidad))} ${m.unidadMedida} al stock`);
    }
    await tx.compra.update({ where: { id: c.id }, data: { estado: 'llego', fechaLlegada: new Date(), recibidoPor: q.usuarioId } });
    await registrarBitacora(tx, { usuarioId: q.usuarioId, modulo: 'almacen', accion: 'compra_recibida', entidad: 'compra', entidadId: c.id, ip: q.ip, valorAnterior: { estado: 'por_llegar' }, valorNuevo: { estado: 'llego', efectos } });
  });
  return { codigo: c.codigo, efectos };
}
