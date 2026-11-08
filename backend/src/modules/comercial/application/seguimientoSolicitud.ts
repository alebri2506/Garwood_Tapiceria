import type { Prisma } from '@prisma/client';
import { prisma } from '../../../shared/infrastructure/prisma.js';
import { parametroNumero } from '../../../shared/infrastructure/parametros.js';
import { registrarBitacora } from '../../../shared/infrastructure/bitacora.js';
import { avisoAlCliente, avisosAlTaller, enviarCorreos, guardarAvisos, type Aviso } from '../../../shared/infrastructure/avisos.js';
import type { AlmacenArchivos, ArchivoSubido } from '../../../shared/infrastructure/archivos.js';
import type { Correo } from '../../../shared/infrastructure/correo.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import { SERVICIOS } from '../domain/solicitud.js';
import { citaDto } from './citas.js';
import { adjuntosDe, archivosPorMueble, guardarGrupos } from './registrarSolicitud.js';

const error = (m: string, status = 400) => new ReglaNegocioError(m, status);
/** Los enlaces a las fotos duran poco: los archivos son privados. */
export const SEGUNDOS_ENLACE = 15 * 60;

export const incluirSolicitud = {
  cliente: { include: { direcciones: false } },
  direccion: true,
  muebles: {
    orderBy: { orden: 'asc' },
    include: {
      tipoMueble: true,
      telas: { orderBy: { orden: 'asc' }, include: { material: true, parte: true } },
      adjuntos: { orderBy: { id: 'asc' } },
    },
  },
  citas: { orderBy: { fechaRegistro: 'asc' }, include: { direccion: true } },
} satisfies Prisma.SolicitudInclude;

export type SolicitudCompleta = Prisma.SolicitudGetPayload<{ include: typeof incluirSolicitud }>;

const nombreServicio = (codigo: string) => SERVICIOS.find((s) => s.codigo === codigo)?.nombre.replace(' (desde una foto)', '') ?? codigo;

/** Lo que cualquiera de los dos roles puede ver de la solicitud (sin costos ni datos internos: RG-08). */
export async function solicitudDto(s: SolicitudCompleta, almacen: AlmacenArchivos) {
  const citaActual = [...s.citas].reverse().find((c) => c.estado !== 'Reprogramada') ?? null;
  const inasistencias = s.citas.filter((c) => c.estado === 'No asistió').length;
  return {
    codigo: s.codigo!,
    estado: s.estado,
    fecha: s.fechaSolicitud,
    canal: s.canal,
    tela: s.telaOpcion,
    mismaTela: s.mismaTela,
    telaDescripcion: s.telaDescripcion,
    telaConocida: s.telaConocida,
    esperaFotos: s.esperaFotos,
    traslado: s.traslado,
    direccion: s.direccion?.direccion ?? null,
    fechaPrefRecojo: s.fechaPrefRecojo?.toISOString().slice(0, 10) ?? null,
    franjaRecojo: s.franjaRecojo,
    motivoDescarte: s.motivoDescarte,
    fechaDescarte: s.fechaDescarte,
    cita: citaActual ? { ...citaDto(citaActual), direccion: citaActual.direccion?.direccion ?? null } : null,
    inasistencias,
    muebles: await Promise.all(s.muebles.map(async (m) => ({
      orden: m.orden,
      tipo: m.tipoMueble.nombre,
      tipoCodigo: m.tipoMueble.codigo,
      servicio: m.servicio,
      servicioNombre: nombreServicio(m.servicio),
      acabado: m.acabado,
      cantidad: m.cantidad,
      medidas: m.medidas,
      modoTela: m.modoTela,
      telas: m.telas.map((t) => ({ id: t.material.id, nombre: t.material.nombre, pattern: t.material.pattern, numeroColor: t.material.numeroColor, colorHex: t.material.colorHex, familia: t.material.familia, parte: t.parte?.nombre ?? null })),
      archivos: await Promise.all(m.adjuntos.map(async (a) => ({
        id: a.id, tipo: a.tipo, nombre: a.nombreOriginal, url: await almacen.urlTemporal(a.ruta, SEGUNDOS_ENLACE).catch(() => null),
      }))),
    }))),
  };
}

