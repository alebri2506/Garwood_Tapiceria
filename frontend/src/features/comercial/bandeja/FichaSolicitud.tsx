import { forwardRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { Icon } from '../../../shared/ui/Icon';
import { StatusChip } from '../../../shared/ui/StatusChip';
import { DIAS, MESES } from '../fechas';
import { fondoDe } from '../solicitud/datos';
import { adminSolicitudesApi, type FichaAdmin } from './adminApi';

const CANAL: Record<string, string> = { web: 'Web', telefono: 'Teléfono', local: 'En persona', correo: 'Correo', mensaje: 'Mensaje de texto' };
const TELA: Record<string, string> = { trae: 'La trae el cliente', catalogo: 'Telas en línea', local: 'Ver en el local', domicilio: 'Visita a domicilio', sin: 'No lleva tela' };
const ACCION: Record<string, string> = {
  solicitud_registrada: 'Solicitud registrada', cita_programada: 'Cita programada', cita_reprogramada: 'Cita reprogramada', cita_cancelada: 'Cita cancelada',
  cita_atendida: 'Cita atendida', cita_inasistencia: 'No asistió', solicitud_descartada: 'Descartada', fotos_recibidas: 'Llegaron las fotos',
};

const iniciales = (n: string) => n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const fechaCorta = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); const f = new Date(y!, m! - 1, d!); return `${DIAS[f.getDay()]!.slice(0, 3)} ${d} ${MESES[m! - 1]!.slice(0, 3)}`; };
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-US', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const telefono = (t: string) => t.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '+1 ($1) $2-$3');

interface Props { codigo: string; motivos: string[]; onCambio(f: FichaAdmin): void }

