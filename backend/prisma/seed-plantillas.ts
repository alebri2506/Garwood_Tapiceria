// A16 Plantillas (CU-C06).
//  - Máquinas del taller con su tarifa por hora: van siempre (configuración). Si ya existen, no se pisan las tarifas.
//    Tarifas provisionales del prototipo: por confirmar con el dueño.
//  - DATOS DE PRUEBA: las plantillas del diseño, solo con los datos de ejemplo (SEED_DATOS_EJEMPLO) y si todavía no hay
//    ninguna. Usan los materiales de ejemplo del inventario (seed-inventario.ts).
import { Prisma, type PrismaClient } from '@prisma/client';

const D = (n: number) => new Prisma.Decimal(n);

export const MAQUINAS: [string, number][] = [
  ['Mesa de corte', 4], ['Máquina de coser industrial', 6], ['Cortadora de espuma', 8], ['Engrapadora neumática', 5],
];

export async function sembrarMaquinas(prisma: PrismaClient) {
  for (const [nombre, tarifa] of MAQUINAS) {
    await prisma.maquina.upsert({ where: { nombre }, update: {}, create: { nombre, tarifaHora: D(tarifa) } });
  }
}

// Material del diseño → código del material de ejemplo del inventario. Solo materiales de stock: la tela la elige el
// cliente y se agrega en la cotización.
const MAT: Record<string, string> = {
  'Espuma 2': 'MAT-0001', 'Espuma 1.5': 'MAT-0003', Guata: 'MAT-0005', Hilo: 'MAT-0006', Cierre: 'MAT-0007',
  Grapas: 'MAT-0008', 'Botones': 'MAT-0009', 'Peg. contacto': 'MAT-0010', 'Peg. madera': 'MAT-0011',
};
type Act = [string, number, string | null, number, [string, number][]];
const tapizar = (h: number, hm: number): Act => ['Tapizar y armar', h, 'Engrapadora neumática', hm, [['Grapas', 1], ['Peg. contacto', 0.5]]];

export async function sembrarPlantillasEjemplo(prisma: PrismaClient) {
  if (await prisma.plantilla.count()) return;
  const admin = await prisma.usuario.findUnique({ where: { nombreUsuario: 'admin' } });
  if (!admin) return;
  const tipos = Object.fromEntries((await prisma.tipoMueble.findMany()).map((t) => [t.codigo, t.id]));
  const maquinas = Object.fromEntries((await prisma.maquina.findMany()).map((m) => [m.nombre, m.id]));
  const materiales = Object.fromEntries((await prisma.material.findMany({ where: { codigo: { startsWith: 'MAT-' } } })).map((m) => [m.codigo, m.id]));
  if (!materiales['MAT-0001']) return; // Sin los materiales de ejemplo del inventario no se siembran.

  const s3: Act[] = [['Desmontar tapiz', 1.5, null, 0, []], ['Cortar tela', 1.5, 'Mesa de corte', 0.5, []], ['Coser fundas y cojines', 4, 'Máquina de coser industrial', 4, [['Hilo', 2], ['Cierre', 3]]], tapizar(3, 2)];
  const s3e: Act[] = [['Desmontar tapiz y espuma antigua', 2.5, null, 0, []], ['Revisar y reforzar estructura', 1.5, null, 0, [['Peg. madera', 0.1]]], ['Cortar tela', 1.5, 'Mesa de corte', 0.5, []], ['Coser fundas y cojines', 4, 'Máquina de coser industrial', 4, [['Hilo', 2], ['Cierre', 3]]], ['Cambiar espuma de asientos', 1.5, 'Cortadora de espuma', 0.5, [['Espuma 2', 6]]], tapizar(3, 2)];
  const s3f: Act[] = [['Abrir cojines', 0.5, null, 0, []], ['Cortar espuma nueva', 1, 'Cortadora de espuma', 0.5, [['Espuma 2', 6]]], ['Rellenar y cerrar cojines', 1, null, 0, [['Guata', 2]]]];
  const ar: Act[] = [['Desmontar tapiz', 1, null, 0, []], ['Cortar tela', 0.75, 'Mesa de corte', 0.25, []], ['Coser fundas', 1.5, 'Máquina de coser industrial', 1.5, [['Hilo', 1], ['Cierre', 1]]], tapizar(1.5, 1)];
  const ch: Act[] = [['Desmontar asiento', 0.25, null, 0, []], ['Cortar tela', 0.25, 'Mesa de corte', 0.1, []], ['Cambiar espuma', 0.25, 'Cortadora de espuma', 0.1, [['Espuma 2', 0.25]]], ['Tapizar asiento', 0.5, 'Engrapadora neumática', 0.25, [['Grapas', 0.1]]]];
  const hb: Act[] = [['Desmontar tapiz', 0.5, null, 0, []], ['Cortar tela', 0.5, 'Mesa de corte', 0.25, [['Guata', 2]]], ['Cambiar espuma', 0.5, 'Cortadora de espuma', 0.25, [['Espuma 2', 1]]], ['Tapizar', 1.5, 'Engrapadora neumática', 1, [['Grapas', 0.5], ['Peg. contacto', 0.25]]]];
  const ot: Act[] = [['Desmontar tapiz', 0.5, null, 0, []], ['Cortar tela', 0.5, 'Mesa de corte', 0.2, []], ['Coser funda', 1, 'Máquina de coser industrial', 1, [['Hilo', 0.5]]], ['Tapizar', 1, 'Engrapadora neumática', 0.5, [['Grapas', 0.25]]]];

  const plantillas: [string, string, Act[]][] = [
    ['s3', 'retapizado', s3], ['s3', 'retapizado_espuma', s3e], ['s3', 'espuma', s3f],
    ['ar', 'retapizado', ar], ['ch', 'retapizado', ch], ['hb', 'retapizado', hb], ['ot', 'retapizado', ot],
  ];
  for (const [tipo, servicio, acts] of plantillas) {
    if (!tipos[tipo]) continue;
    await prisma.plantilla.create({
      data: {
        tipoMuebleId: tipos[tipo]!, servicio, version: 1, creadoPor: admin.id,
        actividades: {
          create: acts.map(([nombre, h, maq, hm, mats], i) => ({
            orden: i + 1, nombre, horasPersona: D(h), maquinaId: maq ? maquinas[maq] ?? null : null, horasMaquina: D(maq ? hm : 0),
            materiales: { create: mats.filter(([m]) => materiales[MAT[m]!] != null).map(([m, q]) => ({ materialId: materiales[MAT[m]!]!, cantidad: D(q) })) },
          })),
        },
      },
    });
  }
}
