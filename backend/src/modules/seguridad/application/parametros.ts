// CU-S05 Configurar parámetros (A14 · decisiones D.3).
import type { Parametro } from '@prisma/client';
import { prisma } from '../../../shared/infrastructure/prisma.js';
import { registrarBitacora } from '../../../shared/infrastructure/bitacora.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import { hoyNegocio } from '../../comercial/domain/calendario.js';
import { enNY, instanteNY } from '../../comercial/domain/agenda.js';
import { HORARIOS_AGENDA, fueraDeRangos, revisarCoherencia, validarValor, type ReglaParametro } from '../domain/parametros.js';

const PROVISIONAL = 'Provisional: por confirmar con el dueño';
const decimal = (d: Parametro['minimo']) => (d == null ? null : Number(d));
const regla = (p: Parametro): ReglaParametro => ({ tipo: p.tipo, unidad: p.unidad, minimo: decimal(p.minimo), maximo: decimal(p.maximo) });

const parametroDto = (p: Parametro) => ({
  clave: p.clave, etiqueta: p.etiqueta ?? p.clave, valor: p.valor, unidad: p.unidad, tipo: p.tipo,
  minimo: decimal(p.minimo), maximo: decimal(p.maximo), ayuda: p.ayuda,
  provisional: Boolean(p.ayuda?.includes(PROVISIONAL)),
});

/**
 * A14: los parámetros de negocio agrupados, en el orden de la pantalla.
 * Los que no tienen grupo no se muestran ni se pueden cambiar desde aquí (D.3.1).
 */
export async function listarParametros() {
  const filas = await prisma.parametro.findMany({ where: { grupo: { not: null } }, orderBy: [{ orden: 'asc' }, { id: 'asc' }] });
  const grupos: { nombre: string; parametros: ReturnType<typeof parametroDto>[] }[] = [];
  for (const p of filas) {
    let g = grupos.find((x) => x.nombre === p.grupo);
    if (!g) grupos.push((g = { nombre: p.grupo!, parametros: [] }));
    g.parametros.push(parametroDto(p));
  }
  return { grupos };
}

/** A14 › Historial de cambios: lo último primero, con quién y cuándo. */
export async function historialParametros(limite = 20) {
  const filas = await prisma.parametroHistorial.findMany({
    orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
    take: limite,
    include: { parametro: true, usuario: true },
  });
  return filas.map((h) => ({
    id: h.id, clave: h.parametro.clave, etiqueta: h.parametro.etiqueta ?? h.parametro.clave, unidad: h.parametro.unidad,
    valorAnterior: h.valorAnterior, valorNuevo: h.valorNuevo,
    usuario: h.usuario.nombre ?? h.usuario.nombreUsuario, fecha: h.fecha.toISOString(),
  }));
}

/**
 * Guarda varios cambios a la vez (A14 tiene un solo botón "Guardar cambios").
 *  - Si algún valor no es válido, no se guarda ninguno y se indica el error de cada campo.
 *  - Los valores que no cambiaron se ignoran (no llenan el historial).
 *  - Cada cambio queda en parametro_historial y en la bitácora (D.3.6, RG-02).
 *  - Cambiar el horario no se bloquea: se avisa qué citas quedaron fuera (D.3.5).
 */
