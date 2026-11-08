import { prisma, type Db } from '../../../shared/infrastructure/prisma.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import type { DireccionEntrada } from '../http/solicitud.schemas.js';

/** Una dirección guardada solo se puede usar si es del mismo cliente (RG-07). */
export async function revisarDireccion(d: DireccionEntrada | undefined, clienteId: number) {
  if (d?.tipo !== 'guardada') return;
  const propia = await prisma.direccion.findFirst({ where: { id: d.id, clienteId, activo: true } });
  if (!propia) throw new ReglaNegocioError('La dirección elegida no está en el perfil del cliente. Elija otra o escriba una nueva.', 400);
}

/** Crea la dirección nueva (y la deja en Mi perfil si se pidió) o devuelve el id de la guardada. */
export async function idDireccion(tx: Db, d: DireccionEntrada | undefined, clienteId: number) {
  if (!d) return null;
  if (d.tipo === 'guardada') return d.id;
  const partes = d.texto.split(',').map((x) => x.trim()).filter(Boolean);
  const creada = await tx.direccion.create({
    data: {
      clienteId, direccion: d.texto, referencia: d.referencia ?? null, ciudad: partes[1] ?? null,
      latitud: d.latitud ?? null, longitud: d.longitud ?? null, guardada: d.guardar,
    },
  });
  return creada.id;
}
