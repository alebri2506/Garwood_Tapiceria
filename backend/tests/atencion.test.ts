// A2b Atender la cita o la visita a domicilio (decisiones L): tela elegida en la visita, traslado, respuesta del cliente
// (pedido + adelanto cobrado, paga después, lo pensará, no acepta) y recojo (agendado o llevado en la visita).
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { prisma } from '../src/shared/infrastructure/prisma.js';
import { ConsolaCorreo } from '../src/shared/infrastructure/correo.js';
import { rutasFijas } from '../src/shared/infrastructure/rutas.js';
import type { AlmacenArchivos } from '../src/shared/infrastructure/archivos.js';
import { hoyNegocio } from '../src/modules/comercial/domain/calendario.js';
import { instanteNY } from '../src/modules/comercial/domain/agenda.js';

const almacen: AlmacenArchivos = { async guardar() { return 'x'; }, async eliminar() {}, async urlTemporal(ruta) { return `/prueba/${ruta}`; } };
const app = crearApp({ correo: new ConsolaCorreo(), almacen, rutas: rutasFijas(14) });
const CLAVE = process.env.SEED_CONTRASENA!;
let admin = '';
let cliente = '';
const login = async (identificador: string) => (await request(app).post('/api/auth/login').send({ identificador, contrasena: CLAVE })).body.token as string;
const api = (metodo: 'get' | 'put' | 'post', ruta: string, token = admin) => request(app)[metodo](`/api/admin${ruta}`).set('Authorization', `Bearer ${token}`);

let n = 0;
let navyId = 0;
let precioNavy: unknown = null;
/** Una solicitud con visita a domicilio (o cita en el local) programada hoy a las 15:00. */
async function conVisita(opciones: { tipo?: 'domicilio' | 'local'; clienteId?: number } = {}) {
  const laura = await prisma.cliente.findUniqueOrThrow({ where: { email: 'laura.mendez@correo.com' } });
  const clienteId = opciones.clienteId ?? laura.id;
  const adminId = (await prisma.usuario.findUniqueOrThrow({ where: { nombreUsuario: 'admin' } })).id;
  const s3 = await prisma.tipoMueble.findUniqueOrThrow({ where: { codigo: 's3' } });
  const tipo = opciones.tipo ?? 'domicilio';
  const dir = await prisma.direccion.create({ data: { clienteId, direccion: '48 Park St, Montclair, NJ 07042', ciudad: 'Montclair', guardada: true } });
  n += 1;
  const s = await prisma.solicitud.create({
    data: {
      codigo: `SOL-96${String(n).padStart(2, '0')}`, clienteId, canal: 'web', telaOpcion: tipo, estado: 'En espera de cita', registradoPor: adminId,
      muebles: { create: [{ orden: 1, tipoMuebleId: s3.id, servicio: 'retapizado_espuma' }] },
    },
    include: { muebles: true },
  });
  const cita = await prisma.cita.create({ data: { solicitudId: s.id, tipo, fechaHora: instanteNY(hoyNegocio(), '15:00'), duracionMin: 60, direccionId: tipo === 'domicilio' ? dir.id : null, estado: 'Programada', registradoPor: adminId } });
  return { s, cita, dir };
}

/** Atiende la visita hasta tener la cotización lista: la marca atendida, define delivery y elige la tela. */
async function armarEnVisita(codigo: string, citaId: number, dirId: number, traslado: 'delivery' | 'propio' = 'delivery') {
  expect((await request(app).post(`/api/citas/${citaId}/resultado`).set('Authorization', `Bearer ${admin}`).send({ resultado: 'atendida' })).status).toBe(200);
  expect((await api('put', `/atencion/${codigo}/traslado`).send(traslado === 'delivery' ? { traslado, direccion: { tipo: 'guardada', id: dirId } } : { traslado })).status).toBe(200);
  const a = (await api('get', `/cotizaciones/armar/${codigo}`)).body;
  return {
    armado: a,
    entrada: {
      muebles: a.muebles.map((m: { solicitudMuebleId: number; actividades: { nombre: string; horasPersona: number; maquinaId: number | null; horasMaquina: number; materiales: { materialId: number; cantidad: number }[] }[] }) => ({
        solicitudMuebleId: m.solicitudMuebleId,
        actividades: m.actividades.map((x) => ({ nombre: x.nombre, horasPersona: x.horasPersona, maquinaId: x.maquinaId, horasMaquina: x.horasMaquina, materiales: x.materiales.map((y) => ({ materialId: y.materialId, cantidad: y.cantidad })) })),
        telas: [{ materialId: navyId, yardas: 14 }], propuesto: 1000, revisado: true,
      })),
      transporte: { manual: false }, adelanto: null, observaciones: '',
    },
  };
}

