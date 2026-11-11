// Mi perfil · paso 3 (CU-H02 · W10 › Direcciones de entrega · decisiones-recientes.md E.2).
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { prisma } from '../src/shared/infrastructure/prisma.js';
import { ConsolaCorreo } from '../src/shared/infrastructure/correo.js';
import { idDireccion, revisarDireccion } from '../src/modules/comercial/application/direcciones.js';

const app = crearApp({ correo: new ConsolaCorreo() });
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
type Dir = { id: number; etiqueta: string | null; direccion: string; esPrincipal: boolean };

let n = 0;
/** Un cliente nuevo desde la web (no se toca a Laura, que usan las demás pruebas). */
async function nuevoCliente() {
  const email = `direcciones.${Date.now()}.${n++}@correo.com`;
  const r = await request(app).post('/api/auth/registro').send({
    tipoPersona: 'persona', nombres: 'Ana', apellidos: 'Prueba', email, telefono: '+19735550100', contrasena: 'Taller2026', avisosCorreo: true,
  });
  expect(r.status).toBe(201);
  const clienteId = (await prisma.cliente.findUniqueOrThrow({ where: { email } })).id;
  const token = r.body.token as string;
  return {
    token, clienteId,
    agregar: (etiqueta: string, direccion = '48 Park St, Montclair, NJ 07042') =>
      request(app).post('/api/cliente/perfil/direcciones').set(auth(token)).send({ etiqueta, direccion, latitud: 40.81, longitud: -74.21 }),
    principal: (id: number) => request(app).post(`/api/cliente/perfil/direcciones/${id}/principal`).set(auth(token)),
    quitar: (id: number) => request(app).post(`/api/cliente/perfil/direcciones/${id}/quitar`).set(auth(token)),
    lista: async () => (await request(app).get('/api/cliente/perfil').set(auth(token))).body.direcciones as Dir[],
  };
}
const principales = (l: Dir[]) => l.filter((d) => d.esPrincipal).map((d) => d.etiqueta);

afterAll(() => prisma.$disconnect());

describe('E.2.1 Agregar', () => {
  it('la primera dirección queda como principal; las siguientes no', async () => {
    const c = await nuevoCliente();
    const r = await c.agregar('Casa');
    expect(r.status).toBe(201);
    expect(r.body.direcciones).toEqual([expect.objectContaining({ etiqueta: 'Casa', ciudad: 'Montclair', esPrincipal: true, latitud: 40.81 })]);
    const r2 = await c.agregar('Oficina', '200 Bloomfield Ave, Montclair, NJ');
    expect(principales(r2.body.direcciones)).toEqual(['Casa']);
    expect(r2.body.direcciones.map((d: Dir) => d.etiqueta)).toEqual(['Casa', 'Oficina']);
  });

  it('pide nombre y dirección completa', async () => {
    const c = await nuevoCliente();
    expect((await c.agregar('')).body.mensaje).toBe('Póngale un nombre (por ejemplo, Casa)');
    expect((await c.agregar('Casa', 'NJ')).body.mensaje).toBe('Escriba la dirección completa');
  });

  it('desde W2, la primera dirección guardada también queda como principal', async () => {
    const c = await nuevoCliente();
    const nueva = { tipo: 'nueva' as const, texto: '10 Main St, Newark, NJ', guardar: true };
    const id1 = await idDireccion(prisma, nueva, c.clienteId);
    const id2 = await idDireccion(prisma, { ...nueva, texto: '12 Main St, Newark, NJ' }, c.clienteId);
    // Una dirección que no se guarda en el perfil nunca es principal.
    const id3 = await idDireccion(prisma, { ...nueva, texto: '14 Main St, Newark, NJ', guardar: false }, c.clienteId);
    const filas = await prisma.direccion.findMany({ where: { id: { in: [id1!, id2!, id3!] } }, orderBy: { id: 'asc' } });
    expect(filas.map((d) => d.esPrincipal)).toEqual([true, false, false]);
  });
});

