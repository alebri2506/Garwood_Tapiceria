// A15 Stock, A15b Telas (muestrario) y A8p Proveedores (CU-A01). Toda escritura queda en la bitácora (RG-02).
import { Prisma, type Material, type Proveedor } from '@prisma/client';
import { prisma } from '../../../shared/infrastructure/prisma.js';
import { registrarBitacora } from '../../../shared/infrastructure/bitacora.js';
import { parametroTexto } from '../../../shared/infrastructure/parametros.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import { hoyNegocio } from '../../comercial/domain/calendario.js';
import {
  CATEGORIAS_STOCK, COLORES_TELA, TIPOS_TELA, UNIDADES, alcanzaPara, disponible, estadoStock, necesitaReponer, nombreTela, r2, siguienteCodigo,
  type CategoriaStock,
} from '../domain/inventario.js';
import { fechaIso, num, situacionMateriales } from './situacion.js';

interface Quien { usuarioId: number; ip?: string }

const nombreUsuario = (u: { nombre: string | null; nombreUsuario: string }) => u.nombre ?? u.nombreUsuario;
const decimal = (n: number | null | undefined) => (n == null ? null : new Prisma.Decimal(r2(n)));
const tardaTexto = (p: Pick<Proveedor, 'diasMin' | 'diasMax'>) => (p.diasMin === p.diasMax ? `${p.diasMax} días` : `${p.diasMin}–${p.diasMax} días`);

const proveedorCorto = (p: Proveedor | null) => (p ? { id: p.id, nombre: p.nombre, tarda: tardaTexto(p) } : null);

/** Datos para los formularios: unidades, categorías, proveedores activos, tipos y colores de tela. */
export async function opcionesInventario() {
  const proveedores = await prisma.proveedor.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } });
  return {
    unidades: UNIDADES,
    categorias: Object.entries(CATEGORIAS_STOCK).map(([valor, etiqueta]) => ({ valor, etiqueta })),
    proveedores: proveedores.map((p) => ({ ...proveedorCorto(p)!, tipo: p.tipo })),
    tiposTela: TIPOS_TELA,
    coloresTela: COLORES_TELA,
  };
}

// ---------------------------------------------------------------- A15 Stock

/** A15: cada material de stock con lo que hay, lo reservado, lo disponible, el mínimo, cuánto alcanza y su estado. */
export async function listarStock() {
  const lista = await situacionMateriales(prisma);
  const ultimo = await prisma.movimientoInventario.findFirst({
    orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
    include: { material: true, usuario: true, pedido: { select: { codigo: true } } },
  });
  const materiales = lista.map((s) => {
    const estado = estadoStock(s);
    return {
      id: s.material.id, nombre: s.material.nombre, categoria: s.material.categoria, unidad: s.material.unidadMedida,
      proveedor: s.material.proveedor?.nombre ?? null,
      fisico: s.fisico, reservado: s.reservado, disponible: disponible(s), minimo: s.minimo, consumoSemanal: s.consumoSemanal,
      alcanza: alcanzaPara(s, s.material.unidadMedida), estado,
      porLlegar: s.porLlegar, llegaEl: s.llegaEl, reservadoPara: s.reservas.map((r) => r.pedido),
    };
  });
  return {
    materiales,
    porReponer: lista.filter(necesitaReponer).length,
    ultimoMovimiento: ultimo && {
      fecha: ultimo.fecha.toISOString(), quien: nombreUsuario(ultimo.usuario), motivo: ultimo.motivo, material: ultimo.material.nombre,
      cantidad: num(ultimo.cantidad), unidad: ultimo.material.unidadMedida, pedido: ultimo.pedido?.codigo ?? null,
    },
  };
}

