import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TopAdmin } from '../../../app/layout/AdminLayout';
import { ApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { Icon } from '../../../shared/ui/Icon';
import { momento, num } from './comunes';
import { inventarioApi, type Diferencia, type ListaConteo } from './inventarioApi';
import './inventario.css';

// A9 Conteo de inventario (CU-A10): se cuenta a ciegas (la lista no muestra lo que dice el sistema), se comparan las
// diferencias y cada una se ajusta con su motivo. El saldo queda igual al estante.

const PASOS = ['1 · Contar', '2 · Revisar', '3 · Listo'];

export function ConteoPage() {
  const [lista, setLista] = useState<ListaConteo | null>(null);
  const [contado, setContado] = useState<Record<number, string>>({});
  const [paso, setPaso] = useState(0);
  const [difs, setDifs] = useState<Diferencia[]>([]);
  const [motivo, setMotivo] = useState<Record<number, string>>({});
  const [otro, setOtro] = useState<Record<number, string>>({});
  const [intento, setIntento] = useState(false);
  const [resultado, setResultado] = useState<{ contados: number; coincidieron: number; ajustados: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => { inventarioApi.listaConteo().then(setLista).catch((e) => setError(e instanceof ApiError ? e.message : 'No pudimos cargar la lista.')); }, []);

  const materiales = useMemo(() => lista?.grupos.flatMap((g) => g.materiales) ?? [], [lista]);
  const faltan = materiales.filter((m) => contado[m.id] === undefined || contado[m.id] === '');
  const valor = (id: number) => Number((contado[id] ?? '').replace(',', '.'));
  const contados = () => materiales.map((m) => ({ materialId: m.id, contado: valor(m.id) }));
  const cambiar = (id: number, d: number) => setContado((c) => ({ ...c, [id]: String(Math.max(0, num((c[id] === undefined || c[id] === '' ? 0 : valor(id)) + d))) }));

  const comparar = async () => {
    if (faltan.length || materiales.some((m) => Number.isNaN(valor(m.id)) || valor(m.id) < 0)) { setIntento(true); return; }
    setOcupado(true); setError(null);
    try {
      const r = await inventarioApi.comparar(contados());
      setDifs(r.diferencias); setPaso(1); setIntento(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos comparar el conteo.');
    } finally {
      setOcupado(false);
    }
  };

  const guardar = async () => {
    if (difs.some((d) => !motivo[d.materialId] || (motivo[d.materialId] === 'Otro' && !otro[d.materialId]?.trim()))) { setIntento(true); return; }
    setOcupado(true); setError(null);
    try {
      const r = await inventarioApi.guardarConteo(contados().map((c) => ({ ...c, ...(motivo[c.materialId] && difs.some((d) => d.materialId === c.materialId) ? { motivo: motivo[c.materialId], otroMotivo: otro[c.materialId] } : {}) })));
      setResultado(r); setPaso(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos guardar el conteo.');
    } finally {
      setOcupado(false);
    }
  };

  const intro = paso === 0
    ? `Revisión semanal · ${materiales.length} materiales en ${lista?.grupos.length ?? 0} grupos${lista?.ultimoConteo ? ` · último conteo ${momento(lista.ultimoConteo).dia}` : ''}`
    : paso === 1 ? 'Compare lo contado con lo que dice el sistema' : 'Conteo cerrado';

  return (
    <div className="iv iv-conteo">
      <TopAdmin crumb={<><Link to="/admin/inventario">Inventario</Link> › Conteo de inventario</>} titulo="Conteo de inventario" debajo={<p className="muted" style={{ margin: '6px 0 0', fontSize: 13.5 }}>{intro}</p>}>
        <div className="prg" aria-label="Pasos del conteo">
          {PASOS.map((l, i) => (
            <button key={l} type="button" className={i === paso ? 'on' : i < paso && paso < 2 ? 'ok' : ''} aria-current={i === paso ? 'step' : undefined} disabled={!(i < paso && paso < 2)} onClick={() => { setPaso(i); setIntento(false); }}>
              {i < paso ? `✓ ${l}` : l}
            </button>
          ))}
        </div>
      </TopAdmin>
      {error && <Alert tone="danger" title="No se pudo completar" compact>{error}</Alert>}
      {!lista && !error && <p className="muted" role="status">Cargando…</p>}

      {lista && paso === 0 && (
        <>
          <Alert tone="info" title="Cuente lo que ve en el almacén">La lista no muestra lo que dice el sistema, para que el conteo sea real. Escriba lo que contó o use − y +.</Alert>
          {lista.grupos.map((g) => (
            <section key={g.categoria} className="zone">
              <div className="zh"><b>{g.nombre}</b><span>{g.materiales.length} {g.materiales.length === 1 ? 'material' : 'materiales'}</span></div>
              {g.materiales.map((m) => {
                const vacio = contado[m.id] === undefined || contado[m.id] === '';
                return (
                  <div key={m.id} className={`cr${vacio ? '' : ' done'}`}>
                    <div><b>{m.nombre}</b>{intento && vacio && <small style={{ color: 'var(--danger-ink)', fontWeight: 600 }}>Falta contar</small>}</div>
                    <div className="stp">
                      <button type="button" onClick={() => cambiar(m.id, -1)} aria-label={`Menos ${m.nombre}`}>−</button>
                      <input className="cnt-in" inputMode="decimal" value={contado[m.id] ?? ''} placeholder="—" aria-label={`Contado de ${m.nombre}`}
                        onChange={(e) => setContado((c) => ({ ...c, [m.id]: e.target.value.replace(/[^\d.,]/g, '') }))} />
                      <small>{m.unidad}</small>
                      <button type="button" onClick={() => cambiar(m.id, 1)} aria-label={`Más ${m.nombre}`}>+</button>
                    </div>
                  </div>
                );
              })}
            </section>
          ))}
          {intento && faltan.length > 0 && <Alert tone="warning" title={`Faltan ${faltan.length} por contar`} compact>Escriba lo que hay de cada material, aunque sea 0.</Alert>}
          <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="gw-btn gw-btn-primary" disabled={ocupado} onClick={comparar}>{ocupado ? 'Comparando…' : 'Terminar conteo y comparar'}</button></div>
        </>
      )}

      {paso === 1 && difs.length === 0 && (
        <div className="okb">
          <span className="ic"><Icon name="check" size={28} /></span>
          <h2>Todo coincide</h2>
          <p>Los {materiales.length} materiales contados son iguales a lo que dice el sistema. No hay nada que ajustar.</p>
          <div className="row" style={{ gap: 8 }}><button type="button" className="gw-btn gw-btn-ghost" onClick={() => setPaso(0)}>← Volver a contar</button><button type="button" className="gw-btn gw-btn-primary" disabled={ocupado} onClick={guardar}>Guardar conteo</button></div>
        </div>
      )}

      {paso === 1 && difs.length > 0 && (
        <>
          <Alert tone="warning" title={`${difs.length} ${difs.length === 1 ? 'diferencia encontrada' : 'diferencias encontradas'}`}>Elija el motivo de cada diferencia. Al guardar, el saldo del sistema queda igual a lo que contó y cada ajuste queda en Movimientos.</Alert>
          <section className="zone">
            <div className="dr hd"><span>Material</span><span className="r">Sistema</span><span className="r">Contado</span><span className="r">Diferencia</span><span>Motivo</span></div>
            {difs.map((d) => (
              <div key={d.materialId} className="dr">
                <b>{d.nombre}</b>
                <span className="r">{num(d.sistema)} {d.unidad}</span>
                <span className="r">{num(d.contado)} {d.unidad}</span>
                <span className="r neg">{d.diferencia > 0 ? '+' : '−'}{num(Math.abs(d.diferencia))}</span>
                <div className="chips" role="radiogroup" aria-label={`Motivo de ${d.nombre}`}>
                  {lista!.motivos.map((w) => <button key={w} type="button" role="radio" aria-checked={motivo[d.materialId] === w} className={motivo[d.materialId] === w ? 'on' : ''} onClick={() => setMotivo((x) => ({ ...x, [d.materialId]: w }))}>{w}</button>)}
                  {motivo[d.materialId] === 'Otro' && <input className="otro-in" placeholder="Escriba el motivo" maxLength={120} value={otro[d.materialId] ?? ''} onChange={(e) => setOtro((x) => ({ ...x, [d.materialId]: e.target.value }))} aria-label={`Otro motivo de ${d.nombre}`} />}
                </div>
                {intento && (!motivo[d.materialId] || (motivo[d.materialId] === 'Otro' && !otro[d.materialId]?.trim())) && <span className="miss">{motivo[d.materialId] ? 'Escriba el motivo' : 'Elija un motivo'}</span>}
              </div>
            ))}
          </section>
          <p className="why">{materiales.length - difs.length} materiales coinciden con el sistema: no se toca nada.</p>
          <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" className="gw-btn gw-btn-ghost" onClick={() => setPaso(0)}>← Volver a contar</button>
            <button type="button" className="gw-btn gw-btn-primary" disabled={ocupado} onClick={guardar}>{ocupado ? 'Guardando…' : 'Guardar ajustes'}</button>
          </div>
        </>
      )}

      {paso === 2 && resultado && (
        <div className="okb">
          <span className="ic"><Icon name="check" size={28} /></span>
          <h2>{resultado.ajustados ? 'Conteo guardado · el sistema coincide con el estante' : 'Conteo guardado · todo coincidía'}</h2>
          <p>{resultado.ajustados
            ? `Se hicieron ${resultado.ajustados} ${resultado.ajustados === 1 ? 'ajuste' : 'ajustes'} con su motivo. Quedaron en Movimientos con usuario, fecha y hora. Con los saldos corregidos, la lista de reposición ya está al día.`
            : 'No se hizo ningún ajuste. Cada material queda en Movimientos como «Conteo de inventario · coincide», con usuario, fecha y hora, como constancia de que se revisó.'}</p>
          <div className="sum3"><div><b>{resultado.contados}</b><small>materiales contados</small></div><div><b>{resultado.coincidieron}</b><small>coincidieron</small></div><div><b>{resultado.ajustados}</b><small>ajustados</small></div></div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link className="gw-btn gw-btn-secondary" to="/admin/inventario/movimientos">Ver movimientos</Link>
            <Link className="gw-btn gw-btn-primary" to="/admin/inventario/reponer">Ir a Reponer</Link>
          </div>
        </div>
      )}
    </div>
  );
}
