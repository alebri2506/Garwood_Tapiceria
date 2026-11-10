// CU-S03 Gestionar usuarios del personal (A20 › Usuarios · decisiones D.1).
import bcrypt from 'bcryptjs';
import type { Rol, Usuario } from '@prisma/client';
import { prisma, type Db } from '../../../shared/infrastructure/prisma.js';
import { registrarBitacora } from '../../../shared/infrastructure/bitacora.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import { COSTO_BCRYPT } from './recuperarContrasena.js';
import {
  DISPOSITIVOS, ROLES_PERSONAL, etiquetaRol, exigeCorreo, generarContrasenaTemporal, motivoNoCambiarRol, motivoNoDesactivar,
  type RolPersonal,
} from '../domain/usuarios.js';

type UsuarioConRol = Usuario & { rol: Rol };
export interface Quien { usuarioId: number; ip?: string }

const usuarioDto = (u: UsuarioConRol, ultimoAcceso: Date | null | undefined) => ({
  id: u.id,
  nombre: u.nombre ?? u.nombreUsuario,
  nombreUsuario: u.nombreUsuario,
  email: u.email,
  rol: u.rol.nombre,
  rolEtiqueta: etiquetaRol(u.rol.nombre),
  dispositivo: u.dispositivo,
  activo: u.activo,
  debeCambiarContrasena: u.debeCambiarContrasena,
  bloqueado: Boolean(u.bloqueadoHasta && u.bloqueadoHasta.getTime() > Date.now()),
  ultimoAcceso: ultimoAcceso?.toISOString() ?? null,
});

/** D.1.8: el último acceso sale de la bitácora (último inicio de sesión), no se guarda aparte. */
async function ultimosAccesos(ids: number[]) {
  const filas = await prisma.bitacora.groupBy({ by: ['usuarioId'], where: { accion: 'login', usuarioId: { in: ids } }, _max: { fecha: true } });
  return new Map(filas.map((f) => [f.usuarioId!, f._max.fecha]));
}
async function dto(u: UsuarioConRol) {
  return usuarioDto(u, (await ultimosAccesos([u.id])).get(u.id));
}

/** Solo el personal se gestiona aquí; un cliente se atiende en A17. */
async function delPersonal(db: Db, id: number) {
  const u = await db.usuario.findUnique({ where: { id }, include: { rol: true } });
  if (!u || u.rol.nombre === 'Cliente') throw new ReglaNegocioError('No encontramos ese usuario del personal.', 404);
  return u;
}

const otrosAdministradoresActivos = (db: Db, id: number) =>
  db.usuario.count({ where: { activo: true, rol: { nombre: 'Administrador' }, NOT: { id } } });

/** A20 › Usuarios: el personal, primero los activos, con su último acceso. */
export async function listarUsuarios() {
  const usuarios = await prisma.usuario.findMany({
    where: { rol: { nombre: { in: [...ROLES_PERSONAL] } } },
    include: { rol: true },
    orderBy: [{ activo: 'desc' }, { nombreUsuario: 'asc' }],
  });
  const accesos = await ultimosAccesos(usuarios.map((u) => u.id));
  return {
    usuarios: usuarios.map((u) => usuarioDto(u, accesos.get(u.id))),
    opciones: { roles: ROLES_PERSONAL.map((r) => ({ nombre: r, etiqueta: etiquetaRol(r) })), dispositivos: DISPOSITIVOS },
  };
}

export interface NuevoUsuario { nombre: string; nombreUsuario: string; rol: RolPersonal; email?: string; dispositivo?: string }

/**
 * Crea un usuario del personal con una contraseña temporal (D.1.3): se devuelve UNA sola vez para que el
 * Administrador la entregue en persona; en la base solo queda su hash y nunca va a la bitácora.
 */
