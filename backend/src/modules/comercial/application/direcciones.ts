import { prisma, type Db } from '../../../shared/infrastructure/prisma.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import type { DireccionEntrada } from '../http/solicitud.schemas.js';
import { ciudadDe, seraPrincipal } from '../../historial/application/direccionesPerfil.js';

/** Una dirección guardada solo se puede usar si es del mismo cliente (RG-07). */
export async function revisarDireccion(d: DireccionEntrada | undefined, clienteId: number) {
  if (d?.tipo !== 'guardada') return;
  const propia = await prisma.direccion.findFirst({ where: { id: d.id, clienteId, activo: true } });
  if (!propia) throw new ReglaNegocioError('La dirección elegida no está en el perfil del cliente. Elija otra o escriba una nueva.', 400);
}

/**
 * Crea la dirección nueva (y la deja en Mi perfil si se pidió) o devuelve el id de la guardada.
 * Si se guarda y el cliente aún no tiene principal, queda como principal (decisiones E.2.1).
 */
export async function idDireccion(tx: Db, d: DireccionEntrada | undefined, clienteId: number) {
  if (!d) return null;
  if (d.tipo === 'guardada') return d.id;
  const creada = await tx.direccion.create({
    data: {
      clienteId, direccion: d.texto, referencia: d.referencia ?? null, ciudad: ciudadDe(d.texto),
      latitud: d.latitud ?? null, longitud: d.longitud ?? null, guardada: d.guardar,
      esPrincipal: d.guardar && (await seraPrincipal(tx, clienteId)),
    },
  });
  return creada.id;
}
