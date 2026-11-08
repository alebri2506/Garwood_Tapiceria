import { Alert } from '../../../shared/ui/Alert';
import { Icon, type IconName } from '../../../shared/ui/Icon';
import { TextField } from '../../../shared/ui/TextField';
import { UploadZone } from '../../../shared/ui/UploadZone';
import { DireccionAutocompletar } from '../../../shared/maps/DireccionAutocompletar';
import { MapaUbicacion } from '../../../shared/maps/MapaUbicacion';
import { mapsHabilitado } from '../../../shared/maps/config';
import { MESES, fechaLarga } from '../fechas';
import { CalendarioRecojo } from './CalendarioRecojo';
import { Contador } from './Contador';
import { DibujoMueble } from './DibujoMueble';
import { fondoDe } from './datos';
import {
  hayRecojo, muebleDeTela, necesitaCita, nuevoMueble, porPartesPosible, sinTelaPosible, telasPorDefecto, tipoDe, todoFabricacion,
  etiquetaMueble, type DireccionW2, type EstadoW2, type MuebleW2, type OpcionTelaW2,
} from './estadoW2';
import type { Catalogo, DireccionGuardada } from './solicitudApi';
import type { Errores } from './validacion';

export interface PropsPaso {
  c: Catalogo;
  e: EstadoW2;
  set(cambio: Partial<EstadoW2>): void;
  errores: Errores;
  guardadas: DireccionGuardada[];
  /** A3: el Administrador registra la solicitud por el cliente (textos en tercera persona). */
  admin?: boolean;
  /** A3: las fotos se le piden al cliente por enlace (no en persona). */
  fotosPorEnlace?: { activo: boolean; posible: boolean; cambiar(v: boolean): void };
  /** A3: el cliente está en el local, así que la tela se elige con él y no se pregunta qué busca. */
  buscaOpcionalEnLocal?: boolean;
}

const ErrorCampo = ({ texto }: { texto?: string }) => (texto ? <p className="gw-field-error w2-error" role="alert"><Icon name="alert" size={14} />{texto}</p> : null);

function cambiarMueble(p: PropsPaso, i: number, cambio: Partial<MuebleW2>) {
  p.set({ muebles: p.e.muebles.map((m, k) => (k === i ? { ...m, ...cambio } : m)) });
}

/** Barra con los muebles de la solicitud: elegir cuál se edita, quitar o agregar otro. */
function BarraMuebles({ p, editable }: { p: PropsPaso; editable: boolean }) {
  const { c, e, set } = p;
  const n = e.muebles.length;
  const quitar = (i: number) => {
    const muebles = e.muebles.filter((_, k) => k !== i);
    set({ muebles, activo: Math.max(0, Math.min(e.activo > i ? e.activo - 1 : e.activo, muebles.length - 1)) });
  };
  return (
    <div className="w2-itbar" role="group" aria-label="Muebles de la solicitud">
      <span className="gw-field-label">{n > 1 ? 'Sus muebles:' : 'Mueble:'}</span>
      {e.muebles.map((m, i) => (
        <span key={m.uid} className={i === e.activo ? 'w2-itc on' : 'w2-itc'}>
          <button type="button" className="w2-itc-b" aria-pressed={i === e.activo} onClick={() => set({ activo: i })}><b>{i + 1} · </b>{etiquetaMueble(c, m)}</button>
          {editable && n > 1 && <button type="button" className="w2-itc-x" aria-label={`Quitar el mueble ${i + 1}`} onClick={() => quitar(i)}>×</button>}
        </span>
      ))}
      {editable && n < c.limites.muebles && (
        <button type="button" className="w2-itadd" onClick={() => set({ muebles: [...e.muebles, nuevoMueble(c, 'ar', 'retapizado')], activo: n })}>+ Agregar otro mueble</button>
      )}
    </div>
  );
}

const ACABADO_CLASE = { liso: 'fl', capitoneado: 'fc', canales: 'fk' } as const;

