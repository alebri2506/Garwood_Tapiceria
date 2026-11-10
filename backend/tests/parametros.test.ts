// Paso 2 de Seguridad y parámetros: API de A14 (CU-S05 · decisiones-recientes.md, sección D.3).
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { prisma } from '../src/shared/infrastructure/prisma.js';
import { ConsolaCorreo } from '../src/shared/infrastructure/correo.js';
import { parametroNumero } from '../src/shared/infrastructure/parametros.js';
import { fueraDeRangos, leerHorario, revisarCoherencia, validarValor } from '../src/modules/seguridad/domain/parametros.js';
import { hoyNegocio } from '../src/modules/comercial/domain/calendario.js';
import { instanteNY, sumarDias } from '../src/modules/comercial/domain/agenda.js';

const app = crearApp({ correo: new ConsolaCorreo() });
const CLAVE = process.env.SEED_CONTRASENA!;
const login = async (identificador: string) => (await request(app).post('/api/auth/login').send({ identificador, contrasena: CLAVE })).body.token as string;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
let admin = '';
const guardar = (cambios: { clave: string; valor: string | number }[], token = admin) =>
  request(app).put('/api/admin/parametros').set(auth(token)).send({ cambios });
const valor = async (clave: string) => (await prisma.parametro.findUniqueOrThrow({ where: { clave } })).valor;

// Las pruebas comparten la base: al terminar se dejan los valores como estaban.
let originales: { clave: string; valor: string }[] = [];
beforeAll(async () => {
  admin = await login('admin');
  originales = await prisma.parametro.findMany({ select: { clave: true, valor: true } });
});
afterAll(async () => {
  for (const p of originales) await prisma.parametro.update({ where: { clave: p.clave }, data: { valor: p.valor } });
  await prisma.$disconnect();
});

describe('Reglas de cada valor (sin base de datos)', () => {
  const entero = { tipo: 'entero', unidad: 'días', minimo: 1, maximo: 90 };
  it('valida enteros, decimales y límites con un mensaje claro', () => {
    expect(validarValor(entero, ' 045 ')).toEqual({ valor: '45' });
    expect(validarValor(entero, '2.5')).toEqual({ error: 'Escriba un número entero, sin decimales.' });
    expect(validarValor(entero, '91')).toEqual({ error: 'Debe estar entre 1 y 90 días.' });
    expect(validarValor(entero, '')).toEqual({ error: 'Escriba un valor.' });
    expect(validarValor({ tipo: 'monto', unidad: 'USD', minimo: 0, maximo: null }, '1.6')).toEqual({ valor: '1.60' });
    expect(validarValor({ tipo: 'monto', unidad: 'USD', minimo: 0, maximo: null }, '-1')).toEqual({ error: 'No puede ser menor que 0.' });
    expect(validarValor({ tipo: 'monto', unidad: 'USD', minimo: 0, maximo: null }, '1.555')).toHaveProperty('error');
  });

  it('acepta horarios con guion o raya y los guarda en el formato de la agenda', () => {
    expect(leerHorario('9:00–12:00')?.valor).toBe('09:00-12:00');
    expect(validarValor({ tipo: 'horario', unidad: null, minimo: null, maximo: null }, '09:00 - 12:30')).toEqual({ valor: '09:00-12:30' });
    expect(validarValor({ tipo: 'horario', unidad: null, minimo: null, maximo: null }, '12:00-09:00')).toHaveProperty('error');
    expect(validarValor({ tipo: 'horario', unidad: null, minimo: null, maximo: null }, '25:00-26:00')).toHaveProperty('error');
  });

  it('pide que la mañana termine antes de la tarde y que entre al menos un turno', () => {
    const valores = new Map([['agenda.turnos_manana', '09:00-16:00'], ['agenda.turnos_tarde', '15:00-17:00'], ['cita.duracion_min', '30']]);
    expect(revisarCoherencia(valores, new Set(['agenda.turnos_manana']))).toHaveProperty('agenda.turnos_manana');
    const corta = new Map([['agenda.turnos_manana', '09:00-09:20'], ['agenda.turnos_tarde', '15:00-17:00'], ['cita.duracion_min', '30']]);
    expect(revisarCoherencia(corta, new Set(['agenda.turnos_manana']))['agenda.turnos_manana']).toMatch(/no entra ningún turno de 30 min/);
  });

  it('detecta una cita que ya no entra completa en el horario', () => {
    expect(fueraDeRangos('09:30', 30, ['10:00-12:00', '15:00-17:00'])).toBe(true);
    expect(fueraDeRangos('11:30', 30, ['10:00-12:00'])).toBe(false);
    expect(fueraDeRangos('11:45', 30, ['10:00-12:00'])).toBe(true);
  });
});