/** A15 · ficha del material: números, datos y sus últimos movimientos. */
export async function fichaMaterial(id: number) {
  const [s] = await situacionMateriales(prisma, [id]);
  if (!s) throw new ReglaNegocioError('No encontramos ese material.', 404);
  const movimientos = await prisma.movimientoInventario.findMany({
    where: { materialId: id }, orderBy: [{ fecha: 'desc' }, { id: 'desc' }], take: 4,
    include: { usuario: true, pedido: { select: { codigo: true } } },
  });
  const m = s.material;
  return {
    id: m.id, nombre: m.nombre, categoria: m.categoria, unidad: m.unidadMedida, ubicacion: m.ubicacion,
    fisico: s.fisico, reservado: s.reservado, disponible: disponible(s), minimo: s.minimo, consumoSemanal: s.consumoSemanal,
    estado: estadoStock(s), alcanza: alcanzaPara(s, m.unidadMedida),
    proveedor: proveedorCorto(m.proveedor), precio: num(m.precio), fechaPrecio: fechaIso(m.fechaPrecio),
    tieneMovimientos: (await prisma.movimientoInventario.count({ where: { materialId: id } })) > 0,
    movimientos: movimientos.map((x) => ({
      fecha: x.fecha.toISOString(), motivo: x.motivo, pedido: x.pedido?.codigo ?? null, quien: nombreUsuario(x.usuario), cantidad: num(x.cantidad),
    })),
  };
}

export interface DatosMaterial {
  nombre: string;
  categoria?: CategoriaStock;
  unidad?: string;
  proveedorId: number;
  minimo: number;
  precio: number;
  ubicacion?: string | null;
}

async function revisarProveedor(proveedorId: number, tipo: 'stock' | 'telas') {
  const p = await prisma.proveedor.findUnique({ where: { id: proveedorId } });
  if (!p || !p.activo) throw new ReglaNegocioError('Elija un proveedor de la lista.', 400, { proveedorId: 'Elija un proveedor de la lista.' });
  if (p.tipo !== tipo) {
    const msg = tipo === 'telas' ? 'Ese proveedor no vende telas bajo pedido.' : 'Ese proveedor solo vende telas bajo pedido.';
    throw new ReglaNegocioError(msg, 400, { proveedorId: msg });
  }
  return p;
}

async function nombreLibre(nombre: string, excepto?: number) {
  const igual = await prisma.material.findFirst({ where: { nombre: { equals: nombre, mode: 'insensitive' }, ...(excepto ? { id: { not: excepto } } : {}) } });
  if (igual) throw new ReglaNegocioError(`Ya existe «${igual.nombre}».`, 409, { nombre: 'Ya existe un material o una tela con ese nombre.' });
}

async function siguienteCodigoMaterial(prefijo: string) {
  const ultimo = await prisma.material.findFirst({ where: { codigo: { startsWith: `${prefijo}-` } }, orderBy: { codigo: 'desc' } });
  return siguienteCodigo(prefijo, ultimo?.codigo);
}

/** A15 «Nuevo material»: entra con 0; su primera cantidad llega con «Llegó» (Reponer) o con el conteo. */
export async function crearMaterial(d: DatosMaterial, q: Quien) {
  if (!d.unidad || !UNIDADES.some((u) => u.valor === d.unidad)) throw new ReglaNegocioError('Elija la unidad de medida.', 400, { unidad: 'Elija la unidad de medida.' });
  await nombreLibre(d.nombre);
  await revisarProveedor(d.proveedorId, 'stock');
  const creado = await prisma.$transaction(async (tx) => {
    const m = await tx.material.create({
      data: {
        codigo: await siguienteCodigoMaterial('MAT'), nombre: d.nombre, categoria: d.categoria ?? 'insumo', unidadMedida: d.unidad!,
        proveedorId: d.proveedorId, stockMinimo: decimal(d.minimo)!, precio: decimal(d.precio), fechaPrecio: new Date(`${hoyNegocio()}T00:00:00Z`),
        ubicacion: d.ubicacion ?? null,
      },
    });
    await registrarBitacora(tx, {
      usuarioId: q.usuarioId, modulo: 'almacen', accion: 'material_creado', entidad: 'material', entidadId: m.id, ip: q.ip,
      valorNuevo: { nombre: m.nombre, unidad: m.unidadMedida, minimo: d.minimo, precio: d.precio, proveedorId: d.proveedorId },
    });
    return m;
  });
  return fichaMaterial(creado.id);
}

