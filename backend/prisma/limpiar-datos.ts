// SOLO DESARROLLO · Vacía las solicitudes, la agenda y el inventario de la base LOCAL, sin tocar usuarios, clientes,
// direcciones, parámetros, tipos de mueble, telas del catálogo ni la bitácora.
//   npm run db:limpiar          → solo muestra cuántos registros se borrarían (no borra nada)
//   npm run db:limpiar -- --si  → los borra
// No es una función del sistema (en GARWEB nada de negocio se borra, RG-03): es para dejar limpia la base de pruebas.
// Se niega a correr contra una base que no sea local (Supabase u otra).
import 'dotenv/config';
import { PrismaClient, type Prisma } from '@prisma/client';

const url = process.env.DATABASE_URL ?? '';
const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
if (!['localhost', '127.0.0.1', 'db'].includes(host)) {
  console.error('Este script solo se usa con la base local de Docker. DATABASE_URL no apunta a localhost: no se hizo nada.');
  process.exit(1);
}

const prisma = new PrismaClient();
const borrar = process.argv.includes('--si');

async function main() {
  // En orden: primero lo que depende de otra tabla.
  const pasos = (prisma: PrismaClient | Prisma.TransactionClient): [string, () => Promise<number>, () => Promise<{ count: number }>][] => [
    ['Movimientos de inventario', () => prisma.movimientoInventario.count(), () => prisma.movimientoInventario.deleteMany()],
    ['Líneas de conteo', () => prisma.conteoLinea.count(), () => prisma.conteoLinea.deleteMany()],
    ['Conteos', () => prisma.conteo.count(), () => prisma.conteo.deleteMany()],
    ['Líneas de compra', () => prisma.compraLinea.count(), () => prisma.compraLinea.deleteMany()],
    ['Compras', () => prisma.compra.count(), () => prisma.compra.deleteMany()],
    ['Encargos de tela', () => prisma.encargoTela.count(), () => prisma.encargoTela.deleteMany()],
    ['Reservas de material', () => prisma.reservaMaterial.count(), () => prisma.reservaMaterial.deleteMany()],
    ['Pedidos', () => prisma.pedido.count(), () => prisma.pedido.deleteMany()],
    ['Avisos de solicitudes y citas', () => prisma.notificacion.count({ where: { solicitudId: { not: null } } }), () => prisma.notificacion.deleteMany({ where: { solicitudId: { not: null } } })],
    ['Citas y visitas', () => prisma.cita.count(), () => prisma.cita.deleteMany()],
    ['Bloqueos de agenda', () => prisma.agendaBloqueo.count(), () => prisma.agendaBloqueo.deleteMany()],
    ['Fotos y videos de solicitudes (registros)', () => prisma.solicitudAdjunto.count(), () => prisma.solicitudAdjunto.deleteMany()],
    ['Telas elegidas en solicitudes', () => prisma.solicitudTela.count(), () => prisma.solicitudTela.deleteMany()],
    ['Muebles de solicitudes', () => prisma.solicitudMueble.count(), () => prisma.solicitudMueble.deleteMany()],
    ['Solicitudes', () => prisma.solicitud.count(), () => prisma.solicitud.deleteMany()],
    ['Materiales de stock (las telas se quedan)', () => prisma.material.count({ where: { categoria: { not: 'tela' } } }), () => prisma.material.deleteMany({ where: { categoria: { not: 'tela' } } })],
    ['Proveedores', () => prisma.proveedor.count(), async () => {
      await prisma.material.updateMany({ where: { proveedorId: { not: null } }, data: { proveedorId: null } });
      return prisma.proveedor.deleteMany();
    }],
  ];

  console.log(borrar ? 'Borrando de la base local…\n' : 'SIMULACIÓN (no se borra nada). Para borrar: npm run db:limpiar -- --si\n');
  if (borrar) {
    await prisma.$transaction(async (tx) => {
      for (const [nombre, , quitar] of pasos(tx)) console.log(`${nombre}: ${(await quitar()).count}`);
    }, { timeout: 60_000 });
    console.log('\nListo. Usuarios, clientes, parámetros, tipos de mueble y telas se mantienen.');
  } else {
    for (const [nombre, contar] of pasos(prisma)) console.log(`${nombre}: ${await contar()}`);
    console.log('\nSe mantienen: usuarios, clientes y sus direcciones, parámetros, tipos de mueble, telas del catálogo y la bitácora.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
