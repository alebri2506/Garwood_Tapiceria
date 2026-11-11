// CU-S06 Consultar y exportar la auditoría (A20 › Registro de actividad · decisiones D.2).
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../shared/infrastructure/prisma.js';
import { registrarBitacora } from '../../../shared/infrastructure/bitacora.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import { hoyNegocio, leerFecha } from '../../comercial/domain/calendario.js';
import { enNY, instanteNY, sumarDias } from '../../comercial/domain/agenda.js';
import { ACCIONES_DEL_SISTEMA, MODULOS, TIPOS_ACTOR, armarCsv, describir, type Referencias } from '../domain/auditoria.js';

export interface FiltrosAuditoria {
  desde?: string;
  hasta?: string;
  usuarioId?: number;
  /** Filtro "Quién": personal del taller, clientes o sistema. */
  tipo?: (typeof TIPOS_ACTOR)[number]['codigo'];
  modulo?: string;
  q?: string;
}

/** Tope de filas por consulta: el buscador filtra el texto ya armado, así que se cargan todas las del período. */
export const LIMITE_FILAS = 10_000;
/** D.2.1: por defecto, los últimos 30 días (hoy incluido). */
export const DIAS_POR_DEFECTO = 30;

/** Período pedido en días de Nueva Jersey. */
export function periodo(f: Pick<FiltrosAuditoria, 'desde' | 'hasta'>, hoy = hoyNegocio()) {
  const hasta = f.hasta && leerFecha(f.hasta) ? f.hasta : hoy;
  const desde = f.desde && leerFecha(f.desde) ? f.desde : sumarDias(hasta, -(DIAS_POR_DEFECTO - 1));
  if (desde > hasta) throw new ReglaNegocioError('La fecha de inicio debe ser anterior o igual a la fecha de fin.');
  return { desde, hasta };
}

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nombreCliente = (c: { tipoPersona: string; razonSocial: string | null; nombres: string; apellidos: string }) =>
  c.tipoPersona === 'empresa' && c.razonSocial ? c.razonSocial : `${c.nombres} ${c.apellidos}`.trim();

/** Busca de una vez los códigos y nombres que se muestran en la columna "Registro". */
async function referencias(filas: { entidad: string; entidadId: number | null }[]): Promise<Referencias> {
  const ids = (entidad: string) => [...new Set(filas.filter((f) => f.entidad === entidad && f.entidadId != null).map((f) => f.entidadId!))];
  const [solicitudes, citas, parametros, usuarios, clientes] = await Promise.all([
    prisma.solicitud.findMany({ where: { id: { in: ids('solicitud') } }, select: { id: true, codigo: true } }),
    prisma.cita.findMany({ where: { id: { in: ids('cita') } }, select: { id: true, solicitud: { select: { codigo: true } } } }),
    prisma.parametro.findMany({ where: { id: { in: ids('parametro') } }, select: { id: true, clave: true, etiqueta: true, unidad: true } }),
    prisma.usuario.findMany({ where: { id: { in: ids('usuario') } }, select: { id: true, nombreUsuario: true } }),
    prisma.cliente.findMany({ where: { id: { in: ids('cliente') } }, select: { id: true, tipoPersona: true, razonSocial: true, nombres: true, apellidos: true } }),
  ]);
  return {
    solicitudes: new Map(solicitudes.map((s) => [s.id, s.codigo ?? ''])),
    citas: new Map(citas.map((c) => [c.id, c.solicitud.codigo ?? ''])),
    parametros: new Map(parametros.map((p) => [p.id, { etiqueta: p.etiqueta ?? p.clave, unidad: p.unidad }])),
    usuarios: new Map(usuarios.map((u) => [u.id, u.nombreUsuario])),
    clientes: new Map(clientes.map((c) => [c.id, nombreCliente(c)])),
  };
}

