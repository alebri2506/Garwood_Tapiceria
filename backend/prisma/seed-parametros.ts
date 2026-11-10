// Parámetros de negocio (RG-04, CU-S05) y cómo se muestran en A14 (decisiones-recientes.md, sección D.3).
//  - `valor` es solo el valor INICIAL: el seed nunca lo pisa, porque después lo cambia el Administrador en A14.
//  - Etiqueta, grupo, tipo, límites y ayuda sí se actualizan en cada seed (son parte del sistema, no del negocio).
//  - Los que aún no usa ningún módulo (cotización, pagos, tarifas, transporte, despacho) llevan los valores del
//    prototipo A14 y la ayuda "Provisional: por confirmar con el dueño" (D.3.2).
import { Prisma, type PrismaClient } from '@prisma/client';

type Tipo = 'entero' | 'decimal' | 'porcentaje' | 'monto' | 'horario' | 'texto';

interface DefParametro {
  clave: string;
  valor: string;
  unidad?: string;
  descripcion: string;
  etiqueta: string;
  tipo: Tipo;
  minimo?: number;
  maximo?: number;
  ayuda?: string;
}

const PROVISIONAL = 'Provisional: por confirmar con el dueño.';
const prov = (texto?: string) => (texto ? `${texto} ${PROVISIONAL}` : PROVISIONAL);