/** Guarda los campos que cambiaron con su valor anterior y nuevo (RG-02). */
function cambios<T extends Record<string, unknown>>(antes: T, despues: Partial<T>) {
  const anterior: Record<string, unknown> = {}, nuevo: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(despues)) {
    if (v !== undefined && String(antes[k] ?? '') !== String(v ?? '')) {
      anterior[k] = antes[k] ?? null;
      nuevo[k] = v ?? null;
    }
  }
  return { anterior, nuevo, hay: Object.keys(nuevo).length > 0 };
}

/** A15 «Editar ficha». La unidad no se cambia si ya tiene movimientos; el precio nuevo queda con su fecha. */
export async function editarMaterial(id: number, d: DatosMaterial, q: Quien) {
  const m = await prisma.material.findUnique({ where: { id } });
  if (!m || m.categoria === 'tela') throw new ReglaNegocioError('No encontramos ese material.', 404);
  await nombreLibre(d.nombre, id);
  await revisarProveedor(d.proveedorId, 'stock');
  if (d.unidad && d.unidad !== m.unidadMedida) {
    if (await prisma.movimientoInventario.count({ where: { materialId: id } })) {
      throw new ReglaNegocioError('La unidad no se puede cambiar: el material ya tiene movimientos.', 400, { unidad: 'No se puede cambiar: el material ya tiene movimientos.' });
    }
  }
  const antes = { nombre: m.nombre, unidad: m.unidadMedida, proveedorId: m.proveedorId, minimo: num(m.stockMinimo), precio: num(m.precio), ubicacion: m.ubicacion };
  const c = cambios(antes, { nombre: d.nombre, unidad: d.unidad, proveedorId: d.proveedorId, minimo: r2(d.minimo), precio: r2(d.precio), ubicacion: d.ubicacion });
  if (c.hay) {
    await prisma.$transaction(async (tx) => {
      await tx.material.update({
        where: { id },
        data: {
          nombre: d.nombre, unidadMedida: d.unidad ?? m.unidadMedida, proveedorId: d.proveedorId, stockMinimo: decimal(d.minimo)!,
          ubicacion: d.ubicacion === undefined ? m.ubicacion : d.ubicacion,
          ...('precio' in c.nuevo ? { precio: decimal(d.precio), fechaPrecio: new Date(`${hoyNegocio()}T00:00:00Z`) } : {}),
        },
      });
      await registrarBitacora(tx, { usuarioId: q.usuarioId, modulo: 'almacen', accion: 'material_modificado', entidad: 'material', entidadId: id, ip: q.ip, valorAnterior: c.anterior as Prisma.InputJsonObject, valorNuevo: c.nuevo as Prisma.InputJsonObject });
    });
  }
  return fichaMaterial(id);
}

// ---------------------------------------------------------------- A15b Telas (muestrario)

type TelaConUsos = Material & { proveedor: Proveedor | null; encargos: { cantidad: Prisma.Decimal; estado: string; pedido: { codigo: string; cliente: { tipoPersona: string; razonSocial: string | null; nombres: string; apellidos: string } } }[] };

const nombreCliente = (c: { tipoPersona: string; razonSocial: string | null; nombres: string; apellidos: string }) =>
  c.tipoPersona === 'empresa' && c.razonSocial ? c.razonSocial : `${c.nombres} ${c.apellidos}`.trim();
const ESTADO_ENCARGO: Record<string, string> = { por_encargar: 'por encargar', encargada: 'encargada · por llegar', llego: 'llegó' };

