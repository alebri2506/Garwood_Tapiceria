// W6c · cómo se ve cada solicitud del cliente según su estado (diseño v3). Solo presenta lo que devuelve la API.
import type { IconName } from '../../../shared/ui/Icon';
import { DIAS, MESES } from '../fechas';
import type { CitaDto, SolicitudCliente } from '../solicitud/solicitudApi';
import type { Aviso } from './datos';

type Tono = 'neutral' | 'info' | 'progress' | 'warning' | 'success' | 'danger';
export type Grupo = 'accion' | 'taller' | 'cerradas';
export type Extra = 'fotos' | null;

export interface TarjetaSolicitud {
  grupo: Grupo;
  titulo: string;
  linea: string;
  icono: IconName;
  estado: string;
  tono: Tono;
  pasos: string[];
  actual: number;
  aviso: Aviso;
  accion?: { texto: string; a: string; tipo: 'primary' | 'secondary' };
  extra: Extra;
}

const dia = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(y!, m! - 1, d!);
  return `${DIAS[f.getDay()]!.slice(0, 3)} ${f.getDate()} ${MESES[f.getMonth()]!.slice(0, 3)}`;
};
const cuando = (c: CitaDto) => (c.hora ? `${dia(c.fecha)}, ${c.hora}` : `${dia(c.fecha)}, por la ${c.franja === 'manana' ? 'mañana (09:00–12:00)' : 'tarde (15:00–17:00)'}`);

