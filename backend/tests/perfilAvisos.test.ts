// Mi perfil · paso 1 (decisiones-recientes.md E.2.4 y E.3): preferencias de avisos y una sola dirección principal.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/shared/infrastructure/prisma.js';
import { avisoAlCliente } from '../src/shared/infrastructure/avisos.js';
import {
  AVISOS_INFORMATIVOS, AVISOS_OBLIGATORIOS, OBLIGATORIOS_EN_PERFIL, correoPermitido, esAvisoObligatorio,
} from '../src/shared/domain/tiposAviso.js';

let clienteId = 0;
const laura = () => prisma.cliente.findUniqueOrThrow({ where: { email: 'laura.mendez@correo.com' } });
const preferencias = (data: { aceptaAvisosCorreo?: boolean; aceptaNovedades?: boolean }) => prisma.cliente.update({ where: { id: clienteId }, data });

beforeAll(async () => {
  clienteId = (await laura()).id;
});
afterAll(async () => {
  await preferencias({ aceptaAvisosCorreo: true, aceptaNovedades: false });
  await prisma.$disconnect();
});

describe('E.3 Avisos obligatorios e informativos (sin base de datos)', () => {
  it('clasifica los avisos que hoy recibe el cliente', () => {
    for (const t of ['cita_programada', 'cita_reprogramada', 'cita_inasistencia', 'solicitud_vencida', 'solicitud_descartada']) {
      expect(esAvisoObligatorio(t), t).toBe(true);
    }
    for (const t of ['solicitud_registrada', 'fotos_recibidas']) expect(esAvisoObligatorio(t), t).toBe(false);
    // Ningún tipo está en las dos listas.
    expect(AVISOS_OBLIGATORIOS.filter((t) => (AVISOS_INFORMATIVOS as readonly string[]).includes(t))).toEqual([]);
  });

  it('el obligatorio llega aunque apague los informativos; sin correo no se envía nada', () => {
    const apagado = { email: 'a@b.com', aceptaAvisosCorreo: false };
    expect(correoPermitido('cita_programada', apagado)).toBe(true);
    expect(correoPermitido('solicitud_registrada', apagado)).toBe(false);
    expect(correoPermitido('solicitud_registrada', { ...apagado, aceptaAvisosCorreo: true })).toBe(true);
    expect(correoPermitido('cita_programada', { email: null, aceptaAvisosCorreo: true })).toBe(false);
  });

  it('W10 lista "Citas y visitas" entre los obligatorios', () => {
    expect(OBLIGATORIOS_EN_PERFIL).toEqual(['Citas y visitas', 'Recojo del mueble en su casa', 'Entrega del pedido', 'Retiro en el taller', 'Daño oculto (V2)']);
  });
});

describe('E.3 Preferencias del cliente en la base', () => {
  it('"Recordatorios y novedades" viene apagado y los informativos encendidos', async () => {
    expect(await laura()).toMatchObject({ aceptaAvisosCorreo: true, aceptaNovedades: false });
  });

  it('con los informativos apagados: la cita llega por correo, "Recibimos su solicitud" solo a la campana', async () => {
    await preferencias({ aceptaAvisosCorreo: false });
    const [cita] = await avisoAlCliente(prisma, clienteId, { tipo: 'cita_programada', titulo: 'Cita', mensaje: 'x' }, 'Asunto', 'Texto');
    const [recibida] = await avisoAlCliente(prisma, clienteId, { tipo: 'solicitud_registrada', titulo: 'Recibida', mensaje: 'x' }, 'Asunto', 'Texto');
    expect(cita!.correo?.para).toBe('laura.mendez@correo.com');
    // RG-05: la notificación igual se genera (la campana siempre muestra todo).
    expect(recibida).toMatchObject({ tipo: 'solicitud_registrada', usuarioId: expect.any(Number) });
    expect(recibida!.correo).toBeUndefined();

    await preferencias({ aceptaAvisosCorreo: true });
    const [otra] = await avisoAlCliente(prisma, clienteId, { tipo: 'solicitud_registrada', titulo: 'Recibida', mensaje: 'x' }, 'Asunto', 'Texto');
    expect(otra!.correo?.para).toBe('laura.mendez@correo.com');
  });
});

describe('E.2.4 Una sola dirección principal activa por cliente (lo impide la base)', () => {
  // Un cliente propio: Laura puede tener ya una principal guardada desde W2 en otras pruebas.
  let propio = 0;
  beforeAll(async () => {
    propio = (await prisma.cliente.create({ data: { tipoPersona: 'persona', nombres: 'Sin', apellidos: 'Direcciones', telefono: '+19735550111', canalRegistro: 'telefono' } })).id;
  });
  const nueva = (data: { esPrincipal?: boolean; activo?: boolean; etiqueta?: string }) =>
    prisma.direccion.create({ data: { clienteId: propio, direccion: '48 Park St, Montclair, NJ 07042', guardada: true, ...data } });

  it('rechaza una segunda principal, pero deja cambiarla en orden y quitar la anterior', async () => {
    const casa = await nueva({ etiqueta: 'Casa', esPrincipal: true });
    await expect(nueva({ etiqueta: 'Oficina', esPrincipal: true })).rejects.toThrow(/ya tiene una dirección principal/);
    const oficina = await nueva({ etiqueta: 'Oficina' });
    await expect(prisma.direccion.update({ where: { id: oficina.id }, data: { esPrincipal: true } })).rejects.toThrow(/ya tiene una dirección principal/);

    // Cambiar la principal: primero se desmarca la anterior, luego se marca la nueva (en una transacción).
    await prisma.$transaction([
      prisma.direccion.update({ where: { id: casa.id }, data: { esPrincipal: false } }),
      prisma.direccion.update({ where: { id: oficina.id }, data: { esPrincipal: true } }),
    ]);
    // Una dirección quitada (inactiva) no cuenta: puede seguir marcada sin bloquear a otra.
    await prisma.direccion.update({ where: { id: oficina.id }, data: { activo: false } });
    await expect(prisma.direccion.update({ where: { id: casa.id }, data: { esPrincipal: true } })).resolves.toMatchObject({ esPrincipal: true });

    // Limpieza: se dejan inactivas (nada se borra) y sin principal, para no afectar a otras pruebas.
    await prisma.direccion.updateMany({ where: { id: { in: [casa.id, oficina.id] } }, data: { activo: false, esPrincipal: false } });
  });
});
