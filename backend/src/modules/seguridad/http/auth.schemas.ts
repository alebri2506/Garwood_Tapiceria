import { z } from 'zod';

// Mismas reglas que el formulario del frontend (frontend/src/features/seguridad/schemas.ts).
const correo = z.string().trim().min(1, 'Ingrese su correo').max(160).email('Ingrese un correo válido');
const contrasenaNueva = z
  .string()
  .min(8, 'Use 8 caracteres o más')
  .max(72, 'Use 72 caracteres o menos') // límite de bcrypt
  .regex(/\d/, 'Incluya al menos un número');

export const loginSchema = z.object({
  identificador: z.string().trim().min(1, 'Ingrese su correo o usuario').max(160),
  contrasena: z.string().min(1, 'Ingrese su contraseña').max(200),
  recordarme: z.boolean().default(false),
});

export const registroSchema = z
  .object({
    tipoPersona: z.enum(['persona', 'empresa']),
    razonSocial: z.string().trim().max(160).optional(),
    documento: z.string().trim().optional(),
    nombres: z.string().trim().min(1, 'Ingrese su nombre').max(80),
    apellidos: z.string().trim().min(1, 'Ingrese su apellido').max(80),
    cargo: z.string().trim().max(80).optional(),
    email: correo,
    telefono: z.string().regex(/^\+1\d{10}$/, 'Ingrese un teléfono de EE. UU.: +1 y 10 dígitos'),
    contrasena: contrasenaNueva,
    avisosCorreo: z.boolean().default(true),
  })
  .superRefine((d, ctx) => {
    if (d.tipoPersona !== 'empresa') return;
    if (!d.razonSocial) ctx.addIssue({ code: 'custom', path: ['razonSocial'], message: 'Ingrese el nombre legal de la empresa' });
    if (!d.documento || !/^\d{2}-\d{7}$/.test(d.documento)) {
      ctx.addIssue({ code: 'custom', path: ['documento'], message: 'El EIN tiene 9 dígitos: 12-3456789' });
    }
  });

export const recuperarSchema = z.object({ email: correo });

export const restablecerSchema = z.object({
  token: z.string().min(20).max(100),
  contrasena: contrasenaNueva,
});

// D.1.3: reemplazar la contraseña temporal en el primer ingreso.
export const cambiarContrasenaSchema = z.object({ contrasena: contrasenaNueva });

// W10 › Seguridad (decisiones E.4.1): cambiar la contraseña pidiendo la actual.
export const cambioContrasenaSchema = z.object({
  actual: z.string({ required_error: 'Ingrese su contraseña actual' }).min(1, 'Ingrese su contraseña actual').max(200),
  contrasena: contrasenaNueva,
});
