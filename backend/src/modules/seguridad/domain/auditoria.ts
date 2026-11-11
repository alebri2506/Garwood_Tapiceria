// CU-S06 Auditoría (A20 › Registro de actividad · decisiones D.2): cada registro de la bitácora en texto legible.
// Sin Express ni Prisma: los nombres de los registros (códigos, etiquetas, usuarios) llegan ya resueltos en `Referencias`.
import { leerFecha } from '../../comercial/domain/calendario.js';
import { enNY } from '../../comercial/domain/agenda.js';
import { etiquetaRol } from './usuarios.js';

/** Módulos del filtro, en el orden de A20. */
export const MODULOS: { codigo: string; nombre: string }[] = [
  { codigo: 'comercial', nombre: 'Comercial' },
  { codigo: 'historial', nombre: 'Historial' },
  { codigo: 'configuracion', nombre: 'Configuración' },
  { codigo: 'seguridad', nombre: 'Seguridad' },
];

export interface EntradaBitacora {
  accion: string;
  modulo: string;
  entidad: string;
  entidadId: number | null;
  valorAnterior: unknown;
  valorNuevo: unknown;
  /** Correo o usuario de quien hizo la acción (null si no había sesión). */
  usuario: string | null;
  /** Su nombre visible (“Carlos Ruiz”, “Laura Méndez”), si se conoce. */
  nombre?: string | null;
}

export interface Referencias {
  solicitudes: Map<number, string>;
  /** cita → código de su solicitud */
  citas: Map<number, string>;
  parametros: Map<number, { etiqueta: string; unidad: string | null }>;
  usuarios: Map<number, string>;
  clientes: Map<number, string>;
}

/** `nombre`: quién lo hizo, para leer; `usuario`: su correo o usuario, para distinguir a dos personas con el mismo nombre. */
export interface EntradaLegible { nombre: string; usuario: string; modulo: string; accion: string; registro: string; cambio: string }

/** Filtro “Quién” de A20 (equipo, 10/11): una lista con cada persona no sirve cuando hay muchos clientes. */
export const TIPOS_ACTOR: { codigo: 'personal' | 'clientes' | 'sistema'; nombre: string }[] = [
  { codigo: 'personal', nombre: 'Personal del taller' },
  { codigo: 'clientes', nombre: 'Clientes' },
  { codigo: 'sistema', nombre: 'Sistema' },
];

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const CANALES: Record<string, string> = { web: 'por la web', telefono: 'por teléfono', local: 'en el local', correo: 'por correo', mensaje: 'por mensaje' };
const FRANJAS: Record<string, string> = { manana: 'mañana', tarde: 'tarde' };

