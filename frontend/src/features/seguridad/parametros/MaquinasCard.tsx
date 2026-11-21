import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { Toast } from '../../../shared/ui/Toast';
import { parametrosApi, type Maquina } from './parametrosApi';

// A14 › Máquinas: la tarifa por hora de cada máquina del taller. Se guarda fila por fila (no con «Guardar cambios»),
// cada cambio queda en el historial y las máquinas se desactivan, no se borran.

interface Borrador { id: number | 'nueva'; nombre: string; tarifaHora: string }

const dinero = (n: number) => `$${n.toFixed(2)}`;
const usadaEn = (n: number) => (n === 0 ? 'Ninguna' : n === 1 ? '1 plantilla' : `${n} plantillas`);

export function MaquinasCard({ alCambiar }: { alCambiar(): void }) {
  const [maquinas, setMaquinas] = useState<Maquina[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [confirmar, setConfirmar] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ titulo: string; texto?: string; tono?: 'info' } | null>(null);

  const cargar = useCallback(() => {
    setErrorCarga(null);
    parametrosApi.maquinas().then(setMaquinas).catch((e) => setErrorCarga(e instanceof ApiError ? e.message : 'No pudimos cargar las máquinas.'));
  }, []);
  useEffect(cargar, [cargar]);

  const editar = (b: Borrador) => { setBorrador(b); setErrores({}); setConfirmar(null); setAviso(null); };
  const cancelar = () => { setBorrador(null); setErrores({}); };

  const guardar = async () => {
    if (!borrador || ocupado) return;
    setOcupado(true);
    try {
      const datos = { nombre: borrador.nombre, tarifaHora: borrador.tarifaHora };
      const m = borrador.id === 'nueva' ? await parametrosApi.crearMaquina(datos) : await parametrosApi.editarMaquina(borrador.id, datos);
      setBorrador(null);
      setErrores({});
      if (m.sinCambios) setAviso({ titulo: 'No había cambios', texto: 'Los valores ya eran esos.', tono: 'info' });
      else setAviso(borrador.id === 'nueva'
        ? { titulo: 'Máquina agregada', texto: `${m.nombre} ya se puede elegir en las Plantillas.` }
        : { titulo: 'Máquina guardada', texto: 'El precio sugerido de las plantillas que la usan ya se calcula con la nueva tarifa.' });
      cargar();
      alCambiar();
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('No pudimos guardar la máquina. Intente de nuevo.', 0);
      setErrores(Object.keys(err.errores).length ? err.errores : { general: err.message });
    } finally {
      setOcupado(false);
    }
  };

  const cambiarEstado = async (m: Maquina, activo: boolean) => {
    setOcupado(true);
    try {
      await parametrosApi.estadoMaquina(m.id, activo);
      setConfirmar(null);
      setAviso(activo
        ? { titulo: 'Máquina reactivada', texto: `${m.nombre} se puede volver a elegir en las Plantillas.` }
        : { titulo: 'Máquina desactivada', texto: `${m.nombre} ya no se ofrece al armar plantillas.` });
      cargar();
      alCambiar();
    } catch (e) {
      setAviso({ titulo: 'No pudimos cambiar la máquina', texto: e instanceof ApiError ? e.message : 'Intente de nuevo.', tono: 'info' });
    } finally {
      setOcupado(false);
    }
  };

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); void guardar(); }
    if (e.key === 'Escape') cancelar();
  };

  const filaEdicion = (b: Borrador) => (
    <tr key={b.id} className="pr-maq-edit">
      <td>
        <input className="gw-input" aria-label="Nombre de la máquina" value={b.nombre} maxLength={60} autoFocus placeholder="Ej.: Remalladora"
          aria-invalid={Boolean(errores.nombre)} onKeyDown={teclas} onChange={(e) => setBorrador({ ...b, nombre: e.target.value })} />
        {errores.nombre && <p className="gw-field-error">{errores.nombre}</p>}
      </td>
      <td>
        <div className="gw-input-wrap pr-maq-tarifa">
          <span className="gw-input-prefix" aria-hidden="true">$</span>
          <input className="gw-input" inputMode="decimal" aria-label="Tarifa por hora" value={b.tarifaHora} placeholder="0.00"
            aria-invalid={Boolean(errores.tarifaHora)} onKeyDown={teclas} onChange={(e) => setBorrador({ ...b, tarifaHora: e.target.value })} />
          <span className="gw-input-suffix">/ h</span>
        </div>
        {errores.tarifaHora && <p className="gw-field-error">{errores.tarifaHora}</p>}
      </td>
      <td colSpan={2}>
        <div className="row pr-maq-acc">
          <button type="button" className="gw-btn gw-btn-primary gw-btn-sm" onClick={guardar} disabled={ocupado}>{ocupado ? 'Guardando…' : b.id === 'nueva' ? 'Agregar' : 'Guardar'}</button>
          <button type="button" className="gw-btn gw-btn-ghost gw-btn-sm" onClick={cancelar} disabled={ocupado}>Cancelar</button>
        </div>
        {errores.general && <p className="gw-field-error">{errores.general}</p>}
      </td>
    </tr>
  );

  return (
    <section className="card stack" aria-labelledby="grp-maquinas">
      <div className="between">
        <h2 id="grp-maquinas" style={{ fontSize: 18 }}>Máquinas</h2>
        {!borrador && maquinas && (
          <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" onClick={() => editar({ id: 'nueva', nombre: '', tarifaHora: '' })}>+ Agregar máquina</button>
        )}
      </div>
      <p className="muted pr-nota">
        La tarifa por hora de cada máquina se suma al precio sugerido de las <Link to="/admin/plantillas">Plantillas</Link>. Cada cambio queda en el
        historial. Una máquina que ya no se usa se desactiva: deja de ofrecerse, pero las plantillas que la tienen la siguen mostrando.
      </p>

      {aviso && <Toast tone={aviso.tono ?? 'success'} title={aviso.titulo} onClose={() => setAviso(null)}>{aviso.texto}</Toast>}
      {errorCarga && (
        <Alert tone="danger" title="No pudimos cargar las máquinas">
          {errorCarga} <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" onClick={cargar}>Reintentar</button>
        </Alert>
      )}
      {!maquinas && !errorCarga && <p className="muted" role="status">Cargando máquinas…</p>}

      {maquinas && (
        <div className="tbl-box pr-tabla">
          <table className="t pr-maq">
            <thead><tr><th>Máquina</th><th>Tarifa por hora</th><th>Usada en</th><th><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody>
              {maquinas.length === 0 && !borrador && <tr><td colSpan={4} className="muted">Todavía no hay máquinas. Agregue la primera.</td></tr>}
              {maquinas.map((m) => borrador?.id === m.id ? filaEdicion(borrador) : (
                <tr key={m.id} className={m.activo ? undefined : 'pr-maq-inactiva'}>
                  <td><b>{m.nombre}</b>{!m.activo && <span className="pill pr-maq-pill">Desactivada</span>}</td>
                  <td className="num">{dinero(m.tarifaHora)} / h</td>
                  <td className="muted">{usadaEn(m.usos)}</td>
                  <td>
                    {confirmar === m.id ? (
                      <div className="pr-maq-conf" role="alert">
                        <p>{m.usos > 0
                          ? `La usan ${usadaEn(m.usos).toLowerCase()}. La seguirán mostrando con su tarifa, pero al editarlas habrá que elegir otra máquina.`
                          : 'Dejará de ofrecerse al armar plantillas.'}</p>
                        <div className="row pr-maq-acc">
                          <button type="button" className="gw-btn gw-btn-danger gw-btn-sm" onClick={() => cambiarEstado(m, false)} disabled={ocupado}>Desactivar</button>
                          <button type="button" className="gw-btn gw-btn-ghost gw-btn-sm" onClick={() => setConfirmar(null)} disabled={ocupado}>Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <div className="row pr-maq-acc">
                        {m.activo && <button type="button" className="gw-btn gw-btn-ghost gw-btn-sm" disabled={Boolean(borrador) || ocupado}
                          onClick={() => editar({ id: m.id, nombre: m.nombre, tarifaHora: m.tarifaHora.toFixed(2) })}>Editar</button>}
                        {m.activo
                          ? <button type="button" className="gw-btn gw-btn-ghost gw-btn-sm" disabled={Boolean(borrador) || ocupado} onClick={() => { setConfirmar(m.id); setAviso(null); }}>Desactivar</button>
                          : <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" disabled={Boolean(borrador) || ocupado} onClick={() => cambiarEstado(m, true)}>Reactivar</button>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {borrador?.id === 'nueva' && filaEdicion(borrador)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
