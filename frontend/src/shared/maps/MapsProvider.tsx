import type { ReactNode } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { GOOGLE_MAPS_API_KEY, mapsHabilitado } from './config';

/** Carga Google Maps solo donde se usa. Sin clave configurada no carga nada y las pantallas muestran su versión sin mapa. */
export function MapsProvider({ children }: { children: ReactNode }) {
  if (!mapsHabilitado) return <>{children}</>;
  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} language="es" region="US">
      {children}
    </APIProvider>
  );
}
