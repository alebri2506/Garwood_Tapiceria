// CU-S03 Gestionar usuarios y CU-S04 roles (A20 · decisiones D.1). Sin Express ni Prisma.
import { randomInt } from 'node:crypto';

/** Roles del personal que se crean en A20. Los clientes crean su cuenta en la web o los registra el taller (A17). */
export const ROLES_PERSONAL = ['Tapicero', 'Conductor', 'Administrador'] as const;
export type RolPersonal = (typeof ROLES_PERSONAL)[number];

/** D.1.1: en la base el rol se llama "Tapicero"; en pantalla, "Producción". */
export const ETIQUETA_ROL: Record<string, string> = { Administrador: 'Administrador', Tapicero: 'Producción', Conductor: 'Conductor', Cliente: 'Cliente' };
export const etiquetaRol = (rol: string) => ETIQUETA_ROL[rol] ?? rol;

/** D.1.7: lista fija, solo informativa. */
export const DISPOSITIVOS = ['Computadora', 'Celular', 'Tablet'] as const;

/**
 * D.1.2 (equipo, 10/11): el correo es obligatorio para todos. Con él la persona entra a GARWEB y puede usar
 * “¿Olvidó su contraseña?”; ya no hay un nombre de usuario aparte.
 */
export const CORREO_OBLIGATORIO = 'Ingrese el correo: con él la persona entra a GARWEB.';

// Sin letras ni números que se confunden al dictarla (l, i, o, 0, 1).
const LETRAS = 'abcdefghjkmnpqrstuvwxyz';
const DIGITOS = '23456789';
const elegir = (de: string, n: number) => Array.from({ length: n }, () => de[randomInt(de.length)]).join('');

/**
 * D.1.3: contraseña temporal fácil de entregar en persona ("kmrtp-4827"). Cumple la regla de contraseñas
 * (8 caracteres o más, con un número). No vence; el usuario debe cambiarla en su primer ingreso.
 */
export const generarContrasenaTemporal = () => `${elegir(LETRAS, 5)}-${elegir(DIGITOS, 4)}`;

interface Situacion {
  /** El Administrador se está cambiando a sí mismo. */
  esUnoMismo: boolean;
  /** El usuario afectado es hoy un Administrador activo. */
  esAdministradorActivo: boolean;
  /** Cuántos Administradores activos quedan sin contar al afectado. */
  otrosAdministradoresActivos: number;
}

export const SIN_ADMINISTRADOR = 'Debe quedar al menos un Administrador activo.';

/** D.1.5: nadie se desactiva a sí mismo y siempre queda al menos un Administrador activo. */
export function motivoNoDesactivar(s: Situacion): string | null {
  if (s.esUnoMismo) return 'No puede desactivar su propia cuenta.';
  if (s.esAdministradorActivo && s.otrosAdministradoresActivos === 0) return SIN_ADMINISTRADOR;
  return null;
}

/** D.1.5: quitarle el rol de Administrador al último que queda dejaría el sistema sin quien lo administre. */
export function motivoNoCambiarRol(s: Situacion & { rolNuevo: string }): string | null {
  if (s.esAdministradorActivo && s.rolNuevo !== 'Administrador' && s.otrosAdministradoresActivos === 0) return SIN_ADMINISTRADOR;
  return null;
}
