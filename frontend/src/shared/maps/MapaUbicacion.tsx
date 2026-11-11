import { useEffect, useRef, useState } from 'react';
import { AdvancedMarker, Map, Pin, useMap, type MapMouseEvent } from '@vis.gl/react-google-maps';
import { CENTRO_POR_DEFECTO, GOOGLE_MAPS_MAP_ID, mapsHabilitado } from './config';
import type { DireccionElegida } from './DireccionAutocompletar';
import { direccionDePunto } from './direccionDePunto';
import './maps.css';

interface Props {
  ubicacion: google.maps.LatLngLiteral | null;
  /** Texto corto sobre el mapa, p. ej. la ciudad. */
  etiqueta?: string;
  alto?: number;
  /** Si se pasa, al tocar un punto del mapa se busca su dirección y se devuelve (OpenStreetMap, ver direccionDePunto.ts). */
  onElegir?(d: DireccionElegida): void;
}

/** Mapa con un marcador en la dirección. Sin clave de Google muestra el mapa ilustrado del diseño. */
export function MapaUbicacion({ ubicacion, etiqueta, alto = 280, onElegir }: Props) {
  if (!mapsHabilitado) {
    return (
      <div className="map" style={{ height: alto }} role="img" aria-label={etiqueta ? `Mapa: ${etiqueta}` : 'Mapa (vista previa)'}>
        <span className="mapa-pin" />
        {etiqueta && <span className="mapa-lbl">{etiqueta}</span>}
      </div>
    );
  }
  return <MapaReal ubicacion={ubicacion} etiqueta={etiqueta} alto={alto} onElegir={onElegir} />;
}

function MapaReal({ ubicacion, etiqueta, alto, onElegir }: Props) {
  const [aviso, setAviso] = useState<string | null>(null);
  const [conMouse] = useState(() => window.matchMedia('(pointer: fine)').matches);
  // Si se toca otro punto antes de que llegue la respuesta, solo vale la del último toque.
  const ultimoToque = useRef(0);

  const tocar = async (ev: MapMouseEvent) => {
    const punto = ev.detail.latLng;
    if (!onElegir || !punto) return;
    const toque = ++ultimoToque.current;
    setAviso('Buscando la dirección de ese punto…');
    try {
      const texto = await direccionDePunto(punto);
      if (toque !== ultimoToque.current) return;
      setAviso(null);
      // El pin queda donde se tocó, que es más exacto que el centro de la calle.
      onElegir({ texto, ubicacion: punto });
    } catch (err) {
      if (toque === ultimoToque.current) setAviso(err instanceof Error ? err.message : 'No pudimos leer la dirección de ese punto.');
    }
  };

  const texto = aviso ?? etiqueta ?? (!ubicacion
    ? onElegir ? 'Escriba la dirección o toque su casa en el mapa' : 'Elija o escriba una dirección para verla en el mapa'
    : null);

  return (
    <div className="mapa-real" style={{ height: alto }}>
      <Map
        mapId={GOOGLE_MAPS_MAP_ID}
        defaultCenter={ubicacion ?? CENTRO_POR_DEFECTO}
        defaultZoom={ubicacion ? 15 : 9}
        // Con mouse, la rueda hace zoom sin Ctrl. En celular sigue "cooperativo" (dos dedos) para que el dedo pueda bajar la página.
        gestureHandling={conMouse ? 'greedy' : 'cooperative'}
        disableDefaultUI
        zoomControl
        clickableIcons={false}
        draggableCursor={onElegir ? 'crosshair' : undefined}
        onClick={onElegir ? (ev) => void tocar(ev) : undefined}
      >
        {ubicacion && (
          <AdvancedMarker position={ubicacion} title={etiqueta}>
            <Pin background="#2563EB" borderColor="#1D4ED8" glyphColor="#FFFFFF" />
          </AdvancedMarker>
        )}
        <Encuadre ubicacion={ubicacion} />
      </Map>
      {texto && <span className="mapa-lbl" role={aviso ? 'status' : undefined}>{texto}</span>}
      {onElegir && (
        <a className="mapa-osm" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">Direcciones © OpenStreetMap</a>
      )}
    </div>
  );
}

/** Mueve el mapa cuando cambia la dirección elegida. */
function Encuadre({ ubicacion }: { ubicacion: google.maps.LatLngLiteral | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !ubicacion) return;
    map.panTo(ubicacion);
    if ((map.getZoom() ?? 0) < 14) map.setZoom(15);
  }, [map, ubicacion]);
  return null;
}
