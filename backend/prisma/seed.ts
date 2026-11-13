// Datos iniciales: roles, parámetros, usuarios de prueba (caso PED-0076) y el catálogo de la solicitud
// (tipos de mueble y telas de prueba, ver seed-solicitud.ts) y el inventario con pedidos de ejemplo (seed-inventario.ts).
// Es idempotente: se puede ejecutar varias veces sin duplicar datos.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { sembrarCatalogoSolicitud } from './seed-solicitud.js';
import { sembrarParametros } from './seed-parametros.js';
import { sembrarInventario } from './seed-inventario.js';

const prisma = new PrismaClient();

// En la base el rol de taller se llama "Tapicero"; en pantalla se muestra "Producción" (decisiones D.1.1).
const ROLES = ['Administrador', 'Tapicero', 'Conductor', 'Cliente'];

async function main() {
  // Contraseña de los usuarios de prueba; solo para desarrollo.
  const contrasena = process.env.SEED_CONTRASENA;
  if (!contrasena) throw new Error('Defina SEED_CONTRASENA en .env para crear los usuarios de prueba.');
  const hash = await bcrypt.hash(contrasena, 12);

  for (const nombre of ROLES) {
    await prisma.rol.upsert({ where: { nombre }, update: {}, create: { nombre } });
  }
  await sembrarParametros(prisma);

  const rol = async (nombre: string) => (await prisma.rol.findUniqueOrThrow({ where: { nombre } })).id;
  const personal = [
    { nombreUsuario: 'admin', nombre: 'Administrador', email: 'admin@garwood.test', rol: 'Administrador', dispositivo: 'Computadora' },
    { nombreUsuario: 'tapicero', nombre: 'Carlos', email: 'tapicero@garwood.test', rol: 'Tapicero', dispositivo: 'Celular' },
    { nombreUsuario: 'conductor', nombre: 'Luis', email: 'conductor@garwood.test', rol: 'Conductor', dispositivo: 'Celular' },
  ];
  for (const u of personal) {
    const datos = { nombre: u.nombre, dispositivo: u.dispositivo };
    await prisma.usuario.upsert({
      where: { nombreUsuario: u.nombreUsuario },
      update: {},
      create: { nombreUsuario: u.nombreUsuario, email: u.email, rolId: await rol(u.rol), contrasenaHash: hash, ...datos },
    });
    // En una base ya sembrada, completa nombre y dispositivo solo si están vacíos (no pisa lo editado en A20).
    await prisma.usuario.updateMany({ where: { nombreUsuario: u.nombreUsuario, nombre: null }, data: datos });
  }

  const email = 'laura.mendez@correo.com';
  if (!(await prisma.cliente.findUnique({ where: { email } }))) {
    await prisma.cliente.create({
      data: {
        tipoPersona: 'persona', nombres: 'Laura', apellidos: 'Méndez', email, telefono: '+19735550142', canalRegistro: 'web',
        usuario: { create: { nombreUsuario: email, email, rolId: await rol('Cliente'), contrasenaHash: hash } },
      },
    });
  }
  await sembrarCatalogoSolicitud(prisma);
  await sembrarInventario(prisma);
  console.log('Seed completo: roles, parámetros, usuarios de prueba, tipos de mueble, telas e inventario de prueba.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
