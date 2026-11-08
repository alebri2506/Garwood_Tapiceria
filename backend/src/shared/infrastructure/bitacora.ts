import type { Prisma } from '@prisma/client';
import type { Db } from './prisma.js';

interface EntradaBitacora {
  usuarioId?: number | null;
  modulo: string;
  accion: string;
  entidad: string;
  entidadId?: number | null;
  valorAnterior?: Prisma.InputJsonValue;
  valorNuevo?: Prisma.InputJsonValue;
  ip?: string;
}

/** RG-02: toda acción relevante queda registrada con usuario, fecha y hora. */
export function registrarBitacora(db: Db, e: EntradaBitacora) {
  return db.bitacora.create({ data: e });
}
