// Paso 1 de Seguridad y parámetros: reglas que garantiza la base de datos (migración 20261110120000)
// y los datos iniciales de seed-parametros.ts (decisiones-recientes.md, sección D).
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/shared/infrastructure/prisma.js';
import { GRUPOS_PARAMETROS, sembrarParametros } from '../prisma/seed-parametros.js';

afterAll(() => prisma.$disconnect());

const parametro = (clave: string) => prisma.parametro.findUniqueOrThrow({ where: { clave } });
const rolId = async (nombre: string) => (await prisma.rol.findUniqueOrThrow({ where: { nombre } })).id;
let n = 0;
const nuevoUsuario = async (datos: { email?: string | null; dispositivo?: string } = {}) =>
  prisma.usuario.create({
    data: { nombreUsuario: `prueba.${Date.now()}.${n++}`, nombre: 'Prueba', rolId: await rolId('Tapicero'), contrasenaHash: 'x', ...datos },
  });

describe('D.2.3 La bitácora no se puede editar ni borrar', () => {
  it('rechaza modificar, borrar y vaciar un registro, pero deja agregar nuevos', async () => {
    const r = await prisma.bitacora.create({ data: { modulo: 'seguridad', accion: 'prueba', entidad: 'usuario' } });
    await expect(prisma.bitacora.update({ where: { id: r.id }, data: { accion: 'otra' } })).rejects.toThrow(/no se puede modificar ni borrar/);
    await expect(prisma.bitacora.delete({ where: { id: r.id } })).rejects.toThrow(/no se puede modificar ni borrar/);
    await expect(prisma.$executeRawUnsafe('TRUNCATE "bitacora"')).rejects.toThrow(/no se puede modificar ni borrar/);
    expect(await prisma.bitacora.findUnique({ where: { id: r.id } })).toMatchObject({ accion: 'prueba' });
  });

  it('impide borrar físicamente un usuario con actividad (RG-03: se desactiva)', async () => {
    const u = await nuevoUsuario();
    await prisma.bitacora.create({ data: { usuarioId: u.id, modulo: 'seguridad', accion: 'login', entidad: 'usuario', entidadId: u.id } });
    await expect(prisma.usuario.delete({ where: { id: u.id } })).rejects.toThrow();
  });
});

describe('D.1 Usuario: correo opcional, dispositivo de lista fija y campos nuevos', () => {
  it('permite personal sin correo y con los valores por defecto de sesión', async () => {
    const u = await nuevoUsuario({ email: null, dispositivo: 'Tablet' });
    expect(u).toMatchObject({ email: null, dispositivo: 'Tablet', debeCambiarContrasena: false, versionSesion: 0 });
  });

  it('solo acepta Computadora, Celular o Tablet como dispositivo', async () => {
    await expect(nuevoUsuario({ dispositivo: 'Laptop' })).rejects.toThrow();
  });

  it('el seed deja nombre y dispositivo al personal de prueba', async () => {
    const admin = await prisma.usuario.findUniqueOrThrow({ where: { nombreUsuario: 'admin' } });
    expect(admin).toMatchObject({ nombre: 'Administrador', dispositivo: 'Computadora' });
  });
});

describe('D.3 Parámetros: datos para A14, límites e historial', () => {
  const todos = GRUPOS_PARAMETROS.flatMap((g) => g.parametros);

  it('cada parámetro del seed queda con grupo, etiqueta y tipo, y su valor dentro de sus límites', async () => {
    const enBase = await prisma.parametro.findMany({ where: { clave: { in: todos.map((p) => p.clave) } } });
    expect(enBase).toHaveLength(todos.length);
    for (const p of enBase) {
      expect(p.grupo, p.clave).toBeTruthy();
      expect(p.etiqueta, p.clave).toBeTruthy();
      if (p.tipo === 'horario' || p.tipo === 'texto') continue;
      if (p.tipo === 'opcion') {
        expect(p.opciones?.split('|').map((o) => o.split('=')[0]), p.clave).toContain(p.valor);
        continue;
      }
      const v = Number(p.valor);
      expect(Number.isNaN(v), p.clave).toBe(false);
      if (p.minimo != null) expect(v, p.clave).toBeGreaterThanOrEqual(Number(p.minimo));
      if (p.maximo != null) expect(v, p.clave).toBeLessThanOrEqual(Number(p.maximo));
    }
  });

  it('aplica los rangos decididos (D.3.4)', async () => {
    const rango = async (clave: string) => {
      const p = await parametro(clave);
      return [Number(p.minimo), p.maximo == null ? null : Number(p.maximo)];
    };
    expect(await rango('pago.adelanto_sin_historial_pct')).toEqual([0, 50]);
    expect(await rango('pago.adelanto_con_historial_pct')).toEqual([0, 50]);
    expect(await rango('cotizacion.margen_pct')).toEqual([0, 200]);
    expect(await rango('cotizacion.vigencia_dias')).toEqual([1, 90]);
    // Porcentajes ≤ 100 (salvo el margen) y nada negativo.
    for (const p of todos) {
      if (p.tipo === 'porcentaje' && p.clave !== 'cotizacion.margen_pct') expect(p.maximo, p.clave).toBeLessThanOrEqual(100);
      if (p.tipo !== 'horario' && p.tipo !== 'texto' && p.tipo !== 'opcion') expect(p.minimo, p.clave).toBeGreaterThanOrEqual(0);
    }
  });

  it('los parámetros de módulos aún no construidos dicen que son provisionales (D.3.2)', async () => {
    for (const clave of ['cotizacion.vigencia_dias', 'pago.adelanto_sin_historial_pct', 'tarifa.hora_persona', 'transporte.por_milla']) {
      expect((await parametro(clave)).ayuda, clave).toMatch(/Provisional: por confirmar con el dueño/);
    }
  });

  it('volver a correr el seed no pisa el valor que dejó el Administrador, pero sí repara sus datos de pantalla', async () => {
    await prisma.parametro.update({ where: { clave: 'login.max_intentos' }, data: { valor: '7', etiqueta: 'cambiada a mano' } });
    await sembrarParametros(prisma);
    expect(await parametro('login.max_intentos')).toMatchObject({ valor: '7', etiqueta: 'Intentos fallidos antes de bloquear', grupo: 'Seguridad' });
    await prisma.parametro.update({ where: { clave: 'login.max_intentos' }, data: { valor: '5' } });
  });

  it('rechaza un tipo desconocido y un mínimo mayor que el máximo', async () => {
    await expect(prisma.parametro.update({ where: { clave: 'login.max_intentos' }, data: { tipo: 'fecha' } })).rejects.toThrow();
    await expect(prisma.parametro.update({ where: { clave: 'login.max_intentos' }, data: { minimo: 10, maximo: 1 } })).rejects.toThrow();
  });

  it('guarda el historial de un cambio con quién y cuándo (CU-S05)', async () => {
    const p = await parametro('cita.duracion_min');
    const admin = await prisma.usuario.findUniqueOrThrow({ where: { nombreUsuario: 'admin' } });
    const h = await prisma.parametroHistorial.create({ data: { parametroId: p.id, valorAnterior: '45', valorNuevo: '30', usuarioId: admin.id } });
    expect(h.fecha).toBeInstanceOf(Date);
    expect(await prisma.parametroHistorial.count({ where: { parametroId: p.id } })).toBeGreaterThanOrEqual(1);
  });
});
