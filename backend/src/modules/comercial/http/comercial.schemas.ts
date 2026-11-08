import { z } from 'zod';
import { direccionSchema, solicitudSchema } from './solicitud.schemas.js';

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha no es válida');
const turno = {
  fecha,
  hora: z.string().regex(/^\d{2}:\d{2}$/, 'La hora no es válida').optional(),
  franja: z.enum(['manana', 'tarde']).optional(),
};

// CU-C04
export const agendarSchema = z.object({
  solicitud: z.string().regex(/^SOL-\d{4,}$/, 'Indique la solicitud'),
  tipo: z.enum(['local', 'domicilio'], { errorMap: () => ({ message: 'Elija cita en el local o visita a domicilio' }) }),
  ...turno,
  direccion: direccionSchema.optional(),
});
export const reprogramarSchema = z.object(turno);
export const resultadoSchema = z.object({ resultado: z.enum(['atendida', 'no_asistio'], { errorMap: () => ({ message: 'Indique si el cliente asistió' }) }) });

// CU-C03 · bloquear turnos de la agenda (A2)
export const bloqueosSchema = z.object({
  bloques: z.array(z.object({ fecha, hora: z.string().regex(/^\d{2}:\d{2}$/, 'La hora no es válida') })).min(1, 'Elija al menos un turno').max(60, 'Son demasiados turnos a la vez'),
  motivo: z.string().trim().max(120, 'El motivo es muy largo').default('Bloqueado por el administrador').transform((m) => m || 'Bloqueado por el administrador'),
});

// CU-C02
export const descartarSchema = z.object({ motivo: z.string().trim().min(3, 'Indique el motivo del descarte').max(120, 'El motivo es muy largo') });

// A3 · solicitud registrada por el Administrador
const telefono = z.string().regex(/^\+1\d{10}$/, 'Ingrese un teléfono de EE. UU.: +1 y 10 dígitos');
const clienteNuevoSchema = z
  .object({
    tipoPersona: z.enum(['persona', 'empresa']),
    nombres: z.string().trim().min(1, 'Falta el nombre').max(80),
    apellidos: z.string().trim().max(80).default(''),
    razonSocial: z.string().trim().max(160).optional(),
    documento: z.string().trim().optional(),
    telefono,
    email: z.string().trim().max(160).email('El correo no es válido').optional().or(z.literal('').transform(() => undefined)),
  })
  .superRefine((c, ctx) => {
    if (c.tipoPersona === 'persona' && !c.apellidos) ctx.addIssue({ code: 'custom', path: ['apellidos'], message: 'Falta el apellido' });
    if (c.tipoPersona !== 'empresa') return;
    if (!c.razonSocial) ctx.addIssue({ code: 'custom', path: ['razonSocial'], message: 'Falta el nombre legal de la empresa' });
    if (!c.documento || !/^\d{2}-\d{7}$/.test(c.documento)) ctx.addIssue({ code: 'custom', path: ['documento'], message: 'El EIN tiene 9 dígitos: 12-3456789' });
    if (!c.email) ctx.addIssue({ code: 'custom', path: ['email'], message: 'Falta el correo de trabajo' });
  });

export const solicitudAdminSchema = z.object({
  cliente: z.union([z.object({ id: z.number().int().positive() }), z.object({ nuevo: clienteNuevoSchema })], { errorMap: () => ({ message: 'Elija un cliente o registre uno nuevo' }) }),
  canal: z.enum(['telefono', 'local', 'correo', 'mensaje']),
  esperaFotos: z.boolean().default(false),
  avisar: z.boolean().default(true),
  solicitud: solicitudSchema,
});
export type SolicitudAdminEntrada = z.infer<typeof solicitudAdminSchema>;
