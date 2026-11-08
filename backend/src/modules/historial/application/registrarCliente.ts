import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../../../shared/infrastructure/prisma.js';
import { registrarBitacora } from '../../../shared/infrastructure/bitacora.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import { COSTO_BCRYPT } from '../../seguridad/application/recuperarContrasena.js';
import { crearSesion } from '../../seguridad/application/tokens.js';

export interface RegistroClienteEntrada {
  tipoPersona: 'persona' | 'empresa';
  razonSocial?: string;
  documento?: string;
  nombres: string;
  apellidos: string;
  cargo?: string;
  email: string;
  telefono: string;
  contrasena: string;
  avisosCorreo: boolean;
}

const correoDuplicado = () =>
  new ReglaNegocioError('Ya existe una cuenta con este correo. Inicie sesión o recupere su contraseña.', 409);
const einDuplicado = () => new ReglaNegocioError('Ya existe una cuenta con este EIN.', 409);

/** CU-H01 Registrar cliente desde la web: crea el cliente y su usuario con rol Cliente. */
export async function registrarCliente(e: RegistroClienteEntrada, ip?: string) {
  const email = e.email.trim().toLowerCase();
  const empresa = e.tipoPersona === 'empresa';

  // Validación previa para dar un mensaje claro; la restricción UNIQUE de la BD cubre la carrera.
  const [usuarioExistente, clienteExistente, einExistente] = await Promise.all([
    prisma.usuario.findFirst({ where: { OR: [{ email }, { nombreUsuario: email }] } }),
    prisma.cliente.findUnique({ where: { email } }),
    empresa && e.documento ? prisma.cliente.findUnique({ where: { documento: e.documento } }) : null,
  ]);
  if (usuarioExistente || clienteExistente) throw correoDuplicado();
  if (einExistente) throw einDuplicado();

  const rolCliente = await prisma.rol.findUniqueOrThrow({ where: { nombre: 'Cliente' } });
  const contrasenaHash = await bcrypt.hash(e.contrasena, COSTO_BCRYPT);

  try {
    const usuario = await prisma.$transaction(async (tx) => {
      const cliente = await tx.cliente.create({
        data: {
          tipoPersona: e.tipoPersona,
          nombres: e.nombres.trim(),
          apellidos: e.apellidos.trim(),
          razonSocial: empresa ? e.razonSocial?.trim() : null,
          documento: empresa ? e.documento : null,
          cargo: empresa ? e.cargo?.trim() || null : null,
          email,
          telefono: e.telefono,
          aceptaAvisosCorreo: e.avisosCorreo,
          canalRegistro: 'web',
        },
      });
      const nuevo = await tx.usuario.create({
        data: { clienteId: cliente.id, rolId: rolCliente.id, nombreUsuario: email, email, contrasenaHash },
        include: { rol: true, cliente: true },
      });
      await registrarBitacora(tx, {
        usuarioId: nuevo.id, modulo: 'historial', accion: 'cliente_registrado', entidad: 'cliente', entidadId: cliente.id,
        valorNuevo: { tipoPersona: cliente.tipoPersona, email: cliente.email, canalRegistro: cliente.canalRegistro }, ip,
      });
      return nuevo;
    });
    return crearSesion(usuario, false);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const campos = String(err.meta?.target ?? '');
      throw campos.includes('documento') ? einDuplicado() : correoDuplicado();
    }
    throw err;
  }
}