const telaDto = (t: TelaConUsos) => ({
  id: t.id, nombre: t.nombre, tipo: t.familia, color: t.colorFamilia, pattern: t.pattern, numeroColor: t.numeroColor, colorHex: t.colorHex,
  libro: t.libro, precio: num(t.precio), fechaPrecio: fechaIso(t.fechaPrecio), enWeb: t.enWeb, activa: t.activo,
  proveedor: proveedorCorto(t.proveedor),
  usos: t.encargos.map((e) => ({ pedido: e.pedido.codigo, cliente: nombreCliente(e.pedido.cliente), detalle: `${r2(num(e.cantidad))} yd · ${ESTADO_ENCARGO[e.estado] ?? e.estado}` })),
});

const incluirTela = {
  proveedor: true,
  encargos: { orderBy: { fecha: 'desc' as const }, take: 5, select: { cantidad: true, estado: true, pedido: { select: { codigo: true, cliente: { select: { tipoPersona: true, razonSocial: true, nombres: true, apellidos: true } } } } } },
};

/** A15b: el muestrario digital (sin cantidades). Las descontinuadas van al final. */
export async function listarTelas() {
  const telas = await prisma.material.findMany({ where: { categoria: 'tela' }, include: incluirTela, orderBy: [{ activo: 'desc' }, { nombre: 'asc' }] });
  // A14: las telas se guardan en yardas; la pantalla las muestra en la unidad elegida (yd o m).
  return { telas: telas.map(telaDto), unidadTelas: await parametroTexto(prisma, 'unidad.telas') };
}

export interface DatosTela {
  proveedorId: number;
  tipo: string;
  color: string;
  pattern: string;
  numeroColor: string;
  precio: number;
  enWeb: boolean;
  nombre?: string | null;
  libro?: string | null;
  colorHex?: string | null;
}

/** A15b «Nueva tela»: lo que dice el libro de muestras. Con el modelo y el número de color se le pide al proveedor. */
export async function crearTela(d: DatosTela, q: Quien) {
  await revisarProveedor(d.proveedorId, 'telas');
  const nombre = d.nombre?.trim() || nombreTela(d.tipo, d.pattern, d.numeroColor);
  await nombreLibre(nombre);
  const repetida = await prisma.material.findFirst({ where: { categoria: 'tela', pattern: d.pattern, numeroColor: d.numeroColor, proveedorId: d.proveedorId } });
  if (repetida) throw new ReglaNegocioError(`Esa tela ya está registrada como «${repetida.nombre}».`, 409, { pattern: 'Ya hay una tela con ese modelo y color.' });
  const t = await prisma.$transaction(async (tx) => {
    const creada = await tx.material.create({
      data: {
        codigo: `TL-${d.pattern}-${d.numeroColor}`.slice(0, 30), nombre, categoria: 'tela', unidadMedida: 'yd', familia: d.tipo, colorFamilia: d.color,
        pattern: d.pattern, numeroColor: d.numeroColor, colorHex: d.colorHex ?? null, libro: d.libro ?? null, enWeb: d.enWeb,
        precio: decimal(d.precio), fechaPrecio: new Date(`${hoyNegocio()}T00:00:00Z`), proveedorId: d.proveedorId,
      },
    });
    await registrarBitacora(tx, { usuarioId: q.usuarioId, modulo: 'almacen', accion: 'tela_creada', entidad: 'material', entidadId: creada.id, ip: q.ip, valorNuevo: { nombre, pattern: d.pattern, color: d.numeroColor, precio: d.precio, enWeb: d.enWeb } });
    return creada;
  });
  return telaDto(await prisma.material.findUniqueOrThrow({ where: { id: t.id }, include: incluirTela }));
}