export function tarjetaDe(s: SolicitudCliente): TarjetaSolicitud {
  const m = s.muebles[0]!;
  const titulo = `${m.cantidad > 1 ? `${m.cantidad} × ` : ''}${m.tipo}${s.muebles.length > 1 ? ` y ${s.muebles.length - 1} más` : ''}`;
  const servicio = m.servicioNombre.toLowerCase();
  const casa = s.tela === 'domicilio';
  const enLocal = s.tela === 'local';
  const PASOS = ['Solicitud', 'Cotización', 'Su respuesta', 'Pedido'];
  const PASOS_CITA = ['Solicitud', casa ? 'Visita a domicilio' : 'Cita en el local', 'Cotización', 'Su respuesta', 'Pedido'];
  const base = { titulo, icono: (casa ? 'map-pin' : enLocal ? 'calendar' : 'sofa') as IconName, extra: null as Extra };
  const enlaceCita = `${casa ? '/cliente/visita' : '/cliente/cita'}?solicitud=${s.codigo}`;

  if (s.estado === 'Descartada') {
    return { ...base, grupo: 'cerradas', linea: `${s.codigo} · ${servicio}`, estado: 'Descartada', tono: 'danger', pasos: PASOS, actual: 0,
      aviso: { quien: 'us', icono: 'info', texto: `Cerramos esta solicitud${s.motivoDescarte ? ` (motivo: ${s.motivoDescarte.toLowerCase()})` : ''}. Si quiere retomarla, envíe una nueva o llámenos.` } };
  }
  if (s.estado === 'Vencida') {
    return { ...base, grupo: 'cerradas', linea: `${s.codigo} · ${servicio}`, estado: 'Vencida', tono: 'neutral', pasos: PASOS_CITA, actual: 1,
      aviso: { quien: 'us', icono: 'info', texto: 'La solicitud venció porque no pudimos realizar la cita dos veces. Para una nueva, comuníquese con el taller.' } };
  }
  if (s.esperaFotos) {
    return { ...base, grupo: 'accion', icono: 'image', linea: `${s.codigo} · ${servicio} · el taller necesita sus fotos`, estado: 'Faltan fotos', tono: 'warning',
      pasos: ['Solicitud', 'Fotos', 'Cotización', 'Su respuesta', 'Pedido'], actual: 1, extra: 'fotos',
      aviso: { quien: 'you', icono: 'image', texto: 'Le toca a usted: suba al menos una foto de cada mueble. Con ellas armamos su cotización.' } };
  }
  if (s.estado === 'En espera de cita') {
    const c = s.cita?.estado === 'Programada' ? s.cita : null;
    if (c) {
      return {
        ...base, grupo: 'taller', linea: `${s.codigo} · ${servicio} · ${casa ? 'visita a domicilio sin costo' : 'quiere ver la tela en el local'}`,
        estado: casa ? 'Visita programada' : 'Cita agendada', tono: 'info', pasos: PASOS_CITA,
        actual: 1,
        aviso: { quien: 'us', icono: 'calendar', texto: casa
          ? `Su visita: ${cuando(c)}${c.direccion ? `, en ${c.direccion}` : ''}. Llevamos los libros de telas: ahí elige la tela, medimos y le dejamos la cotización.`
          : `Su cita: ${cuando(c)}, en el taller (Garwood, NJ). Ahí elige la tela y en la misma visita le armamos la cotización.` },
        accion: { texto: casa ? 'Ver o reprogramar' : 'Reprogramar cita', a: enlaceCita, tipo: 'secondary' },
      };
    }
    // Tras la segunda falta, solo el taller puede ofrecerle un último turno (A2f).
    if (s.inasistencias > 1) {
      return { ...base, grupo: 'accion', linea: `${s.codigo} · ${servicio} · ${casa ? 'visita a domicilio' : 'cita en el local'}`, estado: casa ? 'No lo encontramos' : 'No asistió', tono: 'warning',
        pasos: PASOS_CITA, actual: 1,
        aviso: { quien: 'you', icono: 'alert', texto: 'Ya usó su reprogramación. Si todavía quiere el servicio, llame al taller: podemos ofrecerle un último turno.' } };
    }
    if (s.inasistencias > 0) {
      return { ...base, grupo: 'accion', linea: `${s.codigo} · ${servicio} · ${casa ? 'visita a domicilio' : 'cita en el local'}`, estado: casa ? 'No lo encontramos' : 'No asistió', tono: 'warning',
        pasos: PASOS_CITA, actual: 1, accion: { texto: 'Elegir otra fecha', a: enlaceCita, tipo: 'primary' },
        aviso: { quien: 'you', icono: 'alert', texto: casa ? 'Le toca a usted: fuimos y no había nadie en casa. Elija otra fecha; puede reprogramar una sola vez.' : 'Le toca a usted: no pudo venir a su cita. Elija otro turno; puede reprogramar una sola vez.' } };
    }
    return { ...base, grupo: 'accion', linea: `${s.codigo} · ${servicio} · ${casa ? 'visita a domicilio sin costo' : 'quiere ver la tela en el local'}`, estado: 'Falta elegir el día', tono: 'warning',
      pasos: PASOS_CITA, actual: 1, accion: { texto: casa ? 'Elegir día de la visita' : 'Elegir día y hora', a: enlaceCita, tipo: 'primary' },
      aviso: { quien: 'you', icono: 'calendar', texto: casa ? 'Le toca a usted: elija el día y la franja de la visita a su casa.' : 'Le toca a usted: elija el día y la hora de su cita en el local.' } };
  }
  if (s.estado === 'Atendida') {
    return { ...base, grupo: 'taller', linea: `${s.codigo} · ${casa ? 'visita hecha' : 'cita atendida'}`, estado: 'Preparando cotización', tono: 'info', pasos: PASOS_CITA, actual: 2,
      aviso: { quien: 'us', icono: 'info', texto: casa ? 'Gracias por recibirnos. Con la tela que eligió y las medidas que tomamos, terminamos su cotización y le avisamos aquí y por correo.' : 'Gracias por venir. Terminamos su cotización y le avisamos aquí y por correo.' } };
  }
  if (s.estado === 'Cotizada') {
    return { ...base, grupo: 'accion', icono: 'quote', linea: `${s.codigo} · ${servicio}`, estado: 'Cotización lista', tono: 'success', pasos: PASOS, actual: 2,
      aviso: { quien: 'you', icono: 'clock', texto: 'Le toca a usted: revise la cotización y respóndala.' } };
  }
  const fotos = s.muebles.reduce((t, x) => t + x.archivos.length, 0);
  return { ...base, grupo: 'taller', icono: 'image', linea: `${s.codigo} · ${servicio} · ${fotos} ${fotos === 1 ? 'foto enviada' : 'fotos enviadas'}`, estado: 'En revisión', tono: 'info', pasos: PASOS, actual: 1,
    aviso: { quien: 'us', icono: 'info', texto: 'Estamos preparando su cotización con las fotos que envió. Le avisamos aquí y por correo cuando esté lista. Si necesitamos otra foto o una medida, se la pediremos.' } };
}
