import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { configurarRenovacion, setAccessToken } from '../../shared/api/http';
import type { Sesion } from '../../shared/api/sesion';
import { authApi } from '../../features/seguridad/api/authApi';

interface AuthContexto {
  sesion: Sesion | null;
  /** true mientras se comprueba, al abrir la app, si hay una sesión vigente. */
  cargando: boolean;
  iniciar(sesion: Sesion): void;
  salir(): Promise<void>;
}

const Contexto = createContext<AuthContexto | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [cargando, setCargando] = useState(true);
  const comprobado = useRef(false);

  const iniciar = useCallback((s: Sesion) => {
    setAccessToken(s.token);
    setSesion(s);
  }, []);

  const terminar = useCallback(() => {
    setAccessToken(null);
    setSesion(null);
  }, []);

  const renovar = useCallback(async () => {
    try {
      const s = await authApi.refrescarSesion();
      iniciar(s);
      return s.token;
    } catch {
      terminar();
      return null;
    }
  }, [iniciar, terminar]);

  useEffect(() => {
    configurarRenovacion(renovar);
    // StrictMode monta dos veces en desarrollo: la comprobación inicial se hace una sola vez.
    if (comprobado.current) return;
    comprobado.current = true;
    renovar().finally(() => setCargando(false));
  }, [renovar]);

  const salir = useCallback(async () => {
    terminar();
    await authApi.cerrarSesion().catch(() => {}); // si falla, la cookie igual vence sola
  }, [terminar]);

  const valor = useMemo(() => ({ sesion, cargando, iniciar, salir }), [sesion, cargando, iniciar, salir]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAuth() {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
