import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../../../shared/ui/Icon';
import { StatusChip } from '../../../shared/ui/StatusChip';
import type { SolicitudCliente } from '../solicitud/solicitudApi';
import { AvisoSiguiente, Pasos } from './TarjetaPedido';
import { cuando, dia, type TarjetaSolicitud } from './tarjetasSolicitud';

// W6c «Ver solicitud» (diseño del 13/11): lo que pidió el cliente, mueble por mueble, y lo común a toda la solicitud.
// Solo muestra lo que devuelve la API, sin precios ni datos internos (RG-08).

type Mueble = SolicitudCliente['muebles'][number];
const FONDOS = ['thumb', 'thumb b', 'thumb c'];
const ACABADO: Record<string, string> = { liso: 'Liso', capitoneado: 'Capitoneado', canales: 'Canales' };

/** La tela de un mueble según cómo la eligió el cliente. */
function telaDe(s: SolicitudCliente, m: Mueble, i: number): { nombre: string; detalle: string; color: string | null } {
  if (s.tela === 'trae') return { nombre: 'La trae usted', detalle: s.telaDescripcion ?? 'La entrega con el mueble', color: null };
  if (s.tela === 'sin') return { nombre: 'No lleva tela', detalle: 'Solo espuma o estructura', color: null };
  if (s.tela === 'local') return { nombre: 'La elige en el local', detalle: 'Quiere ver y tocar los libros de telas', color: null };
  if (s.tela === 'domicilio') return { nombre: 'La elige en la visita', detalle: s.telaDescripcion ? `Busca: ${s.telaDescripcion}` : 'Le llevamos los libros de telas a su casa', color: null };
  // Catálogo en línea: la misma tela para todos (se guarda en el primero) o una por mueble / por parte.
  const telas = m.telas.length ? m.telas : s.mismaTela && i > 0 ? s.muebles[0]!.telas : [];
  const t = telas[0];
  if (!t) return { nombre: 'Elegida en línea', detalle: '', color: null };
  const modelo = t.pattern ? `Pattern ${t.pattern} · color ${t.numeroColor}` : (t.familia ?? '');
  if (m.modoTela === 'partes' && telas.length > 1) return { nombre: telas.map((x) => `${x.parte}: ${x.nombre}`).join(' · '), detalle: 'Una tela por parte', color: t.colorHex };
  if (!m.telas.length && i > 0) return { nombre: t.nombre, detalle: 'La misma tela del mueble 1', color: t.colorHex };
  return { nombre: t.nombre, detalle: `${modelo}${s.muebles.length > 1 && s.mismaTela ? ' · la misma para todos' : ''}`, color: t.colorHex };
}

function medidasDe(s: SolicitudCliente, m: Mueble) {
  if (m.medidas) return m.medidas;
  if (s.tela === 'domicilio') return 'Las tomamos en la visita';
  if (s.tela === 'local') return 'Las tomamos en la cita';
  return 'No las indicó';
}

const TELA_ELEGIDA: Record<SolicitudCliente['tela'], string> = {
  catalogo: 'En línea', trae: 'La trae usted', sin: 'No lleva tela', local: 'En el local', domicilio: 'En la visita',
};

