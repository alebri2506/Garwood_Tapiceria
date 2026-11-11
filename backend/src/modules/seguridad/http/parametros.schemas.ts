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
