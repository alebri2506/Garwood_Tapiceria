import { z } from 'zod';
import { CODIGOS_ACABADO, CODIGOS_SERVICIO, FRANJAS, OPCIONES_TELA, TRASLADOS, hayRecojo, necesitaCita, sinTelaPermitido } from '../domain/solicitud.js';

// Mismas reglas que el asistente W2 del frontend (frontend/src/features/comercial/solicitud/validacion.ts).

const texto = (max: number, mensaje: string) => z.string().trim().max(max, mensaje);
const opcional = (max: number, mensaje: string) => texto(max, mensaje).optional().transform((v) => v || undefined);

export const direccionSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('guardada'), id: z.number().int().positive() }),
  z.object({
    tipo: z.literal('nueva'),
    texto: texto(200, 'La dirección es muy larga').min(5, 'Escriba la dirección completa'),
    referencia: opcional(120, 'La referencia es muy larga'),
    latitud: z.number().min(-90).max(90).optional(),
    longitud: z.number().min(-180).max(180).optional(),
    guardar: z.boolean().default(false),
  }),
]);
export type DireccionEntrada = z.infer<typeof direccionSchema>;

/** El turno elegido en el último paso (W3 cita en el local · W3b visita a domicilio): se envía junto con la solicitud. */
export const citaSolicitudSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha de la cita no es válida'),
  hora: z.string().regex(/^\d{2}:\d{2}$/, 'La hora no es válida').optional(),
  franja: z.enum(['manana', 'tarde']).optional(),
  direccion: direccionSchema.optional(),
});

const muebleSchema = z.object({
  tipoMuebleId: z.number({ required_error: 'Elija el tipo de mueble' }).int().positive(),
  servicio: z.enum(CODIGOS_SERVICIO, { errorMap: () => ({ message: 'Elija el servicio' }) }),
  acabado: z.enum(CODIGOS_ACABADO).optional(),
  cantidad: z.number().int().min(1, 'La cantidad mínima es 1').max(99, 'Para más de 99 muebles iguales, llámenos'),
  medidas: opcional(120, 'Las medidas son muy largas'),
  modoTela: z.enum(['una', 'partes']).optional(),
  telas: z
    .array(z.object({ materialId: z.number().int().positive(), parteId: z.number().int().positive().optional() }))
    .max(20, 'Hay demasiadas telas en el mueble')
    .default([]),
});

export const solicitudSchema = z
  .object({
    muebles: z.array(muebleSchema).min(1, 'Agregue al menos un mueble'),
    tela: z.enum(OPCIONES_TELA, { errorMap: () => ({ message: 'Elija qué tela usará' }) }),
    mismaTela: z.boolean().default(true),
    telaDescripcion: opcional(200, 'La descripción de la tela es muy larga'),
    telaConocida: opcional(80, 'El pattern y color son muy largos'),
    traslado: z.enum(TRASLADOS).optional(),
    direccion: direccionSchema.optional(),
    fechaPrefRecojo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha de recojo no es válida').optional(),
    franjaRecojo: z.enum(FRANJAS).optional(),
    horaPrefRecojo: z.string().regex(/^\d{2}:\d{2}$/, 'La hora de recojo no es válida').optional(),
    cita: citaSolicitudSchema.optional(),
  })
  .superRefine((d, ctx) => {
    const falta = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });

    d.muebles.forEach((m, i) => {
      if (m.servicio === 'fabricacion') {
        if (!m.medidas) falta(['muebles', i, 'medidas'], 'En fabricación a medida, indique las medidas que quiere');
        if (!m.acabado) falta(['muebles', i, 'acabado'], 'Elija el acabado del mueble nuevo');
      }
      if (d.tela === 'catalogo') {
        if (m.telas.length === 0) falta(['muebles', i, 'telas'], 'Elija la tela del catálogo');
        // Una tela para todo el mueble; varias solo cuando son por partes.
        if (m.modoTela !== 'partes' && m.telas.length > 1) falta(['muebles', i, 'telas'], 'Elija una sola tela para todo el mueble');
        if (m.modoTela === 'partes' && m.telas.some((t) => !t.parteId)) falta(['muebles', i, 'telas'], 'Indique la parte de cada tela');
      }
    });

    // "No lleva tela" solo cuando ningún mueble necesita tela nueva (solo espuma o estructura).
    if (d.tela === 'sin' && d.muebles.some((m) => !sinTelaPermitido(m.servicio))) {
      falta(['tela'], 'El servicio elegido necesita tela: elija otra opción');
    }
    // En la visita a domicilio llevamos los libros de telas: hay que saber qué busca. En el local es opcional.
    if (d.tela === 'domicilio' && !d.telaDescripcion) falta(['telaDescripcion'], 'Cuéntenos qué tela busca: así llevamos las muestras indicadas');

    if (d.cita) {
      if (!necesitaCita(d.tela)) falta(['cita'], 'La cita solo se agenda para ver las telas en el local o en su casa');
      else if (d.tela === 'local' && !d.cita.hora) falta(['cita', 'hora'], 'Elija la hora de su cita');
      else if (d.tela === 'domicilio') {
        if (!d.cita.franja) falta(['cita', 'franja'], 'Elija la franja de la visita: mañana o tarde');
        if (!d.cita.direccion) falta(['cita', 'direccion'], 'Indique dónde lo visitamos');
      }
    }

    // Con cita en el local o visita a domicilio, el traslado se define ahí.
    if (necesitaCita(d.tela)) return;
    if (!d.traslado) return falta(['traslado'], 'Elija cómo llega el mueble');
    if (d.traslado !== 'delivery') return;
    if (!d.direccion) falta(['direccion'], 'Indique la dirección de recojo y entrega');
    if (hayRecojo(d.muebles.map((m) => m.servicio))) {
      if (!d.fechaPrefRecojo) falta(['fechaPrefRecojo'], 'Elija el día que prefiere para el recojo');
      if (!d.horaPrefRecojo) falta(['horaPrefRecojo'], 'Elija la hora que prefiere para el recojo');
    }
  });

export type SolicitudEntrada = z.infer<typeof solicitudSchema>;
