// A14 Parámetros › Tamaño de carga por tipo de mueble (decisiones K): define cuánto suma cada mueble al transporte
// (chica, mediana o grande; la tarifa de cada tamaño está en «Tarifas»). Cada cambio va a la bitácora (RG-02).
import { prisma } from '../../../shared/infrastructure/prisma.js';
import { registrarBitacora } from '../../../shared/infrastructure/bitacora.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import type { TamanoCarga } from '../../comercial/domain/cotizacion.js';

interface Quien { usuarioId: number; ip?: string }

export async function listarCargas() {
  const tipos = await prisma.tipoMueble.findMany({ where: { activo: true }, orderBy: { orden: 'asc' } });
  return tipos.map((t) => ({ id: t.id, nombre: t.nombre, tamanoCarga: t.tamanoCarga }));
}

export async function cambiarCarga(id: number, tamano: TamanoCarga, q: Quien) {
  const t = Number.isInteger(id) && id > 0 ? await prisma.tipoMueble.findUnique({ where: { id } }) : null;
  if (!t) throw new ReglaNegocioError('No encontramos ese tipo de mueble.', 404);
  if (t.tamanoCarga === tamano) return { id: t.id, nombre: t.nombre, tamanoCarga: t.tamanoCarga, sinCambios: true };
  const nuevo = await prisma.$transaction(async (tx) => {
    const x = await tx.tipoMueble.update({ where: { id }, data: { tamanoCarga: tamano } });
    await registrarBitacora(tx, {
      usuarioId: q.usuarioId, modulo: 'configuracion', accion: 'tamano_carga_modificado', entidad: 'tipo_mueble', entidadId: id,
      valorAnterior: { tamanoCarga: t.tamanoCarga }, valorNuevo: { tamanoCarga: tamano }, ip: q.ip,
    });
    return x;
  });
  return { id: nuevo.id, nombre: nuevo.nombre, tamanoCarga: nuevo.tamanoCarga, sinCambios: false };
}

/** Los cambios de tamaño como líneas del historial de A14. */
export async function historialCargas(limite: number) {
  const filas = await prisma.bitacora.findMany({
    where: { accion: 'tamano_carga_modificado' }, orderBy: [{ fecha: 'desc' }, { id: 'desc' }], take: limite, include: { usuario: true },
  });
  const nombres = new Map((await prisma.tipoMueble.findMany({ where: { id: { in: filas.map((f) => f.entidadId!).filter(Boolean) } } })).map((t) => [t.id, t.nombre]));
  return filas.map((f) => ({
    id: `c${f.id}`, clave: 'tipo_mueble.tamano_carga', etiqueta: `Carga · ${nombres.get(f.entidadId!) ?? 'Mueble'}`, unidad: null,
    valorAnterior: String((f.valorAnterior as { tamanoCarga?: string } | null)?.tamanoCarga ?? ''),
    valorNuevo: String((f.valorNuevo as { tamanoCarga?: string } | null)?.tamanoCarga ?? ''),
    usuario: f.usuario?.nombre ?? f.usuario?.nombreUsuario ?? 'Sistema', fecha: f.fecha.toISOString(),
  }));
}