async function clienteDe(usuarioId: number) {
  const u = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!u?.clienteId) throw error('Solo un cliente puede ver sus solicitudes.', 403);
  return u.clienteId;
}

/** Solo las solicitudes del cliente con sesión (RG-07). */
async function propia(usuarioId: number, codigo: string) {
  const clienteId = await clienteDe(usuarioId);
  const s = await prisma.solicitud.findUnique({ where: { codigo }, include: incluirSolicitud });
  if (!s || s.clienteId !== clienteId) throw error('No encontramos esa solicitud.', 404);
  return s;
}

/** W6c: las solicitudes del cliente, de la más reciente a la más antigua. */
export async function misSolicitudes(usuarioId: number, almacen: AlmacenArchivos) {
  const clienteId = await clienteDe(usuarioId).catch(() => null);
  if (!clienteId) return [];
  const lista = await prisma.solicitud.findMany({ where: { clienteId }, orderBy: { fechaSolicitud: 'desc' }, include: incluirSolicitud });
  return Promise.all(lista.map((s) => solicitudDto(s, almacen)));
}

export async function miSolicitud(usuarioId: number, codigo: string, almacen: AlmacenArchivos) {
  return solicitudDto(await propia(usuarioId, codigo), almacen);
}

/** El cliente sube las fotos que le pidió el taller por enlace. */
export async function subirFotosPendientes(usuarioId: number, codigo: string, archivos: ArchivoSubido[], deps: { almacen: AlmacenArchivos; correo: Correo }, ip?: string) {
  const s = await propia(usuarioId, codigo);
  if (!s.esperaFotos) throw error('Esta solicitud ya tiene sus fotos.');
  const maxArchivos = await parametroNumero(prisma, 'solicitud.max_archivos_mueble');
  const grupos = await archivosPorMueble(archivos, s.muebles.length, maxArchivos);
  const guardados: string[] = [];
  try {
    const rutas = await guardarGrupos(grupos, deps.almacen, guardados);
    let avisos: Aviso[] = [];
    await prisma.$transaction(async (tx) => {
      for (const [i, m] of s.muebles.entries()) {
        await tx.solicitudAdjunto.createMany({ data: adjuntosDe(grupos[i]!, rutas[i]!).map((a) => ({ ...a, solicitudMuebleId: m.id })) });
      }
      await tx.solicitud.update({ where: { id: s.id }, data: { esperaFotos: false } });
      await registrarBitacora(tx, { usuarioId, modulo: 'comercial', accion: 'fotos_recibidas', entidad: 'solicitud', entidadId: s.id, valorNuevo: { archivos: archivos.length }, ip });
      avisos = [
        ...(await avisosAlTaller(tx, { solicitudId: s.id, tipo: 'fotos_recibidas', titulo: `Llegaron las fotos · ${s.codigo}`, mensaje: 'Ya se puede cotizar.', enlace: '/admin/solicitudes' })),
        ...(await avisoAlCliente(tx, s.clienteId, { solicitudId: s.id, tipo: 'fotos_recibidas', titulo: 'Recibimos sus fotos', mensaje: `${s.codigo} · con ellas armamos su cotización.`, enlace: '/cliente/pedidos/solicitudes' },
          `GARWEB · Recibimos sus fotos (${s.codigo})`, 'Recibimos las fotos de su mueble. Con ellas armamos su cotización y le avisamos por aquí y por correo.')),
      ];
      await guardarAvisos(tx, avisos);
    });
    await enviarCorreos(deps.correo, avisos);
  } catch (err) {
    await Promise.all(guardados.map((r) => deps.almacen.eliminar(r)));
    throw err;
  }
  return miSolicitud(usuarioId, codigo, deps.almacen);
}
