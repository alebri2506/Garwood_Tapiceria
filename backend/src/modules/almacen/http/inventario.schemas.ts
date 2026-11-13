import { z } from 'zod';
import { CATEGORIAS_STOCK } from '../domain/inventario.js';

// Validación de lo que llega a /api/admin/inventario (mensajes en español, listos para mostrar).
const texto = (campo: string, max: number) => z.string({ required_error: `Escriba ${campo}.` }).trim().min(1, `Escriba ${campo}.`).max(max, `Es muy largo: máximo ${max} caracteres.`);
const opcional = (max: number) => z.string().trim().max(max, `Es muy largo: máximo ${max} caracteres.`).optional().nullable().transform((v) => (v ? v : null));
const cantidad = (campo: string) => z.coerce.number({ invalid_type_error: `Indique ${campo}.` }).finite().min(0, `${campo[0]!.toUpperCase()}${campo.slice(1)} no puede ser negativo.`).max(1_000_000);
const id = z.coerce.number().int().positive();

export const materialSchema = z.object({
  nombre: texto('el nombre', 80),
  categoria: z.enum(Object.keys(CATEGORIAS_STOCK) as [string, ...string[]], { errorMap: () => ({ message: 'Elija el tipo de material.' }) }).optional(),
  unidad: z.string().trim().max(10).optional(),
  proveedorId: id.refine(Boolean, 'Elija el proveedor.'),
  minimo: cantidad('el mínimo'),
  precio: cantidad('el precio'),
  ubicacion: opcional(30),
});

export const telaSchema = z.object({
  proveedorId: id,
  tipo: texto('el tipo de tela', 30),
  color: texto('el color para buscar', 20),
  pattern: texto('el modelo (pattern)', 20),
  numeroColor: texto('el número de color', 10),
  precio: cantidad('el precio por yarda').refine((n) => n > 0, 'Indique el precio por yarda.'),
  enWeb: z.boolean().default(true),
  nombre: opcional(80),
  libro: opcional(60),
  colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color no válido.').optional().nullable(),
});

export const ofertaTelaSchema = z.object({ activa: z.boolean() });

export const proveedorSchema = z
  .object({
    nombre: texto('el nombre', 80),
    canal: z.enum(['telefono', 'whatsapp'], { errorMap: () => ({ message: 'Elija cómo se le pide.' }) }),
    contacto: texto('el teléfono o WhatsApp', 40),
    diasMin: z.coerce.number().int('Escriba días enteros.').min(0, 'No puede ser negativo.').max(90),
    diasMax: z.coerce.number().int('Escriba días enteros.').min(0, 'No puede ser negativo.').max(90),
    tipo: z.enum(['stock', 'telas'], { errorMap: () => ({ message: 'Elija qué le compra.' }) }),
  })
  .refine((p) => p.diasMax >= p.diasMin, { message: '«Hasta» debe ser igual o mayor que «desde».', path: ['diasMax'] });

export const compraSchema = z.object({
  proveedorId: id,
  lineas: z.array(z.object({ materialId: id, cantidad: cantidad('la cantidad') })).min(1, 'Indique qué se pidió.').max(50),
});

export const encargoSchema = z.object({ materialId: id });

export const correccionSchema = z.object({
  materialId: id,
  sentido: z.enum(['sale', 'entra']),
  cantidad: cantidad('la cantidad').refine((n) => n > 0, 'La cantidad debe ser mayor que 0.'),
  motivo: texto('el motivo', 60),
  otroMotivo: z.string().trim().max(120).optional(),
  pedidoId: id.optional(),
});

const contado = z.object({ materialId: id, contado: cantidad('lo contado') });
export const compararConteoSchema = z.object({ contados: z.array(contado).min(1, 'No hay materiales contados.').max(500) });
export const guardarConteoSchema = z.object({
  contados: z.array(contado.extend({ motivo: z.string().max(60).optional(), otroMotivo: z.string().trim().max(120).optional() })).min(1, 'No hay materiales contados.').max(500),
});