/** Paso 1 · Mueble y fotos (uno o varios muebles). */
export function PasoMuebles(p: PropsPaso) {
  const { c, e, errores, admin, fotosPorEnlace } = p;
  const i = e.activo;
  const m = e.muebles[i]!;
  const fabricacion = m.servicio === 'fabricacion';
  const n = e.muebles.length;

  const cambiarServicio = (servicio: MuebleW2['servicio']) => {
    const muebles = e.muebles.map((x, k) => (k === i ? { ...x, servicio } : x));
    const sinTela = muebles.every((x) => !c.servicios.find((s) => s.codigo === x.servicio)!.requiereTela);
    // Si ningún mueble necesita tela, se marca "No lleva tela"; si vuelve a necesitarla, se quita esa opción.
    p.set({ muebles, tela: sinTela ? 'sin' : e.tela === 'sin' ? 'local' : e.tela });
  };
  const cambiarTipo = (tipoId: number) => {
    const tipo = c.tiposMueble.find((t) => t.id === tipoId)!;
    cambiarMueble(p, i, { tipoId, telaPorParte: telasPorDefecto(tipo, c.telas), parteActiva: 0 });
  };

  return (
    <>
      <BarraMuebles p={p} editable />
      <ErrorCampo texto={errores.muebles} />
      <section className="card stack" aria-labelledby="w2-mueble">
        <h2 id="w2-mueble" className="w2-h2">{n > 1 ? `Mueble ${i + 1} de ${n}` : admin ? 'El mueble' : 'Su mueble'}</h2>
        <div className="grid2" style={{ gap: 16 }}>
          <label className="gw-field">
            <span className="gw-field-label">Tipo de mueble</span>
            <select className="gw-input" value={m.tipoId} onChange={(x) => cambiarTipo(+x.target.value)}>
              {c.tiposMueble.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </label>
          <label className="gw-field">
            <span className="gw-field-label">Servicio</span>
            <select className="gw-input" value={m.servicio} onChange={(x) => cambiarServicio(x.target.value as MuebleW2['servicio'])}>
              {c.servicios.map((s) => <option key={s.codigo} value={s.codigo}>{s.nombre}</option>)}
            </select>
          </label>
        </div>
        {fabricacion && (
          <>
            <Alert tone="info" title="Fabricación a medida" compact>
              Lo hacemos desde cero copiando una foto (de una revista, de internet o de un mueble que le gustó). Suba esa foto abajo e indique las medidas que quiere: el precio se calcula por tamaño y se confirma en la cita o en la visita a su casa.
            </Alert>
            <span className="gw-field-label" id="w2-acabado">Acabado</span>
            <div className="w2-fin" role="radiogroup" aria-labelledby="w2-acabado">
              {c.acabados.map((a) => (
                <button key={a.codigo} type="button" role="radio" aria-checked={m.acabado === a.codigo} className={m.acabado === a.codigo ? 'opt on' : 'opt'} onClick={() => cambiarMueble(p, i, { acabado: a.codigo })}>
                  <span className={`w2-fsw ${ACABADO_CLASE[a.codigo]}`} aria-hidden="true" />
                  <span><b>{a.nombre}</b><small>{a.detalle}</small></span>
                </button>
              ))}
            </div>
            <small className="muted" style={{ fontSize: 12.5 }}>Solo en fabricación a medida. El capitoneado y los canales llevan más horas de trabajo.</small>
          </>
        )}
        <div className="ydrow">
          <div><b>¿Cuántos iguales?</b><small>Por ejemplo, 6 sillas de comedor iguales. Si son distintos, agréguelos como otro mueble.</small></div>
          <Contador valor={m.cantidad} unidad="" etiqueta="muebles iguales" onChange={(cantidad) => cambiarMueble(p, i, { cantidad: Math.min(cantidad, 99) })} />
        </div>
        <TextField
          label={fabricacion ? 'Medidas que quiere' : 'Medidas'}
          required={fabricacion}
          optional={!fabricacion}
          maxLength={120}
          placeholder="Ej.: 210 × 90 × 85 cm (largo × fondo × alto)"
          hint={fabricacion ? 'Obligatorio en fabricación: el precio depende del tamaño. Las confirmamos en la cita o visita.' : 'Opcional: el taller toma la medida exacta en la cita o al recoger el mueble.'}
          error={errores[`muebles.${i}.medidas`]}
          value={m.medidas}
          onChange={(x) => cambiarMueble(p, i, { medidas: x.target.value })}
        />
      </section>
      <section className="card stack" aria-labelledby="w2-fotos">
        <h2 id="w2-fotos" className="w2-h2">{n > 1 ? `Fotos o videos del mueble ${i + 1}` : 'Fotos o videos'} <span className="gw-req" aria-hidden="true">*</span></h2>
        {fotosPorEnlace?.activo ? (
          <>
            <Alert tone="info" title="Se le pedirán las fotos al cliente" compact>Al registrar, le llega un enlace por correo para subirlas. La solicitud queda «Esperando fotos» y no se puede cotizar hasta que lleguen.</Alert>
            <button type="button" className="w2-lnk" onClick={() => fotosPorEnlace.cambiar(false)}>Mejor subirlas ahora</button>
          </>
        ) : (<>
        <UploadZone
          title={fabricacion ? 'Arrastre aquí la foto del mueble que quiere' : 'Arrastre aquí sus fotos o videos'}
          hint={fabricacion
            ? 'Foto de revista, internet o captura · y si puede, una foto del espacio donde irá'
            : `Frente, costado y detalles · mínimo 1 foto · fotos hasta ${c.limites.mbFoto} MB, videos de hasta 1 min (${c.limites.mbVideo} MB)`}
          accept={c.limites.formatos.join(',')}
          files={m.archivos}
          onChange={(archivos) => cambiarMueble(p, i, { archivos })}
        />
        <ErrorCampo texto={errores[`muebles.${i}.archivos`]} />
        {!fabricacion && !admin && <p className="muted" style={{ fontSize: 13 }}>Un video corto mostrando el mueble por todos lados nos ayuda a cotizar mejor.</p>}
        {fotosPorEnlace?.posible && <p className="muted" style={{ fontSize: 13 }}>¿El cliente no tiene las fotos a mano? <button type="button" className="w2-lnk" onClick={() => fotosPorEnlace.cambiar(true)}>Pedírselas por enlace</button></p>}
        </>)}
      </section>
    </>
  );
}

const OPCIONES_TELA: { id: OpcionTelaW2; titulo: string; detalle: string; icono: IconName }[] = [
  { id: 'trae', titulo: 'La traigo yo', detalle: 'Sin costo de tela · la entrega con el mueble', icono: 'package' },
  { id: 'catalogo', titulo: 'Ver telas en línea', detalle: 'Elija del catálogo con foto y código de cada tela', icono: 'image' },
  { id: 'local', titulo: 'Ver en el local', detalle: 'Véala y tóquela en el taller · requiere cita', icono: 'calendar' },
  { id: 'domicilio', titulo: 'Visita a domicilio', detalle: 'Sin costo · llevamos los libros de telas y medimos', icono: 'map-pin' },
  { id: 'sin', titulo: 'No lleva tela', detalle: 'Solo espuma o estructura', icono: 'x' },
];

const TITULO_ADMIN: Partial<Record<OpcionTelaW2, string>> = { trae: 'La trae el cliente', catalogo: 'Catálogo en línea', local: 'Ver en el local (cita)' };

/** Paso 2 · Tela. */
export function PasoTelaW2(p: PropsPaso) {
  const { c, e, set, errores } = p;
  const multi = e.muebles.length > 1;
  const sinTela = sinTelaPosible(c, e);
  const opciones = (p.admin ? OPCIONES_TELA.map((o) => ({ ...o, titulo: TITULO_ADMIN[o.id] ?? o.titulo })) : OPCIONES_TELA)
    .filter((o) => o.id !== 'sin' || sinTela)
    .map((o) => (o.id === 'trae' && todoFabricacion(e) ? { ...o, detalle: 'Sin costo de tela · la trae al taller' } : o));

  return (
    <section className="card stack" aria-labelledby="w2-tela">
      <h2 id="w2-tela" className="w2-h2">¿Qué tela usará?</h2>
      {sinTela && e.tela === 'sin' && (
        <Alert tone="info" title="Su servicio no necesita tela nueva" compact>Marcamos «No lleva tela». Si además quiere cambiar la tela, elija otra opción.</Alert>
      )}
      <div className="opts" role="radiogroup" aria-labelledby="w2-tela">
        {opciones.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={e.tela === o.id} className={e.tela === o.id ? 'opt on' : 'opt'} onClick={() => set({ tela: o.id })}>
            <span className="ic"><Icon name={o.icono} /></span>
            <span><b>{o.titulo}</b><small>{o.detalle}</small></span>
          </button>
        ))}
      </div>
      <ErrorCampo texto={errores.tela} />

      {e.tela === 'catalogo' && (
        <>
          {multi && (
            <div className="ydrow">
              <div><b>¿La misma tela para todos los muebles?</b><small>Si dice que no, elija la tela de cada mueble tocando su nombre.</small></div>
              <div className="ydseg" role="group" aria-label="¿La misma tela para todos?">
                {[['Sí', true], ['No, distinta por mueble', false]].map(([l, v]) => (
                  <button key={String(l)} type="button" aria-pressed={e.mismaTela === v} className={e.mismaTela === v ? 'fchip on' : 'fchip'} onClick={() => set({ mismaTela: v as boolean })}>{l}</button>
                ))}
              </div>
            </div>
          )}
          {multi && !e.mismaTela && <BarraMuebles p={p} editable={false} />}
          <CatalogoW2 {...p} />
        </>
      )}

      {e.tela === 'trae' && (
        <div className="yd">
          <TextField label="¿Qué tela trae?" optional maxLength={200} placeholder="Ej.: lino gris claro, liso" value={e.telaTraida} onChange={(x) => set({ telaTraida: x.target.value })} />
          <small className="muted" style={{ fontSize: 12.5 }}>No necesita saber cuántas yardas trae: el taller la mide y le avisa si alcanza antes de empezar.</small>
        </div>
      )}

      {necesitaCita(e.tela) && !(p.buscaOpcionalEnLocal && e.tela === 'local') && (
        // Obligatorio solo en la visita: llevamos a su casa los libros de telas que correspondan.
        <TextField
          label={p.admin ? '¿Qué tela busca el cliente?' : '¿Qué tela busca?'}
          optional={e.tela === 'local'}
          required={e.tela === 'domicilio'}
          maxLength={200}
          placeholder="Ej.: azul marino, suave al tacto, lisa o con rayas finas"
          value={e.telaBusca}
          onChange={(x) => set({ telaBusca: x.target.value })}
          error={e.tela === 'domicilio' && !e.telaBusca.trim() ? errores.telaDescripcion : undefined}
          hint={e.tela === 'domicilio'
            ? 'Escríbalo con sus palabras: así llevamos a su casa los libros de telas indicados.'
            : 'Si no lo sabe, déjelo en blanco: en la cita le mostramos los libros de telas.'}
        />
      )}

      {e.tela === 'local' && (p.admin ? (
        <Alert tone="info" title={p.buscaOpcionalEnLocal ? 'La elige ahora, con usted' : 'Necesita una cita en el local'} compact>
          {p.buscaOpcionalEnLocal
            ? 'Puede atenderlo ahora con la guía de atención, o guardarle un turno para otro día.'
            : 'Acuerde el día con el cliente: al continuar, la solicitud se registra y se abre la Agenda para guardarle el turno.'}
        </Alert>
      ) : (
        <Alert tone="info" title="Siguiente y último paso: elegir su cita" compact>En el local verá y tocará las telas. El traslado, las medidas finales y su cotización los vemos con usted en la cita, así que no necesita llenar nada más.</Alert>
      ))}
      {e.tela === 'domicilio' && (p.admin ? (
        <Alert tone="info" title="Necesita una visita a domicilio" compact>Acuerde el día con el cliente: al continuar, la solicitud se registra y se abre la Agenda para guardarle 1 hora de visita (cortesía, sin costo).</Alert>
      ) : (
        <Alert tone="info" title="Siguiente y último paso: elegir el día de la visita" compact>Es una cortesía del taller, sin costo. Vamos a su casa con los libros de telas, medimos el mueble y el espacio, y le dejamos la cotización. Útil para muebles grandes o fabricación a medida.</Alert>
      ))}
      {!necesitaCita(e.tela) && (
        <Alert tone="success" title="No necesita cita" compact>Cotizamos con sus fotos y videos. Si falta algo, le escribimos.</Alert>
      )}
    </section>
  );
}

