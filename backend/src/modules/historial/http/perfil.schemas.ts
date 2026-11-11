import { z } from 'zod';

// W10 Mi perfil (decisiones-recientes.md E.1). Mismas reglas que el registro (seguridad/http/auth.schemas.ts).
const NO_SE_CAMBIA = 'No se cambia desde Mi perfil: pídalo al taller.';

export const datosPerfilSchema = z
  .object({
    nombres: z.string().trim().min(1, 'Ingrese sus nombres').max(80, 'Es muy largo').optional(),
    apellidos: z.string().trim().min(1, 'Ingrese sus apellidos').max(80, 'Es muy largo').optional(),
    telefono: z.string().regex(/^\+1\d{10}$/, 'Ingrese un teléfono de EE. UU.: +1 y 10 dígitos').optional(),
    // Solo empresa (E.1.2): nombre de la empresa (obligatorio) y cargo (opcional; vacío = sin cargo).
    razonSocial: z.string().trim().min(1, 'Ingrese el nombre de la empresa').max(160, 'Es muy largo').optional(),
    cargo: z.string().trim().max(80, 'Es muy largo').transform((v) => v || null).nullable().optional(),
    // E.1.1 y E.1.2: el tipo y el EIN se muestran, pero no se cambian aquí. El correo tiene su propio paso (E.1.4).
    tipoPersona: z.undefined({ errorMap: () => ({ message: `Persona o empresa: ${NO_SE_CAMBIA}` }) }).optional(),
    documento: z.undefined({ errorMap: () => ({ message: `El EIN: ${NO_SE_CAMBIA}` }) }).optional(),
    email: z.undefined({ errorMap: () => ({ message: 'El correo se cambia con «Cambiar correo» y se confirma desde el correo nuevo.' }) }).optional(),
  });

export const cambioCorreoSchema = z.object({
  email: z.string({ required_error: 'Ingrese el correo nuevo' }).trim().toLowerCase().min(1, 'Ingrese el correo nuevo').max(160).email('El correo no es válido'),
  contrasena: z.string({ required_error: 'Ingrese su contraseña actual' }).min(1, 'Ingrese su contraseña actual').max(200),
});

export const confirmarCorreoSchema = z.object({ token: z.string().min(20).max(100) });

// E.2.1: agregar una dirección de entrega desde Mi perfil.
export const direccionPerfilSchema = z.object({
  etiqueta: z.string({ required_error: 'Póngale un nombre (por ejemplo, Casa)' }).trim().min(1, 'Póngale un nombre (por ejemplo, Casa)').max(40, 'El nombre es muy largo'),
  direccion: z.string({ required_error: 'Escriba la dirección completa' }).trim().min(5, 'Escriba la dirección completa').max(200, 'La dirección es muy larga'),
  referencia: z.string().trim().max(120, 'La referencia es muy larga').optional().transform((v) => v || undefined),
  latitud: z.number().min(-90).max(90).optional(),
  longitud: z.number().min(-180).max(180).optional(),
});

// E.3: interruptores de avisos (solo el correo; la campana siempre muestra todo).
export const avisosPerfilSchema = z
  .object({
    informativos: z.boolean({ invalid_type_error: 'Indique sí o no' }).optional(),
    novedades: z.boolean({ invalid_type_error: 'Indique sí o no' }).optional(),
  })
  .refine((v) => v.informativos !== undefined || v.novedades !== undefined, 'Indique qué aviso cambia');
