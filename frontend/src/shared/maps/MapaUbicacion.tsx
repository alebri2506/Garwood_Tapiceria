import { useEffect } from 'react';
import { AdvancedMarker, Map, Pin, useMap } from '@vis.gl/react-google-maps';
import { CENTRO_POR_DEFECTO, GOOGLE_MAPS_MAP_ID, mapsHabilitado } from './config';
import './maps.css';

interface Props {
  ubicacion: google.maps.LatLngLiteral | null;
  /** Texto corto sobre el mapa, p. ej. la ciudad. */
  etiqueta?: string;
  alto?: number;
}

/** Mapa con un marcador en la dirección. Sin clave de Google muestra el mapa ilustrado del diseño. */
export function MapaUbicacion({ ubicacion, etiqueta, alto = 280 }: Props) {
  if (!mapsHabilitado) {
    return (
      <div className="map" style={{ height: alto }} role="img" aria-label={etiqueta ? `Mapa: ${etiqueta}` : 'Mapa (vista previa)'}>
        <span className="mapa-pin" />
        {etiqueta && <span className="mapa-lbl">{etiqueta}</span>}
      </div>
    );
  }

  return (
    <div className="mapa-real" style={{ height: alto }}>
      <Map
        mapId={GOOGLE_MAPS_MAP_ID}
        defaultCenter={ubicacion ?? CENTRO_POR_DEFECTO}
        defaultZoom={ubicacion ? 15 : 9}
        gestureHandling="cooperative"
        disableDefaultUI
        zoomControl
        clickableIcons={false}
      >
        {ubicacion && (
          <AdvancedMarker position={ubicacion} title={etiqueta}>
            <Pin background="#2563EB" borderColor="#1D4ED8" glyphColor="#FFFFFF" />
          </AdvancedMarker>
        )}
        <Encuadre ubicacion={ubicacion} />
      </Map>
      {etiqueta ? <span className="mapa-lbl">{etiqueta}</span> : !ubicacion && <span className="mapa-lbl">Elija o escriba una dirección para verla en el mapa</span>}
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
