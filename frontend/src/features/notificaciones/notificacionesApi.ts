import { useCallback, useEffect, useState } from 'react';
import { API_URL, apiFetch } from '../../shared/api/http';

// RG-05 · W11: los avisos que también llegan por correo, del usuario con sesión.

export interface Notificacion {
  id: number; tipo: string; titulo: string; mensaje: string; enlace: string | null; leida: boolean; fecha: string; solicitud: string | null;
}
export interface Bandeja { sinLeer: number; notificaciones: Notificacion[] }

interface NotificacionesApi {
  listar(): Promise<Bandeja>;
  leida(id: number): Promise<void>;
  leerTodas(): Promise<void>;
}

const http: NotificacionesApi = {
  listar: () => apiFetch('/notificaciones'),
  leida: async (id) => { await apiFetch(`/notificaciones/${id}/leida`, { method: 'POST' }); },
  leerTodas: async () => { await apiFetch('/notificaciones/leer-todas', { method: 'POST' }); },
};

// Sin API: algunos avisos de ejemplo.
const ejemplo: Notificacion[] = [
  { id: 1, tipo: 'cita_programada', titulo: 'Su cita en el taller quedó programada', mensaje: 'SOL-0090 · martes 10 de noviembre, 10:00.', enlace: '/cliente/pedidos/solicitudes', leida: false, fecha: new Date().toISOString(), solicitud: 'SOL-0090' },
  { id: 2, tipo: 'solicitud_registrada', titulo: 'Recibimos su solicitud SOL-0088', mensaje: 'El taller arma su cotización con sus fotos y le avisa por aquí y por correo.', enlace: '/cliente/pedidos/solicitudes', leida: true, fecha: new Date(Date.now() - 86_400_000).toISOString(), solicitud: 'SOL-0088' },
];
const simulada: NotificacionesApi = {
  listar: async () => ({ sinLeer: ejemplo.filter((n) => !n.leida).length, notificaciones: ejemplo }),
  leida: async (id) => { ejemplo.forEach((n) => { if (n.id === id) n.leida = true; }); },
  leerTodas: async () => { ejemplo.forEach((n) => { n.leida = true; }); },
};

export const notificacionesApi: NotificacionesApi = API_URL ? http : simulada;

/** Contador de no leídas para la campana; se refresca cada minuto y al volver a la pestaña. */
export function useSinLeer() {
  const [n, setN] = useState(0);
  const leer = useCallback(() => { notificacionesApi.listar().then((b) => setN(b.sinLeer)).catch(() => undefined); }, []);
  useEffect(() => {
    leer();
    const t = setInterval(leer, 60_000);
    const visible = () => document.visibilityState === 'visible' && leer();
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('garweb:avisos', leer);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', visible); window.removeEventListener('garweb:avisos', leer); };
  }, [leer]);
  return n;
}

/** Avisa a la campana que cambió la cantidad de no leídas. */
export const avisosCambiaron = () => window.dispatchEvent(new Event('garweb:avisos'));
