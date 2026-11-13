import { useEffect, useRef, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { TopAdmin } from '../../../app/layout/AdminLayout';
import { Icon } from '../../../shared/ui/Icon';
import type { EstadoStock } from './inventarioApi';
import './inventario.css';

// Piezas comunes de las pantallas de Inventario (diseño del 12/11): cabecera con pestañas, panel lateral y formatos.

const PESTANAS: [string, string][] = [
  ['/admin/inventario', 'Stock'],
  ['/admin/inventario/telas', 'Telas (muestrario)'],
  ['/admin/inventario/reponer', 'Reponer'],
  ['/admin/inventario/movimientos', 'Movimientos'],
  ['/admin/inventario/proveedores', 'Proveedores'],
];

/** Cabecera de Inventario: título, línea de «al día», botón de conteo y las cinco pestañas. */
export function CabeceraInventario({ seccion, porReponer, alDia }: { seccion: string; porReponer?: number; alDia?: ReactNode }) {
  return (
    <>
      <TopAdmin crumb={seccion} titulo="Inventario" debajo={alDia ? <p className="upd"><i /><span>{alDia}</span></p> : undefined}>
        <Link className="gw-btn gw-btn-secondary" to="/admin/inventario/conteo"><Icon name="clipboard" size={18} />Conteo de inventario</Link>
      </TopAdmin>
      <nav className="ivt" aria-label="Secciones del inventario">
        {PESTANAS.map(([a, texto]) => (
          <NavLink key={a} to={a} end className={({ isActive }) => (isActive ? 'on' : '')}>
            {texto}
            {a.endsWith('reponer') && porReponer ? <i aria-label={`${porReponer} por reponer`}>{porReponer}</i> : null}
          </NavLink>
        ))}
      </nav>
    </>
  );
}

/** Panel lateral (ficha, formulario). Se cierra con Escape o tocando fuera. */
export function Lateral({ titulo, sub, onClose, children, pie, etiqueta }: { titulo: ReactNode; sub?: ReactNode; onClose(): void; children: ReactNode; pie?: ReactNode; etiqueta: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', tecla);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', tecla);
  }, [onClose]);
  return (
    <>
      <div className="dim" onClick={onClose} aria-hidden="true" />
      <aside className="drw" role="dialog" aria-modal="true" aria-label={etiqueta} ref={ref} tabIndex={-1}>
        <div className="dh">
          <div><h2>{titulo}</h2>{sub && <p>{sub}</p>}</div>
          <button type="button" className="xb" onClick={onClose} aria-label="Cerrar"><Icon name="x" size={18} /></button>
        </div>
        <div className="db">{children}</div>
        {pie && <div className="df">{pie}</div>}
      </aside>
    </>
  );
}

/** Aviso verde con botón «Cerrar», como en el diseño. */
export function Aviso({ titulo, children, onClose }: { titulo: string; children?: ReactNode; onClose(): void }) {
  return (
    <div className="toastx" role="status">
      <Icon name="check" size={20} />
      <div><b>{titulo}</b>{children}</div>
      <button type="button" onClick={onClose}>Cerrar</button>
    </div>
  );
}

/** Botones − y + con la cantidad en el medio. */
export function Pasos({ valor, unidad, onChange, min = 0, etiqueta }: { valor: number; unidad: string; onChange(n: number): void; min?: number; etiqueta: string }) {
  return (
    <div className="stp">
      <button type="button" onClick={() => onChange(Math.max(min, num(valor - 1)))} aria-label={`Menos ${etiqueta}`}>−</button>
      <b aria-live="polite">{num(valor)}</b>
      <small>{unidad}</small>
      <button type="button" onClick={() => onChange(num(valor + 1))} aria-label={`Más ${etiqueta}`}>+</button>
    </div>
  );
}

export const num = (n: number) => Math.round(n * 100) / 100;
export const dinero = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const cantidad = (n: number, unidad: string) => `${num(n)} ${unidad}`;

export const ESTADO: Record<EstadoStock, [string, string]> = {
  bajo: ['Bajo el mínimo', 'tag warn'], falta: ['Falta para un pedido', 'tag bad'], pedido: ['Pedido', 'tag info'], ok: ['OK', 'tag ok'],
};

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const ZONA = 'America/New_York';
const enNY = (d: Date) => new Date(d.toLocaleString('en-US', { timeZone: ZONA }));
const mismoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** Fecha 'AAAA-MM-DD' de un instante, en Nueva Jersey (un instante en UTC puede ser «mañana» todavía). */
const fechaNY = (iso: string) => (iso.length > 10 ? new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date(iso)) : iso);

/** 'AAAA-MM-DD' (o un instante) → «hoy», «mañana», «lun 19» o «lun 19 oct» si es de otro mes. */
export function diaCorto(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(`${fechaNY(iso)}T12:00:00`);
  const hoy = enNY(new Date());
  const man = new Date(hoy); man.setDate(hoy.getDate() + 1);
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
  if (mismoDia(d, hoy)) return 'hoy';
  if (mismoDia(d, man)) return 'mañana';
  if (mismoDia(d, ayer)) return 'ayer';
  return `${DIAS[d.getDay()]} ${d.getDate()}${d.getMonth() !== hoy.getMonth() ? ` ${MESES[d.getMonth()]}` : ''}`;
}

/** Instante → { dia: «hoy» / «lun 12 oct», hora: «10:05» } en hora de Nueva Jersey. */
export function momento(iso: string) {
  const d = enNY(new Date(iso));
  const hoy = enNY(new Date());
  const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { dia: mismoDia(d, hoy) ? 'hoy' : `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`, hora };
}

/** Fecha completa: «15 ago 2026». */
export const fechaLarga = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
};

/**
 * A14 «Unidades»: las telas se guardan en yardas; si el taller eligió metros, se muestran convertidas
 * (1 yd = 0.9144 m). Solo cambia cómo se ve.
 */
export function enUnidadTela(unidad: string) {
  const metros = unidad === 'm';
  return {
    abrev: metros ? 'm' : 'yd',
    cantidad: (yd: number) => num(metros ? yd * 0.9144 : yd),
    precio: (porYd: number) => num(metros ? porYd / 0.9144 : porYd),
  };
}
