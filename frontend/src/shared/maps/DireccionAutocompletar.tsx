import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { TextField } from '../ui/TextField';
import './maps.css';

export interface DireccionElegida {
  texto: string;
  ubicacion: google.maps.LatLngLiteral;
}

interface Props {
  label: string;
  value: string;
  onChange(texto: string): void;
  onElegir(d: DireccionElegida): void;
}

const ESPERA_MS = 250;

/**
 * Campo de dirección con sugerencias de Google Places (API nueva: AutocompleteSuggestion).
 * Se dibuja con el TextField del sistema de diseño en lugar del widget de Google.
 */
export function DireccionAutocompletar({ label, value, onChange, onElegir }: Props) {
  const places = useMapsLibrary('places');
  const listaId = useId();
  const [sugerencias, setSugerencias] = useState<google.maps.places.PlacePrediction[]>([]);
  const [activa, setActiva] = useState(-1);
  const [abierta, setAbierta] = useState(false);
  const sesion = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const recienElegida = useRef(false);

  useEffect(() => {
    if (!places || recienElegida.current) {
      recienElegida.current = false;
      return;
    }
    if (value.trim().length < 3) {
      setSugerencias([]);
      return;
    }
    let vigente = true;
    const t = setTimeout(async () => {
      // Un token por búsqueda: Google cobra las sugerencias y el detalle como una sola sesión.
      sesion.current ??= new places.AutocompleteSessionToken();
      try {
        const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: value,
          sessionToken: sesion.current,
          includedRegionCodes: ['us'], // el taller trabaja solo en EE. UU.
        });
        if (!vigente) return;
        setSugerencias(
          (suggestions as google.maps.places.AutocompleteSuggestion[])
            .map((s) => s.placePrediction)
            .filter((p): p is google.maps.places.PlacePrediction => p !== null),
        );
        setActiva(-1);
        setAbierta(true);
      } catch {
        if (vigente) setSugerencias([]);
      }
    }, ESPERA_MS);
    return () => { vigente = false; clearTimeout(t); };
  }, [places, value]);

  const elegir = async (p: google.maps.places.PlacePrediction) => {
    setAbierta(false);
    const lugar = p.toPlace();
    await lugar.fetchFields({ fields: ['formattedAddress', 'location'] });
    sesion.current = null;
    if (!lugar.location) return;
    const texto = lugar.formattedAddress ?? p.text.text;
    recienElegida.current = true;
    onChange(texto);
    onElegir({ texto, ubicacion: lugar.location.toJSON() });
  };

  const teclas = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!abierta || sugerencias.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiva((i) => (i + 1) % sugerencias.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiva((i) => (i <= 0 ? sugerencias.length - 1 : i - 1)); }
    else if (e.key === 'Enter' && activa >= 0) { e.preventDefault(); void elegir(sugerencias[activa]!); }
    else if (e.key === 'Escape') setAbierta(false);
  };

  const mostrar = abierta && sugerencias.length > 0;
  return (
    <div className="ac">
      <TextField
        label={label}
        placeholder="Empiece a escribir…"
        hint="Autocompletada con Google Maps"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={mostrar}
        aria-controls={listaId}
        aria-activedescendant={mostrar && activa >= 0 ? `${listaId}-${activa}` : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={teclas}
        onBlur={() => setTimeout(() => setAbierta(false), 150)}
        onFocus={() => sugerencias.length > 0 && setAbierta(true)}
      />
      {mostrar && (
        <ul className="ac-lista" id={listaId} role="listbox" aria-label="Direcciones sugeridas">
          {sugerencias.map((p, i) => (
            <li
              key={p.placeId}
              id={`${listaId}-${i}`}
              role="option"
              aria-selected={i === activa}
              className={i === activa ? 'on' : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void elegir(p)}
            >
              <b>{p.mainText?.text ?? p.text.text}</b>
              {p.secondaryText && <small>{p.secondaryText.text}</small>}
            </li>
          ))}
          <li className="ac-google" aria-hidden="true">con tecnología de Google</li>
        </ul>
      )}
    </div>
  );
}
