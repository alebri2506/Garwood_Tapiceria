import { z } from 'zod';
import { DISPOSITIVOS, ROLES_PERSONAL } from '../domain/usuarios.js';

// CU-S03 · A20 › Usuarios (decisiones D.1).
const nombre = z.string().trim().min(1, 'Ingrese el nombre').max(80, 'El nombre es muy largo');
const rol = z.enum(ROLES_PERSONAL, { errorMap: () => ({ message: 'Elija un rol de la lista' }) });
const dispositivo = z.enum(DISPOSITIVOS, { errorMap: () => ({ message: 'Elija Computadora, Celular o Tablet' }) });

export const crearUsuarioSchema = z.object({
  nombre,
  // Como en el prototipo: "pedro.taller". Sin "@" para no confundirse con el correo de un cliente.
  nombreUsuario: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Use 3 caracteres o más')
    .max(40, 'Use 40 caracteres o menos')
    .regex(/^[a-z0-9]+([._-][a-z0-9]+)*$/, 'Use solo letras sin tilde, números y . - _ (por ejemplo, pedro.taller)'),
  rol,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(160)
    .email('El correo no es válido')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  dispositivo: dispositivo.optional().or(z.literal('').transform(() => undefined)),
});

export const editarUsuarioSchema = z.object({
  nombre: nombre.optional(),
  rol: rol.optional(),
  dispositivo: dispositivo.nullable().optional().or(z.literal('').transform(() => null)),
  // Vacío = quitar el correo (no se permite a un Administrador).
  email: z.string().trim().toLowerCase().max(160).email('El correo no es válido').nullable().optional().or(z.literal('').transform(() => null)),
  // D.1.4: identifica a la persona en la bitácora.
  nombreUsuario: z.undefined({ errorMap: () => ({ message: 'El nombre de usuario no se puede cambiar.' }) }).optional(),
});
