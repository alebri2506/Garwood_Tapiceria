import { prisma } from '../../../shared/infrastructure/prisma.js';
import { parametroNumero } from '../../../shared/infrastructure/parametros.js';
import { registrarBitacora } from '../../../shared/infrastructure/bitacora.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import { LIMITE_BYTES, firmaValida, formatoDe, type AlmacenArchivos, type ArchivoSubido } from '../../../shared/infrastructure/archivos.js';
import { avisoAlCliente, avisosAlTaller, enviarCorreos, guardarAvisos, type Aviso } from '../../../shared/infrastructure/avisos.js';
import type { Correo } from '../../../shared/infrastructure/correo.js';
import { motivoSinRecojo } from '../domain/calendario.js';
import { codigoSolicitud, estadoInicial, hayRecojo, necesitaCita, siguientePaso } from '../domain/solicitud.js';
import type { SolicitudEntrada } from '../http/solicitud.schemas.js';
import { citaDto, revisarTurno, tipoCitaDe, turnoOcupado } from './citas.js';
import { idDireccion, revisarDireccion } from './direcciones.js';

const error = (mensaje: string) => new ReglaNegocioError(mensaje, 400);
const CAMPO_ARCHIVO = /^mueble_(\d+)$/;
const MB = 1024 * 1024;

/**
 * Agrupa los archivos por mueble y revisa formato, tamaño y que cada mueble tenga al menos una foto
 * (salvo que se le hayan pedido al cliente por enlace).
 */
export async function archivosPorMueble(archivos: ArchivoSubido[], nMuebles: number, maxPorMueble: number, exigirFoto = true) {
  const grupos: ArchivoSubido[][] = Array.from({ length: nMuebles }, () => []);
  for (const a of archivos) {
    const i = Number(CAMPO_ARCHIVO.exec(a.fieldname)?.[1] ?? -1);
    if (i < 0 || i >= nMuebles) throw error('Hay un archivo que no corresponde a ningún mueble.');
    const formato = formatoDe(a.mimetype);
    if (!formato) throw error(`«${a.originalname}» no es una foto ni un video aceptado (JPG, PNG, WEBP, HEIC, MP4, MOV o WEBM).`);
    if (a.size > LIMITE_BYTES[formato.tipo]) {
      throw error(`«${a.originalname}» pesa más de ${LIMITE_BYTES[formato.tipo] / MB} MB.`);
    }
    if (!(await firmaValida(a))) throw error(`«${a.originalname}» está dañado o no es del tipo que dice ser.`);
    grupos[i]!.push(a);
  }
  grupos.forEach((g, i) => {
    const n = nMuebles > 1 ? ` del mueble ${i + 1}` : '';
    if (g.length > maxPorMueble) throw error(`Suba hasta ${maxPorMueble} fotos o videos${n}.`);
    if (exigirFoto && !g.some((a) => formatoDe(a.mimetype)!.tipo === 'foto')) throw error(`Suba al menos una foto${n}.`);
  });
  return grupos;
}

/** Revisa los muebles y sus telas contra el catálogo: tipos activos, partes del mueble y solo telas activas. */
async function revisarCatalogo(e: SolicitudEntrada) {
  const ids = [...new Set(e.muebles.map((m) => m.tipoMuebleId))];
  const tipos = await prisma.tipoMueble.findMany({ where: { id: { in: ids }, activo: true }, include: { partes: true } });
  if (tipos.length !== ids.length) throw error('Uno de los tipos de mueble ya no está disponible. Elija otro.');

  if (e.tela !== 'catalogo') return;
  const materiales = [...new Set(e.muebles.flatMap((m) => m.telas.map((t) => t.materialId)))];
  const activas = await prisma.material.count({ where: { id: { in: materiales }, categoria: 'tela', activo: true } });
  if (activas !== materiales.length) throw error('Una de las telas elegidas ya no está disponible. Elija otra.');

  e.muebles.forEach((m, i) => {
    const n = e.muebles.length > 1 ? ` del mueble ${i + 1}` : '';
    if (m.modoTela !== 'partes') {
      if (new Set(m.telas.map((t) => t.materialId)).size !== m.telas.length) throw error(`Hay telas repetidas${n}.`);
      return;
    }
    const partes = tipos.find((t) => t.id === m.tipoMuebleId)!.partes.map((p) => p.id);
    const elegidas = m.telas.map((t) => t.parteId!);
    if (elegidas.some((p) => !partes.includes(p))) throw error(`Una de las partes${n} no corresponde al mueble.`);
    if (new Set(elegidas).size !== elegidas.length || elegidas.length !== partes.length) {
      throw error(`Elija una tela para cada parte${n}.`);
    }
  });
}

export type Canal = 'web' | 'telefono' | 'local' | 'correo' | 'mensaje';

