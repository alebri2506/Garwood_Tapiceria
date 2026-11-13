// Almacén e Inventario (A15, A15b, A8, A8c, A8p, A9 · diseño del 12/11; CU-A01, A02, A03, A04, A09, A10) y la unidad
// de telas y medidas como parámetro de tipo «opción» (A14). Usa los datos de prueba de prisma/seed-inventario.ts.
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { prisma } from '../src/shared/infrastructure/prisma.js';
import { ConsolaCorreo } from '../src/shared/infrastructure/correo.js';
import {
  aTiempo, alcanzaPara, aplicarMovimiento, cantidadSugerida, diferenciasConteo, estadoStock, explicarSugerido, necesitaReponer, razonReposicion, siguienteCodigo,
} from '../src/modules/almacen/domain/inventario.js';
import { validarValor } from '../src/modules/seguridad/domain/parametros.js';

const app = crearApp({ correo: new ConsolaCorreo() });
const CLAVE = process.env.SEED_CONTRASENA!;
const login = async (identificador: string) => (await request(app).post('/api/auth/login').send({ identificador, contrasena: CLAVE })).body.token as string;
let admin = '';
let cliente = '';
const api = (metodo: 'get' | 'post' | 'put', ruta: string, token = admin) => request(app)[metodo](`/api/admin/inventario${ruta}`).set('Authorization', `Bearer ${token}`);
const material = (codigo: string) => prisma.material.findUniqueOrThrow({ where: { codigo } });
const stock = async (codigo: string) => Number((await material(codigo)).stockFisico);

