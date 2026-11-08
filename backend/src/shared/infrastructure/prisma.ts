import { PrismaClient, type Prisma } from '@prisma/client';

export const prisma = new PrismaClient();

/** Cliente de Prisma o una transacción en curso. */
export type Db = PrismaClient | Prisma.TransactionClient;
