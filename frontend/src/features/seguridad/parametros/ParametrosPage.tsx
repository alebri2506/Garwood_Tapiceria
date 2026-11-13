import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TopAdmin } from '../../../app/layout/AdminLayout';
import { ApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { Icon } from '../../../shared/ui/Icon';
import { TextField } from '../../../shared/ui/TextField';
import { Toast } from '../../../shared/ui/Toast';
import { MESES, fechaCorta } from '../../comercial/fechas';
import { parametrosApi, type CambioHistorial, type Guardado, type GrupoParametros, type Parametro } from './parametrosApi';
import './parametros.css';

/** "$" delante de los montos; la unidad (días, %, min, / h…) detrás, como en el prototipo. */
function adornos(p: Pick<Parametro, 'unidad'>) {
  if (p.unidad?.startsWith('USD')) {
    const resto = p.unidad.slice(3).replace('/', '/ ').trim();
    return { prefix: '$', suffix: resto || undefined };
  }
  return { prefix: undefined, suffix: p.unidad ?? undefined };
}

/** Unidades de A14 (tipo «opción»): cómo se lee cada una y su equivalencia. Solo cambia cómo se muestra. */
const UNIDADES: Record<string, [string, string]> = {
  yd: ['yarda', '1 yd = 0.914 m'], m: ['metro', '1 m = 1.094 yd'], in: ['pulgada', '1 in = 2.54 cm'], cm: ['centímetro', '1 cm = 0.394 in'],
};

/** Un valor como se lee en el historial: "$1.60", "40 %", "30 min", "9:00–12:00", "yarda". */
function legible(valor: string, unidad: string | null) {
  if (UNIDADES[valor] && !unidad) return UNIDADES[valor]![0];
  if (unidad?.startsWith('USD')) return `$${valor}`;
  if (/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(valor)) return valor.replace('-', '–');
  return unidad ? `${valor} ${unidad}` : valor;
}

const dosDigitos = (n: number) => String(n).padStart(2, '0');
/** "2 oct 2026, 08:30" */
const cuando = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} ${MESES[d.getMonth()]!.slice(0, 3)} ${d.getFullYear()}, ${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;
};
const diaCita = (fecha: string) => {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  return fechaCorta(new Date(a, m - 1, d));
};

const idCampo = (clave: string) => `par-${clave.replace(/\./g, '-')}`;
/** Lo escrito, listo para comparar con lo guardado: en un horario, "9:30 – 12:00" y "9:30-12:00" son lo mismo. */
const normal = (p: Parametro, texto: string) => (p.tipo === 'horario' ? texto.trim().replace(/\s*[-–—]\s*/, '-') : texto.trim());

