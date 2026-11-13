// DATOS DE PRUEBA del inventario (A15, A15b, A8, A8c, A8p, A9) y de los pedidos de ejemplo del prototipo (PED-0076…).
//  - Proveedores y materiales: se crean una vez; si ya existen no se pisan (el Administrador los edita en A15/A8p).
//  - Pedidos, reservas, encargos, compras y movimientos de ejemplo: solo si todavía no existe PED-0076.
//  - Cada pedido nace de su propia solicitud (SOL-…), con su código PED-… aparte (CU-C14).
// Cuando el taller cargue sus datos reales, este archivo se quita del seed.
import { Prisma, type PrismaClient } from '@prisma/client';
import { codigoSolicitud } from '../src/modules/comercial/domain/solicitud.js';

const D = (n: number) => new Prisma.Decimal(n);
const DIA = 24 * 3600 * 1000;
// El taller no abre los domingos: un movimiento de ejemplo que caería en domingo pasa al sábado.
const haceDias = (n: number, hora = 10) => { const d = new Date(Date.now() - n * DIA); if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() - 1); d.setUTCHours(hora + 5, 0, 0, 0); return d; };
const fecha = (n: number) => new Date(`${new Date(Date.now() + n * DIA).toISOString().slice(0, 10)}T00:00:00Z`);

export const PROVEEDORES = [
  { nombre: 'Proveedor de espumas', canal: 'whatsapp', contacto: '(973) 555-0110', diasMin: 3, diasMax: 5, tipo: 'stock' },
  { nombre: 'Proveedor de insumos', canal: 'whatsapp', contacto: '(908) 555-0177', diasMin: 4, diasMax: 6, tipo: 'stock' },
  { nombre: 'Proveedor de telas', canal: 'telefono', contacto: '(201) 555-0142', diasMin: 2, diasMax: 3, tipo: 'telas' },
];

// [código, nombre, categoría, unidad, en el estante, mínimo, precio, proveedor, ubicación, consumo por semana]
const MATERIALES: [string, string, string, string, number, number, number, string, string, number][] = [
  ['MAT-0001', 'Espuma HD 2"', 'espuma', 'planchas', 7, 10, 24, 'Proveedor de espumas', 'Estante A1', 6],
  ['MAT-0002', 'Espuma HD 4"', 'espuma', 'planchas', 8, 4, 39, 'Proveedor de espumas', 'Estante A2', 2],
  ['MAT-0003', 'Espuma HD 1.5"', 'espuma', 'planchas', 5, 4, 18, 'Proveedor de espumas', 'Estante A3', 2],
  ['MAT-0004', 'Plumas (relleno)', 'relleno', 'kg', 3, 4, 18.5, 'Proveedor de espumas', 'Estante B1', 1],
  ['MAT-0005', 'Guata', 'relleno', 'yd', 8, 10, 3, 'Proveedor de insumos', 'Estante B2', 6],
  ['MAT-0006', 'Hilo nylon 40', 'insumo', 'conos', 10, 6, 6, 'Proveedor de insumos', 'Gaveta C1', 4],
  ['MAT-0007', 'Cierres 60 cm', 'insumo', 'u', 39, 15, 1.2, 'Proveedor de insumos', 'Gaveta C2', 9],
  ['MAT-0008', 'Grapas 71/10', 'insumo', 'cajas', 7, 8, 6, 'Proveedor de insumos', 'Gaveta C3', 3],
  ['MAT-0009', 'Botones forrables', 'insumo', 'u', 120, 50, 0.35, 'Proveedor de insumos', 'Gaveta C4', 10],
  ['MAT-0010', 'Pegamento de contacto', 'pegamento', 'gal', 3, 2, 18, 'Proveedor de insumos', 'Estante D1', 1],
  ['MAT-0011', 'Pegamento de madera', 'pegamento', 'gal', 2, 1, 20, 'Proveedor de insumos', 'Estante D1', 0.25],
];