/** A15b «Editar tela». Un precio nuevo queda con su fecha; las cotizaciones ya enviadas no cambian. */
export async function editarTela(id: number, d: DatosTela, q: Quien) {
  const t = await prisma.material.findUnique({ where: { id } });
  if (!t || t.categoria !== 'tela') throw new ReglaNegocioError('No encontramos esa tela.', 404);
  await revisarProveedor(d.proveedorId, 'telas');
  const nombre = d.nombre?.trim() || nombreTela(d.tipo, d.pattern, d.numeroColor);
  await nombreLibre(nombre, id);
  const antes = { nombre: t.nombre, tipo: t.familia, color: t.colorFamilia, pattern: t.pattern, numeroColor: t.numeroColor, precio: num(t.precio), enWeb: t.enWeb, libro: t.libro, proveedorId: t.proveedorId };
  const c = cambios(antes, { nombre, tipo: d.tipo, color: d.color, pattern: d.pattern, numeroColor: d.numeroColor, precio: r2(d.precio), enWeb: d.enWeb, libro: d.libro ?? null, proveedorId: d.proveedorId });
  if (c.hay) {
    await prisma.$transaction(async (tx) => {
      await tx.material.update({
        where: { id },
        data: {
          nombre, familia: d.tipo, colorFamilia: d.color, pattern: d.pattern, numeroColor: d.numeroColor, enWeb: d.enWeb, libro: d.libro ?? null,
          proveedorId: d.proveedorId, ...(d.colorHex ? { colorHex: d.colorHex } : {}),
          ...('precio' in c.nuevo ? { precio: decimal(d.precio), fechaPrecio: new Date(`${hoyNegocio()}T00:00:00Z`) } : {}),
        },
      });
      await registrarBitacora(tx, { usuarioId: q.usuarioId, modulo: 'almacen', accion: 'tela_modificada', entidad: 'material', entidadId: id, ip: q.ip, valorAnterior: c.anterior as Prisma.InputJsonObject, valorNuevo: c.nuevo as Prisma.InputJsonObject });
    });
  }
  return telaDto(await prisma.material.findUniqueOrThrow({ where: { id }, include: incluirTela }));
}

/** A15b «Marcar como descontinuada» / «Volver a ofrecer». No se borra: ya no aparece al cotizar ni en la web. */
export async function cambiarOfertaTela(id: number, activa: boolean, q: Quien) {
  const t = await prisma.material.findUnique({ where: { id } });
  if (!t || t.categoria !== 'tela') throw new ReglaNegocioError('No encontramos esa tela.', 404);
  if (t.activo !== activa) {
    await prisma.$transaction(async (tx) => {
      await tx.material.update({ where: { id }, data: { activo: activa } });
      await registrarBitacora(tx, { usuarioId: q.usuarioId, modulo: 'almacen', accion: activa ? 'tela_reactivada' : 'tela_descontinuada', entidad: 'material', entidadId: id, ip: q.ip, valorAnterior: { activa: t.activo }, valorNuevo: { activa } });
    });
  }
  return telaDto(await prisma.material.findUniqueOrThrow({ where: { id }, include: incluirTela }));
}

// ---------------------------------------------------------------- A8p Proveedores

const ESTADO_COMPRA: Record<string, string> = { por_llegar: 'Por llegar', llego: 'Llegó' };

