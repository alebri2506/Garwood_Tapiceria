// Días en que el taller hace recojos: lunes a sábado, sin feriados (los mismos que muestra la web).
// Cuando exista la Agenda (CU-C03), los feriados vendrán de `agenda_bloqueo`.

const ZONA_NEGOCIO = 'America/New_York';

/** Fecha de hoy en Nueva Jersey como 'AAAA-MM-DD'. */
export function hoyNegocio(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_NEGOCIO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
}

const utc = (anio: number, mes: number, dia: number) => new Date(Date.UTC(anio, mes, dia));

/** n-ésimo día de la semana del mes (n = -1: el último). */
function nEsimo(anio: number, mes: number, diaSemana: number, n: number) {
  if (n > 0) {
    const d = utc(anio, mes, 1);
    d.setUTCDate(1 + ((diaSemana - d.getUTCDay() + 7) % 7) + (n - 1) * 7);
    return d;
  }
  const d = utc(anio, mes + 1, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - diaSemana + 7) % 7));
  return d;
}

export function feriados(anio: number): { fecha: Date; nombre: string }[] {
  return [
    { fecha: utc(anio, 0, 1), nombre: 'Año Nuevo' },
    { fecha: nEsimo(anio, 4, 1, -1), nombre: 'Memorial Day' },
    { fecha: utc(anio, 6, 4), nombre: 'Independence Day' },
    { fecha: nEsimo(anio, 8, 1, 1), nombre: 'Labor Day' },
    { fecha: utc(anio, 10, 11), nombre: 'Veterans Day' },
    { fecha: nEsimo(anio, 10, 4, 4), nombre: 'Thanksgiving' },
    { fecha: utc(anio, 11, 25), nombre: 'Navidad' },
  ];
}

/** Convierte 'AAAA-MM-DD' en una fecha UTC; null si no existe (p. ej. 2026-02-30). */
export function leerFecha(texto: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m) return null;
  const d = utc(+m[1]!, +m[2]! - 1, +m[3]!);
  return d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]! ? d : null;
}

/** Motivo por el que no se puede pedir el recojo ese día, o null si se puede. */
export function motivoSinRecojo(texto: string, diasMaximos: number, hoy = hoyNegocio()): string | null {
  const d = leerFecha(texto);
  if (!d) return 'La fecha de recojo no es válida.';
  const desde = leerFecha(hoy)!;
  if (d < desde) return 'La fecha de recojo ya pasó. Elija otro día.';
  const limite = new Date(desde);
  limite.setUTCDate(limite.getUTCDate() + diasMaximos);
  if (d > limite) return `Elija una fecha de recojo dentro de los próximos ${diasMaximos} días.`;
  if (d.getUTCDay() === 0) return 'Los domingos no hay recojos. Elija otro día.';
  const feriado = feriados(d.getUTCFullYear()).find((f) => f.fecha.getTime() === d.getTime());
  return feriado ? `${feriado.nombre} no hay recojos. Elija otro día.` : null;
}