// Datos del libro de muestras de las telas de prueba (seed-solicitud.ts): tipo, color para buscar, libro, precio por yd, en la web.
const TELAS: Record<string, [string, string, string, number, boolean]> = {
  'TP-204-4': ['Lino', 'Azul', 'Libro Linos', 17, true],
  'TP-110-11': ['Lino', 'Beige', 'Libro Linos', 16, true],
  'TP-318-2': ['Pana', 'Gris', 'Libro Panas', 18, true],
  'TP-52-7': ['Chenille', 'Verde', 'Libro Chenille', 22, true],
  'TP-12-1': ['Chenille', 'Beige', 'Libro Chenille', 22, true],
  'TP-640-5': ['Cuero sintético', 'Café', 'Libro Sintéticos', 28, true],
  'TP-220-9': ['Terciopelo', 'Rojo', 'Libro Terciopelos', 21, true],
  'TP-224-3': ['Terciopelo', 'Amarillo', 'Libro Terciopelos', 21, true],
  'TP-760-2': ['Estampado', 'Rojo', 'Libro Prints', 25, false],
  'TP-300-8': ['Terciopelo', 'Gris', 'Libro Terciopelos', 19, true],
};

// Clientes de los pedidos de ejemplo (Laura Méndez ya existe en seed.ts).
const CLIENTES = [
  { email: 'daniel.cruz@ejemplo.test', tipoPersona: 'persona', nombres: 'Daniel', apellidos: 'Cruz', telefono: '+19735550101' },
  { email: 'priya.shah@ejemplo.test', tipoPersona: 'persona', nombres: 'Priya', apellidos: 'Shah', telefono: '+19735550102' },
  { email: 'j.ortega@ejemplo.test', tipoPersona: 'persona', nombres: 'J.', apellidos: 'Ortega', telefono: '+19735550103' },
  { email: 'compras@hotelwillow.test', tipoPersona: 'empresa', nombres: 'Grace', apellidos: 'Lin', razonSocial: 'Hotel Willow', telefono: '+19735550104' },
  { email: 'carla.ortiz@ejemplo.test', tipoPersona: 'persona', nombres: 'Carla', apellidos: 'Ortiz', telefono: '+19735550105' },
  { email: 'mark.diaz@ejemplo.test', tipoPersona: 'persona', nombres: 'Mark', apellidos: 'Diaz', telefono: '+19735550106' },
];

// [código, correo del cliente, tipo de mueble, cantidad, descripción, estado, días desde que nació]
const PEDIDOS: [string, string, string, number, string, string, number][] = [
  ['PED-0070', 'daniel.cruz@ejemplo.test', 'bq', 1, 'Banqueta', 'Entregado', 40],
  ['PED-0071', 'priya.shah@ejemplo.test', 'ar', 1, 'Sillón', 'Entregado', 38],
  ['PED-0072', 'j.ortega@ejemplo.test', 'ch', 4, '4 sillas de comedor', 'Entregado', 36],
  ['PED-0074', 'compras@hotelwillow.test', 'hb', 2, '2 cabeceras', 'Entregado', 34],
  ['PED-0076', 'laura.mendez@correo.com', 's3', 1, 'Sofá de 3 cuerpos', 'En producción', 12],
  ['PED-0081', 'j.ortega@ejemplo.test', 's3', 1, 'Sofá + 3 cojines', 'En producción', 8],
  ['PED-0082', 'priya.shah@ejemplo.test', 'ch', 6, '6 sillas de comedor', 'Esperando material', 4],
  ['PED-0084', 'compras@hotelwillow.test', 'ch', 12, '12 sillas', 'Esperando material', 3],
  ['PED-0086', 'carla.ortiz@ejemplo.test', 'ar', 1, 'Butaca', 'Esperando material', 2],
  ['PED-0088', 'mark.diaz@ejemplo.test', 'hb', 1, 'Cabecera', 'Esperando material', 1],
];

