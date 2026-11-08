interface Props {
  label: string;
  items: { label: string; count?: number }[];
  active: number;
  onChange(i: number): void;
}

/** Filtro por pestañas con contador (Garweb.Tabs). */
export function Tabs({ label, items, active, onChange }: Props) {
  return (
    <div className="gw-tabs" role="group" aria-label={label}>
      {items.map((t, i) => (
        <button key={t.label} type="button" className="gw-tab" aria-pressed={active === i} onClick={() => onChange(i)}>
          {t.label}{t.count != null && <span className="gw-tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
