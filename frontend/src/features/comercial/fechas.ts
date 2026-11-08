export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export const mismoDia = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const hoy = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** n-ésimo día de la semana del mes (n = -1: el último). */
function nEsimo(anio: number, mes: number, diaSemana: number, n: number) {
  if (n > 0) {
    const d = new Date(anio, mes, 1);
    d.setDate(1 + ((diaSemana - d.getDay() + 7) % 7) + (n - 1) * 7);
    return d;
  }
  const d = new Date(anio, mes + 1, 0);
  d.setDate(d.getDate() - ((d.getDay() - diaSemana + 7) % 7));
  return d;
}

/** Feriados federales de EE. UU. sin recojos. Ejemplo: en el sistema vendrán de los bloqueos de agenda. */
export function feriados(anio: number): { fecha: Date; nombre: string }[] {
  return [
    { fecha: new Date(anio, 0, 1), nombre: 'Año Nuevo' },
    { fecha: nEsimo(anio, 4, 1, -1), nombre: 'Memorial Day' },
    { fecha: new Date(anio, 6, 4), nombre: 'Independence Day' },
    { fecha: nEsimo(anio, 8, 1, 1), nombre: 'Labor Day' },
    { fecha: new Date(anio, 10, 11), nombre: 'Veterans Day' },
    { fecha: nEsimo(anio, 10, 4, 4), nombre: 'Thanksgiving' },
    { fecha: new Date(anio, 11, 25), nombre: 'Navidad' },
  ];
}

export function feriadoDe(d: Date) {
  return feriados(d.getFullYear()).find((f) => mismoDia(f.fecha, d))?.nombre;
}

/** Recojos de lunes a sábado, sin feriados, desde hoy. */
export function motivoNoDisponible(d: Date): string | null {
  if (d < hoy()) return 'Fecha pasada';
  if (d.getDay() === 0) return 'Domingo · sin recojos';
  const f = feriadoDe(d);
  return f ? `${f} · sin recojos` : null;
}

export function primerDiaDisponible() {
  const d = hoy();
  while (motivoNoDisponible(d)) d.setDate(d.getDate() + 1);
  return d;
}

export const fechaLarga = (d: Date) => {
  const dia = DIAS[d.getDay()]!;
  return `${dia[0]!.toUpperCase()}${dia.slice(1)} ${d.getDate()} de ${MESES[d.getMonth()]}`;
};
export const fechaCorta = (d: Date) => `${DIAS[d.getDay()]!.slice(0, 3)} ${d.getDate()} ${MESES[d.getMonth()]!.slice(0, 3)}`;
