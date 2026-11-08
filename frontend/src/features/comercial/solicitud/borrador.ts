// W2 → W3 / W3b: con cita en el local o visita a domicilio, la solicitud se envía recién al confirmar el turno
// (último paso del asistente). Mientras tanto, lo llenado queda aquí, en memoria, con las fotos elegidas.
// Si se recarga la página se pierde (las fotos no se pueden guardar en el navegador): W3 lo dice y lleva a W2.
import type { EstadoW2 } from './estadoW2';
import type { Catalogo } from './solicitudApi';

export interface BorradorW2 { e: EstadoW2; c: Catalogo }

let actual: BorradorW2 | null = null;

export const borradorW2 = {
  guardar(b: BorradorW2) { actual = b; },
  leer() { return actual; },
  limpiar() { actual = null; },
};
