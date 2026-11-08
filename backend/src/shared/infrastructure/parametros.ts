import type { Db } from './prisma.js';

/** RG-04: los valores de negocio se leen de la tabla `parametro`. */
export async function parametroNumero(db: Db, clave: string): Promise<number> {
  const p = await db.parametro.findUnique({ where: { clave } });
  const valor = Number(p?.valor);
  if (!p || Number.isNaN(valor)) {
    throw new Error(`Falta el parámetro numérico "${clave}". Ejecute el seed de la base de datos.`);
  }
  return valor;
}

export async function parametroTexto(db: Db, clave: string): Promise<string> {
  const p = await db.parametro.findUnique({ where: { clave } });
  if (!p) throw new Error(`Falta el parámetro "${clave}". Ejecute el seed de la base de datos.`);
  return p.valor;
}