describe('E.2.4 Principal', () => {
  it('cambia la principal: siempre queda una sola', async () => {
    const c = await nuevoCliente();
    await c.agregar('Casa');
    const oficina = (await c.agregar('Oficina')).body.direcciones.find((d: Dir) => d.etiqueta === 'Oficina');
    const r = await c.principal(oficina.id);
    expect(r.status).toBe(200);
    // La principal va primero: W2 la propone.
    expect(r.body.direcciones.map((d: Dir) => [d.etiqueta, d.esPrincipal])).toEqual([['Oficina', true], ['Casa', false]]);
    expect(principales((await c.principal(oficina.id)).body.direcciones)).toEqual(['Oficina']);
  });
});

describe('E.2.2 Quitar (se oculta, no se borra)', () => {
  it('quitar la principal pasa la principal a la siguiente; sin direcciones, no queda ninguna', async () => {
    const c = await nuevoCliente();
    const casa = (await c.agregar('Casa')).body.direcciones[0];
    await c.agregar('Oficina');
    await c.agregar('Mamá');

    const r = await c.quitar(casa.id);
    expect(r.body.direcciones.map((d: Dir) => d.etiqueta)).toEqual(['Oficina', 'Mamá']);
    expect(principales(r.body.direcciones)).toEqual(['Oficina']);

    for (const d of await c.lista()) await c.quitar(d.id);
    expect(await c.lista()).toEqual([]);
    // Nada se borra: las filas siguen en la base, inactivas.
    expect(await prisma.direccion.count({ where: { clienteId: c.clienteId, activo: false } })).toBe(3);
  });

  it('una dirección quitada ya no se puede usar en W2, pero la solicitud que la usó la conserva', async () => {
    const c = await nuevoCliente();
    const casa = (await c.agregar('Casa')).body.direcciones[0];
    const admin = await prisma.usuario.findUniqueOrThrow({ where: { nombreUsuario: 'admin' } });
    const s = await prisma.solicitud.create({
      data: { clienteId: c.clienteId, canal: 'web', telaOpcion: 'sin', estado: 'Nueva', registradoPor: admin.id, direccionId: casa.id },
    });
    await c.quitar(casa.id);
    await expect(revisarDireccion({ tipo: 'guardada', id: casa.id }, c.clienteId)).rejects.toThrow(/no está en el perfil/);
    expect((await prisma.solicitud.findUniqueOrThrow({ where: { id: s.id } })).direccionId).toBe(casa.id);
  });
});

describe('RG-07 Cada cliente toca solo sus direcciones', () => {
  it('con el id de una dirección ajena responde como si no existiera', async () => {
    const duena = await nuevoCliente();
    const otro = await nuevoCliente();
    const casa = (await duena.agregar('Casa')).body.direcciones[0];
    await duena.agregar('Oficina');

    for (const r of [await otro.principal(casa.id), await otro.quitar(casa.id), await otro.quitar(999_999), await otro.quitar(-1)]) {
      expect(r.status).toBe(404);
      expect(r.body.mensaje).toBe('No encontramos esa dirección en su perfil.');
    }
    expect(await duena.lista()).toHaveLength(2);
    // El personal no tiene direcciones de perfil.
    const admin = (await request(app).post('/api/auth/login').send({ identificador: 'admin', contrasena: process.env.SEED_CONTRASENA })).body.token;
    expect((await request(app).post('/api/cliente/perfil/direcciones').set(auth(admin)).send({ etiqueta: 'X', direccion: '48 Park St' })).status).toBe(403);
  });

  it('cada cambio queda en el registro de actividad con texto legible', async () => {
    const c = await nuevoCliente();
    const casa = (await c.agregar('Casa')).body.direcciones[0];
    await c.agregar('Oficina');
    await c.quitar(casa.id);
    const admin = (await request(app).post('/api/auth/login').send({ identificador: 'admin', contrasena: process.env.SEED_CONTRASENA })).body.token;
    const actividad = (await request(app).get('/api/admin/auditoria?q=direccion%20quitada').set(auth(admin))).body.registros[0];
    expect(actividad).toMatchObject({ nombre: 'Ana Prueba', accion: 'Dirección quitada', registro: 'Ana Prueba', cambio: 'Casa · 48 Park St, Montclair, NJ 07042 · nueva principal: Oficina' });
  });
});