beforeAll(async () => {
  admin = await login('admin');
  cliente = await login('laura.mendez@correo.com');
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('Reglas del inventario (sin base de datos)', () => {
  const espuma = { fisico: 7, reservado: 1, minimo: 10, porLlegar: 0, consumoSemanal: 6 };

  it('disponible = en el estante − reservado, y el estado sale de ahí', () => {
    expect(estadoStock(espuma)).toBe('bajo');
    expect(estadoStock({ ...espuma, fisico: 3, reservado: 5 })).toBe('falta');
    expect(estadoStock({ ...espuma, fisico: 30 })).toBe('ok');
    // Si ya viene una compra en camino no se vuelve a pedir.
    expect(estadoStock({ ...espuma, porLlegar: 4 })).toBe('pedido');
    expect(necesitaReponer({ ...espuma, porLlegar: 4 })).toBe(false);
  });

  it('sugiere consumo × semanas − disponible − lo que viene, nunca menos de lo que falta para el mínimo (ejemplo del diseño)', () => {
    expect(cantidadSugerida(espuma, 2)).toBe(6);
    expect(explicarSugerido(espuma, 2)).toBe('Usa 6/sem × 2 semanas = 12 − disponible 6 = 6');
    // Sin consumo, completa el mínimo.
    expect(cantidadSugerida({ ...espuma, consumoSemanal: 0 }, 2)).toBe(4);
    // Lo que ya viene se descuenta; nunca negativo.
    expect(cantidadSugerida({ ...espuma, porLlegar: 20 }, 2)).toBe(0);
  });

  it('dice para cuánto alcanza y por qué se repone', () => {
    expect(alcanzaPara(espuma, 'planchas')).toBe('~1 semana');
    expect(alcanzaPara({ ...espuma, fisico: 3, reservado: 5 }, 'kg')).toBe('Faltan 2 kg');
    expect(alcanzaPara({ ...espuma, fisico: 100 }, 'u')).toBe('Más de 2 meses');
    expect(razonReposicion({ ...espuma, fisico: 3, reservado: 5 }, 'kg', ['PED-0082'])).toEqual({ texto: 'Faltan 2 kg para PED-0082', urgente: true });
    expect(razonReposicion({ ...espuma, consumoSemanal: 1 }, 'planchas', [])).toEqual({ texto: 'Bajo el mínimo (10 planchas)', urgente: false });
  });

  it('nunca sale más de lo que hay en el estante', () => {
    expect(aplicarMovimiento(3, -2)).toEqual({ saldo: 1 });
    expect(aplicarMovimiento(3, -4)).toEqual({ error: 'No puede salir más de lo que hay en el estante.' });
  });

  it('el conteo solo marca lo que no coincide; códigos y llegada a tiempo', () => {
    expect(diferenciasConteo([{ sistema: 9, contado: 8 }, { sistema: 5, contado: 5 }])).toEqual([{ sistema: 9, contado: 8, diferencia: -1 }]);
    expect(siguienteCodigo('OC', 'OC-0007')).toBe('OC-0008');
    expect(siguienteCodigo('MAT', null)).toBe('MAT-0001');
    expect(aTiempo('2026-11-16', '2026-11-19')).toBe('a_tiempo');
    expect(aTiempo('2026-11-20', '2026-11-19')).toBe('tarde');
    expect(aTiempo('2026-11-20', null)).toBe('reposicion');
  });

  it('A14: las unidades son una opción de la lista', () => {
    const unidad = { tipo: 'opcion', unidad: null, minimo: null, maximo: null, opciones: 'yd=Yarda|m=Metro' };
    expect(validarValor(unidad, 'm')).toEqual({ valor: 'm' });
    expect(validarValor(unidad, 'cm')).toEqual({ error: 'Elija una de las opciones: Yarda, Metro.' });
  });
});

describe('A15 Stock', () => {
  it('solo el Administrador (RG-07)', async () => {
    expect((await api('get', '/stock', cliente)).status).toBe(403);
    expect((await request(app).get('/api/admin/inventario/stock')).status).toBe(401);
  });

  it('calcula reservado, disponible, consumo y estado de cada material', async () => {
    const r = await api('get', '/stock');
    expect(r.status).toBe(200);
    const fila = (n: string) => r.body.materiales.find((m: { nombre: string }) => m.nombre === n);
    expect(fila('Espuma HD 2"')).toMatchObject({ fisico: 7, reservado: 1, disponible: 6, minimo: 10, consumoSemanal: 6, estado: 'bajo', reservadoPara: ['PED-0076'] });
    // Faltan 2 kg para PED-0082, pero ya vienen 4 kg: «Pedido».
    expect(fila('Plumas (relleno)')).toMatchObject({ disponible: -2, estado: 'pedido', porLlegar: 4 });
    expect(fila('Botones forrables')).toMatchObject({ disponible: 96, estado: 'ok' });
    expect(r.body.porReponer).toBe(2);
    expect(r.body.materiales.some((m: { categoria: string }) => m.categoria === 'tela')).toBe(false);
  });

  it('«Nuevo material» entra con 0 y queda en la bitácora; la unidad no cambia si ya tiene movimientos', async () => {
    const prov = await prisma.proveedor.findUniqueOrThrow({ where: { nombre: 'Proveedor de insumos' } });
    const nuevo = await api('post', '/materiales').send({ nombre: 'Cinta de tapicería', categoria: 'insumo', unidad: 'rollos', proveedorId: prov.id, minimo: 2, precio: 4.5 });
    expect(nuevo.status).toBe(201);
    expect(nuevo.body).toMatchObject({ fisico: 0, unidad: 'rollos', estado: 'bajo', tieneMovimientos: false });
    expect(await prisma.bitacora.count({ where: { accion: 'material_creado', entidadId: nuevo.body.id } })).toBe(1);

    expect((await api('post', '/materiales').send({ nombre: 'cinta de tapicería', unidad: 'u', proveedorId: prov.id, minimo: 0, precio: 1 })).status).toBe(409);
    expect((await api('post', '/materiales').send({ nombre: 'Sin unidad', proveedorId: prov.id, minimo: 0, precio: 1 })).body.errores).toHaveProperty('unidad');

    const guata = await material('MAT-0005');
    const cambio = await api('put', `/materiales/${guata.id}`).send({ nombre: 'Guata', unidad: 'm', proveedorId: prov.id, minimo: 10, precio: 3 });
    expect(cambio.status).toBe(400);
    expect(cambio.body.mensaje).toMatch(/ya tiene movimientos/);
  });

  it('un precio nuevo queda con su fecha y su valor anterior en la bitácora', async () => {
    const guata = await material('MAT-0005');
    const r = await api('put', `/materiales/${guata.id}`).send({ nombre: 'Guata', proveedorId: guata.proveedorId, minimo: 10, precio: 3.25 });
    expect(r.status).toBe(200);
    expect(r.body.precio).toBe(3.25);
    const b = await prisma.bitacora.findFirstOrThrow({ where: { accion: 'material_modificado', entidadId: guata.id }, orderBy: { id: 'desc' } });
    expect(b.valorAnterior).toMatchObject({ precio: 3 });
    expect(b.valorNuevo).toMatchObject({ precio: 3.25 });
  });
});

describe('A8c «Corregir stock»', () => {
  it('no deja sacar más de lo que hay, exige motivo y, si es de un pedido, el pedido', async () => {
    const plumas = await material('MAT-0004');
    expect((await api('post', '/movimientos').send({ materialId: plumas.id, sentido: 'sale', cantidad: 50, motivo: 'Se dañó' })).body.mensaje).toBe('No puede salir más de lo que hay en el estante.');
    expect((await api('post', '/movimientos').send({ materialId: plumas.id, sentido: 'sale', cantidad: 1, motivo: 'Retiro para un pedido' })).body.errores).toHaveProperty('pedidoId');
    expect((await api('post', '/movimientos').send({ materialId: plumas.id, sentido: 'sale', cantidad: 1, motivo: 'Otro' })).body.errores).toHaveProperty('otroMotivo');
    expect((await api('post', '/movimientos').send({ materialId: plumas.id, sentido: 'entra', cantidad: 1, motivo: 'Se dañó' })).status).toBe(400);
    // Un pedido entregado ya no está en proceso.
    const entregado = await prisma.pedido.findUniqueOrThrow({ where: { codigo: 'PED-0070' } });
    expect((await api('post', '/movimientos').send({ materialId: plumas.id, sentido: 'sale', cantidad: 1, motivo: 'Retiro para un pedido', pedidoId: entregado.id })).status).toBe(400);
  });

  it('el retiro para un pedido baja el estante y su reserva, y queda en el kardex con su saldo', async () => {
    const espuma = await material('MAT-0001');
    const ped = await prisma.pedido.findUniqueOrThrow({ where: { codigo: 'PED-0076' } });
    const antes = await stock('MAT-0001');
    const r = await api('post', '/movimientos').send({ materialId: espuma.id, sentido: 'sale', cantidad: 1, motivo: 'Retiro para un pedido', pedidoId: ped.id });
    expect(r.status).toBe(201);
    expect(await stock('MAT-0001')).toBe(antes - 1);
    const reserva = await prisma.reservaMaterial.findUniqueOrThrow({ where: { pedidoId_materialId: { pedidoId: ped.id, materialId: espuma.id } } });
    expect(Number(reserva.retirado)).toBe(1);

    const kardex = await api('get', `/movimientos?materialId=${espuma.id}`);
    expect(kardex.body.movimientos[0]).toMatchObject({ tipo: 'salida', motivo: 'Retiro para un pedido', pedido: 'PED-0076', cantidad: -1, saldo: antes - 1, quien: 'Administrador' });
    const fila = (await api('get', '/stock')).body.materiales.find((m: { nombre: string }) => m.nombre === 'Espuma HD 2"');
    expect(fila).toMatchObject({ reservado: 0, reservadoPara: [] });
  });

  it('busca pedidos en proceso por código o cliente', async () => {
    const r = await api('get', '/pedidos-en-proceso?q=hotel');
    expect(r.body.pedidos.map((p: { codigo: string }) => p.codigo)).toEqual(['PED-0084']);
  });
});

describe('A8 Reponer', () => {
  it('lista telas para encargar, materiales por proveedor con cantidad sugerida y compras por llegar', async () => {
    const r = await api('get', '/reponer');
    expect(r.status).toBe(200);
    expect(r.body.telasParaEncargar).toHaveLength(1);
    expect(r.body.telasParaEncargar[0]).toMatchObject({ nombre: 'Terciopelo Vino', cantidad: 9, precio: 21, subtotal: 189 });
    expect(r.body.telasParaEncargar[0].pedidos.map((p: { codigo: string }) => p.codigo)).toEqual(['PED-0086', 'PED-0088']);
    const nombres = r.body.porProveedor.flatMap((p: { lineas: { nombre: string }[] }) => p.lineas.map((l) => l.nombre));
    expect(nombres).toEqual(expect.arrayContaining(['Espuma HD 2"', 'Guata']));
    const guata = r.body.porProveedor.flatMap((p: { lineas: { nombre: string; sugerido: number }[] }) => p.lineas).find((l: { nombre: string }) => l.nombre === 'Guata');
    expect(guata.sugerido).toBe(4);
    expect(r.body.porLlegar.map((x: { nombre: string }) => x.nombre)).toEqual(expect.arrayContaining(['Plumas (relleno)', 'Grapas 71/10']));
  });

  it('«Marcar como pedido» pasa a «Por llegar» y «Llegó» suma al stock con su entrada', async () => {
    const guata = await material('MAT-0005');
    const antes = await stock('MAT-0005');
    const pedido = await api('post', '/compras').send({ proveedorId: guata.proveedorId, lineas: [{ materialId: guata.id, cantidad: 4 }] });
    expect(pedido.status).toBe(201);
    expect(pedido.body.codigo).toMatch(/^OC-\d{4}$/);
    const fila = (await api('get', '/stock')).body.materiales.find((m: { nombre: string }) => m.nombre === 'Guata');
    expect(fila).toMatchObject({ estado: 'pedido', porLlegar: 4 });

    // A otro proveedor no se le puede pedir este material.
    const espumas = await prisma.proveedor.findUniqueOrThrow({ where: { nombre: 'Proveedor de espumas' } });
    expect((await api('post', '/compras').send({ proveedorId: espumas.id, lineas: [{ materialId: guata.id, cantidad: 1 }] })).status).toBe(400);

    const compra = await prisma.compra.findUniqueOrThrow({ where: { codigo: pedido.body.codigo } });
    const llego = await api('post', `/compras/${compra.id}/llegada`);
    expect(llego.status).toBe(200);
    expect(await stock('MAT-0005')).toBe(antes + 4);
    expect((await api('post', `/compras/${compra.id}/llegada`)).status).toBe(409);
    const mov = await prisma.movimientoInventario.findFirstOrThrow({ where: { compraId: compra.id } });
    expect(mov).toMatchObject({ tipo: 'entrada', motivo: 'Compra recibida' });
  });

  it('la tela se encarga para todos sus pedidos y al llegar queda en ellos, sin entrar al stock', async () => {
    const vino = await material('TP-220-9');
    const r = await api('post', '/encargos').send({ materialId: vino.id });
    expect(r.status).toBe(201);
    expect(await prisma.encargoTela.count({ where: { materialId: vino.id, estado: 'encargada' } })).toBe(2);
    expect((await api('get', '/reponer')).body.telasParaEncargar).toHaveLength(0);

    const compra = await prisma.compra.findUniqueOrThrow({ where: { codigo: r.body.codigo } });
    const llego = await api('post', `/compras/${compra.id}/llegada`);
    expect(llego.body.efectos).toEqual(expect.arrayContaining([expect.stringMatching(/asignadas a PED-0086/)]));
    expect(await prisma.encargoTela.count({ where: { materialId: vino.id, estado: 'llego' } })).toBe(2);
    expect(Number((await material('TP-220-9')).stockFisico)).toBe(0);
    expect(await prisma.movimientoInventario.count({ where: { materialId: vino.id } })).toBe(0);
  });
});

describe('A9 Conteo de inventario', () => {
  it('la lista para contar no muestra lo que dice el sistema (conteo a ciegas)', async () => {
    const r = await api('get', '/conteo');
    expect(r.status).toBe(200);
    expect(r.body.grupos.map((g: { nombre: string }) => g.nombre)).toEqual(['Espumas', 'Rellenos', 'Insumos pequeños', 'Pegamentos']);
    expect(JSON.stringify(r.body.grupos)).not.toMatch(/fisico|sistema|stock/i);
  });

  it('compara, exige el motivo de cada diferencia y deja el saldo igual a lo contado', async () => {
    const hilo = await material('MAT-0006');
    const cierres = await material('MAT-0007');
    const sistemaHilo = Number(hilo.stockFisico);
    const contados = [{ materialId: hilo.id, contado: sistemaHilo - 1 }, { materialId: cierres.id, contado: Number(cierres.stockFisico) }];

    const comparar = await api('post', '/conteo/comparar').send({ contados });
    expect(comparar.body).toMatchObject({ total: 2, diferencias: [{ nombre: 'Hilo nylon 40', sistema: sistemaHilo, contado: sistemaHilo - 1, diferencia: -1 }] });

    const sinMotivo = await api('post', '/conteo').send({ contados });
    expect(sinMotivo.status).toBe(400);
    expect(sinMotivo.body.errores).toHaveProperty(String(hilo.id));

    const ok = await api('post', '/conteo').send({ contados: [{ ...contados[0], motivo: 'Uso sin anotar' }, contados[1]] });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ contados: 2, coincidieron: 1, ajustados: 1 });
    expect(await stock('MAT-0006')).toBe(sistemaHilo - 1);
    const movs = await prisma.movimientoInventario.findMany({ where: { conteoId: ok.body.conteoId }, orderBy: { id: 'asc' } });
    expect(movs.map((m) => [m.tipo, m.motivo, m.detalle])).toEqual([['ajuste', 'Ajuste de conteo', 'Uso sin anotar'], ['conteo', 'Conteo de inventario · coincide', null]]);
  });
});

