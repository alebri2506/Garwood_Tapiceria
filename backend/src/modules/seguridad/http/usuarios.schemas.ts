import { z } from 'zod';
import { CORREO_OBLIGATORIO, DISPOSITIVOS, ROLES_PERSONAL } from '../domain/usuarios.js';

// CU-S03 · A20 › Usuarios (decisiones D.1). Decisión del equipo (10/11): sin nombre de usuario aparte; la persona se
// registra con nombres y apellidos y entra con su correo, que es obligatorio.
const nombre = z
  .string({ required_error: 'Ingrese nombres y apellidos' })
  .trim()
  .max(80, 'El nombre es muy largo')
  .transform((v) => v.replace(/\s+/g, ' '))
  .refine((v) => v.length > 0, 'Ingrese nombres y apellidos')
  .refine((v) => v.split(' ').length >= 2, 'Ingrese nombres y apellidos (por ejemplo, Pedro Ruiz)');
const correo = z.string({ required_error: CORREO_OBLIGATORIO }).trim().toLowerCase().min(1, CORREO_OBLIGATORIO).max(160).email('El correo no es válido');
const rol = z.enum(ROLES_PERSONAL, { errorMap: () => ({ message: 'Elija un rol de la lista' }) });
const dispositivo = z.enum(DISPOSITIVOS, { errorMap: () => ({ message: 'Elija Computadora, Celular o Tablet' }) });

export const crearUsuarioSchema = z.object({
  nombre,
  email: correo,
  rol,
  dispositivo: dispositivo.optional().or(z.literal('').transform(() => undefined)),
});

export const editarUsuarioSchema = z.object({
  nombre: nombre.optional(),
  rol: rol.optional(),
  dispositivo: dispositivo.nullable().optional().or(z.literal('').transform(() => null)),
  email: correo.optional(),
  // Ya no hay un nombre de usuario aparte: la cuenta se identifica por su correo.
  nombreUsuario: z.undefined({ errorMap: () => ({ message: 'La cuenta se identifica por su correo: cambie el correo.' }) }).optional(),
});