/** A14 Parámetros (CU-S05 · decisiones D.3): el Administrador ajusta los valores del negocio; aplican solo a lo nuevo. */
export function ParametrosPage() {
  const [grupos, setGrupos] = useState<GrupoParametros[] | null>(null);
  const [historial, setHistorial] = useState<CambioHistorial[]>([]);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  // Lo que el Administrador escribió y aún no guardó (clave → texto).
  const [borrador, setBorrador] = useState<Record<string, string>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState<Guardado | null>(null);

  const cargar = useCallback(() => {
    setErrorCarga(null);
    Promise.all([parametrosApi.listar(), parametrosApi.historial()])
      .then(([l, h]) => { setGrupos(l.grupos); setHistorial(h); })
      .catch((e) => setErrorCarga(e instanceof ApiError ? e.message : 'No pudimos cargar los parámetros.'));
  }, []);
  useEffect(cargar, [cargar]);

  const todos = grupos?.flatMap((g) => g.parametros) ?? [];
  const editado = (p: Parametro) => borrador[p.clave] !== undefined && normal(p, borrador[p.clave]!) !== p.valor;
  const cambios = todos.filter(editado).map((p) => ({ clave: p.clave, valor: normal(p, borrador[p.clave]!) }));
  const hayCambios = cambios.length > 0;

  // Avisar antes de salir de la página con cambios sin guardar.
  useEffect(() => {
    if (!hayCambios) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [hayCambios]);

  const escribir = (clave: string, valor: string) => {
    setBorrador((b) => ({ ...b, [clave]: valor }));
    setErrores(({ [clave]: _, ...resto }) => resto);
    setGuardado(null);
  };

  const descartar = () => {
    setBorrador({});
    setErrores({});
    setErrorGuardar(null);
  };

  const guardar = async () => {
    if (!hayCambios || guardando) return;
    setGuardando(true);
    setErrorGuardar(null);
    setGuardado(null);
    try {
      const r = await parametrosApi.guardar(cambios);
      setGrupos(r.grupos);
      setBorrador({});
      setErrores({});
      setGuardado(r);
      parametrosApi.historial().then(setHistorial).catch(() => undefined);
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('No pudimos guardar los cambios. Intente de nuevo.', 0);
      setErrores(err.errores);
      setErrorGuardar(err.message);
      // Lleva al primer campo con error para corregirlo.
      const primero = todos.find((p) => err.errores[p.clave]);
      if (primero) document.getElementById(idCampo(primero.clave))?.focus();
    } finally {
      setGuardando(false);
    }
  };

  const fuera = guardado?.avisos.citasFueraDeHorario ?? [];

  return (
    <>
      <TopAdmin
        crumb="Configuración"
        titulo="Parámetros"
        debajo={hayCambios ? <p className="pr-pend" role="status">{cambios.length === 1 ? '1 cambio sin guardar' : `${cambios.length} cambios sin guardar`}</p> : undefined}
      >
        <div className="row pr-acciones">
          {hayCambios && <button type="button" className="gw-btn gw-btn-ghost" onClick={descartar} disabled={guardando}>Descartar</button>}
          <button type="button" className="gw-btn gw-btn-primary" onClick={guardar} disabled={!hayCambios || guardando}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </TopAdmin>

      {guardado && (
        guardado.cambiados.length > 0 ? (
          <Toast title="Parámetros guardados" onClose={() => setGuardado(null)}>
            Aplican a lo nuevo. Las citas, solicitudes y cotizaciones que ya existen mantienen sus condiciones.
          </Toast>
        ) : (
          <Toast tone="info" title="No había cambios" onClose={() => setGuardado(null)}>Los valores ya eran esos.</Toast>
        )
      )}
      {fuera.length > 0 && (
        <Alert tone="warning" title={fuera.length === 1 ? '1 cita quedó fuera del nuevo horario' : `${fuera.length} citas quedaron fuera del nuevo horario`}>
          <p>El cambio se guardó y estas citas se mantienen. Reprográmelas si hace falta:</p>
          <ul className="pr-fuera">
            {fuera.map((c) => (
              <li key={c.citaId}>
                <b>{c.solicitud}</b> · {c.cliente} · {diaCita(c.fecha)}, {c.hora} · {c.tipo === 'local' ? 'cita en el local' : 'visita a domicilio'}
              </li>
            ))}
          </ul>
          <Link to="/admin/agenda">Ir a la Agenda de citas</Link>
        </Alert>
      )}
      {errorGuardar && <Alert tone="danger" title="No se guardaron los cambios">{errorGuardar}</Alert>}

      {errorCarga && (
        <Alert tone="danger" title="No pudimos cargar los parámetros">
          {errorCarga} <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" onClick={cargar}>Reintentar</button>
        </Alert>
      )}
      {!grupos && !errorCarga && <p className="muted" role="status">Cargando parámetros…</p>}

      {grupos && (
        <div className="split">
          <div className="wide">
            {grupos.map((g) => g.parametros.every((p) => p.tipo === 'opcion') ? (
              // «Unidades de la solicitud y la cotización»: una tabla, como en el diseño.
              <section key={g.nombre} className="card stack" aria-labelledby={`grp-${g.nombre}`}>
                <div className="between"><h2 id={`grp-${g.nombre}`} style={{ fontSize: 18 }}>{g.nombre}</h2><span className="pill">Telas y medidas del mueble</span></div>
                <p className="muted pr-nota">Cómo se miden las telas que se cotizan y las medidas que el cliente escribe de su mueble. Lo guardado no cambia: solo cómo se muestra. La unidad de cada material del almacén se elige al registrarlo en <Link to="/admin/inventario">Inventario › Stock</Link>.</p>
                <div className="tbl-box pr-tabla">
                  <table className="t">
                    <thead><tr><th>Qué se mide</th><th>Unidad</th><th>Abreviatura</th><th>Equivalencia</th></tr></thead>
                    <tbody>
                      {g.parametros.map((p) => {
                        const valor = borrador[p.clave] ?? p.valor;
                        return (
                          <tr key={p.clave}>
                            <td><b>{p.etiqueta}</b></td>
                            <td>
                              <select id={idCampo(p.clave)} className={`gw-input${editado(p) ? ' pr-sel-editado' : ''}`} aria-label={`Unidad de ${p.etiqueta.toLowerCase()}`} value={valor} onChange={(e) => escribir(p.clave, e.target.value)}>
                                {p.opciones?.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
                              </select>
                              {errores[p.clave] && <p className="gw-field-error">{errores[p.clave]}</p>}
                            </td>
                            <td className="num">{valor}</td>
                            <td className="muted">{UNIDADES[valor]?.[1] ?? '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : (
              <section key={g.nombre} className="card stack" aria-labelledby={`grp-${g.nombre}`}>
                <h2 id={`grp-${g.nombre}`} style={{ fontSize: 18 }}>{g.nombre}</h2>
                <div className="grid2 pr-grid">
                  {g.parametros.map((p) => {
                    const { prefix, suffix } = adornos(p);
                    const valor = borrador[p.clave] ?? p.valor;
                    return (
                      <TextField
                        key={p.clave}
                        id={idCampo(p.clave)}
                        className={editado(p) ? 'pr-editado' : undefined}
                        label={p.etiqueta}
                        value={p.tipo === 'horario' ? valor.replace('-', '–') : valor}
                        onChange={(e) => escribir(p.clave, e.target.value)}
                        inputMode={p.tipo === 'horario' || p.tipo === 'texto' ? 'text' : p.tipo === 'entero' ? 'numeric' : 'decimal'}
                        placeholder={p.tipo === 'horario' ? '09:00–12:00' : undefined}
                        prefix={prefix}
                        suffix={suffix}
                        hint={p.ayuda ?? (p.tipo === 'horario' ? 'Hora de inicio y de fin, por ejemplo 09:00–12:00.' : undefined)}
                        error={errores[p.clave]}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <aside className="aside">
            <div className="card stack">
              <div className="between"><h2 style={{ fontSize: 17 }}>Historial de cambios</h2><Icon name="history" /></div>
              {historial.length === 0 ? (
                <p className="muted pr-vacio">Todavía no hay cambios. Cada cambio queda aquí con quién lo hizo y cuándo.</p>
              ) : (
                <ul className="pr-hist">
                  {historial.map((h) => (
                    <li key={h.id}>
                      <b>{h.etiqueta}: {legible(h.valorAnterior, h.unidad)} → {legible(h.valorNuevo, h.unidad)}</b>
                      <p className="audit">{h.usuario} · {cuando(h.fecha)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="card stack">
              <span className="ov">Relacionado</span>
              <Link to="/admin/plantillas" className="pr-rel">Plantillas de cotización</Link>
              <Link to="/admin/usuarios?tab=actividad" className="pr-rel">Usuarios, roles y auditoría completa</Link>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
