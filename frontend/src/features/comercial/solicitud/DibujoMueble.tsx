/**
 * Zona del dibujo: [parte, x, y, ancho, alto, radio]. La parte es el índice en las partes del mueble;
 * -1 son patas y estructura (oscuras) y -2 adornos claros: no se pueden elegir.
 */
type Zona = [number, number, number, number, number, number];

// Dibujos del diseño W2, por código del tipo de mueble (tipo_mueble.codigo en la API).
const S3: Zona[] = [[5, 58, 18, 284, 20, 8], [0, 70, 30, 260, 84, 20], [2, 26, 74, 56, 112, 18], [3, 318, 74, 56, 112, 18], [1, 84, 112, 76, 44, 10], [1, 162, 112, 76, 44, 10], [1, 240, 112, 76, 44, 10], [4, 36, 156, 328, 34, 9], [-1, 62, 190, 12, 18, 3], [-1, 326, 190, 12, 18, 3]];
const AR: Zona[] = [[0, 128, 22, 144, 94, 22], [2, 94, 70, 54, 116, 18], [3, 252, 70, 54, 116, 18], [1, 146, 112, 108, 44, 10], [4, 104, 156, 192, 34, 9], [-1, 124, 190, 12, 18, 3], [-1, 264, 190, 12, 18, 3]];
const CH: Zona[] = [[-1, 150, 24, 10, 186, 3], [-1, 240, 24, 10, 186, 3], [0, 146, 18, 108, 96, 14], [1, 124, 118, 152, 34, 9], [-1, 132, 152, 10, 58, 3], [-1, 258, 152, 10, 58, 3]];
const HB: Zona[] = [[1, 58, 14, 284, 156, 34], [0, 76, 32, 248, 120, 24], [-2, 40, 170, 320, 44, 10]];
const OT: Zona[] = [[1, 116, 104, 168, 72, 10], [0, 108, 70, 184, 42, 16], [-1, 128, 176, 12, 18, 3], [-1, 260, 176, 12, 18, 3]];
const GEN: Zona[] = [[0, 90, 30, 220, 110, 18], [1, 90, 140, 220, 50, 10], [-1, 110, 190, 12, 18, 3], [-1, 278, 190, 12, 18, 3]];

const DIBUJOS: Record<string, Zona[]> = {
  s2: [[5, 88, 18, 224, 20, 8], [0, 100, 30, 200, 84, 20], [2, 56, 74, 56, 112, 18], [3, 288, 74, 56, 112, 18], [1, 114, 112, 84, 44, 10], [1, 202, 112, 84, 44, 10], [4, 66, 156, 268, 34, 9], [-1, 92, 190, 12, 18, 3], [-1, 296, 190, 12, 18, 3]],
  s3: S3,
  sc: S3,
  sL: [[0, 40, 24, 316, 76, 18], [3, 16, 62, 46, 124, 16], [4, 338, 62, 46, 124, 16], [1, 64, 100, 84, 44, 10], [1, 150, 100, 84, 44, 10], [2, 238, 100, 98, 94, 12], [5, 26, 144, 210, 42, 9], [-1, 40, 186, 12, 18, 3], [-1, 320, 194, 12, 14, 3]],
  ar: AR,
  ch: CH,
  hb: HB,
  bed: [[0, 70, 14, 260, 104, 24], [-2, 58, 110, 284, 40, 12], [1, 48, 148, 304, 36, 9], [2, 48, 184, 304, 22, 4]],
  ot: OT,
  bn: [[1, 66, 130, 268, 32, 6], [0, 58, 96, 284, 40, 12], [-1, 80, 162, 12, 44, 3], [-1, 308, 162, 12, 44, 3]],
  bq: [[0, 40, 18, 320, 96, 12], [1, 34, 112, 332, 40, 10], [2, 40, 152, 320, 52, 6]],
  wn: [[-2, 40, 14, 320, 104, 8], [2, 64, 58, 128, 62, 16], [2, 208, 58, 128, 62, 16], [0, 44, 118, 312, 30, 10], [1, 44, 146, 312, 16, 4], [-1, 44, 162, 312, 46, 4]],
  gen: GEN,
  // Tipos de los datos de ejemplo de A2b y A3 (con sus propias partes).
  sofa3: S3,
  sillon: [[0, 110, 24, 180, 96, 22], [2, 66, 84, 60, 104, 18], [2, 274, 84, 60, 104, 18], [1, 126, 112, 148, 48, 12], [3, 76, 160, 248, 30, 9], [-1, 96, 190, 12, 18, 3], [-1, 292, 190, 12, 18, 3]],
  silla: [[1, 130, 16, 140, 96, 18], [0, 112, 112, 176, 40, 12], [-1, 126, 152, 12, 62, 3], [-1, 262, 152, 12, 62, 3]],
  cabecera: [[1, 40, 30, 320, 150, 26], [0, 62, 52, 276, 106, 16], [-1, 70, 180, 14, 34, 3], [-1, 316, 180, 14, 34, 3]],
  puff: [[1, 100, 88, 200, 96, 18], [0, 90, 50, 220, 50, 22], [-1, 124, 184, 12, 20, 3], [-1, 264, 184, 12, 20, 3]],
  otro: AR.map(([p, ...resto]) => [p < 0 ? p : 0, ...resto] as Zona),
};

interface Props {
  muebleId: string;
  /** Nombres de las partes del mueble, para el texto al pasar el mouse. */
  partes: string[];
  activa: number;
  colorDe(parte: number): string;
  onElegir(parte: number): void;
}

/** Dibujo del mueble por partes (W2, A2b y A3). Es un atajo con el mouse: las mismas partes se eligen en la lista. */
export function DibujoMueble({ muebleId, partes, activa, colorDe, onElegir }: Props) {
  const zonas = DIBUJOS[muebleId];
  if (!zonas) return null;
  return (
    <svg className="draw" viewBox="0 0 400 230" aria-hidden="true">
      {zonas.map(([parte, x, y, w, h, rx], i) => (parte < 0
        ? <rect key={i} x={x} y={y} width={w} height={h} rx={rx} fill={parte === -1 ? '#475569' : '#E2E8F0'} style={{ pointerEvents: 'none' }} />
        : (
          <rect key={i} className={activa === parte ? 'pt on' : 'pt'} x={x} y={y} width={w} height={h} rx={rx} fill={colorDe(parte)} onClick={() => onElegir(parte)}>
            <title>{partes[parte]}</title>
          </rect>
        )))}
    </svg>
  );
}
