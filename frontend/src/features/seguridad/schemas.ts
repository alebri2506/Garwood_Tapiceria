import { z } from 'zod';

const correo = z.string().trim().min(1, 'Ingrese su correo').email('Ingrese un correo válido');

export const loginSchema = z.object({
  identificador: z.string().trim().min(1, 'Ingrese su correo o usuario'),
  contrasena: z.string().min(1, 'Ingrese su contraseña'),
  recordarme: z.boolean(),
});
export type LoginForm = z.infer<typeof loginSchema>;

export const recuperarSchema = z.object({ email: correo });
export type RecuperarForm = z.infer<typeof recuperarSchema>;

const contrasenaNueva = z.string().min(8, 'Use 8 caracteres o más').regex(/\d/, 'Incluya al menos un número');

export const restablecerSchema = z
  .object({ contrasena: contrasenaNueva, confirmacion: z.string() })
  .refine((d) => d.contrasena === d.confirmacion, { path: ['confirmacion'], message: 'Las contraseñas no coinciden' });
export type RestablecerForm = z.infer<typeof restablecerSchema>;

/** Solo dígitos de un teléfono de EE. UU., sin el +1. */
export const digitosTelefono = (v: string) => v.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
export const EIN_RE = /^\d{2}-\d{7}$/;

export const REGLAS_CONTRASENA = [
  { texto: '8 caracteres o más', cumple: (v: string) => v.length >= 8, obligatoria: true },
  { texto: 'Al menos un número', cumple: (v: string) => /\d/.test(v), obligatoria: true },
  { texto: 'Una mayúscula (recomendado)', cumple: (v: string) => /[A-Z]/.test(v), obligatoria: false },
];

export const registroSchema = z
  .object({
    tipoPersona: z.enum(['persona', 'empresa']),
    razonSocial: z.string().trim(),
    documento: z.string().trim(),
    nombres: z.string().trim().min(1, 'Ingrese su nombre'),
    apellidos: z.string().trim().min(1, 'Ingrese su apellido'),
    cargo: z.string().trim(),
    email: correo,
    telefono: z.string().refine((v) => digitosTelefono(v).length === 10, 'Ingrese el código de área y los 7 dígitos'),
    contrasena: contrasenaNueva,
    avisosCorreo: z.boolean(),
    aceptaTerminos: z.boolean().refine((v) => v, 'Debe aceptar los términos para crear la cuenta'),
  })
  .superRefine((d, ctx) => {
    if (d.tipoPersona !== 'empresa') return;
    if (!d.razonSocial) ctx.addIssue({ code: 'custom', path: ['razonSocial'], message: 'Ingrese el nombre legal de la empresa' });
    if (!EIN_RE.test(d.documento)) ctx.addIssue({ code: 'custom', path: ['documento'], message: 'El EIN tiene 9 dígitos: 12-3456789' });
  });
export type RegistroForm = z.infer<typeof registroSchema>;
