// W10 Mi perfil › Direcciones de entrega (CU-H02 · decisiones-recientes.md E.2).
// RG-07: el cliente sale de la sesión; una dirección se busca SIEMPRE por su id y el cliente de la sesión.
// RG-03: quitar no borra: la dirección se oculta y las solicitudes que la usaron la conservan.
import { prisma, type Db } from '../../../shared/infrastructure/prisma.js';
import { registrarBitacora } from '../../../shared/infrastructure/bitacora.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import { direccionesDelCliente } from '../../comercial/application/catalogoSolicitud.js';

/** Las direcciones que se ven en Mi perfil y en W2: guardadas y no quitadas. */
const enPerfil = (clienteId: number) => ({ clienteId, guardada: true, activo: true });

/** "48 Park St, Montclair, NJ 07042" → "Montclair". */
export const ciudadDe = (texto: string) => texto.split(',').map((x) => x.trim()).filter(Boolean)[1] ?? null;

/** E.2.1: si el cliente todavía no tiene principal, la que se guarda ahora lo es. */
export async function seraPrincipal(db: Db, clienteId: number) {
  return !(await db.direccion.findFirst({ where: { ...enPerfil(clienteId), esPrincipal: true }, select: { id: true } }));
}

async function clienteDeSesion(usuarioId: number) {
  const u = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { clienteId: true } });
  if (!u?.clienteId) throw new ReglaNegocioError('Solo un cliente tiene Mi perfil.', 403);
  return u.clienteId;
}

/** Una dirección del perfil de ESTE cliente; si es de otro o ya se quitó, responde como si no existiera. */
async function propia(db: Db, clienteId: number, id: number) {
  const d = await db.direccion.findFirst({ where: { id, ...enPerfil(clienteId) } });
  if (!d) throw new ReglaNegocioError('No encontramos esa dirección en su perfil.', 404);
  return d;
}

const resumen = (d: { id: number; etiqueta: string | null; direccion: string }) => ({ direccionId: d.id, etiqueta: d.etiqueta, direccion: d.direccion });

export interface NuevaDireccion { etiqueta: string; direccion: string; referencia?: string; latitud?: number; longitud?: number }

/** E.2.1: agrega una dirección con su etiqueta; la primera queda como principal. */
export async function agregarDireccion(usuarioId: number, e: NuevaDireccion, ip?: string) {
  const clienteId = await clienteDeSesion(usuarioId);
  await prisma.$transaction(async (tx) => {
    const creada = await tx.direccion.create({
      data: {
        clienteId, etiqueta: e.etiqueta, direccion: e.direccion, referencia: e.referencia ?? null, ciudad: ciudadDe(e.direccion),
        latitud: e.latitud ?? null, longitud: e.longitud ?? null, guardada: true, esPrincipal: await seraPrincipal(tx, clienteId),
      },
    });
    await registrarBitacora(tx, {
      usuarioId, modulo: 'historial', accion: 'direccion_agregada', entidad: 'cliente', entidadId: clienteId,
      valorNuevo: { ...resumen(creada), principal: creada.esPrincipal }, ip,
    });
  });
  return { direcciones: await direccionesDelCliente(clienteId) };
}

/** E.2.4: la principal se propone en W2 (delivery) y en el despacho. Siempre hay una sola. */
export async function marcarPrincipal(usuarioId: number, id: number, ip?: string) {
  const clienteId = await clienteDeSesion(usuarioId);
  await prisma.$transaction(async (tx) => {
    const d = await propia(tx, clienteId, id);
    if (d.esPrincipal) return;
    const anterior = await tx.direccion.findFirst({ where: { ...enPerfil(clienteId), esPrincipal: true } });
    // En este orden: primero se desmarca la anterior (la base no admite dos principales a la vez).
    if (anterior) await tx.direccion.update({ where: { id: anterior.id }, data: { esPrincipal: false } });
    await tx.direccion.update({ where: { id: d.id }, data: { esPrincipal: true } });
    await registrarBitacora(tx, {
      usuarioId, modulo: 'historial', accion: 'direccion_principal', entidad: 'cliente', entidadId: clienteId,
      valorAnterior: anterior ? resumen(anterior) : undefined, valorNuevo: resumen(d), ip,
    });
  });
  return { direcciones: await direccionesDelCliente(clienteId) };
}

/**
 * E.2.2 y E.2.4: quita una dirección del perfil (se oculta, no se borra). Si era la principal, la siguiente
 * (la más antigua que queda) pasa a serlo.
 */
export async function quitarDireccion(usuarioId: number, id: number, ip?: string) {
  const clienteId = await clienteDeSesion(usuarioId);
  await prisma.$transaction(async (tx) => {
    const d = await propia(tx, clienteId, id);
    await tx.direccion.update({ where: { id: d.id }, data: { activo: false, esPrincipal: false } });
    let nuevaPrincipal = null;
    if (d.esPrincipal) {
      nuevaPrincipal = await tx.direccion.findFirst({ where: enPerfil(clienteId), orderBy: [{ fechaCreacion: 'asc' }, { id: 'asc' }] });
      if (nuevaPrincipal) await tx.direccion.update({ where: { id: nuevaPrincipal.id }, data: { esPrincipal: true } });
    }
    await registrarBitacora(tx, {
      usuarioId, modulo: 'historial', accion: 'direccion_quitada', entidad: 'cliente', entidadId: clienteId,
      valorAnterior: { ...resumen(d), principal: d.esPrincipal },
      valorNuevo: nuevaPrincipal ? { nuevaPrincipal: resumen(nuevaPrincipal) } : undefined,
      ip,
    });
  });
  return { direcciones: await direccionesDelCliente(clienteId) };
}