/** «Para toda la solicitud»: cómo eligió la tela, la cita o visita, el traslado y la dirección, cada uno con su ícono. */
function comunes(s: SolicitudCliente) {
  const filas: { icono: IconName; k: string; v: string }[] = [];
  const c = s.cita && s.cita.estado !== 'Cancelada' ? s.cita : null;
  const casa = s.tela === 'domicilio';
  filas.push({ icono: 'image', k: 'Tela', v: s.tela === 'catalogo' ? 'Elegida en línea (Telas en línea)' : s.tela === 'local' ? 'La elige en el local' : s.tela === 'domicilio' ? 'La elige en la visita a su casa' : TELA_ELEGIDA[s.tela] });
  if (c) filas.push({ icono: 'calendar', k: c.tipo === 'domicilio' ? 'Visita a domicilio' : 'Cita en el local', v: cuando(c) });
  filas.push({ icono: 'truck', k: 'Traslado', v: s.traslado === 'delivery' ? 'Recojo y entrega a domicilio' : s.traslado === 'propio' ? 'Usted lo trae y lo retira' : `Lo definimos en la ${casa ? 'visita' : 'cita'}` });
  if (s.traslado === 'delivery') {
    // Decisiones A.7: el cliente elige el día y la hora cuando se confirma su pago. Las solicitudes anteriores conservan su fecha.
    filas.push({ icono: 'calendar', k: 'Recojo', v: s.fechaPrefRecojo ? `Preferido: ${dia(s.fechaPrefRecojo)}${s.horaPrefRecojo ? `, ${s.horaPrefRecojo}` : ''}` : 'Usted elige el día y la hora cuando se confirme su pago' });
  }
  const direccion = s.direccion ?? (casa ? c?.direccion ?? null : null);
  if (direccion) filas.push({ icono: 'map-pin', k: 'Dirección', v: direccion });
  return filas;
}

