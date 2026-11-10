// Paso 4 de Seguridad y parámetros: auditoría (CU-S06 · A20 › Registro de actividad · decisiones D.2).
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { prisma } from '../src/shared/infrastructure/prisma.js';
import { ConsolaCorreo } from '../src/shared/infrastructure/correo.js';
import { armarCsv, celdaCsv, describir, type Referencias } from '../src/modules/seguridad/domain/auditoria.js';
import { periodo } from '../src/modules/seguridad/application/auditoria.js';
import { hoyNegocio } from '../src/modules/comercial/domain/calendario.js';
import { instanteNY, sumarDias } from '../src/modules/comercial/domain/agenda.js';

const app = crearApp({ correo: new ConsolaCorreo() });
const CLAVE = process.env.SEED_CONTRASENA!;
const login = async (identificador: string, contrasena = CLAVE) => request(app).post('/api/auth/login').send({ identificador, contrasena });
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
let admin = '';
const actividad = (query = '') => request(app).get(`/api/admin/auditoria${query}`).set(auth(admin));

const vacias = (): Referencias => ({ solicitudes: new Map(), citas: new Map(), parametros: new Map(), usuarios: new Map(), clientes: new Map() });
const entrada = (e: Partial<Parameters<typeof describir>[0]>) =>
  ({ accion: 'x', modulo: 'comercial', entidad: 'solicitud', entidadId: 1, valorAnterior: null, valorNuevo: null, usuario: 'admin', ...e });

beforeAll(async () => {
  admin = (await login('admin')).body.token;
});
afterAll(() => prisma.$disconnect());

