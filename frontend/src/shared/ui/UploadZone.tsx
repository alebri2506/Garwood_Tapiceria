import { useEffect, useId, useMemo, useState, type DragEvent } from 'react';
import { Icon } from './Icon';

interface UploadZoneProps {
  title: string;
  hint: string;
  accept?: string;
  files: File[];
  onChange(files: File[]): void;
}

/** Zona para elegir o arrastrar archivos, con miniaturas (Garweb.UploadZone). Solo maneja archivos en el navegador. */
export function UploadZone({ title, hint, accept = 'image/*,video/*', files, onChange }: UploadZoneProps) {
  const id = useId();
  const [arrastrando, setArrastrando] = useState(false);
  const vistas = useMemo(() => files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)), [files]);
  useEffect(() => () => vistas.forEach((u) => u && URL.revokeObjectURL(u)), [vistas]);

  const agregar = (nuevos: FileList | null) => {
    if (nuevos?.length) onChange([...files, ...Array.from(nuevos)]);
  };
  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setArrastrando(false);
    agregar(e.dataTransfer.files);
  };

  return (
    <div className="gw-upload">
      <label
        htmlFor={id}
        className={arrastrando ? 'gw-drop is-dragging' : 'gw-drop'}
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={soltar}
      >
        <span className="gw-drop-icon"><Icon name="upload" size={24} /></span>
        <strong>{title}</strong>
        <span>{hint}</span>
        <input
          id={id}
          type="file"
          accept={accept}
          multiple
          className="sr-only"
          onChange={(e) => { agregar(e.target.files); e.target.value = ''; }}
        />
      </label>
      {files.length > 0 && (
        <ul className="gw-thumbs">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="gw-thumb">
              <span className="gw-thumb-img">
                {vistas[i] ? <img src={vistas[i]!} alt="" /> : <Icon name="image" size={22} />}
              </span>
              <span className="gw-thumb-name">{f.name}</span>
              <button type="button" className="gw-thumb-x" aria-label={`Quitar ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))}>
                <Icon name="x" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