// Grupos en el orden en que aparecen en A14. Los de "Cotización y pagos", "Tarifas" y "Agenda y despacho" son los
// del prototipo; "Solicitudes" y "Seguridad" se agregan por la decisión D.3.1.
// Mínimo 1 en duraciones y cantidades: con 0 la agenda o el inicio de sesión dejarían de funcionar.
export const GRUPOS_PARAMETROS: { grupo: string; parametros: DefParametro[] }[] = [
  {
    grupo: 'Cotización y pagos',
    parametros: [
      { clave: 'cotizacion.vigencia_dias', valor: '30', unidad: 'días', tipo: 'entero', minimo: 1, maximo: 90, etiqueta: 'Vigencia de la cotización', descripcion: 'Días que la cotización publicada sigue vigente (CU-C09)', ayuda: prov('En el prototipo: 1 mes.') },
      { clave: 'cotizacion.dias_aviso_vencimiento', valor: '3', unidad: 'días', tipo: 'entero', minimo: 0, etiqueta: 'Aviso al cliente antes de vencer', descripcion: 'Días antes del vencimiento en que se avisa al cliente (CU-C09)', ayuda: prov() },
      { clave: 'pago.plazo_adelanto_dias', valor: '7', unidad: 'días', tipo: 'entero', minimo: 0, etiqueta: 'Plazo de pago del adelanto', descripcion: 'Días para pagar el adelanto tras aceptar la cotización', ayuda: prov() },
      { clave: 'pago.adelanto_sin_historial_pct', valor: '40', unidad: '%', tipo: 'porcentaje', minimo: 0, maximo: 50, etiqueta: 'Adelanto sugerido · sin pedidos cerrados o con saldo vencido', descripcion: 'Porcentaje de adelanto sugerido para clientes sin historial', ayuda: prov('El dueño pide entre 40 % y 50 %: en cada pedido se puede subir hasta 50 % (queda registrado).') },
      { clave: 'pago.adelanto_con_historial_pct', valor: '0', unidad: '%', tipo: 'porcentaje', minimo: 0, maximo: 50, etiqueta: 'Adelanto sugerido · con al menos un pedido cerrado', descripcion: 'Porcentaje de adelanto sugerido para clientes con historial', ayuda: prov() },
      { clave: 'cotizacion.plazo_recotizacion_dias', valor: '5', unidad: 'días', tipo: 'entero', minimo: 0, etiqueta: 'Plazo para responder una recotización (daño oculto)', descripcion: 'Días que tiene el cliente para responder una V2 (CU-C08)', ayuda: prov() },
      { clave: 'cotizacion.margen_pct', valor: '75', unidad: '%', tipo: 'porcentaje', minimo: 0, maximo: 200, etiqueta: 'Margen sobre costo', descripcion: 'Margen que se suma al costo para el precio sugerido (CU-C06)', ayuda: prov('Se usa para el precio sugerido.') },
      { clave: 'cotizacion.cargo_revision', valor: '45.00', unidad: 'USD', tipo: 'monto', minimo: 0, etiqueta: 'Cargo por revisión (diagnóstico)', descripcion: 'Se cobra si, tras la revisión inicial, el cliente no acepta la recotización', ayuda: prov('Se cobra si, tras la revisión inicial, el cliente no acepta la recotización.') },
    ],
  },
  {
    grupo: 'Tarifas',
    parametros: [
      { clave: 'tarifa.hora_persona', valor: '15.00', unidad: 'USD/h', tipo: 'monto', minimo: 0, etiqueta: 'Hora persona', descripcion: 'Costo de una hora de mano de obra (CU-C06)', ayuda: prov() },
      { clave: 'tarifa.costos_fijos_pedido', valor: '60.00', unidad: 'USD', tipo: 'monto', minimo: 0, etiqueta: 'Costos fijos por pedido', descripcion: 'Costos fijos que se suman a cada pedido (CU-C06)', ayuda: prov() },
      { clave: 'tarifa.tela_referencia', valor: '17.00', unidad: 'USD/yd', tipo: 'monto', minimo: 0, etiqueta: 'Tela de referencia para plantillas', descripcion: 'Precio de tela usado solo en el precio de referencia de las plantillas (A16)', ayuda: prov('La cotización usa el precio de la tela que elige el cliente.') },
      { clave: 'catalogo.dias_revisar_precio', valor: '180', unidad: 'días', tipo: 'entero', minimo: 0, etiqueta: 'Aviso de precio por revisar', descripcion: 'Pasado este plazo, el Catálogo marca "Revisar precio" (A15)', ayuda: prov() },
      { clave: 'tarifa.tela_dificil_pct', valor: '20', unidad: '%', tipo: 'porcentaje', minimo: 0, maximo: 100, etiqueta: 'Horas extra por tela difícil', descripcion: 'Se suma a coser y tapizar cuando la tela es difícil (seda, terciopelo, cuero)', ayuda: prov() },
      { clave: 'transporte.carga_chica', valor: '15.00', unidad: 'USD', tipo: 'monto', minimo: 0, etiqueta: 'Transporte · carga chica (silla, cojín, otomán)', descripcion: 'Parte fija del transporte según el tamaño de la carga (C.4)', ayuda: prov() },
      { clave: 'transporte.carga_mediana', valor: '30.00', unidad: 'USD', tipo: 'monto', minimo: 0, etiqueta: 'Transporte · carga mediana (sillón, cabecera, banco)', descripcion: 'Parte fija del transporte según el tamaño de la carga (C.4)', ayuda: prov() },
      { clave: 'transporte.carga_grande', valor: '45.00', unidad: 'USD', tipo: 'monto', minimo: 0, etiqueta: 'Transporte · carga grande (sofá, cama, seccional)', descripcion: 'Parte fija del transporte según el tamaño de la carga (C.4)', ayuda: prov() },
      { clave: 'transporte.por_milla', valor: '1.60', unidad: 'USD/milla', tipo: 'monto', minimo: 0, etiqueta: 'Transporte · por milla', descripcion: 'Costo por milla recorrida (ida y vuelta)', ayuda: prov('Ej.: sofá a 14 mi: 14 × 2 × $1.60 + $45 (grande) ≈ $90.') },
    ],
  },
  {
    grupo: 'Agenda y despacho',
    parametros: [
      { clave: 'cita.duracion_min', valor: '30', unidad: 'min', tipo: 'entero', minimo: 1, etiqueta: 'Duración del turno de cita', descripcion: 'Duración de un turno de cita en el local; un cliente por turno (CU-C03)', ayuda: 'Las citas ya agendadas conservan su duración.' },
      { clave: 'agenda.turnos_manana', valor: '09:30-12:00', tipo: 'horario', etiqueta: 'Horario de citas · mañana', descripcion: 'Horario de citas en el local por la mañana (CU-C03)' },
      { clave: 'agenda.turnos_tarde', valor: '15:00-17:00', tipo: 'horario', etiqueta: 'Horario de citas · tarde', descripcion: 'Horario de citas en el local por la tarde (CU-C03)' },
      { clave: 'agenda.dias_adelante', valor: '84', unidad: 'días', tipo: 'entero', minimo: 1, etiqueta: 'Se puede agendar hasta', descripcion: 'Hasta cuántos días adelante se puede agendar una cita o visita (CU-C04)' },
      { clave: 'cita.reprogramaciones_inasistencia', valor: '1', unidad: 'veces', tipo: 'entero', minimo: 0, etiqueta: 'Reprogramaciones tras no asistir', descripcion: 'Reprogramaciones permitidas tras no asistir; la siguiente falta vence la solicitud (CU-C04)' },
      { clave: 'visita.duracion_min', valor: '60', unidad: 'min', tipo: 'entero', minimo: 1, etiqueta: 'Duración de la visita a domicilio', descripcion: 'Duración aproximada de una visita a domicilio (CU-C04)' },
      { clave: 'visita.franja_manana', valor: '09:00-12:00', tipo: 'horario', etiqueta: 'Franja de visitas · mañana', descripcion: 'Franja de la mañana de las visitas a domicilio; una visita por franja (CU-C04)' },
      { clave: 'visita.franja_tarde', valor: '15:00-17:00', tipo: 'horario', etiqueta: 'Franja de visitas · tarde', descripcion: 'Franja de la tarde de las visitas a domicilio; una visita por franja (CU-C04)' },
      { clave: 'taller.franja_manana', valor: '9:00–12:00', tipo: 'horario', etiqueta: 'Franja de recojos y entregas · mañana', descripcion: 'Franja de la mañana para recojos y entregas' },
      { clave: 'taller.franja_tarde', valor: '15:00–17:00', tipo: 'horario', etiqueta: 'Franja de recojos y entregas · tarde', descripcion: 'Franja de la tarde para recojos y entregas (el taller cierra al mediodía)' },
      { clave: 'recojo.dias_anticipacion_max', valor: '28', unidad: 'días', tipo: 'entero', minimo: 1, etiqueta: 'El cliente puede pedir el recojo hasta', descripcion: 'Hasta cuántos días adelante se puede pedir el recojo (CU-C01)' },
      { clave: 'despacho.dias_aviso_terminado', valor: '7', unidad: 'días', tipo: 'entero', minimo: 0, etiqueta: 'Aviso de pedido terminado sin salida', descripcion: 'Días que un pedido terminado puede esperar sin salida antes de avisar', ayuda: prov() },
      { clave: 'entrega.horas_confirmar', valor: '24', unidad: 'h antes', tipo: 'entero', minimo: 0, etiqueta: 'Confirmar o reprogramar entrega hasta', descripcion: 'Horas antes de la entrega en que el cliente aún puede confirmarla o reprogramarla', ayuda: prov() },
      { clave: 'reclamo.plazo_dias', valor: '7', unidad: 'días', tipo: 'entero', minimo: 0, etiqueta: 'Plazo para reclamos', descripcion: 'Días tras la entrega en que el cliente puede reclamar (CU-D07)', ayuda: prov() },
    ],
  },
  {
    grupo: 'Solicitudes',
    parametros: [
      { clave: 'solicitud.max_muebles', valor: '8', unidad: 'muebles', tipo: 'entero', minimo: 1, etiqueta: 'Muebles por solicitud', descripcion: 'Muebles que puede traer una sola solicitud (CU-C01)' },
      { clave: 'solicitud.max_archivos_mueble', valor: '10', unidad: 'archivos', tipo: 'entero', minimo: 1, etiqueta: 'Fotos o videos por mueble', descripcion: 'Fotos o videos por mueble en una solicitud (CU-C01)' },
      { clave: 'solicitud.dias_atraso', valor: '2', unidad: 'días', tipo: 'entero', minimo: 0, etiqueta: 'Solicitud atrasada después de', descripcion: 'Una solicitud Nueva con estos días sin atender aparece como atrasada (CU-C02)' },
      { clave: 'invitacion.dias_vigencia', valor: '7', unidad: 'días', tipo: 'entero', minimo: 1, etiqueta: 'Vigencia de la invitación al cliente', descripcion: 'Vigencia del enlace para que un cliente registrado por el taller cree su contraseña' },
    ],
  },
  {
    grupo: 'Seguridad',
    parametros: [
      { clave: 'login.max_intentos', valor: '5', unidad: 'intentos', tipo: 'entero', minimo: 1, etiqueta: 'Intentos fallidos antes de bloquear', descripcion: 'Intentos fallidos de inicio de sesión antes de bloquear la cuenta (CU-S01)' },
      { clave: 'login.minutos_bloqueo', valor: '15', unidad: 'min', tipo: 'entero', minimo: 1, etiqueta: 'Minutos de bloqueo', descripcion: 'Duración del bloqueo por intentos fallidos (CU-S01)' },
      { clave: 'recuperacion.minutos_vigencia', valor: '30', unidad: 'min', tipo: 'entero', minimo: 1, etiqueta: 'Duración del enlace de recuperación', descripcion: 'Vigencia del enlace para recuperar la contraseña (CU-S02)' },
    ],
  },
];

const decimal = (n?: number) => (n == null ? null : new Prisma.Decimal(n));

export async function sembrarParametros(prisma: PrismaClient) {
  let orden = 0;
  for (const { grupo, parametros } of GRUPOS_PARAMETROS) {
    for (const p of parametros) {
      orden += 10;
      const datos = {
        unidad: p.unidad ?? null, descripcion: p.descripcion, etiqueta: p.etiqueta, grupo, tipo: p.tipo,
        minimo: decimal(p.minimo), maximo: decimal(p.maximo), ayuda: p.ayuda ?? null, orden,
      };
      // El valor solo se pone al crear: si ya existe, se respeta el que dejó el Administrador.
      await prisma.parametro.upsert({ where: { clave: p.clave }, update: datos, create: { clave: p.clave, valor: p.valor, ...datos } });
    }
  }
}
