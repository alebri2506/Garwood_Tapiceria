// W6a Mis pedidos · En curso (CU-C16): los pedidos reales del cliente y cómo se presentan en la tarjeta y en la ficha.
// La API devuelve hechos (estado, recojo, pagos confirmados); aquí se decide qué ve el cliente y qué le toca hacer.
// Sin VITE_API_URL se usan los datos de ejemplo del diseño. RG-08: no llega ningún costo interno.
import { API_URL, apiFetch } from '../../../shared/api/http';
import { PEDIDOS_EN_CURSO, type Aviso, type Accion, type Etapa, type PedidoEnCurso } from './datos';
import { dia } from './tarjetasSolicitud';

export interface PedidoClienteDto {
  codigo: string;
  /** Generado · Esperando mueble · Esperando material · Listo para producir · En producción · En pausa · Terminado · En reparto · Listo para retiro */
  estado: string;
  descripcion: string;
  creado: string;
  entregaEstimada: string | null;
  solicitud: string | null;
  cotizacion: string | null;
  traslado: 'delivery' | 'propio' | null;
  telaOpcion: string;
  direccion: string | null;
  muebles: { tipo: string; cantidad: number; servicio: string; trabajos: string[]; telas: string[]; foto: string | null }[];
  recojo: { tipo: 'agendado' | 'en_visita'; fecha: string | null; hora: string | null; duracionMin: number; estado: string } | null;
  cuenta: { total: number; transporte: number; pagado: number; saldo: number; pagos: { concepto: string; metodo: string; monto: number; fecha: string }[] };
}

