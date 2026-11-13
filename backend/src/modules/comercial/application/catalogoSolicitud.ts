import { prisma } from '../../../shared/infrastructure/prisma.js';
import { parametroNumero, parametroTexto } from '../../../shared/infrastructure/parametros.js';
import { LIMITE_BYTES, MIMES_ACEPTADOS } from '../../../shared/infrastructure/archivos.js';
import { ACABADOS, SERVICIOS } from '../domain/solicitud.js';

/**
 * Lo que el asistente W2 necesita para armar la solicitud: muebles con sus partes, servicios, telas activas y franjas.
 * `soloWeb` (el cliente): solo las telas marcadas «Mostrar al cliente en Telas en línea» (A15b); el Administrador ve todas.
 */
export async function consultarCatalogo(soloWeb = false) {
  const [tipos, telas, maxMuebles, maxArchivos, diasRecojo, manana, tarde] = await Promise.all([
    prisma.tipoMueble.findMany({ where: { activo: true }, orderBy: { orden: 'asc' }, include: { partes: { orderBy: { orden: 'asc' } } } }),
    // CU-C01: solo telas activas.
    prisma.material.findMany({ where: { categoria: 'tela', activo: true, ...(soloWeb ? { enWeb: true } : {}) }, orderBy: [{ familia: 'asc' }, { nombre: 'asc' }] }),
    parametroNumero(prisma, 'solicitud.max_muebles'),
    parametroNumero(prisma, 'solicitud.max_archivos_mueble'),
    parametroNumero(prisma, 'recojo.dias_anticipacion_max'),
    parametroTexto(prisma, 'taller.franja_manana'),
    parametroTexto(prisma, 'taller.franja_tarde'),
  ]);
  return {
    tiposMueble: tipos.map((t) => ({ id: t.id, codigo: t.codigo, nombre: t.nombre, partes: t.partes.map((p) => ({ id: p.id, nombre: p.nombre })) })),
    servicios: SERVICIOS,
    acabados: ACABADOS,
    telas: telas.map((t) => ({
      id: t.id, nombre: t.nombre, familia: t.familia, pattern: t.pattern, numeroColor: t.numeroColor, colorHex: t.colorHex, descripcion: t.descripcion,
    })),
    // A14 guarda el horario como "09:00-12:00"; al cliente se le muestra "09:00–12:00".
    franjas: [{ codigo: 'manana', nombre: `Mañana · ${manana.replace('-', '–')}` }, { codigo: 'tarde', nombre: `Tarde · ${tarde.replace('-', '–')}` }],
    limites: {
      muebles: maxMuebles,
      archivosPorMueble: maxArchivos,
      diasRecojo,
      mbFoto: LIMITE_BYTES.foto / 1024 / 1024,
      mbVideo: LIMITE_BYTES.video / 1024 / 1024,
      formatos: MIMES_ACEPTADOS,
    },
  };
}

/** Direcciones que el cliente guardó en su perfil (Mi perfil · W10). */
export async function direccionesDelCliente(clienteId: number) {
  const d = await prisma.direccion.findMany({
    where: { clienteId, guardada: true, activo: true },
    orderBy: [{ esPrincipal: 'desc' }, { fechaCreacion: 'asc' }],
  });
  return d.map((x) => ({
    id: x.id, etiqueta: x.etiqueta, direccion: x.direccion, referencia: x.referencia, ciudad: x.ciudad, esPrincipal: x.esPrincipal,
    latitud: x.latitud == null ? null : Number(x.latitud), longitud: x.longitud == null ? null : Number(x.longitud),
  }));
}