export async function guardarParametros(usuarioId: number, cambios: { clave: string; valor: string }[], ip?: string) {
  const repetida = cambios.find((c, i) => cambios.findIndex((x) => x.clave === c.clave) !== i);
  if (repetida) throw new ReglaNegocioError(`El parámetro "${repetida.clave}" viene dos veces.`);

  const cambiados = await prisma.$transaction(async (tx) => {
    const filas = await tx.parametro.findMany({ where: { grupo: { not: null } } });
    const porClave = new Map(filas.map((p) => [p.clave, p]));
    const errores: Record<string, string> = {};
    const nuevos = new Map<string, string>();

    for (const c of cambios) {
      const p = porClave.get(c.clave);
      if (!p) {
        errores[c.clave] = 'Este parámetro no existe o no se puede cambiar desde aquí.';
        continue;
      }
      const r = validarValor(regla(p), c.valor);
      if ('error' in r) errores[c.clave] = r.error;
      else if (r.valor !== p.valor) nuevos.set(c.clave, r.valor);
    }
    const valores = new Map(filas.map((p) => [p.clave, nuevos.get(p.clave) ?? p.valor]));
    for (const [clave, mensaje] of Object.entries(revisarCoherencia(valores, new Set(nuevos.keys())))) errores[clave] ??= mensaje;

    const conError = Object.keys(errores);
    if (conError.length) {
      const primero = porClave.get(conError[0]!);
      const mensaje = conError.length === 1 && primero
        ? `${primero.etiqueta ?? primero.clave}: ${errores[conError[0]!]} No se guardó ningún cambio.`
        : `Revise los ${conError.length} valores marcados. No se guardó ningún cambio.`;
      throw new ReglaNegocioError(mensaje, 400, errores);
    }

    for (const [clave, valor] of nuevos) {
      const p = porClave.get(clave)!;
      await tx.parametro.update({ where: { id: p.id }, data: { valor, modificadoPor: usuarioId, fechaModificacion: new Date() } });
      await tx.parametroHistorial.create({ data: { parametroId: p.id, valorAnterior: p.valor, valorNuevo: valor, usuarioId } });
      await registrarBitacora(tx, {
        usuarioId, modulo: 'seguridad', accion: 'parametro_modificado', entidad: 'parametro', entidadId: p.id,
        valorAnterior: { clave, valor: p.valor }, valorNuevo: { clave, valor }, ip,
      });
    }
    return [...nuevos.keys()];
  });

  const tocaHorario = cambiados.some((c) => HORARIOS_AGENDA.includes(c));
  return {
    cambiados,
    ...(await listarParametros()),
    avisos: { citasFueraDeHorario: tocaHorario ? await citasFueraDeHorario() : [] },
  };
}

const nombreCliente = (c: { tipoPersona: string; razonSocial: string | null; nombres: string; apellidos: string }) =>
  c.tipoPersona === 'empresa' && c.razonSocial ? c.razonSocial : `${c.nombres} ${c.apellidos}`.trim();

/**
 * D.3.5: citas programadas desde hoy que ya no entran en el horario vigente. No se tocan: se listan para que el
 * Administrador las reprograme. Las visitas sin hora fija solo dependen de la franja (mañana o tarde), que sigue existiendo.
 */
export async function citasFueraDeHorario() {
  const valores = new Map(
    (await prisma.parametro.findMany({ where: { clave: { in: HORARIOS_AGENDA } } })).map((p) => [p.clave, p.valor]),
  );
  const rangosLocal = [valores.get('agenda.turnos_manana') ?? '', valores.get('agenda.turnos_tarde') ?? ''];
  const citas = await prisma.cita.findMany({
    where: { estado: 'Programada', fechaHora: { gte: instanteNY(hoyNegocio()) } },
    orderBy: { fechaHora: 'asc' },
    include: { solicitud: { include: { cliente: true } } },
  });

  return citas.flatMap((c) => {
    const { fecha, hora } = enNY(c.fechaHora);
    const visitaSinHora = c.tipo === 'domicilio' && hora === '00:00';
    if (visitaSinHora) return [];
    const franjas = c.franja ? [c.franja] : ['manana', 'tarde'];
    const rangos = c.tipo === 'local' ? rangosLocal : franjas.map((f) => valores.get(`visita.franja_${f}`) ?? '');
    if (!fueraDeRangos(hora, c.duracionMin, rangos)) return [];
    return [{ citaId: c.id, solicitud: c.solicitud.codigo, cliente: nombreCliente(c.solicitud.cliente), tipo: c.tipo, fecha, hora, franja: c.franja }];
  });
}
