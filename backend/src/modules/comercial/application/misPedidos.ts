// W6a Mis pedidos · En curso (CU-C16): los pedidos del cliente con sesión que todavía no terminan (RG-07).
// Solo lo que el cliente puede ver: qué se hará, tela, traslado, recojo, total, pagos confirmados y saldo (RG-08: nada de
// costos internos). Es de solo lectura: no escribe en la bitácora. El saldo se calcula, nunca se guarda (CU-C12).
import { prisma } from '../../../shared/infrastructure/prisma.js';
import type { AlmacenArchivos } from '../../../shared/infrastructure/archivos.js';
import { ReglaNegocioError } from '../../../shared/domain/errores.js';
import { SERVICIOS } from '../domain/solicitud.js';

/** Estados en los que el pedido ya salió de «En curso» (pasa a Anteriores o se canceló). */
export const PEDIDO_TERMINADO = ['Entregado', 'Cerrado', 'Cancelado'] as const;

const num = (d: { toString(): string } | null | undefined) => (d == null ? 0 : Number(d.toString()));
const iso = (d: Date | null | undefined) => d?.toISOString().slice(0, 10) ?? null;
const nombreServicio = (codigo: string) => SERVICIOS.find((x) => x.codigo === codigo)?.nombre.replace(' (desde una foto)', '') ?? codigo;
const SEGUNDOS_ENLACE = 15 * 60;

export async function misPedidosEnCurso(usuarioId: number, almacen: AlmacenArchivos) {
  const u = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!u?.clienteId) throw new ReglaNegocioError('Solo un cliente puede ver sus pedidos.', 403);

  const pedidos = await prisma.pedido.findMany({
    where: { clienteId: u.clienteId, estado: { notIn: [...PEDIDO_TERMINADO] } },
    orderBy: { fechaCreacion: 'desc' },
    include: {
      recojo: { include: { direccion: true } },
      pagos: { where: { estado: 'Confirmado' }, orderBy: { fecha: 'asc' } },
      cotizacion: { include: { muebles: { include: { actividades: { orderBy: { orden: 'asc' } }, telas: { include: { material: true } } } } } },
      solicitud: {
        include: {
          direccion: true,
          muebles: { orderBy: { orden: 'asc' }, include: { tipoMueble: true, adjuntos: { where: { tipo: 'foto' }, orderBy: { id: 'asc' }, take: 1 } } },
        },
      },
    },
  });

  return Promise.all(pedidos.map(async (p) => {
    const s = p.solicitud;
    const cot = p.cotizacion;
    const total = num(cot?.total);
    const pagado = p.pagos.reduce((a, x) => a + num(x.monto), 0);
    const muebles = await Promise.all(s.muebles.map(async (m) => {
      const cm = cot?.muebles.find((x) => x.solicitudMuebleId === m.id);
      const foto = m.adjuntos[0];
      return {
        tipo: m.tipoMueble.nombre, cantidad: m.cantidad, servicio: nombreServicio(m.servicio),
        trabajos: (cm?.actividades ?? []).map((a) => a.nombre),
        telas: (cm?.telas ?? []).map((t) => [t.material.nombre, t.material.numeroColor].filter(Boolean).join(' ')),
        foto: foto ? await almacen.urlTemporal(foto.ruta, SEGUNDOS_ENLACE).catch(() => null) : null,
      };
    }));
    const r = p.recojo && p.recojo.estado !== 'Cancelado' ? p.recojo : null;
    return {
      codigo: p.codigo, estado: p.estado, descripcion: p.descripcion,
      creado: p.fechaCreacion.toISOString(), entregaEstimada: iso(p.fechaCompromiso),
      solicitud: s.codigo, cotizacion: cot?.codigo ?? null,
      traslado: s.traslado, telaOpcion: s.telaOpcion,
      direccion: r?.direccion?.direccion ?? s.direccion?.direccion ?? null,
      muebles,
      recojo: r ? { tipo: r.tipo, fecha: iso(r.fecha), hora: r.hora, duracionMin: r.duracionMin, estado: r.estado } : null,
      cuenta: {
        total, transporte: num(cot?.transporte), pagado, saldo: Math.max(0, Math.round((total - pagado) * 100) / 100),
        pagos: p.pagos.map((x) => ({ concepto: x.concepto, metodo: x.metodo, monto: num(x.monto), fecha: x.fecha.toISOString() })),
      },
    };
  }));
}