export const dolares = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const METODO: Record<string, string> = { tarjeta: 'Tarjeta', efectivo: 'Efectivo', zelle: 'Zelle', cheque: 'Cheque', transferencia: 'Transferencia' };
const hoyIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const sumarMin =(hora: string, min: number) => {
  const [h, m] = hora.split(':').map(Number) as [number, number];
  const t = h * 60 + m + min;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/** En qué etapa va: 0 confirmado · 1 recojo (o lo trae) · 2 en el taller · 3 listo · 4 entrega (o retiro). */
function etapaDe(p: PedidoClienteDto, muebleEnTaller: boolean) {
  switch (p.estado) {
    case 'Generado': case 'Esperando mueble': return muebleEnTaller ? 2 : 1;
    case 'Terminado': return 3;
    case 'En reparto': case 'Listo para retiro': return 4;
    default: return 2; // Esperando material · Listo para producir · En producción · En pausa
  }
}

export function pedidoEnCurso(p: PedidoClienteDto): PedidoEnCurso {
  const delivery = p.traslado === 'delivery';
  const r = p.recojo;
  const recogido = Boolean(r && (r.tipo === 'en_visita' || r.estado === 'Realizado'));
  const etapa = etapaDe(p, recogido);
  const verCotizacion = p.solicitud ? `/cliente/cotizacion?solicitud=${p.solicitud}` : '/cliente/pedidos/solicitudes';
  const varios = p.muebles.length > 1;
  const su = varios ? 'sus muebles' : 'su mueble';
  const servicios = [...new Set(p.muebles.map((m) => m.servicio))];
  const telas = [...new Set(p.muebles.flatMap((m) => m.telas))];
  // Muebles iguales se cuentan juntos: «2 × Sofá de 3 cuerpos» (no «Sofá de 3 cuerpos, Sofá de 3 cuerpos»).
  const cuantos = new Map<string, number>();
  p.muebles.forEach((m) => cuantos.set(m.tipo, (cuantos.get(m.tipo) ?? 0) + m.cantidad));
  const titulo = p.muebles.length ? [...cuantos].map(([t, n]) => (n > 1 ? `${n} × ${t}` : t)).join(', ') : p.descripcion;
  const telaCorta = telas.length > 2 ? `${telas[0]} y ${telas.length - 1} telas más` : telas.join(', ');
  // Sin telas del taller: la trae el cliente, no lleva, o el servicio no usa tela (p. ej. solo espuma) → no se muestra.
  const tela = telas.length ? telas.join(', ') : p.telaOpcion === 'trae' ? 'La brinda usted' : p.telaOpcion === 'sin' ? 'No lleva tela' : '';
  const linea = [p.codigo, servicios.join(' + ').toLowerCase(), telaCorta || tela].filter(Boolean).join(' · ');
  const cuandoRecojo =r?.fecha && r.hora ? `${dia(r.fecha)}, de ${r.hora} a ${sumarMin(r.hora, r.duracionMin)}` : null;
  const totalTrabajos = p.muebles.reduce((a, m) => a + m.trabajos.length, 0);

  // Qué sigue y si le toca al cliente.
  let siguiente: Aviso;
  let accion: Accion | undefined;
  if (etapa === 1 && delivery && !r) {
    siguiente = { quien: 'you', icono: 'calendar', texto: `Le toca a usted: elija el día y la hora en que pasamos por ${su}. Solo verá las horas libres del taller.` };
    accion = { texto: 'Elegir día del recojo', a: verCotizacion, tipo: 'primary' };
  } else if (etapa === 1 && delivery && r?.fecha && r.fecha < hoyIso()) {
    // El recojo ya pasó pero el taller aún no registra que recibió el mueble.
    siguiente = { quien: 'us', icono: 'truck', texto: `El recojo estaba previsto el ${cuandoRecojo}. En cuanto el taller registre que recibió ${su}, lo verá aquí. Si no pasamos, llámenos y lo reprogramamos.` };
  } else if (etapa === 1 && delivery) {
    siguiente = { quien: 'us', icono: 'truck', texto: `Pasamos por ${su} el ${cuandoRecojo ?? 'día acordado'}${p.direccion ? `, en ${p.direccion}` : ''}. Le avisamos un día antes.` };
  } else if (etapa === 1) {
    siguiente = { quien: 'you', icono: 'home', texto: `Le toca a usted: traiga ${su} al taller (Garwood, NJ) en el horario de atención. Si necesita coordinar el día, llámenos.` };
  } else if (p.estado === 'Esperando material') {
    siguiente = { quien: 'us', icono: 'clock', texto: 'Estamos consiguiendo la tela y los materiales de su pedido. Cuando lleguen empezamos el trabajo y le avisamos aquí.' };
  } else if (p.estado === 'En pausa') {
    siguiente = { quien: 'us', icono: 'pause', texto: 'Su pedido está en pausa. El taller se comunicará con usted para explicarle el motivo.' };
  } else if (p.estado === 'Terminado') {
    siguiente = { quien: 'us', icono: 'check', texto: delivery
      ? `${varios ? 'Sus muebles están terminados' : 'Su mueble está terminado'}. Cuando el taller arme la salida le avisamos la fecha y hora de entrega para que la confirme.`
      : `${varios ? 'Sus muebles están terminados' : 'Su mueble está terminado'}. Le avisamos cuando pueda pasar a retirarlo.` };
  } else if (p.estado === 'En reparto') {
    siguiente = { quien: 'us', icono: 'truck', texto: 'Su pedido va en camino. El conductor le entrega y le pide su firma.' };
  } else if (p.estado === 'Listo para retiro') {
    siguiente = { quien: 'you', icono: 'package', texto: 'Le toca a usted: su pedido está listo para retirar en el taller.' };
  } else if (p.estado === 'En producción') {
    siguiente = { quien: 'us', icono: 'info', texto: 'Por ahora no necesita hacer nada: el equipo del taller está trabajando en su pedido.' };
  } else {
    siguiente = { quien: 'us', icono: 'info', texto: `Por ahora no necesita hacer nada: ${su} ya ${varios ? 'están' : 'está'} con nosotros y el taller está planificando el trabajo.` };
  }

  const etapas: Etapa[] = [
    { l: 'Pedido confirmado', d: dia(p.creado.slice(0, 10)) },
    delivery
      ? { l: 'Recojo', d: r?.tipo === 'en_visita' ? 'en la visita' : cuandoRecojo ?? 'día por elegir' }
      : { l: 'Lo trae al taller', d: recogido ? 'recibido' : 'cuando pueda' },
    { l: 'En el taller', d: p.estado === 'Esperando material' ? 'esperando material' : p.estado === 'En pausa' ? 'en pausa' : etapa > 2 ? 'hecho' : 'pronto' },
    { l: 'Listo', d: etapa >= 3 ? 'terminado' : p.entregaEstimada ? `${dia(p.entregaEstimada)} (est.)` : 'por definir' },
    { l: delivery ? 'Entrega' : 'Retiro', d: 'fecha por asignar' },
  ];

  const pagos = p.cuenta.pagos.map((x) => ({ l: `${x.concepto === 'adelanto' ? 'Adelanto' : 'Pago'} · ${METODO[x.metodo] ?? x.metodo} · ${dia(x.fecha.slice(0, 10))}`, v: dolares(x.monto) }));
  const sinSaldo = p.cuenta.saldo <= 0;

  return {
    id: p.codigo, titulo, codigo: linea, descripcion: linea,
    icono: 'sofa', thumb: '', estado: p.estado, pasos: ['Confirmado', delivery ? 'Recojo' : 'Lo trae', 'En el taller', 'Listo', delivery ? 'Entrega' : 'Retiro'], pasoActual: etapa,
    necesitaAccion: siguiente.quien === 'you', aviso: siguiente, siguiente, accion,
    monto: sinSaldo
      ? { valor: dolares(p.cuenta.total), sub: 'pagado por completo' }
      : { valor: dolares(p.cuenta.saldo), sub: p.cuenta.pagado > 0 ? `saldo pendiente · pagó ${dolares(p.cuenta.pagado)}` : 'saldo pendiente' },
    entregaEstimada: p.entregaEstimada ? dia(p.entregaEstimada) : 'Por definir',
    etapas, etapaActual: etapa,
    trabajo: {
      texto: etapa < 2
        ? `Todavía no empezamos: el trabajo arranca cuando ${su} ${varios ? 'lleguen' : 'llegue'} al taller. Esto es lo que haremos:`
        : etapa === 2 ? 'Esto es lo que haremos en su pedido. El avance de cada trabajo se verá aquí cuando el taller lo registre.' : 'Terminamos todos los trabajos de su pedido.',
      hechos: etapa >= 3 ? totalTrabajos : 0, total: Math.max(totalTrabajos, 1),
      pie: `${etapa >= 3 ? totalTrabajos : 0} de ${totalTrabajos} trabajos`, actualizado: dia(p.creado.slice(0, 10)),
    },
    tareas: p.muebles.map((m) => ({ mueble: `${m.cantidad > 1 ? `${m.cantidad} × ` : ''}${m.tipo} · ${m.servicio.toLowerCase()}`, trabajos: m.trabajos })),
    imagenes: p.muebles.map((m) => m.foto).filter((x): x is string => Boolean(x)),
    fotos: recogido ? 'Fotos que nos envió en su solicitud. Las fotos del recojo y del avance aparecerán aquí.' : 'Fotos que nos envió en su solicitud. Cuando recibamos su mueble verá aquí las del taller.',
    datos: [
      { l: 'Trabajo', v: servicios.join(' + ') },
      ...(tela ? [{ l: 'Tela', v: tela }] : []),
      { l: 'Traslado', v: delivery ? 'Recojo y entrega' : 'Lo trae y lo retira usted' },
      ...(delivery && p.direccion ? [{ l: 'Dirección', v: p.direccion }] : []),
      ...(delivery ? [{ l: 'Recojo', v: r?.tipo === 'en_visita' ? 'Hecho en la visita' : cuandoRecojo ?? 'Por elegir', ok: recogido }] : []),
      ...(p.cotizacion ? [{ l: 'Cotización aceptada', v: `${p.cotizacion} · ver`, a: verCotizacion }] : []),
    ],
    cuenta: { total: dolares(p.cuenta.total), pagos, saldo: dolares(p.cuenta.saldo) },
    entrega: {
      asignada: false,
      texto: delivery
        ? `La fecha se asigna cuando ${su} ${varios ? 'estén terminados' : 'esté terminado'} y el taller lo incluya en una salida de reparto.`
        : `Cuando ${su} ${varios ? 'estén listos' : 'esté listo'} le avisamos aquí y por correo para que pase a retirarlo.`,
      pasos: delivery
        ? ['Terminamos su pedido.', 'El taller arma la salida y le asigna día y franja horaria.', 'Le avisamos aquí y por correo: usted confirma o reprograma hasta 24 h antes.']
        : undefined,
    },
    cancelarPorTelefono: true,
  };
}

export const pedidosApi = {
  /** Los pedidos que todavía no se entregan ni se cancelan. */
  enCurso: async (): Promise<PedidoEnCurso[]> =>
    API_URL ? (await apiFetch<PedidoClienteDto[]>('/solicitudes/pedidos/en-curso')).map(pedidoEnCurso) : [...PEDIDOS_EN_CURSO],
};
