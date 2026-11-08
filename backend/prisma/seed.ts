// Datos iniciales: roles, parámetros, usuarios de prueba (caso PED-0076) y el catálogo de la solicitud
// (tipos de mueble y telas de prueba, ver seed-solicitud.ts).
// Es idempotente: se puede ejecutar varias veces sin duplicar datos.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { sembrarCatalogoSolicitud } from './seed-solicitud.js';

const prisma = new PrismaClient();

const ROLES = ['Administrador', 'Tapicero', 'Conductor', 'Cliente'];

const PARAMETROS = [
  { clave: 'login.max_intentos', valor: '5', unidad: 'intentos', descripcion: 'Intentos fallidos de inicio de sesión antes de bloquear la cuenta (CU-S01)' },
  { clave: 'login.minutos_bloqueo', valor: '15', unidad: 'minutos', descripcion: 'Duración del bloqueo por intentos fallidos (CU-S01)' },
  { clave: 'recuperacion.minutos_vigencia', valor: '30', unidad: 'minutos', descripcion: 'Vigencia del enlace para recuperar la contraseña (CU-S02)' },
];

async function main() {
  // Contraseña de los usuarios de prueba; solo para desarrollo.
  const contrasena = process.env.SEED_CONTRASENA;
  if (!contrasena) throw new Error('Defina SEED_CONTRASENA en .env para crear los usuarios de prueba.');
  const hash = await bcrypt.hash(contrasena, 12);

  for (const nombre of ROLES) {
    await prisma.rol.upsert({ where: { nombre }, update: {}, create: { nombre } });
  }
  for (const p of PARAMETROS) {
    await prisma.parametro.upsert({ where: { clave: p.clave }, update: {}, create: p });
  }

  const rol = async (nombre: string) => (await prisma.rol.findUniqueOrThrow({ where: { nombre } })).id;
  const personal = [
    { nombreUsuario: 'admin', email: 'admin@garwood.test', rol: 'Administrador' },
    { nombreUsuario: 'tapicero', email: 'tapicero@garwood.test', rol: 'Tapicero' },
    { nombreUsuario: 'conductor', email: 'conductor@garwood.test', rol: 'Conductor' },
  ];
  for (const u of personal) {
    await prisma.usuario.upsert({
      where: { nombreUsuario: u.nombreUsuario },
      update: {},
      create: { nombreUsuario: u.nombreUsuario, email: u.email, rolId: await rol(u.rol), contrasenaHash: hash },
    });
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
  console.log('Seed completo: roles, parámetros, usuarios de prueba, tipos de mueble y telas de prueba.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