describe('Texto legible de cada registro (sin base de datos)', () => {
  it('un parámetro: etiqueta en "Registro" y antes → después con su unidad, en Configuración', () => {
    const refs = vacias();
    refs.parametros.set(7, { etiqueta: 'Duración del turno de cita', unidad: 'min' });
    expect(describir(entrada({ accion: 'parametro_modificado', modulo: 'configuracion', entidad: 'parametro', entidadId: 7, valorAnterior: { valor: '45' }, valorNuevo: { valor: '30' } }), refs))
      .toEqual({ usuario: 'admin', modulo: 'Configuración', accion: 'Parámetro', registro: 'Duración del turno de cita', cambio: '45 min → 30 min' });
  });

  it('los intentos fallidos los registra "sistema" sobre la cuenta afectada', () => {
    const refs = vacias();
    refs.usuarios.set(3, 'tapicero');
    expect(describir(entrada({ accion: 'cuenta_bloqueada', modulo: 'seguridad', entidad: 'usuario', entidadId: 3, usuario: 'tapicero' }), refs))
      .toMatchObject({ usuario: 'sistema', modulo: 'Seguridad', accion: 'Intentos fallidos', registro: 'tapicero' });
  });

  it('citas y solicitudes muestran el código de la solicitud y el cambio en palabras', () => {
    const refs = vacias();
    refs.citas.set(5, 'SOL-0012');
    refs.solicitudes.set(1, 'SOL-0012');
    expect(describir(entrada({
      accion: 'cita_reprogramada', entidad: 'cita', entidadId: 5,
      valorAnterior: { fechaHora: instanteNY('2026-11-16', '10:00').toISOString() }, valorNuevo: { fecha: '2026-11-17', hora: '15:30' },
    }), refs)).toMatchObject({ accion: 'Cita reprogramada', registro: 'SOL-0012', cambio: 'lun 16 nov, 10:00 → mar 17 nov, 15:30' });
    expect(describir(entrada({ accion: 'solicitud_descartada', valorAnterior: { estado: 'Nueva' }, valorNuevo: { estado: 'Descartada', motivo: 'Duplicada' } }), refs).cambio)
      .toBe('Nueva → Descartada · “Duplicada”');
  });

  it('una acción todavía sin texto propio se muestra igual, con sus datos', () => {
    expect(describir(entrada({ accion: 'material_retirado', modulo: 'inventario', entidad: 'material', entidadId: 9, valorAnterior: { stock: 6 }, valorNuevo: { stock: 7 } }), vacias()))
      .toMatchObject({ modulo: 'Inventario', accion: 'Material retirado', registro: 'material #9', cambio: 'stock: 6 → 7' });
  });

  it('el CSV lleva BOM, escapa comillas y comas, y no deja pasar fórmulas', () => {
    expect(celdaCsv('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(celdaCsv('+1')).toBe("'+1");
    expect(celdaCsv('a, b')).toBe('"a, b"');
    expect(armarCsv(['A', 'B'], [['1', 'ñ']])).toBe('﻿A,B\r\n1,ñ\r\n');
  });

  it('el período por defecto son los últimos 30 días, hoy incluido (D.2.1)', () => {
    expect(periodo({}, '2026-11-10')).toEqual({ desde: '2026-10-12', hasta: '2026-11-10' });
    expect(() => periodo({ desde: '2026-11-11', hasta: '2026-11-10' })).toThrow(/fecha de inicio/);
  });
});

describe('CU-S06 API del registro de actividad', () => {
  it('solo el Administrador puede verlo y exportarlo', async () => {
    const tapicero = (await login('tapicero')).body.token;
    expect((await request(app).get('/api/admin/auditoria')).status).toBe(401);
    expect((await request(app).get('/api/admin/auditoria').set(auth(tapicero))).status).toBe(403);
    expect((await request(app).get('/api/admin/auditoria/exportar').set(auth(tapicero))).status).toBe(403);
  });

  it('muestra los últimos 30 días, lo más nuevo primero, con texto legible', async () => {
    await login('conductor', 'no-es-la-clave');
    const r = await actividad();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ hasta: hoyNegocio(), desde: sumarDias(hoyNegocio(), -29), pagina: 1, porPagina: 50 });
    expect(r.body.registros[0]).toMatchObject({ usuario: 'sistema', modulo: 'Seguridad', accion: 'Intento fallido', registro: 'conductor', cambio: 'Contraseña incorrecta' });
    expect(r.body.registros).toContainEqual(expect.objectContaining({ usuario: 'admin', accion: 'Inicio de sesión', registro: 'admin' }));
    // El filtro "Usuario" lista al personal, no a los clientes.
    const usuarios = r.body.opciones.usuarios.map((u: { nombreUsuario: string }) => u.nombreUsuario);
    expect(usuarios).toEqual(expect.arrayContaining(['admin', 'conductor', 'tapicero']));
    expect(usuarios).not.toContain('laura.mendez@correo.com');
  });

  it('filtra por módulo, usuario y texto (sin importar tildes ni mayúsculas)', async () => {
    const original = (await prisma.parametro.findUniqueOrThrow({ where: { clave: 'reclamo.plazo_dias' } })).valor;
    await request(app).put('/api/admin/parametros').set(auth(admin)).send({ cambios: [{ clave: 'reclamo.plazo_dias', valor: '9' }] });
    await prisma.parametro.update({ where: { clave: 'reclamo.plazo_dias' }, data: { valor: original } });

    const config = (await actividad('?modulo=configuracion')).body.registros;
    expect(config.length).toBeGreaterThan(0);
    expect(config.every((x: { modulo: string }) => x.modulo === 'Configuración')).toBe(true);
    expect(config[0]).toMatchObject({ accion: 'Parámetro', registro: 'Plazo para reclamos', cambio: '7 días → 9 días' });

    const adminId = (await prisma.usuario.findUniqueOrThrow({ where: { nombreUsuario: 'admin' } })).id;
    const delAdmin = (await actividad(`?usuarioId=${adminId}`)).body.registros;
    expect(delAdmin.every((x: { usuario: string }) => x.usuario === 'admin')).toBe(true);

    const buscados = (await actividad('?q=INTENTO%20FALLIDO')).body.registros;
    expect(buscados.length).toBeGreaterThan(0);
    expect(buscados.every((x: { accion: string }) => x.accion === 'Intento fallido')).toBe(true);
    expect((await actividad('?q=plazo%20para%20reclamos')).body.total).toBeGreaterThan(0);
  });

  it('respeta el período elegido', async () => {
    const vieja = await prisma.bitacora.create({
      data: { modulo: 'seguridad', accion: 'login', entidad: 'usuario', fecha: instanteNY(sumarDias(hoyNegocio(), -40), '10:00') },
    });
    const ids = async (q: string) => (await actividad(q)).body.registros.map((x: { id: number }) => x.id);
    expect(await ids('?q=inicio')).not.toContain(vieja.id);
    expect(await ids(`?desde=${sumarDias(hoyNegocio(), -41)}&hasta=${sumarDias(hoyNegocio(), -39)}`)).toEqual([vieja.id]);
  });

  it('pagina los resultados y rechaza filtros inválidos con un mensaje claro', async () => {
    const r = await request(app).get('/api/admin/auditoria').set(auth(admin)).query({ pagina: 1 });
    expect(r.body.total).toBeGreaterThanOrEqual(r.body.registros.length);
    expect((await actividad(`?desde=${hoyNegocio()}&hasta=${sumarDias(hoyNegocio(), -1)}`)).body.mensaje)
      .toBe('La fecha de inicio debe ser anterior o igual a la fecha de fin.');
    expect((await actividad('?modulo=otro')).body.mensaje).toBe('Elija un módulo de la lista');
  });

  it('exporta a CSV con los mismos filtros y deja constancia de quién exportó (D.2.1)', async () => {
    const r = await request(app).get('/api/admin/auditoria/exportar?modulo=seguridad').set(auth(admin)).buffer(true);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/^text\/csv/);
    expect(r.headers['content-disposition']).toBe(`attachment; filename="garweb-actividad-${sumarDias(hoyNegocio(), -29)}-a-${hoyNegocio()}.csv"`);
    const lineas = r.text.replace(/^﻿/, '').split('\r\n');
    expect(lineas[0]).toBe('Fecha y hora,Usuario,Módulo,Acción,Registro,Antes → después,IP');
    expect(lineas.some((l) => l.includes(',sistema,Seguridad,Intento fallido,conductor,'))).toBe(true);
    expect(lineas.slice(1).filter(Boolean).every((l) => l.includes(',Seguridad,'))).toBe(true);

    const exportado = (await actividad('?q=exporto')).body.registros[0];
    expect(exportado).toMatchObject({ usuario: 'admin', modulo: 'Seguridad', accion: 'Exportó el registro de actividad' });
    expect(exportado.cambio).toMatch(/fila/);
  });
});
