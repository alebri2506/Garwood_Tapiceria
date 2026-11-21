import { useEffect, useState } from 'react';

export const POR_PAGINA = [10, 25, 50, 100];

interface PaginacionProps {
  total: number;
  /** Página actual, empezando en 0. */
  pagina: number;
  porPagina: number;
  onPagina(pagina: number): void;
  onPorPagina(porPagina: number): void;
  opciones?: number[];
  cargando?: boolean;
}

/** Pie de una lista: «Mostrar [10] por página» y «1–10 de 42 ‹ ›» (el mismo en Pagos, Solicitudes y Usuarios). */
export function Paginacion({ total, pagina, porPagina, onPagina, onPorPagina, opciones = POR_PAGINA, cargando = false }: PaginacionProps) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const desde = pagina * porPagina;
  return (
    <div className="gw-pg">
      <label>Mostrar
        <select aria-label="Filas por página" value={porPagina} onChange={(e) => onPorPagina(Number(e.target.value))}>
          {opciones.map((n) => <option key={n} value={n}>{n}</option>)}
        </select> por página
      </label>
      <div className="gw-pg-nav">
        <span>{total ? `${desde + 1}–${Math.min(total, desde + porPagina)} de ${total}` : '0 de 0'}</span>
        <button type="button" aria-label="Página anterior" disabled={pagina === 0 || cargando} onClick={() => onPagina(pagina - 1)}>‹</button>
        <button type="button" aria-label="Página siguiente" disabled={pagina >= paginas - 1 || cargando} onClick={() => onPagina(pagina + 1)}>›</button>
      </div>
    </div>
  );
}

/**
 * Paginación de una lista que ya está en el navegador. Vuelve a la primera página cuando cambia `reinicio`
 * (la pestaña, la búsqueda o un filtro), y nunca queda en una página que ya no existe.
 */
export function usePaginacion<T>(lista: T[], reinicio: unknown, inicial = POR_PAGINA[0]!) {
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(inicial);
  const clave = JSON.stringify(reinicio);
  useEffect(() => { setPagina(0); }, [clave]);
  const ultima = Math.max(0, Math.ceil(lista.length / porPagina) - 1);
  const actual = Math.min(pagina, ultima);
  return {
    visibles: lista.slice(actual * porPagina, actual * porPagina + porPagina),
    props: {
      total: lista.length, pagina: actual, porPagina,
      onPagina: setPagina, onPorPagina: (n: number) => { setPorPagina(n); setPagina(0); },
    },
  };
}