/** A3 · ficha de la solicitud elegida, con lo que pidió el cliente, sus fotos, la cita y las acciones (CU-C02). */
export const FichaSolicitud = forwardRef<HTMLElement, Props>(function FichaSolicitud({ codigo, motivos, onCambio }, ref) {
  const [f, setF] = useState<FichaAdmin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [descartando, setDescartando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [falla, setFalla] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vigente = true;
    setF(null);
    setError(null);
    setDescartando(false);
    setMotivo('');
    adminSolicitudesApi.ficha(codigo)
      .then((x) => vigente && setF(x))
      .catch((e) => vigente && setError(e instanceof ApiError ? e.message : 'No pudimos abrir la solicitud.'));
    return () => { vigente = false; };
  }, [codigo]);

  const hacer = async (accion: () => Promise<FichaAdmin | void>) => {
    setOcupado(true);
    setFalla(null);
    try {
      const nueva = (await accion()) ?? (await adminSolicitudesApi.ficha(codigo));
      setF(nueva);
      onCambio(nueva);
      setDescartando(false);
    } catch (e) {
      setFalla(e instanceof ApiError ? e.message : 'No se pudo completar. Intente de nuevo.');
    } finally {
      setOcupado(false);
    }
  };

  if (error) return <section ref={ref} className="sl-det"><Alert tone="danger" title="No pudimos abrir la solicitud" compact>{error}</Alert></section>;
  if (!f) return <section ref={ref} className="sl-det" aria-busy="true"><p className="muted" role="status">Cargando la solicitud…</p></section>;

  const cita = f.cita;
  // A2c / A2e: sin turno, se agenda desde aquí; con turno, se abre la Agenda en esa cita.
  const accion = f.estado === 'En espera de cita'
    ? cita?.estado === 'Programada'
      ? { texto: 'Ver en la agenda', a: `/admin/agenda?cita=${cita.id}&fecha=${cita.fecha}` }
      : { texto: f.tela === 'domicilio' ? 'Agendar visita' : 'Agendar cita', a: `/admin/agenda?agendar=${f.codigo}` }
    : ['Nueva', 'Atendida'].includes(f.estado) && !f.esperaFotos ?{ texto: 'Armar cotización', a: '/admin/cotizaciones/cotizar' }
      : f.estado === 'Cotizada' ? { texto: 'Ver cotización', a: '/admin/cotizaciones' } : null;

  return (
    <section ref={ref} className="sl-det" aria-label={`Solicitud ${f.codigo}`}>
      <div className="between"><span className="ov">{f.codigo} · {CANAL[f.canal] ?? f.canal}</span><StatusChip status={f.estado} /></div>
      <div className="sl-who">
        <span className="sl-av" aria-hidden="true">{iniciales(f.cliente.nombre)}</span>
        <div>
          <h2>{f.cliente.nombre}</h2>
          <small>{[f.cliente.email, telefono(f.cliente.telefono)].filter(Boolean).join(' · ')}{f.cliente.tieneCuenta ? '' : ' · sin cuenta en la web'}</small>
        </div>
      </div>
      {f.esperaFotos && <Alert tone="warning" title="Esperando las fotos del cliente" compact>Se le pidieron por enlace. No se puede cotizar hasta que lleguen.</Alert>}

      {f.muebles.map((m) => (
        <div key={m.orden} className="sl-blk">
          <span className="ov">{f.muebles.length > 1 ? `Mueble ${m.orden}` : 'Mueble'}</span>
          <b>{m.cantidad > 1 ? `${m.cantidad} × ` : ''}{m.tipo} · {m.servicioNombre.toLowerCase()}</b>
          {m.acabado && <small>Acabado: {m.acabado}</small>}
          <small>{m.medidas ? `Medidas: ${m.medidas}` : 'Medidas: no indicó'}</small>
          {m.archivos.length > 0 ? (
            <div className="sl-ph">
              {m.archivos.map((a) => (
                a.url
                  ? <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="sl-foto" title={`Abrir ${a.nombre}`}>{a.tipo === 'foto' ? <img src={a.url} alt={a.nombre} /> : <Icon name="image" size={18} />}{a.tipo === 'video' && <em>video</em>}</a>
                  : <span key={a.id} className="sl-foto" title={a.nombre}><Icon name="image" size={18} /></span>
              ))}
            </div>
          ) : <small>Sin fotos todavía</small>}
          {m.telas.map((t) => (
            <div key={`${t.id}-${t.parte}`} className="sl-fab">
              <i style={{ background: fondoDe(t.familia, t.colorHex) }} aria-hidden="true" />
              <div><b>{t.nombre}</b><small>{t.pattern ? `Pattern ${t.pattern} · color ${t.numeroColor}` : ''}</small></div>
              <em>{t.parte ?? (m.telas.length > 1 ? 'opción' : 'todo')}</em>
            </div>
          ))}
        </div>
      ))}

      <div className="sl-blk">
        <span className="ov">Tela · {TELA[f.tela]}</span>
        {f.telaDescripcion && <b>“{f.telaDescripcion}”</b>}
        {f.telaConocida && <small>Ya conoce la tela: {f.telaConocida}</small>}
      </div>

      <div className="sl-blk">
        <span className="ov">Traslado</span>
        <b>{f.traslado === 'delivery' ? `Delivery · ${f.direccion ?? ''}` : f.traslado === 'propio' ? 'Lo lleva y lo recoge el cliente' : 'Se define en la cita'}</b>
        {f.fechaPrefRecojo && <small>Recojo preferido: {fechaCorta(f.fechaPrefRecojo)} · {f.franjaRecojo === 'manana' ? 'mañana' : 'tarde'}</small>}
      </div>

      {cita && (
        <div className="sl-blk">
          <span className="ov">{cita.tipo === 'local' ? 'Cita en el local' : 'Visita a domicilio'} · {cita.estado}</span>
          <b>{fechaCorta(cita.fecha)} · {cita.hora ?? (cita.franja === 'manana' ? 'mañana' : 'tarde')}</b>
          {cita.direccion && <small>{cita.direccion}</small>}
          {f.inasistencias > 0 && <small>No asistió {f.inasistencias} {f.inasistencias === 1 ? 'vez' : 'veces'}</small>}
          {cita.estado === 'Programada' && (
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" disabled={ocupado} onClick={() => hacer(() => adminSolicitudesApi.resultadoCita(cita.id, 'atendida'))}>Asistió</button>
              <button type="button" className="gw-btn gw-btn-ghost gw-btn-sm" disabled={ocupado} onClick={() => hacer(() => adminSolicitudesApi.resultadoCita(cita.id, 'no_asistio'))}>{cita.tipo === 'local' ? 'No asistió' : 'No estaba en casa'}</button>
            </div>
          )}
        </div>
      )}

      {f.motivoDescarte && <Alert tone="warning" title="Descartada" compact>Motivo: {f.motivoDescarte.toLowerCase()}.</Alert>}
      {falla && <Alert tone="danger" title="No se pudo" compact>{falla}</Alert>}
      {accion && <Link className="gw-btn gw-btn-primary gw-btn-block" to={accion.a}>{accion.texto}</Link>}
      {f.puedeDescartarse && !descartando && (
        <button type="button" className="gw-btn gw-btn-ghost gw-btn-block" onClick={() => setDescartando(true)}>Descartar solicitud</button>
      )}
      {f.puedeDescartarse && descartando && (
        <div className="sl-disc">
          <b id="sl-mot">Motivo del descarte (obligatorio)</b>
          <div className="sl-chips" role="radiogroup" aria-labelledby="sl-mot">
            {motivos.map((x) => <button key={x} type="button" role="radio" aria-checked={motivo === x} className="sl-mchip" onClick={() => setMotivo(x)}>{x}</button>)}
          </div>
          <p className="audit">No se borra: queda Descartada con motivo, quién y cuándo. El cliente recibe un aviso y, si tenía una cita, se cancela.</p>
          <div className="row">
            <button type="button" className="gw-btn gw-btn-danger" disabled={!motivo || ocupado} onClick={() => hacer(() => adminSolicitudesApi.descartar(f.codigo, motivo))}>Descartar</button>
            <button type="button" className="gw-btn gw-btn-ghost" onClick={() => { setDescartando(false); setMotivo(''); }}>Volver</button>
          </div>
        </div>
      )}

      <details className="sl-hist">
        <summary>Historial ({f.historial.length})</summary>
        <ol>{f.historial.map((h, i) => <li key={i}><b>{ACCION[h.accion] ?? h.accion}</b><small>{fechaHora(h.fecha)} · {h.quien}</small></li>)}</ol>
      </details>
      <p className="audit">Registrada por {f.registradaPor}. Cada cambio de estado queda con usuario, fecha y hora.</p>
    </section>
  );
});