function CatalogoW2(p: PropsPaso) {
  const { c, e, set, errores } = p;
  const iTela = muebleDeTela(e);
  const m = e.muebles[iTela]!;
  const tipo = tipoDe(c, m);
  const partesPosible = porPartesPosible(e);
  const porPartes = partesPosible && m.modoTela === 'partes';
  const parte = tipo.partes[m.parteActiva] ?? tipo.partes[0]!;
  const familias = ['Todas', ...new Set(c.telas.map((t) => t.familia).filter((f): f is string => Boolean(f)))];
  const visibles = c.telas.filter((t) => e.familia === 'Todas' || t.familia === e.familia);
  const tela = (id: number | undefined) => c.telas.find((t) => t.id === id);

  // Con la misma tela para todos, lo elegido se copia a todos los muebles.
  const cambiar = (cambio: Partial<MuebleW2>) =>
    set({ muebles: e.muebles.map((x, k) => (k === iTela || (e.mismaTela && cambio.telas) ? { ...x, ...cambio } : x)) });
  const elegir = (id: number) => {
    if (porPartes) return cambiar({ telaPorParte: { ...m.telaPorParte, [parte.id]: id } });
    cambiar({ telas: [id] });
  };
  const usadas = new Set(Object.values(m.telaPorParte)).size;

  return (
    <>
      <span className="gw-field-label" id="w2-como">¿Cómo quiere la tela?</span>
      <div className="use" role="radiogroup" aria-labelledby="w2-como">
        {([
          ['una', 'Una tela para todo', 'Una sola tela en todo el mueble', 'quote'],
          ['partes', 'Distintas telas por partes', partesPosible ? 'Elija en el dibujo qué tela va en cada parte' : 'Elija «No, distinta por mueble» para usarla', 'sofa'],
        ] as const).map(([id, titulo, detalle, icono]) => (
          <button key={id} type="button" role="radio" aria-checked={(id === 'partes') === porPartes} disabled={id === 'partes' && !partesPosible}
            className={(id === 'partes') === porPartes ? 'opt on' : 'opt'} onClick={() => cambiar({ modoTela: id })}>
            <span className="ic"><Icon name={icono} /></span>
            <span><b>{titulo}</b><small>{detalle}</small></span>
          </button>
        ))}
      </div>

      {porPartes && (
        <div className="dz">
          <div className="dzhd"><b>1. Toque una parte de su {tipo.nombre.toLowerCase()}</b><small>Puede usar una tela distinta en cada parte, sin límite.</small></div>
          <div className="dzgrid">
            <DibujoMueble muebleId={tipo.codigo} partes={tipo.partes.map((x) => x.nombre)} activa={m.parteActiva}
              colorDe={(k) => tela(m.telaPorParte[tipo.partes[k]?.id ?? -1])?.colorHex ?? '#CBD5E1'} onElegir={(parteActiva) => cambiar({ parteActiva })} />
            <div className="plist">
              {tipo.partes.map((x, k) => {
                const t = tela(m.telaPorParte[x.id]);
                return (
                  <div key={x.id} className={m.parteActiva === k ? 'prow on' : 'prow'}>
                    <button type="button" className="pbtn" aria-pressed={m.parteActiva === k} onClick={() => cambiar({ parteActiva: k })}>
                      <i style={{ background: t ? fondoDe(t.familia, t.colorHex) : '#CBD5E1' }} />
                      <span><b>{x.nombre}</b><small>{t?.nombre ?? 'Sin tela'}</small></span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <small className="muted" style={{ fontSize: 12.5 }}>El dibujo y sus partes cambian según el tipo de mueble elegido en el paso 1. Si su mueble tiene otra parte, la vemos con usted.</small>
        </div>
      )}

      <div className="swhd">
        <span className="gw-field-label">{porPartes ? `2. Elija la tela para: ${parte.nombre}` : 'Elija la tela para todo el mueble'}</span>
        <b>{porPartes ? `${usadas} ${usadas === 1 ? 'tela' : 'telas'} en el mueble` : m.telas.length ? '1 tela elegida' : 'Ninguna elegida'}</b>
      </div>
      <div className="fchips" role="group" aria-label="Tipo de tela">
        {familias.map((f) => <button key={f} type="button" aria-pressed={e.familia === f} className={e.familia === f ? 'fchip on' : 'fchip'} onClick={() => set({ familia: f })}>{f}</button>)}
      </div>
      <div className="sw">
        {visibles.map((t) => {
          const on = porPartes ? m.telaPorParte[parte.id] === t.id : m.telas[0] === t.id;
          return (
            <button key={t.id} type="button" aria-pressed={on} className={on ? 'on' : undefined} onClick={() => elegir(t.id)}>
              <span className="tex" style={{ background: fondoDe(t.familia, t.colorHex) }}><span className="ck"><Icon name="check" size={13} strokeWidth={3} /></span></span>
              <span className="cap"><b>{t.nombre}</b><small>Pattern {t.pattern} · color {t.numeroColor}{t.descripcion ? ` · ${t.descripcion}` : ''}</small></span>
            </button>
          );
        })}
      </div>
      <ErrorCampo texto={errores[`muebles.${iTela}.telas`]} />
      <small className="muted" style={{ fontSize: 12.5 }}>Las yardas las calcula el taller con las fotos y medidas: no tiene que saberlo.</small>

      <TextField label="¿Ya conoce la tela?" optional maxLength={80} placeholder="Escriba el pattern y el color, ej.: 42015 · color 9" hint="Cada tela se identifica por su modelo (pattern) y su número de color."
        value={e.telaConocida} onChange={(x) => set({ telaConocida: x.target.value })} />
    </>
  );
}

/** Dirección guardada en Mi perfil o una nueva (con Google Maps si hay clave). */
export function CampoDireccion({ valor, onChange, guardadas, etiqueta, error, textoGuardar = 'Guardarla en Mi perfil' }: { valor: DireccionW2; onChange(d: DireccionW2): void; guardadas: DireccionGuardada[]; etiqueta: string; error?: string; textoGuardar?: string }) {
  const nueva = valor.guardadaId == null;
  const set = (c: Partial<DireccionW2>) => onChange({ ...valor, ...c });
  return (
    <div className="stack" style={{ gap: 8 }}>
      {guardadas.length > 0 && (
        <>
          <label className="gw-field">
            <span className="gw-field-label">{etiqueta}</span>
            <select className="gw-input" value={nueva ? '' : String(valor.guardadaId)} disabled={nueva} onChange={(x) => set({ guardadaId: +x.target.value })}>
              {nueva && <option value="">Dirección nueva</option>}
              {guardadas.map((d) => <option key={d.id} value={d.id}>{d.etiqueta ? `${d.etiqueta} · ` : ''}{d.direccion}</option>)}
            </select>
          </label>
          <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ guardadaId: nueva ? guardadas[0]!.id : null })}>
            {nueva ? 'Usar una dirección guardada' : '+ Usar una dirección nueva'}
          </button>
        </>
      )}
      {nueva && (
        <>
          {mapsHabilitado ? (
            <DireccionAutocompletar label={guardadas.length ? 'Escriba la dirección' : etiqueta} value={valor.texto}
              onChange={(texto) => set({ texto, ubicacion: null })} onElegir={(d) => set({ texto: d.texto, ubicacion: d.ubicacion })} />
          ) : (
            <TextField label={guardadas.length ? 'Escriba la dirección' : etiqueta} required maxLength={200} placeholder="Ej.: 31 Elm St, Westfield, NJ 07090" error={error}
              value={valor.texto} onChange={(x) => set({ texto: x.target.value, ubicacion: null })} />
          )}
          {mapsHabilitado && <ErrorCampo texto={error} />}
          <TextField label="Depto., piso o referencia" optional maxLength={120} value={valor.referencia} onChange={(x) => set({ referencia: x.target.value })} />
          <label className="row" style={{ fontSize: 14, gap: 8 }}>
            <input type="checkbox" checked={valor.guardar} onChange={(x) => set({ guardar: x.target.checked })} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />
            {textoGuardar}
          </label>
        </>
      )}
    </div>
  );
}

/** Paso 3 · Traslado (solo cuando no hace falta cita ni visita). */
export function PasoTrasladoW2(p: PropsPaso) {
  const { c, e, set, errores, guardadas } = p;
  const nuevo = todoFabricacion(e);
  const opciones = nuevo
    ? [['delivery', 'Entrega a domicilio', 'Solo entrega: es un mueble nuevo · según distancia y tamaño', 'truck'], ['propio', 'Lo recojo en el taller', 'Sin costo de traslado', 'map-pin']] as const
    : [['delivery', 'Delivery (recojo y entrega)', 'Ida y vuelta, un solo costo · según la distancia y el tamaño del mueble', 'truck'], ['propio', 'Lo llevo y lo recojo yo', 'Usted lo trae y lo retira en el taller', 'map-pin']] as const;
  const guardada = guardadas.find((d) => d.id === e.dir.guardadaId);
  const mapa = guardada
    ? { ubicacion: guardada.latitud != null && guardada.longitud != null ? { lat: guardada.latitud, lng: guardada.longitud } : null, etiqueta: `${guardada.etiqueta ?? 'Dirección'} · ${guardada.ciudad ?? ''}` }
    : { ubicacion: e.dir.ubicacion, etiqueta: e.dir.ubicacion ? e.dir.texto : undefined };
  const f = e.fechaRecojo;

  return (
    <section className="card stack" aria-labelledby="w2-tras">
      <h2 id="w2-tras" className="w2-h2">{nuevo ? '¿Cómo recibe su mueble nuevo?' : '¿Cómo llega el mueble?'}</h2>
      <div className="opts" role="radiogroup" aria-labelledby="w2-tras">
        {opciones.map(([id, titulo, detalle, icono]) => (
          <button key={id} type="button" role="radio" aria-checked={e.traslado === id} className={e.traslado === id ? 'opt on' : 'opt'} onClick={() => set({ traslado: id })}>
            <span className="ic"><Icon name={icono} /></span>
            <span><b>{titulo}</b><small>{detalle}</small></span>
          </button>
        ))}
      </div>
      {e.traslado === 'propio' && (
        <Alert tone="info" title={nuevo ? 'Lo recoge en el taller' : 'Usted lo trae y lo retira'} compact>
          {nuevo ? 'Cuando esté terminado le avisamos para que elija un turno libre y lo recoja en el taller.' : 'Lo trae al taller después de aceptar la cotización: le daremos un turno libre de la agenda para dejarlo, y otro para retirarlo cuando esté listo.'}
        </Alert>
      )}
      {e.traslado === 'delivery' && (
        <>
          <div className="grid2" style={{ gap: 16, alignItems: 'start' }}>
            <CampoDireccion valor={e.dir} onChange={(dir) => set({ dir })} guardadas={guardadas} textoGuardar={p.admin ? 'Guardarla en la ficha del cliente' : undefined} etiqueta={nuevo ? 'Dirección de entrega' : 'Dirección de recojo y entrega'} error={errores.direccion} />
            <MapaUbicacion alto={240} ubicacion={mapa.ubicacion} etiqueta={mapa.etiqueta} />
          </div>
          {hayRecojo(e) ? (
            <div className="stack" style={{ gap: 8, marginTop: 8 }}>
              <span className="gw-field-label">¿Cuándo prefiere que pasemos a recogerlo?</span>
              <div className="pick2">
                <CalendarioRecojo value={f} onChange={(fechaRecojo) => set({ fechaRecojo })} />
                <div className="selday">
                  <div className="big">
                    <span><small>{MESES[f.getMonth()]!.slice(0, 3)}</small>{f.getDate()}</span>
                    <div><b>{fechaLarga(f)}</b><em>Fecha preferida de recojo</em></div>
                  </div>
                  <span className="gw-field-label" id="w2-franja">Franja horaria</span>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 8 }} role="radiogroup" aria-labelledby="w2-franja">
                    {c.franjas.map((x) => (
                      <button key={x.codigo} type="button" role="radio" aria-checked={e.franja === x.codigo} className={e.franja === x.codigo ? 'pslot on' : 'pslot'} onClick={() => set({ franja: x.codigo })}>{x.nombre}</button>
                    ))}
                  </div>
                  <span className="muted" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                    Horario del taller: {c.franjas.map((x) => x.nombre.split('· ')[1]).join(' y ')} (cierra al mediodía). Es una preferencia: el recojo se hace después de que acepte la cotización; el taller confirma el día exacto al planificar la salida y le avisa por correo y aquí.
                  </span>
                </div>
              </div>
              <ErrorCampo texto={errores.fechaPrefRecojo} />
            </div>
          ) : (
            <p className="muted" style={{ fontSize: 13 }}>Como es un mueble nuevo, no hay nada que recoger. Cuando esté terminado le avisamos y coordinamos el día de la entrega.</p>
          )}
        </>
      )}
    </section>
  );
}