export async function sembrarInventario(prisma: PrismaClient) {
  for (const p of PROVEEDORES) await prisma.proveedor.upsert({ where: { nombre: p.nombre }, update: {}, create: p });
  const prov = Object.fromEntries((await prisma.proveedor.findMany()).map((p) => [p.nombre, p.id]));

  for (const [codigo, nombre, categoria, unidad, , minimo, precio, proveedor, ubicacion] of MATERIALES) {
    await prisma.material.upsert({
      where: { codigo }, update: {},
      create: { codigo, nombre, categoria, unidadMedida: unidad, stockMinimo: D(minimo), precio: D(precio), fechaPrecio: fecha(-60), proveedorId: prov[proveedor], ubicacion },
    });
  }
  // Telas: completa el libro de muestras solo si aún no tienen precio (no pisa lo editado en A15b).
  for (const [codigo, [tipo, color, libro, precio, enWeb]] of Object.entries(TELAS)) {
    await prisma.material.updateMany({
      where: { codigo, precio: null },
      data: { familia: tipo, colorFamilia: color, libro, precio: D(precio), fechaPrecio: fecha(-70), enWeb, proveedorId: prov['Proveedor de telas'] },
    });
  }

  if (await prisma.pedido.findUnique({ where: { codigo: 'PED-0076' } })) return;

  for (const c of CLIENTES) {
    if (!(await prisma.cliente.findUnique({ where: { email: c.email } }))) await prisma.cliente.create({ data: { ...c, canalRegistro: 'local' } });
  }
  const admin = await prisma.usuario.findUniqueOrThrow({ where: { nombreUsuario: 'admin' } });
  const taller = await prisma.usuario.findUniqueOrThrow({ where: { nombreUsuario: 'tapicero' } });
  const tipos = Object.fromEntries((await prisma.tipoMueble.findMany()).map((t) => [t.codigo, t.id]));

  // Pedidos: cada uno con su solicitud de origen (ya cotizada y aceptada).
  const ped: Record<string, number> = {};
  for (const [codigo, email, tipo, cantidad, descripcion, estado, dias] of PEDIDOS) {
    const cliente = await prisma.cliente.findUniqueOrThrow({ where: { email } });
    const s = await prisma.solicitud.create({
      data: {
        clienteId: cliente.id, canal: 'local', telaOpcion: 'catalogo', estado: 'Cotizada', registradoPor: admin.id, fechaSolicitud: haceDias(dias + 6),
        muebles: { create: [{ orden: 1, tipoMuebleId: tipos[tipo]!, servicio: 'retapizado', cantidad }] },
      },
    });
    await prisma.solicitud.update({ where: { id: s.id }, data: { codigo: codigoSolicitud(s.id) } });
    const p = await prisma.pedido.create({
      data: { codigo, solicitudId: s.id, clienteId: cliente.id, estado, descripcion, fechaCreacion: haceDias(dias), fechaCompromiso: fecha(14 - dias) },
    });
    ped[codigo] = p.id;
  }

  const mat = Object.fromEntries((await prisma.material.findMany()).map((m) => [m.codigo, m]));
  const id = (codigo: string) => mat[codigo]!.id;
  const compra = async (codigo: string, proveedor: string, estado: string, pedidoHace: number, llegaEn: number, lineas: { m: string; q: number; p: number; encargoId?: number }[]) => {
    return prisma.compra.create({
      data: {
        codigo, proveedorId: prov[proveedor]!, estado, fechaPedido: haceDias(pedidoHace), fechaEstimada: fecha(llegaEn), registradoPor: admin.id,
        ...(estado === 'llego' ? { fechaLlegada: haceDias(-llegaEn, 14), recibidoPor: admin.id } : {}),
        lineas: { create: lineas.map((l) => ({ materialId: id(l.m), cantidad: D(l.q), precio: D(l.p), encargoId: l.encargoId ?? null })) },
      },
    });
  };

  // Historial de cada material: entra con una compra hace 5 semanas y el taller retira cada semana (consumo promedio).
  const retiros = [[26, 'PED-0070'], [19, 'PED-0071'], [12, 'PED-0072'], [5, 'PED-0076']] as const;
  const inicial = (m: (typeof MATERIALES)[number]) => Math.round((m[4] + 4 * m[9]) * 100) / 100;
  const c1 = await compra('OC-0001', 'Proveedor de espumas', 'llego', 38, -35, MATERIALES.filter((m) => m[7] === 'Proveedor de espumas').map((m) => ({ m: m[0], q: inicial(m), p: m[6] })));
  const c2 = await compra('OC-0002', 'Proveedor de insumos', 'llego', 39, -35, MATERIALES.filter((m) => m[7] === 'Proveedor de insumos').map((m) => ({ m: m[0], q: inicial(m), p: m[6] })));
  for (const m of MATERIALES) {
    let saldo = inicial(m);
    await prisma.movimientoInventario.create({
      data: { materialId: id(m[0]), tipo: 'entrada', motivo: 'Compra recibida', detalle: `${m[7]} · ${m[7] === 'Proveedor de espumas' ? c1.codigo : c2.codigo}`, cantidad: D(saldo), saldo: D(saldo), compraId: m[7] === 'Proveedor de espumas' ? c1.id : c2.id, usuarioId: admin.id, fecha: haceDias(35, 14) },
    });
    for (const [dias, pedido] of retiros) {
      if (!m[9]) continue;
      saldo = Math.round((saldo - m[9]) * 100) / 100;
      await prisma.movimientoInventario.create({
        data: { materialId: id(m[0]), tipo: 'salida', motivo: 'Retiro para un pedido', cantidad: D(-m[9]), saldo: D(saldo), pedidoId: ped[pedido], usuarioId: taller.id, fecha: haceDias(dias, 9) },
      });
    }
    await prisma.material.update({ where: { id: id(m[0]) }, data: { stockFisico: D(saldo) } });
  }

  // Reservas de los pedidos en curso (lo pendiente de retirar). Plumas: faltan 2 kg para PED-0082.
  const reservas: [string, string, number][] = [
    ['PED-0076', 'MAT-0001', 1], ['PED-0081', 'MAT-0002', 2], ['PED-0082', 'MAT-0004', 5], ['PED-0084', 'MAT-0007', 6], ['PED-0084', 'MAT-0009', 24],
  ];
  for (const [pedido, material, cantidad] of reservas) {
    await prisma.reservaMaterial.create({ data: { pedidoId: ped[pedido]!, materialId: id(material), cantidad: D(cantidad), fecha: haceDias(3) } });
  }

  // Telas bajo pedido: una llegó (PED-0076), una viene en camino (PED-0084) y una está por encargar (PED-0086 y PED-0088).
  const llego = await prisma.encargoTela.create({ data: { pedidoId: ped['PED-0076']!, materialId: id('TP-204-4'), cantidad: D(12), precio: D(17), estado: 'llego', fechaNecesaria: fecha(-6), fecha: haceDias(12) } });
  await compra('OC-0003', 'Proveedor de telas', 'llego', 11, -9, [{ m: 'TP-204-4', q: 12, p: 17, encargoId: llego.id }]);
  const enCamino = await prisma.encargoTela.create({ data: { pedidoId: ped['PED-0084']!, materialId: id('TP-318-2'), cantidad: D(22), precio: D(18), estado: 'encargada', fechaNecesaria: fecha(1), fecha: haceDias(3) } });
  await compra('OC-0004', 'Proveedor de espumas', 'por_llegar', 2, 2, [{ m: 'MAT-0004', q: 4, p: 18.5 }]);
  await compra('OC-0005', 'Proveedor de insumos', 'por_llegar', 6, 5, [{ m: 'MAT-0008', q: 10, p: 6 }]);
  await compra('OC-0006', 'Proveedor de telas', 'por_llegar', 3, 0, [{ m: 'TP-318-2', q: 22, p: 18, encargoId: enCamino.id }]);
  for (const [pedido, q] of [['PED-0086', 6], ['PED-0088', 3]] as const) {
    await prisma.encargoTela.create({ data: { pedidoId: ped[pedido]!, materialId: id('TP-220-9'), cantidad: D(q), precio: D(21), estado: 'por_encargar', fechaNecesaria: fecha(4), fecha: haceDias(1) } });
  }
}