beforeAll(async () => {
  admin = await login('admin');
  cliente = await login('laura.mendez@correo.com');
  const navy = await prisma.material.findUniqueOrThrow({ where: { codigo: 'TP-204-4' } });
  navyId = navy.id;
  precioNavy = navy.precio;
  await prisma.material.update({ where: { id: navy.id }, data: { precio: 24 } });
});
afterAll(async () => {
  await prisma.material.update({ where: { codigo: 'TP-204-4' }, data: { precio: precioNavy as number | null } });
  await prisma.$disconnect();
});

describe('A2b · Atender la visita a domicilio', () => {
  it('solo el Administrador (RG-07)', async () => {
    const { s } = await conVisita();
    expect((await api('get', `/atencion/${s.codigo}`, cliente)).status).toBe(403);
    expect((await request(app).get(`/api/admin/atencion/${s.codigo}`)).status).toBe(401);
  });

  it('muestra a quién se atiende, la visita con su hora y las direcciones del cliente', async () => {
    const { s } = await conVisita();
    const r = await api('get', `/atencion/${s.codigo}`);
    expect(r.status).toBe(200);
    expect(r.body.cliente).toMatchObject({ nombre: 'Laura Méndez', telefono: '+19735550142' });
    expect(r.body.cita).toMatchObject({ tipo: 'domicilio', estado: 'Programada', hora: '15:00', direccion: '48 Park St, Montclair, NJ 07042' });
    expect(r.body.direcciones.length).toBeGreaterThan(0);
    expect(r.body.cotizacion).toBeNull();
  });

  it('la tela se elige en la visita del muestrario y viaja en el borrador de la cotización', async () => {
    const { s, cita, dir } = await conVisita();
    const { armado, entrada } = await armarEnVisita(s.codigo!, cita.id, dir.id);
    expect(armado.muebles[0].tela).toMatchObject({ tipo: 'pendiente', eligeAqui: true });
    expect(armado.muestrario.some((t: { id: number }) => t.id === navyId)).toBe(true);
    expect(armado.transporte).toMatchObject({ aplica: true, millas: 14 });
    expect((await api('put', `/cotizaciones/armar/${s.codigo}`).send(entrada)).status).toBe(200);
    const b = (await api('get', `/cotizaciones/armar/${s.codigo}`)).body;
    expect(b.muebles[0].tela).toMatchObject({ tipo: 'taller', eligeAqui: true, telas: [{ materialId: navyId, nombre: 'Lino Navy 204', precio: 24, yardas: 14 }] });
    // Sin tela no se puede cerrar la respuesta.
    const sinTela = await api('post', `/atencion/${s.codigo}/respuesta`).send({ cotizacion: { ...entrada, muebles: entrada.muebles.map((m: object) => ({ ...m, telas: [] })) }, respuesta: 'pensara' });
    expect(sinTela.status).toBe(400);
    expect(sinTela.body.errores).toHaveProperty(['muebles.0.tela']);
  });

  it('acepta y paga en la visita: pedido «Esperando mueble», adelanto confirmado y constancia para el cliente', async () => {
    const { s, cita, dir } = await conVisita();
    const { entrada } = await armarEnVisita(s.codigo!, cita.id, dir.id);
    expect((await api('post', `/atencion/${s.codigo}/respuesta`).send({ cotizacion: entrada, respuesta: 'acepta', pagaAhora: true })).body.errores).toHaveProperty('metodo');
    const r = await api('post', `/atencion/${s.codigo}/respuesta`).send({ cotizacion: entrada, respuesta: 'acepta', pagaAhora: true, metodo: 'zelle' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ estado: 'Aceptada', recojoPendiente: true });
    expect(r.body.pedido).toMatch(/^PED-\d{4}$/);
    const pedido = await prisma.pedido.findUniqueOrThrow({ where: { codigo: r.body.pedido }, include: { pagos: true, cotizacion: true } });
    expect(pedido).toMatchObject({ estado: 'Esperando mueble', solicitudId: s.id });
    expect(pedido.cotizacion).toMatchObject({ estado: 'Aceptada', medioRespuesta: 'En persona' });
    expect(pedido.pagos).toHaveLength(1);
    expect(pedido.pagos[0]).toMatchObject({ concepto: 'adelanto', metodo: 'zelle', origen: 'visita', estado: 'Confirmado' });
    expect(Number(pedido.pagos[0]!.monto)).toBe(r.body.adelanto);
    expect(await prisma.notificacion.count({ where: { solicitudId: s.id, tipo: 'pedido_generado' } })).toBe(1);
    expect(await prisma.bitacora.count({ where: { entidad: 'pedido', entidadId: pedido.id, accion: 'pedido_generado' } })).toBe(1);
    // A3: la solicitud queda cerrada como «Aceptada → pedido».
    const ficha = (await api('get', `/solicitudes/${s.codigo}`)).body;
    expect(ficha).toMatchObject({ etapa: 'Cerradas', estadoVisible: `Aceptada → pedido ${r.body.pedido}` });
  });

  it('el recojo se agenda en una hora libre (una por hora) o se lleva en la visita', async () => {
    const disp = (await api('get', '/atencion/recojos/disponibilidad')).body;
    expect(disp.duracionMin).toBe(60);
    expect(disp.dias.every((d: { fecha: string }) => new Date(`${d.fecha}T12:00:00Z`).getUTCDay() !== 0)).toBe(true);
    const libre = disp.dias.flatMap((d: { fecha: string; horas: { inicio: string; estado: string }[] }) => d.horas.filter((h) => h.estado === 'libre').map((h) => ({ fecha: d.fecha, hora: h.inicio })))[0];

    const uno = await conVisita();
    const p1 = (await api('post', `/atencion/${uno.s.codigo}/respuesta`).send({ cotizacion: (await armarEnVisita(uno.s.codigo!, uno.cita.id, uno.dir.id)).entrada, respuesta: 'acepta', pagaAhora: true, metodo: 'efectivo' })).body.pedido;
    const r = await api('post', `/atencion/pedidos/${p1}/recojo`).send({ tipo: 'agendado', ...libre });
    expect(r.status).toBe(200);
    expect(r.body.pedido.recojo).toMatchObject({ tipo: 'agendado', estado: 'Programado', fecha: libre.fecha, hora: libre.hora });
    expect(await prisma.notificacion.count({ where: { solicitudId: uno.s.id, tipo: 'recojo_programado' } })).toBe(1);
    expect((await api('post', `/atencion/pedidos/${p1}/recojo`).send({ tipo: 'en_visita' })).status).toBe(409);

    // Esa hora ya no está libre para otro recojo.
    const dos = await conVisita();
    const p2 = (await api('post', `/atencion/${dos.s.codigo}/respuesta`).send({ cotizacion: (await armarEnVisita(dos.s.codigo!, dos.cita.id, dos.dir.id)).entrada, respuesta: 'acepta', pagaAhora: true, metodo: 'efectivo' })).body.pedido;
    const ocupada = (await api('get', '/atencion/recojos/disponibilidad')).body.dias.find((d: { fecha: string }) => d.fecha === libre.fecha).horas.find((h: { inicio: string }) => h.inicio === libre.hora);
    expect(ocupada.estado).toBe('ocupada');
    expect((await api('post', `/atencion/pedidos/${p2}/recojo`).send({ tipo: 'agendado', ...libre })).status).toBe(409);
    // «Me lo llevo ahora»: recojo hecho en la visita.
    const llevado = await api('post', `/atencion/pedidos/${p2}/recojo`).send({ tipo: 'en_visita' });
    expect(llevado.body.pedido.recojo).toMatchObject({ tipo: 'en_visita', estado: 'Realizado' });
    expect((await prisma.pedido.findUniqueOrThrow({ where: { codigo: p2 } })).estado).toBe('Esperando mueble');
  });

  it('en una cita en el local no se puede «llevar el mueble ahora»', async () => {
    const { s, cita, dir } = await conVisita({ tipo: 'local' });
    const p = (await api('post', `/atencion/${s.codigo}/respuesta`).send({ cotizacion: (await armarEnVisita(s.codigo!, cita.id, dir.id)).entrada, respuesta: 'acepta', pagaAhora: true, metodo: 'tarjeta' })).body;
    expect(p.pedido).toBeTruthy();
    expect((await prisma.pago.findFirstOrThrow({ where: { pedido: { codigo: p.pedido } } })).origen).toBe('local');
    expect((await api('post', `/atencion/pedidos/${p.pedido}/recojo`).send({ tipo: 'en_visita' })).status).toBe(409);
  });

  it('acepta pero paga después: «Aceptada · falta adelanto», sin pedido todavía', async () => {
    const { s, cita, dir } = await conVisita();
    const { entrada } = await armarEnVisita(s.codigo!, cita.id, dir.id);
    const r = await api('post', `/atencion/${s.codigo}/respuesta`).send({ cotizacion: entrada, respuesta: 'acepta', pagaAhora: false });
    expect(r.body).toMatchObject({ estado: 'Aceptada: pendiente de adelanto', pedido: null, recojoPendiente: false });
    expect(await prisma.pedido.count({ where: { solicitudId: s.id } })).toBe(0);
    expect(await prisma.notificacion.count({ where: { solicitudId: s.id, tipo: 'cotizacion_aceptada' } })).toBe(1);
    expect((await api('get', `/solicitudes/${s.codigo}`)).body).toMatchObject({ etapa: 'Esperando al cliente', estadoVisible: 'Aceptada · falta adelanto' });
  });

  it('lo pensará (se publica en su cuenta) y no acepta (con motivo: la solicitud se cierra)', async () => {
    const piensa = await conVisita();
    const e1 = (await armarEnVisita(piensa.s.codigo!, piensa.cita.id, piensa.dir.id)).entrada;
    expect((await api('post', `/atencion/${piensa.s.codigo}/respuesta`).send({ cotizacion: e1, respuesta: 'pensara' })).body.estado).toBe('Pendiente de respuesta');
    expect((await prisma.solicitud.findUniqueOrThrow({ where: { id: piensa.s.id } })).estado).toBe('Cotizada');

    const no = await conVisita();
    const e2 = (await armarEnVisita(no.s.codigo!, no.cita.id, no.dir.id)).entrada;
    expect((await api('post', `/atencion/${no.s.codigo}/respuesta`).send({ cotizacion: e2, respuesta: 'rechaza' })).status).toBe(400);
    const r = await api('post', `/atencion/${no.s.codigo}/respuesta`).send({ cotizacion: e2, respuesta: 'rechaza', motivo: 'Precio' });
    expect(r.body.estado).toBe('Rechazada');
    expect(await prisma.cotizacion.findFirstOrThrow({ where: { solicitudId: no.s.id } })).toMatchObject({ estado: 'Rechazada', motivoRechazo: 'Precio' });
    expect((await api('get', `/solicitudes/${no.s.codigo}`)).body).toMatchObject({ estado: 'Rechazada', etapa: 'Cerradas' });
  });

  it('cliente con pedidos cerrados: adelanto 0 %, el pedido se genera sin cobrar', async () => {
    const empresa = await prisma.cliente.create({ data: { tipoPersona: 'persona', nombres: 'Tomás', apellidos: 'Frecuente', telefono: '+19735550999', canalRegistro: 'telefono' } });
    const viejo = await conVisita({ clienteId: empresa.id });
    await prisma.pedido.create({ data: { codigo: 'PED-9901', solicitudId: viejo.s.id, clienteId: empresa.id, estado: 'Cerrado', descripcion: 'Sillón' } });
    const { s, cita, dir } = await conVisita({ clienteId: empresa.id });
    const { armado, entrada } = await armarEnVisita(s.codigo!, cita.id, dir.id, 'propio');
    expect(armado.condiciones.adelantoPct).toBe(0);
    const r = await api('post', `/atencion/${s.codigo}/respuesta`).send({ cotizacion: entrada, respuesta: 'acepta' });
    expect(r.body).toMatchObject({ estado: 'Aceptada', adelanto: 0, recojoPendiente: false });
    expect(await prisma.pago.count({ where: { pedido: { codigo: r.body.pedido } } })).toBe(0);
  });
});
