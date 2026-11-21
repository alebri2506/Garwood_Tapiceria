// CU-C13: cada pago confirmado lleva su recibo REC-0000 (el PDF llega después). Se asigna dentro de la transacción que
// confirma el pago; el índice único de `pago.recibo` impide repetir un número.
import type { Db } from '../../../shared/infrastructure/prisma.js';

export async function siguienteRecibo(tx: Db) {
  // Uno a la vez hasta el fin de la transacción: dos pagos confirmados al mismo tiempo no sacan el mismo número.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(7401)::text`;
  const [r] = await tx.$queryRaw<{ n: number | null }[]>`SELECT MAX(CAST(SUBSTRING(recibo FROM 5) AS INTEGER)) AS n FROM pago WHERE recibo ~ '^REC-[0-9]+$'`;
  return `REC-${String(Number(r?.n ?? 0) + 1).padStart(4, '0')}`;
}
