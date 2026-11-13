// CU-S05 Parámetros (A14): cómo se valida cada valor según su tipo y sus límites (decisiones D.3). Sin Express ni Prisma.

export interface ReglaParametro {
  tipo: string;
  unidad: string | null;
  minimo: number | null;
  maximo: number | null;
  /** Solo tipo "opcion": "valor=Etiqueta|valor=Etiqueta". */
  opciones?: string | null;
}

/** "yd=Yarda|m=Metro" → [{ valor: 'yd', etiqueta: 'Yarda' }, …]. */
export function leerOpciones(texto: string | null | undefined) {
  return (texto ?? '').split('|').filter(Boolean).map((o) => {
    const [valor = '', etiqueta = valor] = o.split('=');
    return { valor: valor.trim(), etiqueta: etiqueta.trim() };
  });
}

const dosDigitos = (n: number) => String(n).padStart(2, '0');

/**
 * "9:00–12:00", "09:00 - 12:00" o "09:00-12:00" → minutos de inicio y fin, y el formato que lee la agenda
 * ("09:00-12:00"). Devuelve null si no es un horario válido.
 */
export function leerHorario(texto: string) {
  const m = /^(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const [h1, m1, h2, m2] = m.slice(1).map(Number) as [number, number, number, number];
  if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59) return null;
  return { desde: h1 * 60 + m1, hasta: h2 * 60 + m2, valor: `${dosDigitos(h1)}:${dosDigitos(m1)}-${dosDigitos(h2)}:${dosDigitos(m2)}` };
}

const numero = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** Valida el valor que escribió el Administrador; devuelve el valor a guardar o el mensaje para mostrar junto al campo. */
export function validarValor(p: ReglaParametro, entrada: string): { valor: string } | { error: string } {
  const texto = entrada.trim();
  if (!texto) return { error: 'Escriba un valor.' };

  if (p.tipo === 'horario') {
    const h = leerHorario(texto);
    if (!h) return { error: 'Escriba el horario así: 09:00-12:00.' };
    if (h.desde >= h.hasta) return { error: 'La hora de inicio debe ser antes que la hora de fin.' };
    return { valor: h.valor };
  }
  if (p.tipo === 'opcion') {
    const opciones = leerOpciones(p.opciones);
    return opciones.some((o) => o.valor === texto) ? { valor: texto } : { error: `Elija una de las opciones: ${opciones.map((o) => o.etiqueta).join(', ')}.` };
  }
  if (p.tipo === 'texto') return texto.length > 200 ? { error: 'Es muy largo: máximo 200 caracteres.' } : { valor: texto };

  const entero = p.tipo === 'entero';
  if (!(entero ? /^-?\d{1,9}$/ : /^-?\d{1,9}(\.\d{1,2})?$/).test(texto)) {
    return { error: entero ? 'Escriba un número entero, sin decimales.' : 'Escriba un número, con hasta 2 decimales.' };
  }
  const n = Number(texto);
  const unidad = p.unidad ? ` ${p.unidad}` : '';
  if (p.minimo != null && p.maximo != null && (n < p.minimo || n > p.maximo)) {
    return { error: `Debe estar entre ${numero(p.minimo)} y ${numero(p.maximo)}${unidad}.` };
  }
  // Sin unidad: "menor que 1 intentos" se leería mal.
  if (p.minimo != null && n < p.minimo) return { error: `No puede ser menor que ${numero(p.minimo)}.` };
  if (p.maximo != null && n > p.maximo) return { error: `No puede ser mayor que ${numero(p.maximo)}.` };
  // Los montos se guardan con 2 decimales, como en el seed ("45.00"); el resto, sin ceros de más ("007" → "7").
  return { valor: p.tipo === 'monto' ? n.toFixed(2) : String(n) };
}

/** Pares de horarios de un mismo día: la mañana debe terminar antes de que empiece la tarde. */
export const PARES_HORARIO: [string, string][] = [
  ['agenda.turnos_manana', 'agenda.turnos_tarde'],
  ['visita.franja_manana', 'visita.franja_tarde'],
  ['taller.franja_manana', 'taller.franja_tarde'],
];

/** Cambiar estos parámetros puede dejar citas ya agendadas fuera del horario (D.3.5). */
export const HORARIOS_AGENDA = ['agenda.turnos_manana', 'agenda.turnos_tarde', 'visita.franja_manana', 'visita.franja_tarde'];

/**
 * Revisa que los valores, ya con los cambios aplicados, sigan siendo coherentes entre sí:
 *  - la mañana termina antes de que empiece la tarde (si no, se repetirían turnos);
 *  - en cada horario de citas entra al menos un turno (si no, la agenda queda vacía).
 * Solo marca los parámetros que se están cambiando.
 */
export function revisarCoherencia(valores: Map<string, string>, cambiados: Set<string>): Record<string, string> {
  const errores: Record<string, string> = {};
  const marcar = (claves: string[], mensaje: string) => {
    const clave = claves.find((c) => cambiados.has(c));
    if (clave && !errores[clave]) errores[clave] = mensaje;
  };

  for (const [manana, tarde] of PARES_HORARIO) {
    const a = leerHorario(valores.get(manana) ?? ''), b = leerHorario(valores.get(tarde) ?? '');
    if (a && b && a.hasta > b.desde) marcar([manana, tarde], 'El horario de la mañana debe terminar antes de que empiece el de la tarde.');
  }

  const duracion = Number(valores.get('cita.duracion_min'));
  if (duracion > 0) {
    for (const clave of ['agenda.turnos_manana', 'agenda.turnos_tarde']) {
      const h = leerHorario(valores.get(clave) ?? '');
      if (h && h.hasta - h.desde < duracion) marcar([clave, 'cita.duracion_min'], `En este horario no entra ningún turno de ${duracion} min.`);
    }
  }
  return errores;
}

/** Una cita ya agendada queda fuera del horario si no entra completa en ninguno de los rangos (D.3.5). */
export function fueraDeRangos(hora: string, duracionMin: number, rangos: string[]) {
  const [h, m] = hora.split(':').map(Number) as [number, number];
  const inicio = h * 60 + m;
  return !rangos.some((r) => {
    const rango = leerHorario(r);
    return rango && inicio >= rango.desde && inicio + duracionMin <= rango.hasta;
  });
}