describe('A15b Telas y A8p Proveedores', () => {
  it('registra una tela con nombre automático y la descontinúa sin borrarla: el cliente deja de verla', async () => {
    const telas = await prisma.proveedor.findUniqueOrThrow({ where: { nombre: 'Proveedor de telas' } });
    const r = await api('post', '/telas').send({ proveedorId: telas.id, tipo: 'Terciopelo', color: 'Azul', pattern: '214', numeroColor: '3', precio: 21, enWeb: true });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ nombre: 'Terciopelo · Pattern 214 · color 3', activa: true, enWeb: true });
    expect((await api('post', '/telas').send({ proveedorId: telas.id, tipo: 'Terciopelo', color: 'Azul', pattern: '214', numeroColor: '3', precio: 21, enWeb: true })).status).toBe(409);
    // Una tela no se le compra al proveedor de espumas.
    const espumas = await prisma.proveedor.findUniqueOrThrow({ where: { nombre: 'Proveedor de espumas' } });
    expect((await api('post', '/telas').send({ proveedorId: espumas.id, tipo: 'Lino', color: 'Gris', pattern: '9', numeroColor: '9', precio: 10, enWeb: true })).status).toBe(400);

    const catalogo = async () => (await request(app).get('/api/solicitudes/catalogo').set('Authorization', `Bearer ${cliente}`)).body.telas.map((t: { id: number }) => t.id);
    expect(await catalogo()).toContain(r.body.id);
    const off = await api('put', `/telas/${r.body.id}/oferta`).send({ activa: false });
    expect(off.body.activa).toBe(false);
    expect(await catalogo()).not.toContain(r.body.id);
    expect(await prisma.material.count({ where: { id: r.body.id } })).toBe(1);
  });

  it('el Administrador ve en el catálogo también las telas «Solo en el taller»', async () => {
    const telas = (await request(app).get('/api/solicitudes/catalogo').set('Authorization', `Bearer ${admin}`)).body.telas.map((t: { nombre: string }) => t.nombre);
    expect(telas).toContain('Estampado Floral');
  });

  it('proveedores: lista con lo pendiente, y valida días y nombre repetido', async () => {
    const r = await api('get', '/proveedores');
    expect(r.body.proveedores.map((p: { nombre: string }) => p.nombre)).toEqual(['Proveedor de espumas', 'Proveedor de insumos', 'Proveedor de telas']);
    expect((await api('post', '/proveedores').send({ nombre: 'Rellenos NJ', canal: 'whatsapp', contacto: '(973) 555-0199', diasMin: 5, diasMax: 3, tipo: 'stock' })).body.errores).toHaveProperty('diasMax');
    expect((await api('post', '/proveedores').send({ nombre: 'proveedor de telas', canal: 'telefono', contacto: '1', diasMin: 1, diasMax: 2, tipo: 'telas' })).status).toBe(409);
    expect((await api('post', '/proveedores').send({ nombre: 'Rellenos NJ', canal: 'whatsapp', contacto: '(973) 555-0199', diasMin: 3, diasMax: 5, tipo: 'stock' })).status).toBe(201);
  });
});
