// SOLO DESARROLLO · Vacía la base LOCAL de pruebas. No es una función del sistema (en GARWEB nada de negocio se borra,
// RG-03): es para dejar limpia la base de desarrollo. Se niega a correr contra una base que no sea local (Supabase u otra).
//
//   npm run db:limpiar                          → simulación: cuántos registros se borrarían (no borra nada)
//   npm run db:limpiar -- --si                  → borra la agenda, las solicitudes y las cotizaciones
//   npm run db:limpiar -- --si --inventario     → además, el inventario (materiales de stock, proveedores, compras…)
//
// Agenda, solicitudes y cotizaciones incluye lo que nace de ellas: citas y visitas, bloqueos, recojos, adelantos (pago),
// pedidos y sus avisos. Nunca toca usuarios, clientes y sus direcciones, parámetros, tipos de mueble, plantillas, telas
// del catálogo ni la bitácora. Sin --inventario, el stock queda igual: lo que el inventario tenga ligado a un pedido
// (reservas, encargos de tela) se quita y los movimientos o compras solo se desligan del pedido.
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
const conInventario = process.argv.includes('--inventario');

type Db = PrismaClient | Prisma.TransactionClient;
type Paso = [string, (db: Db) => Promise<number>, (db: Db) => Promise<{ count: number }>];

// En orden: primero lo que depende de otra tabla.
const COMERCIAL: Paso[] = [
  ['Recojos', (db) => db.recojo.count(), (db) => db.recojo.deleteMany()],
  ['Adelantos registrados (pago)', (db) => db.pago.count(), (db) => db.pago.deleteMany()],
  ['Reservas de material de pedidos', (db) => db.reservaMaterial.count(), (db) => db.reservaMaterial.deleteMany()],
  ['Movimientos de inventario ligados a un pedido (se desligan, el stock no cambia)', (db) => db.movimientoInventario.count({ where: { pedidoId: { not: null } } }),
    (db) => db.movimientoInventario.updateMany({ where: { pedidoId: { not: null } }, data: { pedidoId: null } })],
  ['Líneas de compra ligadas a un encargo de tela (se desligan)', (db) => db.compraLinea.count({ where: { encargoId: { not: null } } }),
    (db) => db.compraLinea.updateMany({ where: { encargoId: { not: null } }, data: { encargoId: null } })],
  ['Encargos de tela de pedidos', (db) => db.encargoTela.count(), (db) => db.encargoTela.deleteMany()],
  ['Pedidos', (db) => db.pedido.count(), (db) => db.pedido.deleteMany()],
  ['Materiales de las cotizaciones', (db) => db.cotizacionMaterial.count(), (db) => db.cotizacionMaterial.deleteMany()],
  ['Actividades de las cotizaciones', (db) => db.cotizacionActividad.count(), (db) => db.cotizacionActividad.deleteMany()],
  ['Telas de las cotizaciones', (db) => db.cotizacionTela.count(), (db) => db.cotizacionTela.deleteMany()],
  ['Muebles de las cotizaciones', (db) => db.cotizacionMueble.count(), (db) => db.cotizacionMueble.deleteMany()],
  ['Cotizaciones', (db) => db.cotizacion.count(), (db) => db.cotizacion.deleteMany()],
  ['Avisos de solicitudes, citas y pedidos', (db) => db.notificacion.count({ where: { solicitudId: { not: null } } }), (db) => db.notificacion.deleteMany({ where: { solicitudId: { not: null } } })],
  ['Citas y visitas', (db) => db.cita.count(), (db) => db.cita.deleteMany()],
  ['Bloqueos de agenda', (db) => db.agendaBloqueo.count(), (db) => db.agendaBloqueo.deleteMany()],
  ['Fotos y videos de solicitudes (registros)', (db) => db.solicitudAdjunto.count(), (db) => db.solicitudAdjunto.deleteMany()],
  ['Telas elegidas en solicitudes', (db) => db.solicitudTela.count(), (db) => db.solicitudTela.deleteMany()],
  ['Muebles de solicitudes', (db) => db.solicitudMueble.count(), (db) => db.solicitudMueble.deleteMany()],
  ['Solicitudes', (db) => db.solicitud.count(), (db) => db.solicitud.deleteMany()],
];

const INVENTARIO: Paso[] = [
  ['Movimientos de inventario', (db) => db.movimientoInventario.count(), (db) => db.movimientoInventario.deleteMany()],
  ['Líneas de conteo', (db) => db.conteoLinea.count(), (db) => db.conteoLinea.deleteMany()],
  ['Conteos', (db) => db.conteo.count(), (db) => db.conteo.deleteMany()],
  ['Líneas de compra', (db) => db.compraLinea.count(), (db) => db.compraLinea.deleteMany()],
  ['Compras', (db) => db.compra.count(), (db) => db.compra.deleteMany()],
  // Las plantillas y las cotizaciones usan materiales: sin --inventario no se tocan; con él, solo los que nadie usa.
  ['Materiales de stock que no usa ninguna plantilla (las telas se quedan)',
    (db) => db.material.count({ where: { categoria: { not: 'tela' }, enPlantillas: { none: {} } } }),
    (db) => db.material.deleteMany({ where: { categoria: { not: 'tela' }, enPlantillas: { none: {} } } })],
  ['Proveedores sin materiales', (db) => db.proveedor.count({ where: { materiales: { none: {} } } }), (db) => db.proveedor.deleteMany({ where: { materiales: { none: {} } } })],
];

async function main() {
  const pasos = conInventario ? [...COMERCIAL, ...INVENTARIO] : COMERCIAL;
  const que = conInventario ? 'agenda, solicitudes, cotizaciones e inventario' : 'agenda, solicitudes y cotizaciones';
  console.log(borrar ? `Borrando de la base local: ${que}…\n` : `SIMULACIÓN (no se borra nada) · ${que}. Para borrar: npm run db:limpiar -- --si${conInventario ? ' --inventario' : ''}\n`);
  if (borrar) {
    await prisma.$transaction(async (tx) => {
      for (const [nombre, , quitar] of pasos) console.log(`${nombre}: ${(await quitar(tx)).count}`);
    }, { timeout: 60_000 });
    console.log('\nListo.');
  } else {
    for (const [nombre, contar] of pasos) console.log(`${nombre}: ${await contar(prisma)}`);
  }
  console.log(`\nSe mantienen: usuarios, clientes y sus direcciones, parámetros, tipos de mueble, plantillas, telas del catálogo y la bitácora${conInventario ? '' : ', y todo el inventario (stock, proveedores, compras y movimientos)'}.`);
  console.log('Las fotos subidas quedan en la carpeta de archivos del backend (no se borran del disco).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