/** Quién registra: el cliente desde la web o el Administrador por el cliente (teléfono, local, correo o mensaje). */
export interface Solicitante {
  usuarioId: number;
  clienteId: number;
  canal: Canal;
  /** Solo el Administrador: las fotos se piden al cliente por enlace y llegan después. */
  esperaFotos?: boolean;
  /** Avisar al cliente por correo (el Administrador puede no hacerlo). */
  avisar?: boolean;
}

/** CU-C01 Registrar solicitud de cotización. */
export async function registrarSolicitud(e: SolicitudEntrada, archivos: ArchivoSubido[], quien: Solicitante, deps: { almacen: AlmacenArchivos; correo: Correo }, ip?: string) {
  const { clienteId } = quien;
  const [maxMuebles, maxArchivos, diasRecojo] = await Promise.all([
    parametroNumero(prisma, 'solicitud.max_muebles'),
    parametroNumero(prisma, 'solicitud.max_archivos_mueble'),
    parametroNumero(prisma, 'recojo.dias_anticipacion_max'),
  ]);
  if (e.muebles.length > maxMuebles) throw error(`Puede pedir hasta ${maxMuebles} muebles por solicitud.`);

  // Lo que no aplica a la opción elegida no se guarda (p. ej. la fecha de recojo cuando hay cita).
  const cita = necesitaCita(e.tela);
  const delivery = !cita && e.traslado === 'delivery';
  const conRecojo = delivery && hayRecojo(e.muebles.map((m) => m.servicio));
  // En persona no hay enlace que pedir: las fotos se toman ahí mismo.
  const esperaFotos = Boolean(quien.esperaFotos) && quien.canal !== 'local' && quien.canal !== 'web';

  const grupos = await archivosPorMueble(archivos, e.muebles.length, maxArchivos, !esperaFotos);
  await revisarCatalogo(e);
  await revisarDireccion(delivery ? e.direccion : undefined, clienteId);
  // W3 / W3b: desde la web la solicitud con cita se envía junto con el turno elegido (último paso del asistente).
  if (cita && quien.canal === 'web' && !e.cita) throw error(e.tela === 'domicilio' ? 'Elija el día de la visita.' : 'Elija el día y la hora de su cita.');
  const tipoCita = tipoCitaDe(e.tela);
  // Desde la web el cliente elige la franja de la visita; la hora la fija solo el taller.
  const turno = cita && e.cita ? await revisarTurno(tipoCita, tipoCita === 'domicilio' && quien.canal === 'web' ? { fecha: e.cita.fecha, franja: e.cita.franja } : e.cita) : null;
  if (turno && tipoCita === 'domicilio') await revisarDireccion(e.cita!.direccion, clienteId);
  if (conRecojo) {
    const motivo = motivoSinRecojo(e.fechaPrefRecojo!, diasRecojo);
    if (motivo) throw error(motivo);
  }

  // Los archivos pasan a su lugar definitivo antes de la transacción; si algo falla, se borran.
  const guardados: string[] = [];
  try {
    const rutas = await guardarGrupos(grupos, deps.almacen, guardados);
    let avisos: Aviso[] = [];

    const solicitud = await prisma.$transaction(async (tx) => {
      const direccionId = delivery ? await idDireccion(tx, e.direccion, clienteId) : null;
      const creada = await tx.solicitud.create({
        data: {
          clienteId,
          canal: quien.canal,
          telaOpcion: e.tela,
          mismaTela: e.muebles.length === 1 || e.mismaTela,
          telaDescripcion: e.tela === 'trae' || cita ? e.telaDescripcion ?? null : null,
          telaConocida: e.tela === 'catalogo' ? e.telaConocida ?? null : null,
          traslado: cita ? null : e.traslado!,
          direccionId,
          fechaPrefRecojo: conRecojo ? new Date(`${e.fechaPrefRecojo}T00:00:00Z`) : null,
          franjaRecojo: conRecojo ? e.franjaRecojo! : null,
          estado: estadoInicial(e.tela),
          esperaFotos,
          registradoPor: quien.usuarioId,
        },
      });
      const codigo = codigoSolicitud(creada.id);
      await tx.solicitud.update({ where: { id: creada.id }, data: { codigo } });

      for (const [i, m] of e.muebles.entries()) {
        await tx.solicitudMueble.create({
          data: {
            solicitudId: creada.id,
            orden: i + 1,
            tipoMuebleId: m.tipoMuebleId,
            servicio: m.servicio,
            acabado: m.servicio === 'fabricacion' ? m.acabado! : null,
            cantidad: m.cantidad,
            medidas: m.medidas ?? null,
            modoTela: e.tela === 'catalogo' ? m.modoTela ?? 'una' : null,
            telas: e.tela === 'catalogo'
              ? { create: m.telas.map((t, k) => ({ materialId: t.materialId, parteId: m.modoTela === 'partes' ? t.parteId! : null, orden: k + 1 })) }
              : undefined,
            adjuntos: { create: adjuntosDe(grupos[i]!, rutas[i]!) },
          },
        });
      }

      await registrarBitacora(tx, {
        usuarioId: quien.usuarioId, modulo: 'comercial', accion: 'solicitud_registrada', entidad: 'solicitud', entidadId: creada.id,
        valorNuevo: { codigo, estado: creada.estado, canal: quien.canal, tela: e.tela, muebles: e.muebles.length, archivos: archivos.length, esperaFotos },
        ip,
      });

      // La cita o visita elegida en el último paso queda en la misma transacción: o se guardan las dos, o ninguna.
      const citaCreada = turno ? await tx.cita.create({
        data: {
          solicitudId: creada.id, tipo: tipoCita, fechaHora: turno.fechaHora, franja: turno.franja, duracionMin: turno.duracion,
          direccionId: tipoCita === 'domicilio' ? await idDireccion(tx, e.cita!.direccion, clienteId) : null,
          reprogramaciones: 0, estado: 'Programada', registradoPor: quien.usuarioId,
        },
      }) : null;
      if (citaCreada) {
        await registrarBitacora(tx, {
          usuarioId: quien.usuarioId, modulo: 'comercial', accion: 'cita_programada', entidad: 'cita', entidadId: citaCreada.id,
          valorNuevo: { solicitud: codigo, tipo: tipoCita, fecha: e.cita!.fecha, hora: e.cita!.hora ?? null, franja: e.cita!.franja ?? null }, ip,
        });
      }

      // RG-05: el cliente recibe el aviso (si el Administrador no lo desmarcó) y el taller ve la solicitud nueva.
      const siguiente = siguientePaso(e.tela);
      const queSigue = esperaFotos
        ? 'Suba las fotos de su mueble desde Mis pedidos › Solicitudes: con ellas armamos su cotización.'
        : turno ? `${tipoCita === 'local' ? 'Su cita en el taller' : 'La visita a su casa'} quedó para el ${turno.texto}. Puede reprogramarla o cancelarla desde Mis pedidos › Solicitudes.`
          : siguiente === 'cita' ? 'Elija el día y la hora de su cita en el local desde Mis pedidos › Solicitudes.'
            : siguiente === 'visita' ? 'Elija el día de la visita a su casa desde Mis pedidos › Solicitudes.'
              : 'El taller arma su cotización con sus fotos y le avisa por aquí y por correo.';
      avisos = [
        ...(quien.avisar === false ? [] : await avisoAlCliente(tx, clienteId,
          { solicitudId: creada.id, tipo: 'solicitud_registrada', titulo: `Recibimos su solicitud ${codigo}`, mensaje: queSigue, enlace: '/cliente/pedidos/solicitudes' },
          `GARWEB · Recibimos su solicitud ${codigo}`, `Recibimos su solicitud de cotización ${codigo}.\n\n${queSigue}`)),
        ...(quien.canal === 'web'
          ? await avisosAlTaller(tx, { solicitudId: creada.id, tipo: 'solicitud_nueva', titulo: `Nueva solicitud ${codigo}`, mensaje: `${e.muebles.length} ${e.muebles.length === 1 ? 'mueble' : 'muebles'} · ${turno ? `${tipoCita === 'local' ? 'cita' : 'visita'} el ${turno.texto}` : creada.estado}`, enlace: turno ? '/admin/agenda' : '/admin/solicitudes' })
          : []),
      ];
      await guardarAvisos(tx, avisos);
      return { ...creada, codigo, siguiente, cita: citaCreada };
    });

    await enviarCorreos(deps.correo, avisos);
    return { codigo: solicitud.codigo, estado: solicitud.estado, siguiente: solicitud.siguiente, esperaFotos, cita: solicitud.cita ? citaDto(solicitud.cita) : null };
  } catch (err) {
    await Promise.all(guardados.map((r) => deps.almacen.eliminar(r)));
    if (turnoOcupado(err)) throw new ReglaNegocioError(tipoCita === 'local' ? 'Ese turno se acaba de ocupar. Elija otro.' : 'Esa franja se acaba de ocupar. Elija otra.', 409);
    throw err;
  }
}

/** Guarda los archivos de cada mueble en el almacén y devuelve sus rutas (anota todo lo guardado para poder deshacerlo). */
export async function guardarGrupos(grupos: ArchivoSubido[][], almacen: AlmacenArchivos, guardados: string[]) {
  const carpeta = `solicitudes/${new Date().toISOString().slice(0, 7)}`;
  const rutas: string[][] = [];
  for (const g of grupos) {
    const r: string[] = [];
    for (const a of g) {
      const ruta = await almacen.guardar(a, carpeta);
      guardados.push(ruta);
      r.push(ruta);
    }
    rutas.push(r);
  }
  return rutas;
}

export const adjuntosDe = (archivos: ArchivoSubido[], rutas: string[]) => archivos.map((a, k) => ({
  tipo: formatoDe(a.mimetype)!.tipo, nombreOriginal: a.originalname.slice(0, 160), ruta: rutas[k]!, mime: a.mimetype, tamanoBytes: a.size,
}));