/** A8p: proveedores con lo que se les compra, lo pendiente y sus últimas compras. */
export async function listarProveedores() {
  const [proveedores, situacion, encargos] = await Promise.all([
    prisma.proveedor.findMany({
      orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
      include: {
        materiales: { where: { activo: true }, orderBy: { nombre: 'asc' } },
        compras: { orderBy: { fechaPedido: 'desc' }, take: 4, include: { lineas: { include: { material: true } } } },
      },
    }),
    situacionMateriales(prisma),
    prisma.encargoTela.findMany({ where: { estado: 'por_encargar' }, include: { material: true } }),
  ]);
  return {
    proveedores: proveedores.map((p) => {
      const porPedir = situacion.filter((s) => s.material.proveedorId === p.id && necesitaReponer(s)).length;
      const porEncargar = new Set(encargos.filter((e) => e.material.proveedorId === p.id).map((e) => e.materialId)).size;
      return {
        id: p.id, nombre: p.nombre, canal: p.canal, contacto: p.contacto, diasMin: p.diasMin, diasMax: p.diasMax, tarda: tardaTexto(p), tipo: p.tipo, activo: p.activo,
        pendiente: p.tipo === 'telas'
          ? (porEncargar ? `${porEncargar} ${porEncargar === 1 ? 'tela' : 'telas'} por encargar` : null)
          : (porPedir ? `${porPedir} por pedir` : null),
        materiales: p.materiales.map((m) => {
          const s = situacion.find((x) => x.material.id === m.id);
          const estado = s ? estadoStock(s) : null;
          return { id: m.id, nombre: m.nombre, precio: num(m.precio), unidad: m.unidadMedida, estado };
        }),
        compras: p.compras.map((c) => ({
          codigo: c.codigo, estado: ESTADO_COMPRA[c.estado] ?? c.estado, fechaPedido: c.fechaPedido.toISOString(), fechaEstimada: fechaIso(c.fechaEstimada),
          fechaLlegada: c.fechaLlegada?.toISOString() ?? null,
          detalle: c.lineas.map((l) => `${l.material.nombre} · ${r2(num(l.cantidad))} ${l.material.unidadMedida}`).join(', '),
        })),
      };
    }),
  };
}

export interface DatosProveedor { nombre: string; canal: 'telefono' | 'whatsapp'; contacto: string; diasMin: number; diasMax: number; tipo: 'stock' | 'telas' }

export async function crearProveedor(d: DatosProveedor, q: Quien) {
  if (await prisma.proveedor.findFirst({ where: { nombre: { equals: d.nombre, mode: 'insensitive' } } })) {
    throw new ReglaNegocioError('Ya hay un proveedor con ese nombre.', 409, { nombre: 'Ya hay un proveedor con ese nombre.' });
  }
  const p = await prisma.$transaction(async (tx) => {
    const creado = await tx.proveedor.create({ data: d });
    await registrarBitacora(tx, { usuarioId: q.usuarioId, modulo: 'almacen', accion: 'proveedor_creado', entidad: 'proveedor', entidadId: creado.id, ip: q.ip, valorNuevo: { ...d } });
    return creado;
  });
  return { id: p.id };
}

export async function editarProveedor(id: number, d: DatosProveedor, q: Quien) {
  const p = await prisma.proveedor.findUnique({ where: { id }, include: { _count: { select: { materiales: true } } } });
  if (!p) throw new ReglaNegocioError('No encontramos ese proveedor.', 404);
  if (await prisma.proveedor.findFirst({ where: { nombre: { equals: d.nombre, mode: 'insensitive' }, id: { not: id } } })) {
    throw new ReglaNegocioError('Ya hay un proveedor con ese nombre.', 409, { nombre: 'Ya hay un proveedor con ese nombre.' });
  }
  if (d.tipo !== p.tipo && p._count.materiales > 0) {
    throw new ReglaNegocioError('No se puede cambiar qué le compra: ya tiene materiales o telas asignados.', 400, { tipo: 'Ya tiene materiales o telas asignados.' });
  }
  const c = cambios({ nombre: p.nombre, canal: p.canal, contacto: p.contacto, diasMin: p.diasMin, diasMax: p.diasMax, tipo: p.tipo }, d);
  if (c.hay) {
    await prisma.$transaction(async (tx) => {
      await tx.proveedor.update({ where: { id }, data: d });
      await registrarBitacora(tx, { usuarioId: q.usuarioId, modulo: 'almacen', accion: 'proveedor_modificado', entidad: 'proveedor', entidadId: id, ip: q.ip, valorAnterior: c.anterior as Prisma.InputJsonObject, valorNuevo: c.nuevo as Prisma.InputJsonObject });
    });
  }
  return { id };
}