describe('CU-S05 API de parámetros (A14)', () => {
  it('solo el Administrador puede ver y cambiar los parámetros', async () => {
    const tapicero = await login('tapicero');
    expect((await request(app).get('/api/admin/parametros')).status).toBe(401);
    expect((await request(app).get('/api/admin/parametros').set(auth(tapicero))).status).toBe(403);
    expect((await guardar([{ clave: 'login.max_intentos', valor: '9' }], tapicero)).status).toBe(403);
    expect(await valor('login.max_intentos')).toBe('5');
  });

  it('lista los parámetros agrupados, en el orden de la pantalla y sin valores técnicos', async () => {
    const r = await request(app).get('/api/admin/parametros').set(auth(admin));
    expect(r.status).toBe(200);
    expect(r.body.grupos.map((g: { nombre: string }) => g.nombre)).toEqual(['Cotización y pagos', 'Tarifas', 'Agenda y despacho', 'Solicitudes', 'Seguridad']);
    const vigencia = r.body.grupos[0].parametros[0];
    expect(vigencia).toMatchObject({ clave: 'cotizacion.vigencia_dias', etiqueta: 'Vigencia de la cotización', tipo: 'entero', minimo: 1, maximo: 90, provisional: true });
    const claves = r.body.grupos.flatMap((g: { parametros: { clave: string }[] }) => g.parametros.map((p) => p.clave));
    expect(claves.some((c: string) => /jwt|url|clave|secret/i.test(c))).toBe(false);
  });

  it('guarda el cambio, lo aplica a lo nuevo y deja historial y bitácora con quién y cuándo', async () => {
    const r = await guardar([{ clave: 'cotizacion.vigencia_dias', valor: 45 }, { clave: 'tarifa.hora_persona', valor: '16' }]);
    expect(r.status).toBe(200);
    expect(r.body.cambiados).toEqual(['cotizacion.vigencia_dias', 'tarifa.hora_persona']);
    expect(await parametroNumero(prisma, 'cotizacion.vigencia_dias')).toBe(45);
    expect(await valor('tarifa.hora_persona')).toBe('16.00');

    const historial = (await request(app).get('/api/admin/parametros/historial').set(auth(admin))).body;
    expect(historial[0]).toMatchObject({ etiqueta: 'Hora persona', valorAnterior: '15.00', valorNuevo: '16.00', usuario: 'Administrador' });
    expect(historial[1]).toMatchObject({ clave: 'cotizacion.vigencia_dias', valorAnterior: '30', valorNuevo: '45' });

    const p = await prisma.parametro.findUniqueOrThrow({ where: { clave: 'cotizacion.vigencia_dias' } });
    const bitacora = await prisma.bitacora.findFirstOrThrow({ where: { accion: 'parametro_modificado', entidadId: p.id }, orderBy: { id: 'desc' } });
    expect(bitacora).toMatchObject({ modulo: 'seguridad', entidad: 'parametro', valorAnterior: { valor: '30' }, valorNuevo: { valor: '45' } });
    expect(p.modificadoPor).toBe(bitacora.usuarioId);
  });

  it('no registra nada si el valor no cambió', async () => {
    const antes = await prisma.parametroHistorial.count();
    const r = await guardar([{ clave: 'login.max_intentos', valor: '5' }]);
    expect(r.body.cambiados).toEqual([]);
    expect(await prisma.parametroHistorial.count()).toBe(antes);
  });

  it('si un valor es inválido no guarda ninguno y marca cada campo (D.3.4)', async () => {
    const antes = await prisma.parametroHistorial.count();
    const r = await guardar([
      { clave: 'cotizacion.margen_pct', valor: '80' },
      { clave: 'pago.adelanto_sin_historial_pct', valor: '60' },
      { clave: 'login.max_intentos', valor: '0' },
      { clave: 'no.existe', valor: '1' },
    ]);
    expect(r.status).toBe(400);
    expect(r.body.mensaje).toBe('Revise los 3 valores marcados. No se guardó ningún cambio.');
    expect(r.body.errores).toEqual({
      'pago.adelanto_sin_historial_pct': 'Debe estar entre 0 y 50 %.',
      'login.max_intentos': 'No puede ser menor que 1.',
      'no.existe': 'Este parámetro no existe o no se puede cambiar desde aquí.',
    });
    expect(await valor('cotizacion.margen_pct')).toBe('75');
    expect(await prisma.parametroHistorial.count()).toBe(antes);
  });

  it('con un solo error, el mensaje dice cuál es', async () => {
    const r = await guardar([{ clave: 'cotizacion.vigencia_dias', valor: '120' }]);
    expect(r.body.mensaje).toBe('Vigencia de la cotización: Debe estar entre 1 y 90 días. No se guardó ningún cambio.');
  });

  it('rechaza un cuerpo vacío o el mismo parámetro dos veces', async () => {
    expect((await guardar([])).body.mensaje).toBe('No hay cambios para guardar.');
    const r = await guardar([{ clave: 'login.max_intentos', valor: '6' }, { clave: 'login.max_intentos', valor: '7' }]);
    expect(r.status).toBe(400);
    expect(await valor('login.max_intentos')).toBe('5');
  });

  it('cambiar el horario no se bloquea: guarda y avisa las citas que quedan fuera (D.3.5)', async () => {
    const adminId = (await prisma.usuario.findUniqueOrThrow({ where: { nombreUsuario: 'admin' } })).id;
    const clienteId = (await prisma.cliente.findUniqueOrThrow({ where: { email: 'laura.mendez@correo.com' } })).id;
    const solicitud = await prisma.solicitud.create({
      data: { codigo: 'SOL-9901', clienteId, canal: 'telefono', telaOpcion: 'local', estado: 'En espera de cita', registradoPor: adminId },
    });
    const cita = await prisma.cita.create({
      data: { solicitudId: solicitud.id, tipo: 'local', fechaHora: instanteNY(sumarDias(hoyNegocio(), 7), '09:30'), duracionMin: 30, estado: 'Programada', registradoPor: adminId },
    });
    try {
      const r = await guardar([{ clave: 'agenda.turnos_manana', valor: '10:00–12:00' }]);
      expect(r.status).toBe(200);
      expect(await valor('agenda.turnos_manana')).toBe('10:00-12:00');
      expect(r.body.avisos.citasFueraDeHorario).toContainEqual(
        expect.objectContaining({ citaId: cita.id, solicitud: 'SOL-9901', cliente: 'Laura Méndez', hora: '09:30', tipo: 'local' }),
      );
      expect((await prisma.cita.findUniqueOrThrow({ where: { id: cita.id } })).estado).toBe('Programada');

      // Un cambio que no toca el horario no trae el aviso.
      expect((await guardar([{ clave: 'reclamo.plazo_dias', valor: '8' }])).body.avisos.citasFueraDeHorario).toEqual([]);
    } finally {
      // Nada se borra: la cita de prueba se cancela.
      await prisma.cita.update({ where: { id: cita.id }, data: { estado: 'Cancelada' } });
    }
  });

  it('rechaza un horario que se cruza con la tarde', async () => {
    const r = await guardar([{ clave: 'agenda.turnos_manana', valor: '09:30-15:30' }]);
    expect(r.status).toBe(400);
    expect(r.body.errores['agenda.turnos_manana']).toBe('El horario de la mañana debe terminar antes de que empiece el de la tarde.');
  });
});
