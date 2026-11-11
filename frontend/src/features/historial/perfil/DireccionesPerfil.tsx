import { useState, type FormEvent } from 'react';
import { ApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { Icon } from '../../../shared/ui/Icon';
import { TextField } from '../../../shared/ui/TextField';
import { MapsProvider } from '../../../shared/maps/MapsProvider';
import { MapaUbicacion } from '../../../shared/maps/MapaUbicacion';
import { DireccionAutocompletar } from '../../../shared/maps/DireccionAutocompletar';
import { mapsHabilitado } from '../../../shared/maps/config';
import { erroresDe, perfilApi, type DireccionPerfil } from './perfilApi';

interface Nueva { etiqueta: string; texto: string; referencia: string; ubicacion: google.maps.LatLngLiteral | null }
const VACIA: Nueva = { etiqueta: '', texto: '', referencia: '', ubicacion: null };

/** E.2.1: nombre + dirección (Google Maps o tocando el mapa) + referencia. */
function AgregarDireccion({ alGuardar, alCancelar }: { alGuardar(l: DireccionPerfil[]): void; alCancelar(): void }) {
  const [d, setD] = useState<Nueva>(VACIA);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const poner = (c: Partial<Nueva>, campo?: string) => { setD((x) => ({ ...x, ...c })); if (campo) setErrores(({ [campo]: _, ...r }) => r); };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const faltan: Record<string, string> = {};
    if (!d.etiqueta.trim()) faltan.etiqueta = 'Póngale un nombre (por ejemplo, Casa)';
    if (d.texto.trim().length < 5) faltan.direccion = 'Escriba la dirección completa';
    if (Object.keys(faltan).length) { setErrores(faltan); return; }
    setGuardando(true);
    setError(null);
    try {
      const r = await perfilApi.agregarDireccion({
        etiqueta: d.etiqueta.trim(), direccion: d.texto.trim(), referencia: d.referencia.trim() || undefined,
        ...(d.ubicacion && { latitud: d.ubicacion.lat, longitud: d.ubicacion.lng }),
      });
      alGuardar(r.direcciones);
    } catch (err) {
      const campos = erroresDe(err);
      setErrores(campos);
      if (!Object.keys(campos).length) setError(err instanceof ApiError ? err.message : 'No pudimos guardar la dirección. Intente de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form className="stack pf-nueva" onSubmit={guardar} noValidate>
      <div className="grid2" style={{ gap: 16, alignItems: 'start' }}>
        <div className="stack" style={{ gap: 12 }}>
          <TextField label="Nombre" required placeholder="Ej.: Casa de mi madre" maxLength={40} autoFocus
            value={d.etiqueta} onChange={(e) => poner({ etiqueta: e.target.value }, 'etiqueta')} error={errores.etiqueta} />
          {mapsHabilitado ? (
            <>
              <DireccionAutocompletar label="Dirección" value={d.texto}
                onChange={(texto) => poner({ texto, ubicacion: null }, 'direccion')}
                onElegir={(x) => poner({ texto: x.texto, ubicacion: x.ubicacion }, 'direccion')} />
              {errores.direccion && <p className="gw-field-error"><Icon name="alert" size={14} />{errores.direccion}</p>}
            </>
          ) : (
            <TextField label="Dirección" required maxLength={200} placeholder="Ej.: 48 Park St, Montclair, NJ 07042"
              value={d.texto} onChange={(e) => poner({ texto: e.target.value, ubicacion: null }, 'direccion')} error={errores.direccion} />
          )}
          <TextField label="Depto., piso o referencia" optional maxLength={120} value={d.referencia} onChange={(e) => poner({ referencia: e.target.value })} />
        </div>
        {/* Tocar el mapa también llena la dirección (OpenStreetMap, como en W2). */}
        <MapaUbicacion alto={220} ubicacion={d.ubicacion} etiqueta={d.ubicacion ? d.texto : undefined}
          onElegir={(x) => poner({ texto: x.texto, ubicacion: x.ubicacion }, 'direccion')} />
      </div>
      {error && <Alert tone="danger" compact>{error}</Alert>}
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button type="submit" className="gw-btn gw-btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar dirección'}</button>
        <button type="button" className="gw-btn gw-btn-ghost" onClick={alCancelar}>Cancelar</button>
      </div>
    </form>
  );
}

/** W10 › Direcciones de entrega (decisiones E.2). Cada cambio se guarda al instante. */
export function DireccionesPerfil({ direcciones, onCambio }: { direcciones: DireccionPerfil[]; onCambio(l: DireccionPerfil[], aviso?: string): void }) {
  const [agregando, setAgregando] = useState(false);
  const [quitando, setQuitando] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hacer = async (accion: () => Promise<{ direcciones: DireccionPerfil[] }>, aviso: string) => {
    setOcupado(true);
    setError(null);
    try {
      onCambio((await accion()).direcciones, aviso);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No pudimos guardar el cambio. Intente de nuevo.');
    } finally {
      setOcupado(false);
      setQuitando(null);
    }
  };

  return (
    <MapsProvider>
      <section className="card stack" aria-labelledby="pf-dir">
        <div className="between">
          <h2 id="pf-dir" style={{ fontSize: 18 }}>Direcciones de entrega</h2>
          {!agregando && <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" onClick={() => setAgregando(true)}>+ Agregar dirección</button>}
        </div>

        {direcciones.length === 0 && !agregando && (
          <p className="muted" style={{ fontSize: 14 }}>Todavía no tiene direcciones guardadas. Agregue una para no escribirla en cada solicitud.</p>
        )}
        {direcciones.length > 0 && (
          <div className="grid2" style={{ gap: 12 }}>
            {direcciones.map((d) => (
              <div key={d.id} className={d.esPrincipal ? 'pf-addr on' : 'pf-addr'}>
                {/* Como en el prototipo: tocar la tarjeta la hace principal. */}
                <button type="button" className="pf-addr-main" disabled={ocupado || d.esPrincipal}
                  aria-label={d.esPrincipal ? `${d.etiqueta ?? 'Dirección'}: principal` : `Hacer principal: ${d.etiqueta ?? d.direccion}`}
                  onClick={() => hacer(() => perfilApi.marcarPrincipal(d.id), `${d.etiqueta ?? 'La dirección'} es ahora su dirección principal.`)}>
                  <Icon name="map-pin" />
                  <span className="pf-addr-txt">
                    <b>{d.etiqueta ?? 'Dirección'}</b>
                    <span className="muted">{d.direccion}{d.referencia ? ` · ${d.referencia}` : ''}</span>
                  </span>
                  {d.esPrincipal && <span className="pill pf-principal">Principal</span>}
                </button>
                {quitando === d.id ? (
                  <div className="pf-quitar">
                    <span>¿Quitarla de su perfil? Las solicitudes que ya la usaron no cambian.</span>
                    <span className="row" style={{ gap: 6 }}>
                      <button type="button" className="gw-btn gw-btn-danger gw-btn-sm" disabled={ocupado}
                        onClick={() => hacer(() => perfilApi.quitarDireccion(d.id), `Quitamos «${d.etiqueta ?? d.direccion}» de su perfil.`)}>Quitar</button>
                      <button type="button" className="gw-btn gw-btn-ghost gw-btn-sm" onClick={() => setQuitando(null)}>Cancelar</button>
                    </span>
                  </div>
                ) : (
                  <button type="button" className="gw-btn gw-btn-ghost gw-btn-sm pf-addr-quitar" disabled={ocupado} onClick={() => setQuitando(d.id)}>Quitar</button>
                )}
              </div>
            ))}
          </div>
        )}
        {error && <Alert tone="danger" compact>{error}</Alert>}

        {agregando && (
          <AgregarDireccion alCancelar={() => setAgregando(false)}
            alGuardar={(l) => { setAgregando(false); onCambio(l, 'Dirección guardada.'); }} />
        )}
        <p className="muted" style={{ fontSize: 13 }}>
          La dirección principal se propone al solicitar con delivery y en el despacho.{direcciones.length > 1 ? ' Toque otra para hacerla principal.' : ''}
        </p>
      </section>
    </MapsProvider>
  );
}