/** Galería de un mueble: la foto o el video elegido en grande y miniaturas para cambiar. */
function Galeria({ m, i }: { m: Mueble; i: number }) {
  const [sel, setSel] = useState(0);
  const archivos = m.archivos.filter((a) => a.url);
  if (!archivos.length) return <p className="w6c-vacio"><Icon name="image" size={16} />Todavía no envió fotos de este mueble.</p>;
  const a = archivos[Math.min(sel, archivos.length - 1)]!;
  return (
    <div className="w6c-gal">
      <div className={`${FONDOS[i % 3]} w6c-gal-main`}>
        {a.tipo === 'video'
          ? <video src={a.url!} controls preload="metadata" aria-label={`Video ${sel + 1} de ${m.tipo.toLowerCase()}`} />
          : <a href={a.url!} target="_blank" rel="noreferrer" title="Abrir la foto en grande"><img src={a.url!} alt={`Foto ${sel + 1} de ${m.tipo.toLowerCase()}`} /></a>}
        <span className="w6c-gal-n">{sel + 1} / {archivos.length}</span>
      </div>
      {archivos.length > 1 && (
        <div className="w6c-gal-min" role="group" aria-label="Elegir foto">
          {archivos.map((x, k) => (
            <button key={x.id} type="button" className={`${FONDOS[(i + k) % 3]}${k === sel ? ' on' : ''}`} aria-label={`Ver ${x.tipo === 'video' ? 'video' : 'foto'} ${k + 1}`} aria-pressed={k === sel} onClick={() => setSel(k)}>
              {x.tipo === 'video' ? <Icon name="image" size={16} /> : <img src={x.url!} alt="" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DetalleSolicitud({ s, t, onClose }: { s: SolicitudCliente; t: TarjetaSolicitud; onClose(): void }) {
  const [abierto, setAbierto] = useState(0);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', tecla);
    // Mientras el panel está abierto, la página de atrás no se desplaza.
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => { document.removeEventListener('keydown', tecla); document.body.style.overflow = antes; };
  }, [onClose]);

  const n = s.muebles.length;
  const archivos = s.muebles.reduce((x, m) => x + m.archivos.length, 0);
  const resumen: { icono: IconName; k: string; v: string }[] = [
    { icono: 'sofa', k: n === 1 ? 'Mueble' : 'Muebles', v: String(n) },
    { icono: 'image', k: 'Fotos y videos', v: String(archivos) },
    { icono: 'package', k: 'Tela', v: TELA_ELEGIDA[s.tela] },
    { icono: 'truck', k: 'Traslado', v: s.traslado === 'delivery' ? 'Delivery' : s.traslado === 'propio' ? 'Lo trae usted' : 'Por definir' },
  ];

  // Se dibuja sobre toda la página (portal): así ocupa el alto completo y no queda dentro de la tarjeta.
  return createPortal(
    <div className="w6c-capa">
      <div className="w6c-dim" onClick={onClose} aria-hidden="true" />
      <aside className="w6c-drw" role="dialog" aria-modal="true" aria-labelledby="w6c-dt" ref={ref} tabIndex={-1}>
        <header className="w6c-dh">
          <div className="w6c-dh-top">
            <span className="w6c-cod">{s.codigo}</span>
            <StatusChip status={t.estado} tone={t.tono} />
            <button type="button" className="w6c-x" aria-label="Cerrar" onClick={onClose}><Icon name="x" size={18} /></button>
          </div>
          <h2 id="w6c-dt">{t.titulo}</h2>
          <p>Enviada el {dia(s.fecha.slice(0, 10))} · {n} {n === 1 ? 'mueble' : 'muebles'}</p>
          <Pasos pasos={t.pasos} actual={t.actual} />
        </header>

        <div className="w6c-db">
          <AvisoSiguiente aviso={t.aviso} />

          <div className="w6c-res">
            {resumen.map((r) => (
              <div key={r.k}><Icon name={r.icono} size={16} /><span>{r.k}</span><b>{r.v}</b></div>
            ))}
          </div>

          <section className="w6c-sec" aria-labelledby="w6c-lp">
            <h3 id="w6c-lp">Lo que pidió{n > 1 && <em>{n} muebles</em>}</h3>
            {s.muebles.map((m, i) => {
              const on = abierto === i;
              const foto = m.archivos.find((a) => a.tipo === 'foto' && a.url)?.url;
              const tela = telaDe(s, m, i);
              return (
                <div key={m.orden} className={`w6c-mi${on ? ' on' : ''}`}>
                  <button type="button" className="w6c-mh" aria-expanded={on} aria-controls={`w6c-m${i}`} onClick={() => setAbierto(on ? -1 : i)}>
                    <span className={`${FONDOS[i % 3]} w6c-mt`}>{foto ? <img src={foto} alt="" /> : <Icon name="sofa" size={22} />}</span>
                    <span className="w6c-mx">
                      <small>{n > 1 ? `Mueble ${i + 1}` : 'Su mueble'}</small>
                      <b>{m.cantidad > 1 ? `${m.cantidad} × ${m.tipo}` : m.tipo}</b>
                      <em>{m.servicioNombre}</em>
                    </span>
                    <i className="w6c-chv" aria-hidden="true" />
                  </button>
                  {on && (
                    <div className="w6c-md" id={`w6c-m${i}`}>
                      <Galeria m={m} i={i} />
                      <div className="w6c-tl">
                        <i style={{ background: tela.color ?? undefined }} className={tela.color ? '' : 'sin'} />
                        <span><small>Tela</small><b>{tela.nombre}</b>{tela.detalle && <em>{tela.detalle}</em>}</span>
                      </div>
                      <dl className="w6c-dat">
                        <div><dt>Servicio</dt><dd>{m.servicioNombre}</dd></div>
                        <div><dt>Cantidad</dt><dd>{m.cantidad > 1 ? `${m.cantidad} iguales` : '1'}</dd></div>
                        {m.acabado && <div><dt>Acabado</dt><dd>{ACABADO[m.acabado] ?? m.acabado}</dd></div>}
                        <div className="w6c-dat-ancho"><dt>Medidas</dt><dd className={m.medidas ? '' : 'muted'}>{medidasDe(s, m)}</dd></div>
                      </dl>
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          <section className="w6c-sec" aria-labelledby="w6c-pt">
            <h3 id="w6c-pt">Para toda la solicitud</h3>
            <ul className="w6c-com">
              {comunes(s).map((r) => (
                <li key={r.k}><span className="w6c-ic"><Icon name={r.icono} size={16} /></span><span><small>{r.k}</small><b>{r.v}</b></span></li>
              ))}
            </ul>
          </section>
        </div>

        <footer className="w6c-df">
          {t.accion && <Link className="gw-btn gw-btn-primary gw-btn-block" to={t.accion.a}>{t.accion.texto}</Link>}
          <button type="button" className="gw-btn gw-btn-secondary gw-btn-block" onClick={onClose}>Cerrar</button>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}
