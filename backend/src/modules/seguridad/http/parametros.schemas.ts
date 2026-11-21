import { z } from 'zod';

// CU-S05 · A14 "Guardar cambios": todos los valores cambiados de una vez.
export const guardarParametrosSchema = z.object({
  cambios: z
    .array(
      z.object({
        clave: z.string().trim().min(1, 'Falta el parámetro').max(80),
        valor: z.union([z.string().max(200, 'El valor es muy largo'), z.number().finite()]).transform(String),
      }),
      { errorMap: () => ({ message: 'Indique los cambios a guardar' }) },
    )
    .min(1, 'No hay cambios para guardar.')
    .max(60, 'Son demasiados cambios a la vez.'),
});

// A14 › Máquinas: nombre y tarifa por hora (CU-C06 la usa en el precio sugerido de las plantillas).
const nombreMaquina = z.string({ required_error: 'Escriba el nombre de la máquina.' }).trim()
  .min(2, 'Escriba el nombre de la máquina.').max(60, 'El nombre es muy largo: máximo 60 caracteres.');
const tarifaMaquina = z.coerce.number({ invalid_type_error: 'Escriba la tarifa con números.', required_error: 'Escriba la tarifa por hora.' })
  .finite('Escriba la tarifa con números.').min(0, 'La tarifa no puede ser negativa.').max(1000, 'La tarifa no puede pasar de $1,000 por hora.');
export const crearMaquinaSchema = z.object({ nombre: nombreMaquina, tarifaHora: tarifaMaquina });
export const editarMaquinaSchema = z.object({ nombre: nombreMaquina.optional(), tarifaHora: tarifaMaquina.optional() })
  .refine((d) => d.nombre !== undefined || d.tarifaHora !== undefined, 'Indique qué cambiar.');
export const estadoMaquinaSchema = z.object({ activo: z.boolean({ required_error: 'Indique si la máquina queda activa.' }) });

export const cargaSchema = z.object({ tamanoCarga: z.enum(['chica', 'mediana', 'grande'], { errorMap: () => ({ message: 'Elija chica, mediana o grande.' }) }) });