export async function crearUsuario(quien: Quien, e: NuevoUsuario) {
  if (exigeCorreo(e.rol) && !e.email) {
    throw new ReglaNegocioError('Ingrese el correo: es obligatorio para un Administrador.', 400, { email: 'El correo es obligatorio para un Administrador.' });
  }
  const repetido = await prisma.usuario.findFirst({
    where: { OR: [{ nombreUsuario: e.nombreUsuario }, ...(e.email ? [{ email: e.email }, { nombreUsuario: e.email }] : [])] },
  });
  if (repetido?.nombreUsuario === e.nombreUsuario) {
    throw new ReglaNegocioError('Ese usuario ya existe. Elija otro.', 409, { nombreUsuario: 'Ese usuario ya existe. Elija otro.' });
  }
  if (repetido) throw new ReglaNegocioError('Ya existe una cuenta con ese correo.', 409, { email: 'Ya existe una cuenta con ese correo.' });

  const contrasenaTemporal = generarContrasenaTemporal();
  const contrasenaHash = await bcrypt.hash(contrasenaTemporal, COSTO_BCRYPT);
  const u = await prisma.$transaction(async (tx) => {
    const rol = await tx.rol.findUniqueOrThrow({ where: { nombre: e.rol } });
    const creado = await tx.usuario.create({
      data: {
        nombre: e.nombre, nombreUsuario: e.nombreUsuario, email: e.email ?? null, dispositivo: e.dispositivo ?? null,
        rolId: rol.id, contrasenaHash, debeCambiarContrasena: true,
      },
      include: { rol: true },
    });
    await registrarBitacora(tx, {
      usuarioId: quien.usuarioId, modulo: 'seguridad', accion: 'usuario_creado', entidad: 'usuario', entidadId: creado.id,
      valorNuevo: { nombreUsuario: e.nombreUsuario, nombre: e.nombre, rol: e.rol, email: e.email ?? null, dispositivo: e.dispositivo ?? null },
      ip: quien.ip,
    });
    return creado;
  });
  return { usuario: usuarioDto(u, null), contrasenaTemporal };
}

export interface EdicionUsuario { nombre?: string; rol?: RolPersonal; dispositivo?: string | null; email?: string | null }

/**
 * D.1.4: se cambia nombre, rol, dispositivo y correo; el nombre de usuario no (identifica a la persona en la bitácora).
 * Cambiar el rol sube `version_sesion`: su sesión no se renueva y vuelve a entrar con el rol nuevo (D.1.6).
 */
export async function editarUsuario(quien: Quien, id: number, e: EdicionUsuario) {
  const u = await prisma.$transaction(async (tx) => {
    const actual = await delPersonal(tx, id);
    const antes: Record<string, unknown> = {}, despues: Record<string, unknown> = {};
    const anotar = (campo: string, a: unknown, d: unknown) => { antes[campo] = a; despues[campo] = d; };

    if (e.nombre !== undefined && e.nombre !== actual.nombre) anotar('nombre', actual.nombre, e.nombre);
    if (e.dispositivo !== undefined && e.dispositivo !== actual.dispositivo) anotar('dispositivo', actual.dispositivo, e.dispositivo);
    if (e.email !== undefined && e.email !== actual.email) {
      if (e.email) {
        const repetido = await tx.usuario.findFirst({ where: { OR: [{ email: e.email }, { nombreUsuario: e.email }], NOT: { id } } });
        if (repetido) throw new ReglaNegocioError('Ya existe una cuenta con ese correo.', 409, { email: 'Ya existe una cuenta con ese correo.' });
      }
      anotar('email', actual.email, e.email);
    }
    // D.1.2: con el rol y el correo que quedarán, el Administrador debe tener correo.
    const rolFinal = e.rol ?? actual.rol.nombre;
    const correoFinal = e.email !== undefined ? e.email : actual.email;
    if (exigeCorreo(rolFinal) && !correoFinal) {
      const m = 'El correo es obligatorio para un Administrador.';
      throw new ReglaNegocioError(m, 400, { email: m });
    }
    let rolId: number | undefined;
    if (e.rol !== undefined && e.rol !== actual.rol.nombre) {
      const motivo = motivoNoCambiarRol({
        esUnoMismo: id === quien.usuarioId,
        esAdministradorActivo: actual.activo && actual.rol.nombre === 'Administrador',
        otrosAdministradoresActivos: await otrosAdministradoresActivos(tx, id),
        rolNuevo: e.rol,
      });
      if (motivo) throw new ReglaNegocioError(motivo, 400, { rol: motivo });
      rolId = (await tx.rol.findUniqueOrThrow({ where: { nombre: e.rol } })).id;
      anotar('rol', actual.rol.nombre, e.rol);
    }
    if (Object.keys(despues).length === 0) return actual;

    const editado = await tx.usuario.update({
      where: { id },
      data: {
        ...('nombre' in despues && { nombre: e.nombre }),
        ...('dispositivo' in despues && { dispositivo: e.dispositivo }),
        ...('email' in despues && { email: e.email }),
        ...(rolId && { rolId, versionSesion: { increment: 1 } }),
      },
      include: { rol: true },
    });
    await registrarBitacora(tx, {
      usuarioId: quien.usuarioId, modulo: 'seguridad', accion: 'usuario_modificado', entidad: 'usuario', entidadId: id,
      valorAnterior: antes as never, valorNuevo: despues as never, ip: quien.ip,
    });
    return editado;
  });
  return dto(u);
}

