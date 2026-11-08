export type Rol = 'Administrador' | 'Tapicero' | 'Conductor' | 'Cliente';

export interface Sesion {
  token: string;
  usuario: { id: string; nombre: string; rol: Rol };
}

/** Zona de la app de cada rol (RG-07: cada rol ve solo lo suyo). */
export const ZONA_POR_ROL: Record<Rol, string> = {
  Cliente: '/cliente',
  Administrador: '/admin',
  Tapicero: '/taller',
  Conductor: '/conductor',
};

/** Pantalla con la que abre cada rol al ingresar. */
export const INICIO_POR_ROL: Record<Rol, string> = {
  Cliente: '/cliente/pedidos',
  Administrador: '/admin',
  Tapicero: '/taller',
  Conductor: '/conductor',
};

export const NOMBRE_ROL: Record<Rol, string> = {
  Cliente: 'Cliente',
  Administrador: 'Administración',
  Tapicero: 'Producción',
  Conductor: 'Conductor',
};

/** Ruta a la que ir tras ingresar: la que pidió antes del login si es de su zona, si no su inicio. */
export function destinoTrasIngreso(rol: Rol, desde?: string) {
  return desde?.startsWith(ZONA_POR_ROL[rol]) ? desde : INICIO_POR_ROL[rol];
}
