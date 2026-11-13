// Reglas de los campos obligatorios del asistente W2. Son las mismas que valida la API
// (backend/src/modules/comercial/http/solicitud.schemas.ts y application/registrarSolicitud.ts).
import { hayRecojo, necesitaCita, porPartesPosible, tipoDe, type DireccionW2, type EstadoW2 } from './estadoW2';
import type { Catalogo } from './solicitudApi';

export type Errores = Record<string, string>;

const MB = 1024 * 1024;

function revisarDireccion(d: DireccionW2, campo: string, mensaje: string, errores: Errores) {
  if (d.guardadaId != null) return;
  if (d.texto.trim().length < 5) errores[campo] = mensaje;
}

/**
 * Errores del paso indicado, con la misma clave que usa la API (p. ej. "muebles.0.medidas").
 * `fotosOpcionales`: A3, cuando las fotos se le piden al cliente por enlace.
 */
export function validarPaso(c: Catalogo, e: EstadoW2, paso: number, fotosOpcionales = false): Errores {
  const errores: Errores = {};
  const { limites } = c;

  if (paso === 0) {
    if (e.muebles.length > limites.muebles) errores.muebles = `Puede pedir hasta ${limites.muebles} muebles por solicitud.`;
    e.muebles.forEach((m, i) => {
      if (m.servicio === 'fabricacion' && !m.medidas.trim()) errores[`muebles.${i}.medidas`] = 'En fabricación a medida, indique las medidas que quiere.';
      const fotos = m.archivos.filter((a) => a.type.startsWith('image/'));
      const malo = m.archivos.find((a) => !limites.formatos.includes(a.type));
      const pesado = m.archivos.find((a) => a.size > (a.type.startsWith('video/') ? limites.mbVideo : limites.mbFoto) * MB);
      if (malo) errores[`muebles.${i}.archivos`] = `«${malo.name}» no es una foto ni un video aceptado (JPG, PNG, WEBP, HEIC, MP4, MOV o WEBM).`;
      else if (pesado) errores[`muebles.${i}.archivos`] = `«${pesado.name}» pesa más de ${pesado.type.startsWith('video/') ? limites.mbVideo : limites.mbFoto} MB.`;
      else if (m.archivos.length > limites.archivosPorMueble) errores[`muebles.${i}.archivos`] = `Suba hasta ${limites.archivosPorMueble} fotos o videos por mueble.`;
      else if (fotos.length === 0 && !fotosOpcionales) errores[`muebles.${i}.archivos`] = m.servicio === 'fabricacion' ? 'Suba la foto del mueble que quiere.' : 'Suba al menos una foto del mueble.';
    });
  }

  if (paso === 1) {
    if (e.tela === 'sin' && e.muebles.some((m) => c.servicios.find((s) => s.codigo === m.servicio)!.requiereTela)) {
      errores.tela = 'El servicio elegido necesita tela: elija otra opción.';
    }
    if (e.tela === 'catalogo') {
      const revisar = e.mismaTela ? [0] : e.muebles.map((_, i) => i);
      for (const i of revisar) {
        const m = e.muebles[i]!;
        if (m.modoTela === 'partes' && porPartesPosible(e)) {
          if (tipoDe(c, m).partes.some((p) => m.telaPorParte[p.id] == null)) errores[`muebles.${i}.telas`] = 'Elija una tela para cada parte.';
        } else if (m.telas.length === 0) {
          errores[`muebles.${i}.telas`] = 'Elija la tela del catálogo.';
        }
      }
    }
    // En la visita llevamos los libros de telas a su casa: hay que saber qué busca. En el local es opcional.
    if (e.tela === 'domicilio' && !e.telaBusca.trim()) errores.telaDescripcion = 'Cuéntenos qué tela busca: así llevamos las muestras indicadas.';
  }

  if (paso === 2 && !necesitaCita(e.tela) && e.traslado === 'delivery') {
    revisarDireccion(e.dir, 'direccion', 'Escriba la dirección de recojo y entrega.', errores);
    // La cuadrícula solo deja elegir horas libres; la API vuelve a revisar contra la agenda al enviar.
    if (hayRecojo(e) && !e.recojo) errores.horaPrefRecojo = 'Elija el día y la hora que prefiere para el recojo.';
  }
  return errores;
}

/** En qué paso está el campo que devolvió la API, para llevar al cliente ahí. */
export function pasoDeCampo(campo: string) {
  if (/^muebles\.\d+\.telas/.test(campo) || ['tela', 'telaDescripcion', 'telaConocida'].includes(campo)) return 1;
  if (campo.startsWith('muebles')) return 0;
  return 2;
}