/** D.1.5 y D.1.6: desactivar corta la renovación de su sesión; nada se borra (RG-03). */
export async function desactivarUsuario(quien: Quien, id: number) {
  const u = await prisma.$transaction(async (tx) => {
    const actual = await delPersonal(tx, id);
    if (!actual.activo) return actual;
    const motivo = motivoNoDesactivar({
      esUnoMismo: id === quien.usuarioId,
      esAdministradorActivo: actual.rol.nombre === 'Administrador',
      otrosAdministradoresActivos: await otrosAdministradoresActivos(tx, id),
    });
    if (motivo) throw new ReglaNegocioError(motivo);
    const editado = await tx.usuario.update({ where: { id }, data: { activo: false, versionSesion: { increment: 1 } }, include: { rol: true } });
    await registrarBitacora(tx, {
      usuarioId: quien.usuarioId, modulo: 'seguridad', accion: 'usuario_desactivado', entidad: 'usuario', entidadId: id,
      valorAnterior: { activo: true }, valorNuevo: { activo: false }, ip: quien.ip,
    });
    return editado;
  });
  return dto(u);
}

/** Vuelve a dejarlo entrar con su contraseña de siempre; también levanta un bloqueo por intentos fallidos. */
export async function reactivarUsuario(quien: Quien, id: number) {
  const u = await prisma.$transaction(async (tx) => {
    const actual = await delPersonal(tx, id);
    if (actual.activo) return actual;
    const editado = await tx.usuario.update({
      where: { id }, data: { activo: true, intentosFallidos: 0, bloqueadoHasta: null }, include: { rol: true },
    });
    await registrarBitacora(tx, {
      usuarioId: quien.usuarioId, modulo: 'seguridad', accion: 'usuario_reactivado', entidad: 'usuario', entidadId: id,
      valorAnterior: { activo: false }, valorNuevo: { activo: true }, ip: quien.ip,
    });
    return editado;
  });
  return dto(u);
}

/**
 * D.1.2 y D.1.4: el Administrador genera una contraseña temporal nueva (p. ej. para quien no tiene correo y la olvidó).
 * La anterior deja de servir, la sesión abierta no se renueva y debe cambiarla al ingresar.
 */
export async function nuevaContrasenaTemporal(quien: Quien, id: number) {
  const contrasenaTemporal = generarContrasenaTemporal();
  const contrasenaHash = await bcrypt.hash(contrasenaTemporal, COSTO_BCRYPT);
  const u = await prisma.$transaction(async (tx) => {
    await delPersonal(tx, id);
    const editado = await tx.usuario.update({
      where: { id },
      data: { contrasenaHash, debeCambiarContrasena: true, intentosFallidos: 0, bloqueadoHasta: null, versionSesion: { increment: 1 } },
      include: { rol: true },
    });
    // Solo queda que se generó; la contraseña nunca se guarda en la bitácora.
    await registrarBitacora(tx, { usuarioId: quien.usuarioId, modulo: 'seguridad', accion: 'contrasena_temporal', entidad: 'usuario', entidadId: id, ip: quien.ip });
    return editado;
  });
  return { usuario: await dto(u), contrasenaTemporal };
}