/** Registros del período, del más nuevo al más antiguo, ya en texto legible y filtrados. */
async function consultar(f: FiltrosAuditoria) {
  const { desde, hasta } = periodo(f);
  const where: Prisma.BitacoraWhereInput = { fecha: { gte: instanteNY(desde), lt: instanteNY(sumarDias(hasta, 1)) } };
  if (f.usuarioId) where.usuarioId = f.usuarioId;
  if (f.modulo) where.modulo = f.modulo;
  if (f.tipo === 'sistema') where.OR = [{ usuarioId: null }, { accion: { in: ACCIONES_DEL_SISTEMA } }];
  if (f.tipo === 'personal' || f.tipo === 'clientes') {
    where.accion = { notIn: ACCIONES_DEL_SISTEMA };
    where.usuario = { rol: { nombre: f.tipo === 'clientes' ? 'Cliente' : { not: 'Cliente' } } };
  }

  const filas = await prisma.bitacora.findMany({
    where,
    orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
    take: LIMITE_FILAS + 1,
    include: { usuario: { select: { nombreUsuario: true, nombre: true, cliente: { select: { tipoPersona: true, razonSocial: true, nombres: true, apellidos: true } } } } },
  });
  const truncado = filas.length > LIMITE_FILAS;
  if (truncado) filas.pop();

  const refs = await referencias(filas);
  let registros = filas.map((b) => ({
    id: b.id, fecha: b.fecha, ip: b.ip,
    ...describir({ ...b, usuario: b.usuario?.nombreUsuario ?? null, nombre: b.usuario && (b.usuario.cliente ? nombreCliente(b.usuario.cliente) : b.usuario.nombre) }, refs),
  }));
  // "Buscar por nombre, correo, solicitud o acción": sobre el texto que ve el Administrador, sin importar tildes ni
  // mayúsculas. Así se encuentra a una persona aunque haya muchos clientes.
  const q = sinTildes(f.q?.trim() ?? '');
  if (q) registros = registros.filter((r) => sinTildes([r.nombre, r.usuario, r.modulo, r.accion, r.registro, r.cambio].join(' ')).includes(q));
  return { desde, hasta, registros, truncado };
}

/** A20 › Registro de actividad: una página de resultados y las opciones de los filtros. */
export async function listarActividad(f: FiltrosAuditoria, pagina = 1, porPagina = 50) {
  const r = await consultar(f);
  const inicio = (pagina - 1) * porPagina;
  return {
    desde: r.desde, hasta: r.hasta, truncado: r.truncado,
    total: r.registros.length, pagina, porPagina,
    registros: r.registros.slice(inicio, inicio + porPagina).map((x) => ({ ...x, fecha: x.fecha.toISOString() })),
    opciones: { tipos: TIPOS_ACTOR, modulos: MODULOS },
  };
}

/**
 * D.2.1: exporta a CSV con los mismos filtros de la pantalla. Exportar también queda en la bitácora,
 * para saber quién se llevó el registro y de qué período.
 */
export async function exportarActividad(usuarioId: number, f: FiltrosAuditoria, ip?: string) {
  const r = await consultar(f);
  const csv = armarCsv(
    ['Fecha y hora', 'Nombre', 'Correo o usuario', 'Módulo', 'Acción', 'Registro', 'Antes → después', 'IP'],
    r.registros.map((x) => {
      const { fecha, hora } = enNY(x.fecha);
      return [`${fecha} ${hora}`, x.nombre, x.usuario, x.modulo, x.accion, x.registro, x.cambio, x.ip ?? ''];
    }),
  );
  await registrarBitacora(prisma, {
    usuarioId, modulo: 'seguridad', accion: 'auditoria_exportada', entidad: 'bitacora',
    valorNuevo: { desde: r.desde, hasta: r.hasta, filas: r.registros.length, usuarioId: f.usuarioId ?? null, tipo: f.tipo ?? null, modulo: f.modulo ?? null, q: f.q ?? null },
    ip,
  });
  return { csv, nombre: `garweb-actividad-${r.desde}-a-${r.hasta}.csv`, truncado: r.truncado };
}
