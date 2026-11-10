/**
 * Error de negocio con un mensaje en español listo para mostrar al usuario.
 * `errores` (opcional): el mensaje de cada campo, para marcarlo en la pantalla.
 */
export class ReglaNegocioError extends Error {
  constructor(message: string, readonly status = 400, readonly errores?: Record<string, string>) {
    super(message);
    this.name = 'ReglaNegocioError';
  }
}

export class NoAutorizadoError extends ReglaNegocioError {
  constructor(message = 'Su sesión venció. Vuelva a iniciar sesión.') {
    super(message, 401);
    this.name = 'NoAutorizadoError';
  }
}
