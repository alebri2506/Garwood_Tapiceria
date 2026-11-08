// Catálogo que usa la solicitud de cotización (CU-C01).
//  - Tipos de mueble y sus partes: los del diseño W2 (pendiente confirmar con el dueño cuáles son los más frecuentes).
//  - Telas: DATOS DE PRUEBA. El Administrador todavía no tiene la pantalla A15 Catálogo para cargarlas;
//    cuando exista, se reemplazan por las reales y este bloque se quita.
import type { PrismaClient } from '@prisma/client';

export const TIPOS_MUEBLE: { codigo: string; nombre: string; partes: string[] }[] = [
  { codigo: 's2', nombre: 'Sofá de 2 cuerpos', partes: ['Respaldo', 'Asiento (cojines)', 'Brazo izquierdo', 'Brazo derecho', 'Base y faldón', 'Parte trasera'] },
  { codigo: 's3', nombre: 'Sofá de 3 cuerpos', partes: ['Respaldo', 'Asiento (cojines)', 'Brazo izquierdo', 'Brazo derecho', 'Base y faldón', 'Parte trasera'] },
  { codigo: 'sL', nombre: 'Sofá seccional (en L)', partes: ['Respaldo', 'Asiento (cojines)', 'Chaise (extensión)', 'Brazo izquierdo', 'Brazo derecho', 'Base y faldón'] },
  { codigo: 'sc', nombre: 'Sofá cama', partes: ['Respaldo', 'Asiento (cojines)', 'Brazo izquierdo', 'Brazo derecho', 'Base y faldón', 'Parte trasera'] },
  { codigo: 'ar', nombre: 'Sillón', partes: ['Respaldo', 'Asiento', 'Brazo izquierdo', 'Brazo derecho', 'Base y faldón'] },
  { codigo: 'ch', nombre: 'Silla de comedor', partes: ['Respaldo', 'Asiento'] },
  { codigo: 'hb', nombre: 'Cabecera de cama', partes: ['Frente', 'Bordes y ribete'] },
  { codigo: 'bed', nombre: 'Cama tapizada', partes: ['Cabecera', 'Laterales y piecera', 'Faldón'] },
  { codigo: 'ot', nombre: 'Otomán o puf', partes: ['Tapa (arriba)', 'Lados'] },
  { codigo: 'bn', nombre: 'Banco (bench)', partes: ['Asiento', 'Lados'] },
  { codigo: 'bq', nombre: 'Banqueta de restaurante', partes: ['Respaldo', 'Asiento', 'Base (frente)'] },
  { codigo: 'wn', nombre: 'Cojín de ventana o asiento empotrado', partes: ['Cojín del asiento', 'Frente del cojín', 'Cojines del respaldo'] },
  { codigo: 'gen', nombre: 'Otro mueble de interior', partes: ['Parte principal', 'Otra parte'] },
];

export const PARAMETROS_SOLICITUD = [
  { clave: 'solicitud.max_muebles', valor: '8', unidad: 'muebles', descripcion: 'Muebles que puede traer una sola solicitud (CU-C01)' },
  { clave: 'solicitud.max_archivos_mueble', valor: '10', unidad: 'archivos', descripcion: 'Fotos o videos por mueble en una solicitud (CU-C01)' },
  { clave: 'recojo.dias_anticipacion_max', valor: '60', unidad: 'días', descripcion: 'Hasta cuántos días adelante se puede pedir el recojo (CU-C01)' },
  { clave: 'taller.franja_manana', valor: '9:00–12:00', unidad: 'horario', descripcion: 'Franja de la mañana para recojos y entregas' },
  { clave: 'taller.franja_tarde', valor: '15:00–17:00', unidad: 'horario', descripcion: 'Franja de la tarde para recojos y entregas (el taller cierra al mediodía)' },
  { clave: 'solicitud.dias_atraso', valor: '2', unidad: 'días', descripcion: 'Una solicitud Nueva con estos días sin atender aparece como atrasada (CU-C02)' },
  { clave: 'cita.duracion_min', valor: '30', unidad: 'minutos', descripcion: 'Duración de un turno de cita en el local; un cliente por turno (CU-C03)' },
  { clave: 'agenda.turnos_manana', valor: '09:30-12:00', unidad: 'horario', descripcion: 'Horario de citas en el local por la mañana (CU-C03)' },
  { clave: 'agenda.turnos_tarde', valor: '15:00-17:00', unidad: 'horario', descripcion: 'Horario de citas en el local por la tarde (CU-C03)' },
  { clave: 'agenda.dias_adelante', valor: '84', unidad: 'días', descripcion: 'Hasta cuántos días adelante se puede agendar una cita o visita (CU-C04)' },
  { clave: 'visita.duracion_min', valor: '60', unidad: 'minutos', descripcion: 'Duración aproximada de una visita a domicilio (CU-C04)' },
  { clave: 'visita.franja_manana', valor: '09:00-12:00', unidad: 'horario', descripcion: 'Franja de la mañana de las visitas a domicilio; una visita por franja (CU-C04)' },
  { clave: 'visita.franja_tarde', valor: '15:00-17:00', unidad: 'horario', descripcion: 'Franja de la tarde de las visitas a domicilio; una visita por franja (CU-C04)' },
  { clave: 'cita.reprogramaciones_inasistencia', valor: '1', unidad: 'veces', descripcion: 'Reprogramaciones permitidas tras no asistir; la siguiente falta vence la solicitud (CU-C04)' },
  { clave: 'invitacion.dias_vigencia', valor: '7', unidad: 'días', descripcion: 'Vigencia del enlace para que un cliente registrado por el taller cree su contraseña' },
];

