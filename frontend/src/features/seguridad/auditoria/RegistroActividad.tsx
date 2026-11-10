import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { Icon } from '../../../shared/ui/Icon';
import { MESES } from '../../comercial/fechas';
import { auditoriaApi, type FiltrosActividad, type PaginaActividad } from './auditoriaApi';
import './auditoria.css';

type Periodo = '30' | '7' | 'hoy' | 'rango';

const dos = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const haceDias = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
/** "13 oct 10:05" (columna "Fecha y hora", como en el prototipo). */
const fechaHora = (s: string) => { const d = new Date(s); return `${d.getDate()} ${MESES[d.getMonth()]!.slice(0, 3)} ${dos(d.getHours())}:${dos(d.getMinutes())}`; };
/** "2026-10-12" → "12 oct 2026" */
const dia = (s: string) => { const [a, m, d] = s.split('-').map(Number) as [number, number, number]; return `${d} ${MESES[m - 1]!.slice(0, 3)} ${a}`; };

/** A20 › Registro de actividad (CU-S06 · decisiones D.2): quién hizo qué y cuándo. Solo se consulta: no se edita ni se borra. */
export function RegistroActividad() {
  const [busca, setBusca] = useState('');
  const [q, setQ] = useState('');
  const [usuarioId, setUsuarioId] = useState('');
  const [modulo, setModulo] = useState('');
  const [periodo, setPeriodo] = useState<Periodo>('30');
  const [rango, setRango] = useState({ desde: haceDias(29), hasta: iso(new Date()) });
  const [pagina, setPagina] = useState(1);

  const [datos, setDatos] = useState<PaginaActividad | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [errorExportar, setErrorExportar] = useState<string | null>(null);
  const ultima = useRef(0);

  // El buscador espera a que termine de escribir.
  useEffect(() => {
    const t = setTimeout(() => { setQ(busca.trim()); setPagina(1); }, 350);
    return () => clearTimeout(t);
  }, [busca]);

  // D.2.1: por defecto, los últimos 30 días (sin fechas, el backend los calcula en hora de Nueva Jersey).
  const fechas: Pick<FiltrosActividad, 'desde' | 'hasta'> =
    periodo === '7' ? { desde: haceDias(6) } : periodo === 'hoy' ? { desde: iso(new Date()), hasta: iso(new Date()) } : periodo === 'rango' ? rango : {};
  const filtros: FiltrosActividad = { ...fechas, usuarioId: usuarioId ? Number(usuarioId) : undefined, modulo: modulo || undefined, q: q || undefined };
  const clave = JSON.stringify({ ...filtros, pagina });

  useEffect(() => {
    const n = ++ultima.current;
    setCargando(true);
    setError(null);
    auditoriaApi.listar({ ...filtros, pagina })
      .then((r) => { if (n === ultima.current) setDatos(r); })
      .catch((e) => { if (n === ultima.current) setError(e instanceof ApiError ? e.message : 'No pudimos cargar el registro de actividad.'); })
      .finally(() => { if (n === ultima.current) setCargando(false); });
    // `clave` resume todos los filtros y la página: se vuelve a pedir solo cuando cambia alguno.
  }, [clave]);

  /** Al cambiar un filtro se vuelve a la primera página. */
  const cambiar = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPagina(1); };

  const exportar = async () => {
    setExportando(true);
    setErrorExportar(null);
    try {
      await auditoriaApi.exportar(filtros);
    } catch (e) {
      setErrorExportar(e instanceof ApiError ? e.message : 'No pudimos exportar. Intente de nuevo.');
    } finally {
      setExportando(false);
    }
  };

  const registros = datos?.registros ?? [];
  const desdeFila = datos ? (datos.pagina - 1) * datos.porPagina + 1 : 0;
  const hastaFila = datos ? desdeFila + registros.length - 1 : 0;
  const paginas = datos ? Math.max(1, Math.ceil(datos.total / datos.porPagina)) : 1;

  return (
    <div className="stack au">
      <div className="row au-filtros">
        <label className="search au-search">
          <Icon name="search" size={18} />
          <input type="search" aria-label="Buscar por usuario, pedido o acción" placeholder="Buscar por usuario, pedido o acción" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <label className="au-sel">
          <span className="sr-only">Usuario</span>
          <select className="gw-input" value={usuarioId} onChange={(e) => cambiar(setUsuarioId)(e.target.value)}>
            <option value="">Usuario: todos</option>
            {datos?.opciones.usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre ? `${u.nombre} (${u.nombreUsuario})` : u.nombreUsuario}</option>)}
          </select>
        </label>
        <label className="au-sel">
          <span className="sr-only">Módulo</span>
          <select className="gw-input" value={modulo} onChange={(e) => cambiar(setModulo)(e.target.value)}>
            <option value="">Módulo: todos</option>
            {datos?.opciones.modulos.map((m) => <option key={m.codigo} value={m.codigo}>{m.nombre}</option>)}
          </select>
        </label>
        <label className="au-sel">
          <span className="sr-only">Período</span>
          <select className="gw-input" value={periodo} onChange={(e) => cambiar(setPeriodo)(e.target.value as Periodo)}>
            <option value="30">Últimos 30 días</option>
            <option value="7">Últimos 7 días</option>
            <option value="hoy">Hoy</option>
            <option value="rango">Elegir fechas…</option>
          </select>
        </label>
        {periodo === 'rango' && (
          <span className="row au-rango">
            <label><span className="sr-only">Desde</span><input type="date" className="gw-input" value={rango.desde} max={rango.hasta} onChange={(e) => cambiar(setRango)({ ...rango, desde: e.target.value })} /></label>
            <span aria-hidden="true">a</span>
            <label><span className="sr-only">Hasta</span><input type="date" className="gw-input" value={rango.hasta} min={rango.desde} onChange={(e) => cambiar(setRango)({ ...rango, hasta: e.target.value })} /></label>
          </span>
        )}
        <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" onClick={exportar} disabled={exportando || !datos?.total}>
          {exportando ? 'Exportando…' : 'Exportar'}
        </button>
      </div>

      {datos && datos.desde && (
        <p className="muted au-resumen" role="status">
          {dia(datos.desde)} – {dia(datos.hasta)} · {datos.total === 1 ? '1 registro' : `${datos.total} registros`}
          {cargando && ' · actualizando…'}
        </p>
      )}
      {errorExportar && <Alert tone="danger" title="No se exportó">{errorExportar}</Alert>}
      {error && <Alert tone="danger" title="No pudimos cargar el registro">{error}</Alert>}
      {datos?.truncado && (
        <Alert tone="warning" title="Hay demasiados registros en este período">Se muestran los 10 000 más recientes. Elija un período más corto o un filtro para ver el resto.</Alert>
      )}
      {!datos && cargando && <p className="muted" role="status">Cargando el registro de actividad…</p>}

      {datos && registros.length === 0 && !error && (
        <EmptyState icon="search" title="Sin actividad">No hay registros con estos filtros en el período elegido.</EmptyState>
      )}
      {registros.length > 0 && (
        <div className="tbl-box">
          <table className="t au-tabla" aria-busy={cargando}>
            <thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Módulo</th><th>Acción</th><th>Registro</th><th>Antes → después</th></tr></thead>
            <tbody>
              {registros.map((r) => (
                <tr key={r.id}>
                  <td className="num au-fecha"><time dateTime={r.fecha}>{fechaHora(r.fecha)}</time></td>
                  <td>{r.usuario}</td>
                  <td>{r.modulo}</td>
                  <td>{r.accion}</td>
                  <td>{r.registro || <span className="muted">—</span>}</td>
                  <td className="au-cambio">{r.cambio || <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {datos && datos.total > datos.porPagina && (
        <div className="between au-paginas">
          <span className="muted">Mostrando {desdeFila}–{hastaFila} de {datos.total}</span>
          <span className="row">
            <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" disabled={pagina <= 1 || cargando} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
            <span className="muted">Página {datos.pagina} de {paginas}</span>
            <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" disabled={pagina >= paginas || cargando} onClick={() => setPagina((p) => p + 1)}>Siguiente</button>
          </span>
        </div>
      )}

      <p className="audit">El registro no se puede editar ni borrar.</p>
    </div>
  );
}