/** "2026-11-16" → "lun 16 nov" */
export function diaCorto(fecha: string) {
  const d = leerFecha(fecha);
  return d ? `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}` : fecha;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const texto = (v: unknown) => (v == null ? '' : String(v));
const plural = (n: unknown, uno: string, varios: string) => `${n} ${Number(n) === 1 ? uno : varios}`;

/** "lun 16 nov, 10:00" o "lun 16 nov · mañana" */
function cuandoCita(v: Record<string, unknown>) {
  if (typeof v.fechaHora === 'string') {
    const { fecha, hora } = enNY(new Date(v.fechaHora));
    return hora === '00:00' && v.franja ? `${diaCorto(fecha)} · ${FRANJAS[texto(v.franja)] ?? v.franja}` : `${diaCorto(fecha)}, ${hora}`;
  }
  const dia = diaCorto(texto(v.fecha));
  if (v.hora) return `${dia}, ${v.hora}`;
  return v.franja ? `${dia} · ${FRANJAS[texto(v.franja)] ?? v.franja}` : dia;
}

/** Valor de un parámetro como se lee: "$1.60", "40 %", "30 min", "09:30–12:00". */
function valorParametro(valor: unknown, unidad: string | null) {
  const v = texto(valor);
  if (unidad?.startsWith('USD')) return `$${v}`;
  if (/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(v)) return v.replace('-', '–');
  return unidad ? `${v} ${unidad}` : v;
}

/** Para acciones nuevas que aún no tienen texto: "estado: Nueva → Descartada · motivo: …". */
function cambioGenerico(antes: Record<string, unknown>, despues: Record<string, unknown>) {
  const claves = [...new Set([...Object.keys(antes), ...Object.keys(despues)])];
  return claves
    .filter((k) => antes[k] !== undefined || despues[k] !== undefined)
    .map((k) => (k in antes && k in despues ? `${k}: ${texto(antes[k])} → ${texto(despues[k])}` : `${k}: ${texto(despues[k] ?? antes[k])}`))
    .join(' · ');
}

/** Las registra el sistema sobre la cuenta afectada (como en el prototipo). */
export const ACCIONES_DEL_SISTEMA = ['login_fallido', 'cuenta_bloqueada'];

/** Un registro de la bitácora como se muestra en A20 y en el CSV. */
export function describir(e: EntradaBitacora, r: Referencias): EntradaLegible {
  const antes = obj(e.valorAnterior), despues = obj(e.valorNuevo);
  const id = e.entidadId ?? -1;
  const modulo = MODULOS.find((m) => m.codigo === e.modulo)?.nombre ?? e.modulo.charAt(0).toUpperCase() + e.modulo.slice(1);
  // Los intentos fallidos y el bloqueo los registra el sistema sobre la cuenta afectada (como en el prototipo).
  const delSistema = ACCIONES_DEL_SISTEMA.includes(e.accion) || !e.usuario;
  const usuario = delSistema ? 'sistema' : e.usuario!;
  const nombre = delSistema ? 'Sistema' : e.nombre || e.usuario!;
  const cuenta = r.usuarios.get(id) ?? '';
  const solicitud = r.solicitudes.get(id) ?? '';
  const deCita = texto(despues.solicitud) && e.accion === 'cita_programada' ? texto(despues.solicitud) : r.citas.get(id) ?? '';
  const l = (accion: string, registro: string, cambio: string): EntradaLegible => ({ nombre, usuario, modulo, accion, registro, cambio });

  switch (e.accion) {
    case 'login': return l('Inicio de sesión', cuenta, '');
    case 'logout': return l('Cierre de sesión', cuenta, '');
    case 'login_fallido': return l('Intento fallido', cuenta, 'Contraseña incorrecta');
    case 'cuenta_bloqueada': return l('Intentos fallidos', cuenta, 'Cuenta bloqueada por intentos fallidos');
    case 'recuperacion_solicitada': return l('Pidió cambiar su contraseña', cuenta, 'Se envió el enlace por correo');
    case 'contrasena_restablecida': return l('Contraseña cambiada', cuenta, 'Con el enlace de recuperación');
    case 'contrasena_cambiada': return l('Contraseña cambiada', cuenta, despues.temporal ? 'Reemplazó la contraseña temporal' : 'Cambió su contraseña');
    case 'auditoria_exportada': return l('Exportó el registro de actividad', 'Registro de actividad',
      `${diaCorto(texto(despues.desde))} – ${diaCorto(texto(despues.hasta))} · ${plural(despues.filas, 'fila', 'filas')}`);

    case 'parametro_modificado': {
      const p = r.parametros.get(id);
      return l('Parámetro', p?.etiqueta ?? texto(despues.clave), `${valorParametro(antes.valor, p?.unidad ?? null)} → ${valorParametro(despues.valor, p?.unidad ?? null)}`);
    }

    case 'solicitud_registrada': {
      const partes = [texto(despues.estado), plural(despues.muebles, 'mueble', 'muebles'), plural(despues.archivos, 'archivo', 'archivos')];
      if (CANALES[texto(despues.canal)]) partes.push(CANALES[texto(despues.canal)]!);
      if (despues.esperaFotos) partes.push('espera fotos');
      return l('Solicitud registrada', texto(despues.codigo) || solicitud, partes.join(' · '));
    }
    case 'fotos_recibidas': return l('Fotos recibidas', solicitud, plural(despues.archivos, 'archivo', 'archivos'));
    case 'solicitud_descartada': return l('Solicitud descartada', solicitud, `${texto(antes.estado)} → Descartada · “${texto(despues.motivo)}”`);
    case 'solicitud_vencida': return l('Solicitud vencida', solicitud, `${texto(antes.estado)} → Vencida · ${plural(despues.inasistencias, 'inasistencia', 'inasistencias')}`);

    case 'cita_programada': return l(despues.tipo === 'domicilio' ? 'Visita programada' : 'Cita programada', deCita, cuandoCita(despues));
    case 'cita_reprogramada': return l('Cita reprogramada', deCita, `${cuandoCita(antes)} → ${cuandoCita(despues)}`);
    case 'cita_cancelada': return l('Cita cancelada', deCita, 'Programada → Cancelada');
    case 'cita_atendida': return l('Cita atendida', deCita, `Solicitud: ${texto(antes.solicitud)} → ${texto(despues.solicitud)}`);
    case 'cita_inasistencia': return l('No asistió', deCita,
      `Solicitud: ${texto(antes.solicitud)} → ${texto(despues.solicitud)} · ${plural(despues.inasistencias, 'inasistencia', 'inasistencias')}`);
    case 'agenda_bloqueo': return l('Turno bloqueado', 'Agenda', `${cuandoCita(despues)} · ${texto(despues.motivo)}`);

    case 'usuario_creado': {
      const partes = [texto(despues.nombre), etiquetaRol(texto(despues.rol)), texto(despues.dispositivo)].filter(Boolean);
      return l('Usuario creado', texto(despues.email) || texto(despues.nombreUsuario) || cuenta, `${partes.join(' · ')} · contraseña temporal`);
    }
    case 'usuario_modificado': {
      const CAMPOS: Record<string, string> = { nombre: 'Nombre', rol: 'Rol', dispositivo: 'Dispositivo', email: 'Correo' };
      const valor = (campo: string, v: unknown) => (v == null || v === '' ? '—' : campo === 'rol' ? etiquetaRol(texto(v)) : texto(v));
      // Orden fijo: la base (jsonb) no conserva el orden de las claves.
      const campos = [...Object.keys(CAMPOS).filter((c) => c in despues), ...Object.keys(despues).filter((c) => !(c in CAMPOS))];
      const cambios = campos.map((c) => `${CAMPOS[c] ?? c}: ${valor(c, antes[c])} → ${valor(c, despues[c])}`);
      return l('Usuario editado', cuenta, cambios.join(' · '));
    }
    case 'usuario_desactivado': return l('Usuario desactivado', cuenta, 'Activo → Desactivado');
    case 'usuario_reactivado': return l('Usuario reactivado', cuenta, 'Desactivado → Activo');
    case 'contrasena_temporal': return l('Contraseña temporal', cuenta, 'Se generó una nueva; debe cambiarla al ingresar');

    // W10 Mi perfil (decisiones E.1).
    case 'cliente_actualizado': {
      const CAMPOS: Record<string, string> = { nombres: 'Nombres', apellidos: 'Apellidos', telefono: 'Teléfono', razonSocial: 'Empresa', cargo: 'Cargo' };
      const campos = Object.keys(CAMPOS).filter((c) => c in despues);
      return l('Datos del cliente', r.clientes.get(id) ?? '', campos.map((c) => `${CAMPOS[c]}: ${texto(antes[c]) || '—'} → ${texto(despues[c]) || '—'}`).join(' · '));
    }
    case 'correo_cambio_solicitado': return l('Pidió cambiar su correo', r.clientes.get(id) ?? '', `${texto(antes.email)} → ${texto(despues.email)} · falta confirmar`);
    case 'correo_cambiado': return l('Correo cambiado', r.clientes.get(id) ?? '', `${texto(antes.email)} → ${texto(despues.email)}`);
    // W10 › Avisos (E.3).
    case 'avisos_actualizados': {
      const NOMBRES: Record<string, string> = { informativos: 'Avisos informativos por correo', novedades: 'Recordatorios y novedades' };
      const siNo = (v: unknown) => (v ? 'Sí' : 'No');
      const campos = Object.keys(NOMBRES).filter((c) => c in despues);
      return l('Preferencias de avisos', r.clientes.get(id) ?? '', campos.map((c) => `${NOMBRES[c]}: ${siNo(antes[c])} → ${siNo(despues[c])}`).join(' · '));
    }
    // W10 › Direcciones de entrega (E.2).
    case 'direccion_agregada': return l('Dirección agregada', r.clientes.get(id) ?? '',
      `${[texto(despues.etiqueta), texto(despues.direccion)].filter(Boolean).join(' · ')}${despues.principal ? ' · principal' : ''}`);
    case 'direccion_principal': return l('Dirección principal', r.clientes.get(id) ?? '',
      `${texto(obj(antes).etiqueta) || texto(obj(antes).direccion) || '—'} → ${texto(despues.etiqueta) || texto(despues.direccion)}`);
    case 'direccion_quitada': {
      const nueva = obj(despues.nuevaPrincipal);
      const quitada = [texto(antes.etiqueta), texto(antes.direccion)].filter(Boolean).join(' · ');
      return l('Dirección quitada', r.clientes.get(id) ?? '', nueva.direccionId ? `${quitada} · nueva principal: ${texto(nueva.etiqueta) || texto(nueva.direccion)}` : quitada);
    }

    case 'cliente_registrado': {
      const tipo = despues.tipoPersona === 'empresa' ? 'Empresa' : 'Persona';
      const canal = CANALES[texto(despues.canalRegistro)];
      return l('Cliente registrado', r.clientes.get(id) ?? '', canal ? `${tipo} · ${canal}` : tipo);
    }
  }
  // Acción sin texto propio (de un módulo nuevo): se muestra igual, con los datos tal cual.
  const accion = e.accion.replace(/_/g, ' ');
  return l(accion.charAt(0).toUpperCase() + accion.slice(1), `${e.entidad}${e.entidadId != null ? ` #${e.entidadId}` : ''}`, cambioGenerico(antes, despues));
}

/**
 * Una celda de CSV. Va entre comillas si hace falta, y si empieza con = + - @ se le antepone un apóstrofo
 * para que Excel no la ejecute como fórmula (un motivo escrito por un usuario podría traer una).
 */
export function celdaCsv(valor: string) {
  const seguro = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
  return /[",\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

/** Filas → CSV con BOM, para que Excel lea bien las tildes y la ñ. */
export function armarCsv(encabezados: string[], filas: string[][]) {
  return '﻿' + [encabezados, ...filas].map((f) => f.map(celdaCsv).join(',')).join('\r\n') + '\r\n';
}
