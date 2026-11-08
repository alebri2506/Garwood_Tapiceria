interface Props {
  valor: number;
  unidad: string;
  etiqueta: string;
  onChange(v: number): void;
  pequeno?: boolean;
}

/** Botones − / + para una cantidad entera de 1 en adelante. */
export function Contador({ valor, unidad, etiqueta, onChange, pequeno }: Props) {
  return (
    <div className={pequeno ? 'stp sm' : 'stp'} role="group" aria-label={etiqueta}>
      <button type="button" aria-label={`Menos ${etiqueta}`} disabled={valor <= 1} onClick={() => onChange(Math.max(1, valor - 1))}>−</button>
      <output aria-live="polite">{valor} {unidad}</output>
      <button type="button" aria-label={`Más ${etiqueta}`} onClick={() => onChange(valor + 1)}>+</button>
    </div>
  );
}