// DATOS DE PRUEBA · telas del catálogo en línea (código TP-… = tela de prueba).
export const TELAS_PRUEBA = [
  { codigo: 'TP-204-4', nombre: 'Lino Navy 204', familia: 'Lino', pattern: '204', numeroColor: '4', colorHex: '#1E2A4A', descripcion: '100 % lino · azul marino' },
  { codigo: 'TP-110-11', nombre: 'Lino Arena 110', familia: 'Lino', pattern: '110', numeroColor: '11', colorHex: '#CDBA96', descripcion: 'Lino y algodón · arena' },
  { codigo: 'TP-318-2', nombre: 'Pana Gris 318', familia: 'Pana', pattern: '318', numeroColor: '2', colorHex: '#6B7280', descripcion: 'Pana de algodón · gris' },
  { codigo: 'TP-52-7', nombre: 'Chenille Verde 52', familia: 'Chenille', pattern: '52', numeroColor: '7', colorHex: '#3F6B4E', descripcion: 'Chenille · verde bosque' },
  { codigo: 'TP-12-1', nombre: 'Chenille Marfil 12', familia: 'Chenille', pattern: '12', numeroColor: '1', colorHex: '#E7DFCF', descripcion: 'Chenille · marfil' },
  { codigo: 'TP-640-5', nombre: 'Cuero sint. Café', familia: 'Cuero sint.', pattern: '640', numeroColor: '5', colorHex: '#6B4226', descripcion: 'Fácil de limpiar · café' },
  { codigo: 'TP-220-9', nombre: 'Terciopelo Vino', familia: 'Terciopelo', pattern: '220', numeroColor: '9', colorHex: '#6D1F3A', descripcion: 'Terciopelo · vino' },
  { codigo: 'TP-224-3', nombre: 'Terciopelo Mostaza', familia: 'Terciopelo', pattern: '224', numeroColor: '3', colorHex: '#B8860B', descripcion: 'Terciopelo · mostaza' },
  { codigo: 'TP-760-2', nombre: 'Estampado Floral', familia: 'Estampado', pattern: '760', numeroColor: '2', colorHex: '#9C6B5B', descripcion: 'Estampado · floral' },
  // Descontinuada: no aparece en el catálogo en línea (CU-C01: solo telas activas).
  { codigo: 'TP-300-8', nombre: 'Terciopelo Gris 300', familia: 'Terciopelo', pattern: '300', numeroColor: '8', colorHex: '#71717A', descripcion: 'Terciopelo · gris · descontinuada', activo: false },
];

export async function sembrarCatalogoSolicitud(prisma: PrismaClient) {
  for (const p of PARAMETROS_SOLICITUD) {
    await prisma.parametro.upsert({ where: { clave: p.clave }, update: {}, create: p });
  }
  for (const [orden, t] of TIPOS_MUEBLE.entries()) {
    const tipo = await prisma.tipoMueble.upsert({
      where: { codigo: t.codigo },
      update: { nombre: t.nombre, orden },
      create: { codigo: t.codigo, nombre: t.nombre, orden },
    });
    for (const [i, nombre] of t.partes.entries()) {
      await prisma.tipoMuebleParte.upsert({
        where: { tipoMuebleId_orden: { tipoMuebleId: tipo.id, orden: i + 1 } },
        update: { nombre },
        create: { tipoMuebleId: tipo.id, nombre, orden: i + 1 },
      });
    }
  }
  for (const t of TELAS_PRUEBA) {
    const datos = { ...t, categoria: 'tela', unidadMedida: 'yd', activo: t.activo ?? true };
    await prisma.material.upsert({ where: { codigo: t.codigo }, update: datos, create: datos });
  }
}
