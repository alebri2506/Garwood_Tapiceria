import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { Icon } from '../../../shared/ui/Icon';
import { StatusChip } from '../../../shared/ui/StatusChip';
import { Toast } from '../../../shared/ui/Toast';
import { UploadZone } from '../../../shared/ui/UploadZone';
import { solicitudApi, type SolicitudCliente } from '../solicitud/solicitudApi';
import { useMisPedidos } from './MisPedidosLayout';
import { AvisoSiguiente, Pasos } from './TarjetaPedido';
import { nombreMueble, tarjetaDe, type Grupo } from './tarjetasSolicitud';
import { DetalleSolicitud } from './DetalleSolicitud';

const GRUPOS: { id: Grupo; t: string; sub: string }[] = [
  { id: 'accion', t: 'Necesitan su acción', sub: '' },
  { id: 'taller', t: 'Esperando al taller', sub: 'No necesita hacer nada: le avisaremos cuando su cotización esté lista.' },
  { id: 'cerradas', t: 'Cerradas', sub: '' },
];

/** W6c Mis pedidos · solicitudes y cotizaciones (CU-C01, C04 y C09 vistos por el cliente), con los datos de la API. */
export function SolicitudesPage() {
  const { solicitudes, cargando, error, actualizar, recargar } = useMisPedidos();
  const [aviso, setAviso] = useState('');

  if (cargando) return <p className="muted" role="status">Cargando sus solicitudes…</p>;
  if (error) return <Alert tone="danger" title="No pudimos cargar sus solicitudes">{error} <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" onClick={recargar}>Reintentar</button></Alert>;

  const tarjetas = solicitudes.map((s) => ({ s, t: tarjetaDe(s) }));
  return (
    <>
      {aviso && <Toast title={aviso} onClose={() => setAviso('')} />}
      {tarjetas.length === 0 && (
        <EmptyState icon="quote" title="No tiene solicitudes">
          Pida una cotización con fotos de su mueble. <Link to="/cliente/solicitud">Nueva solicitud</Link>
        </EmptyState>
      )}
      {GRUPOS.map((g) => {
        const items = tarjetas.filter((x) => x.t.grupo === g.id);
        if (!items.length) return null;
        return (
          <section key={g.id} className="stack" style={{ gap: 16 }} aria-label={g.t}>
            <div className="sec">{g.t} · {items.length}</div>
            {g.sub && <p className="muted" style={{ fontSize: 14, margin: '-6px 0 2px' }}>{g.sub}</p>}
            {items.map(({ s, t }) => <Tarjeta key={s.codigo} s={s} t={t} actualizar={actualizar} avisar={setAviso} />)}
          </section>
        );
      })}
      <p className="muted" style={{ fontSize: 13 }}>
        Cuando acepta una cotización y se confirma el adelanto (si corresponde), su pedido pasa a “En curso”. Las cotizaciones valen 1 mes.
      </p>
    </>
  );
}

const FONDOS = ['thumb', 'thumb b', 'thumb c'];
const fotoDe = (m: SolicitudCliente['muebles'][number]) => m.archivos.find((a) => a.tipo === 'foto' && a.url)?.url ?? null;

/** Varios muebles: mosaico con la foto de cada uno (hasta 3) y «N muebles» encima (diseño W6c del 13/11). */
function Mosaico({ s }: { s: SolicitudCliente }) {
  const n = s.muebles.length;
  return (
    <div className="w6c-mos" role="img" aria-label={`${n} muebles`}>
      {s.muebles.slice(0, 3).map((m, i) => {
        const url = fotoDe(m);
        return (
          <span key={m.orden} className={`${FONDOS[i % 3]}${n === 2 || i === 0 ? ' r2' : ''}`}>
            {url ? <img className="w6c-img" src={url} alt="" /> : <Icon name="sofa" size={18} />}
          </span>
        );
      })}
      <em>{n} muebles</em>
    </div>
  );
}

function Tarjeta({ s, t, actualizar, avisar }: { s: SolicitudCliente; t: ReturnType<typeof tarjetaDe>; actualizar(s: SolicitudCliente): void; avisar(m: string): void }) {
  const [detalle, setDetalle] = useState(false);
  const varios = s.muebles.length > 1;
  const foto = s.muebles.map(fotoDe).find(Boolean);
  return (
    <article className={t.grupo === 'accion' ? 'oc act' : 'oc'}>
      {varios
        ? <Mosaico s={s} />
        : <span className={`thumb ${t.grupo === 'accion' ? '' : 'b'} ph`}>{foto ? <img className="w6c-img" src={foto} alt="" /> : <Icon name={t.icono} size={30} />}</span>}
      <div className="bd">
        <div className="between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div><h2>{t.titulo}</h2><span className="code">{t.linea}</span></div>
          <StatusChip status={t.estado} tone={t.tono} />
        </div>
        {varios && (
          <div className="w6c-mch" aria-label="Muebles de la solicitud">
            {s.muebles.map((m, i) => <span key={m.orden}><b>{i + 1}</b>{nombreMueble(m)}</span>)}
          </div>
        )}
        <Pasos pasos={t.pasos} actual={t.actual} />
        <AvisoSiguiente aviso={t.aviso} />
        {t.extra === 'fotos' && <SubirFotos s={s} actualizar={actualizar} avisar={avisar} />}
      </div>
      <div className="oside">
        {t.monto && <div className="amt"><b>{t.monto.valor}</b><small>{t.monto.nota}</small></div>}
        {t.accion && <Link className={`gw-btn gw-btn-${t.accion.tipo} gw-btn-block`} to={t.accion.a}>{t.accion.texto}</Link>}
        <button type="button" className="gw-btn gw-btn-ghost gw-btn-block" onClick={() => setDetalle(true)}>Ver solicitud</button>
      </div>
      {detalle && <DetalleSolicitud s={s} t={t} onClose={() => setDetalle(false)} />}
    </article>
  );
}

/** El taller pidió las fotos: el cliente las sube aquí (al menos una por mueble). */
function SubirFotos({ s, actualizar, avisar }: { s: SolicitudCliente; actualizar(s: SolicitudCliente): void; avisar(m: string): void }) {
  const [fotos, setFotos] = useState<File[][]>(() => s.muebles.map(() => []));
  const [falla, setFalla] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const faltan = fotos.some((f) => !f.some((a) => a.type.startsWith('image/')));

  const enviar = async () => {
    if (faltan) return setFalla('Suba al menos una foto de cada mueble.');
    setEnviando(true);
    setFalla(null);
    try {
      actualizar(await solicitudApi.subirFotos(s.codigo, fotos));
      avisar('Recibimos sus fotos');
    } catch (e) {
      setFalla(e instanceof ApiError ? e.message : 'No pudimos subir las fotos. Intente de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 10 }}>
      {s.muebles.map((m, i) => (
        <UploadZone key={m.orden} title={s.muebles.length > 1 ? `Fotos del mueble ${i + 1}: ${m.tipo}` : `Fotos de su ${m.tipo.toLowerCase()}`} hint="Frente, costado y detalles · mínimo 1 foto"
          files={fotos[i]!} onChange={(f) => setFotos((x) => x.map((y, k) => (k === i ? f : y)))} />
      ))}
      {falla && <Alert tone="danger" title="No se pudo" compact>{falla}</Alert>}
      <button type="button" className="gw-btn gw-btn-primary" style={{ alignSelf: 'flex-start' }} disabled={enviando} onClick={enviar}>{enviando ? 'Subiendo…' : 'Enviar fotos'}</button>
    </div>
  );
}
