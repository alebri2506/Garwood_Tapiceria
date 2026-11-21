// A2b Atender la cita o la visita a domicilio (decisiones L): tela elegida en la visita, traslado, respuesta del cliente
// (pedido + adelanto cobrado, paga después, lo pensará, no acepta) y recojo (agendado o llevado en la visita).
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { prisma } from '../src/shared/infrastructure/prisma.js';
import { ConsolaCorreo } from '../src/shared/infrastructure/correo.js';
import { rutasFijas } from '../src/shared/infrastructure/rutas.js';
import type { Pasarela, ResultadoPago } from '../src/shared/infrastructure/pasarela.js';
import type { AlmacenArchivos } from '../src/shared/infrastructure/archivos.js';
import { hoyNegocio } from '../src/modules/comercial/domain/calendario.js';
import { instanteNY, sumarDias } from '../src/modules/comercial/domain/agenda.js';

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

  it('una sola agenda sin cruces: el recojo ocupa los turnos de citas y una cita ocupa la hora del recojo', async () => {
    type Dia = { fecha: string; horas: { inicio: string; estado: string }[] };
    const recojos = async () => (await api('get', '/atencion/recojos/disponibilidad')).body.dias as Dia[];
    const turnosLocal = async (fecha: string) => (await request(app).get(`/api/citas/disponibilidad?tipo=local&desde=${fecha}&dias=1`).set('Authorization', `Bearer ${cliente}`)).body.dias[0].turnos as { hora: string; libre: boolean }[];

    // Un recojo de 15:00 a 16:00 (desde mañana, para que no haya horas pasadas) deja sin ofrecer las citas de 15:00 y 15:30.
    const dia = (await recojos()).find((d) => d.fecha > hoyNegocio() && d.horas.some((h) => h.inicio === '15:00' && h.estado === 'libre'))!;
    // Las horas de inicio son las de la Agenda (cada 30 min) donde cabe la hora entera del recojo.
    expect(dia.horas.map((h) => h.inicio)).toEqual(['09:30', '10:00', '10:30', '11:00', '15:00', '15:30', '16:00']);
    expect((await turnosLocal(dia.fecha)).filter((t) => ['15:00', '15:30'].includes(t.hora)).every((t) => t.libre)).toBe(true);
    const { s, cita, dir } = await conVisita();
    const pedido = (await api('post', `/atencion/${s.codigo}/respuesta`).send({ cotizacion: (await armarEnVisita(s.codigo!, cita.id, dir.id)).entrada, respuesta: 'acepta', pagaAhora: true, metodo: 'efectivo' })).body.pedido;
    expect((await api('post', `/atencion/pedidos/${pedido}/recojo`).send({ tipo: 'agendado', fecha: dia.fecha, hora: '15:00' })).status).toBe(200);
    const local = await turnosLocal(dia.fecha);
    expect(local.find((t) => t.hora === '15:00')!.libre).toBe(false);
    expect(local.find((t) => t.hora === '15:30')!.libre).toBe(false);
    expect(local.find((t) => t.hora === '16:00')!.libre).toBe(true);
    // La Agenda de citas lo muestra.
    const semana = (await api('get', `/agenda?desde=${dia.fecha}`)).body;
    expect(semana.recojos).toEqual(expect.arrayContaining([expect.objectContaining({ pedido, fecha: dia.fecha, hora: '15:00', fin: '16:00', estadoPedido: 'Esperando mueble', telefono: expect.any(String), cotizacion: expect.stringMatching(/^COT-/), agendadoPor: expect.any(String), duracionMin: 60 })]));

    // Al revés: una cita en el local a las 10:30 ocupa la hora de recojo de 10:00 a 11:00.
    const otro = (await recojos()).find((d) => d.fecha > hoyNegocio() && d.horas.some((h) => h.inicio === '10:00' && h.estado === 'libre'))!;
    const conCita = await conVisita({ tipo: 'local' });
    await prisma.cita.update({ where: { id: conCita.cita.id }, data: { fechaHora: instanteNY(otro.fecha, '10:30'), duracionMin: 30 } });
    const hora = (await recojos()).find((d) => d.fecha === otro.fecha)!.horas.find((h) => h.inicio === '10:00')!;
    expect(hora.estado).toBe('ocupada');
  });

  it('«Empezar» la deja «En atención» hasta registrar la respuesta: recién ahí la cita queda «Atendida»', async () => {
    const { s, cita, dir } = await conVisita({ tipo: 'local' });
    const r = await api('post', `/atencion/${s.codigo}/empezar`);
    expect(r.body).toEqual({ cita: 'En atención', solicitud: 'En atención' });
    expect((await prisma.cita.findUniqueOrThrow({ where: { id: cita.id } })).estado).toBe('En atención');
    // Se puede volver a abrir (se retoma) sin cambiar nada; la pantalla de la atención la ve «En atención».
    expect((await api('post', `/atencion/${s.codigo}/empezar`)).body.cita).toBe('En atención');
    expect((await api('get', `/atencion/${s.codigo}`)).body.cita.estado).toBe('En atención');
    // A medias: arma la cotización (traslado y tela) pero no termina → no está «Atendida».
    expect((await api('put', `/atencion/${s.codigo}/traslado`).send({ traslado: 'delivery', direccion: { tipo: 'guardada', id: dir.id } })).status).toBe(200);
    const a = (await api('get', `/cotizaciones/armar/${s.codigo}`)).body;
    const entrada = {
      muebles: a.muebles.map((m: { solicitudMuebleId: number; actividades: { nombre: string; horasPersona: number; maquinaId: number | null; horasMaquina: number; materiales: { materialId: number; cantidad: number }[] }[] }) => ({
        solicitudMuebleId: m.solicitudMuebleId, telas: [{ materialId: navyId, yardas: 12 }], propuesto: 900, revisado: true,
        actividades: m.actividades.map((x) => ({ nombre: x.nombre, horasPersona: x.horasPersona, maquinaId: x.maquinaId, horasMaquina: x.horasMaquina, materiales: x.materiales.map((y) => ({ materialId: y.materialId, cantidad: y.cantidad })) })),
      })),
      transporte: { manual: false }, adelanto: null, observaciones: '',
    };
    expect((await api('put', `/cotizaciones/armar/${s.codigo}`).send(entrada)).status).toBe(200);
    expect((await prisma.solicitud.findUniqueOrThrow({ where: { id: s.id } })).estado).toBe('En atención');
    expect((await prisma.cita.findUniqueOrThrow({ where: { id: cita.id } })).estado).toBe('En atención');
    // Con la respuesta del cliente termina: cita «Atendida» y solicitud «Cotizada».
    expect((await api('post', `/atencion/${s.codigo}/respuesta`).send({ cotizacion: entrada, respuesta: 'pensara' })).status).toBe(200);
    expect((await prisma.cita.findUniqueOrThrow({ where: { id: cita.id } })).estado).toBe('Atendida');
    expect((await prisma.solicitud.findUniqueOrThrow({ where: { id: s.id } })).estado).toBe('Cotizada');
    expect(await prisma.bitacora.count({ where: { entidad: 'cita', entidadId: cita.id, accion: { in: ['cita_en_atencion', 'cita_atendida'] } } })).toBe(2);
  });

  it('solo se atiende el día de la cita (decisiones L.2.11); una ya «En atención» se retoma cualquier día', async () => {
    // Cita de otro día (mañana o ayer): ni «Empezar» ni marcarla atendida.
    const otra = await conVisita({ tipo: 'local' });
    await prisma.cita.update({ where: { id: otra.cita.id }, data: { fechaHora: instanteNY(sumarDias(hoyNegocio(), 1), '15:00') } });
    const r = await api('post', `/atencion/${otra.s.codigo}/empezar`);
    expect(r.status).toBe(409);
    expect(r.body.mensaje).toMatch(/se atiende ese día.*reprograme la cita para hoy/);
    expect((await request(app).post(`/api/citas/${otra.cita.id}/resultado`).set('Authorization', `Bearer ${admin}`).send({ resultado: 'atendida' })).status).toBe(409);
    await prisma.cita.update({ where: { id: otra.cita.id }, data: { fechaHora: instanteNY(sumarDias(hoyNegocio(), -1), '15:00') } });
    expect((await api('post', `/atencion/${otra.s.codigo}/empezar`)).body.mensaje).toMatch(/Ese día ya pasó/);
    expect((await prisma.cita.findUniqueOrThrow({ where: { id: otra.cita.id } })).estado).toBe('Programada');

    // Empezada el día que correspondía: se puede continuar después.
    const hoy = await conVisita({ tipo: 'local' });
    expect((await api('post', `/atencion/${hoy.s.codigo}/empezar`)).body.cita).toBe('En atención');
    await prisma.cita.update({ where: { id: hoy.cita.id }, data: { fechaHora: instanteNY(sumarDias(hoyNegocio(), -1), '15:00') } });
    expect((await api('post', `/atencion/${hoy.s.codigo}/empezar`)).body.cita).toBe('En atención');
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
    // W6c: el cliente ve el total, el adelanto y la vigencia para «Ver y responder»; nunca el sugerido ni el desglose (RG-08).
    const mias = (await request(app).get('/api/solicitudes').set('Authorization', `Bearer ${cliente}`)).body as { codigo: string; cotizacion: Record<string, unknown> | null }[];
    const vista = mias.find((x) => x.codigo === piensa.s.codigo)!.cotizacion!;
    expect(vista).toMatchObject({ estado: 'Pendiente de respuesta', conTraslado: true, pedido: null });
    expect(vista.total).toBeGreaterThan(0);
    expect(vista.vigenciaHasta).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Object.keys(vista).sort()).toEqual(['adelanto', 'codigo', 'conTraslado', 'estado', 'pedido', 'total', 'vigenciaHasta']);

    const no = await conVisita();
    const e2 = (await armarEnVisita(no.s.codigo!, no.cita.id, no.dir.id)).entrada;
    expect((await api('post', `/atencion/${no.s.codigo}/respuesta`).send({ cotizacion: e2, respuesta: 'rechaza' })).status).toBe(400);
    const r = await api('post', `/atencion/${no.s.codigo}/respuesta`).send({ cotizacion: e2, respuesta: 'rechaza', motivo: 'Precio' });
    expect(r.body.estado).toBe('Rechazada');
    expect(await prisma.cotizacion.findFirstOrThrow({ where: { solicitudId: no.s.id } })).toMatchObject({ estado: 'Rechazada', motivoRechazo: 'Precio' });
    expect((await api('get', `/solicitudes/${no.s.codigo}`)).body).toMatchObject({ estado: 'Rechazada', etapa: 'Cerradas' });
  });

  it('telas por partes (como W2): cada parte con su tela; al publicar queda en la solicitud y la cotización va por tela', async () => {
    const { s, cita, dir } = await conVisita({ tipo: 'local' });
    const { entrada } = await armarEnVisita(s.codigo!, cita.id, dir.id);
    const partes = await prisma.tipoMuebleParte.findMany({ where: { tipoMueble: { codigo: 's3' } }, orderBy: { orden: 'asc' } });
    const otra = await prisma.material.findFirstOrThrow({ where: { categoria: 'tela', activo: true, precio: { not: null }, id: { not: navyId } } });
    const asiento = partes[1]!.id;
    const porPartes = partes.map((p) => ({ parteId: p.id, materialId: p.id === asiento ? otra.id : navyId }));
    const mueble = { ...entrada.muebles[0], telas: [{ materialId: navyId, yardas: 14 }, { materialId: otra.id, yardas: 5 }] };

    // Falta la tela de una parte: no se publica.
    const incompleta = await api('post', `/atencion/${s.codigo}/respuesta`).send({ cotizacion: { ...entrada, muebles: [{ ...mueble, partes: porPartes.slice(1) }] }, respuesta: 'pensara' });
    expect(incompleta.status).toBe(400);
    expect(JSON.stringify(incompleta.body)).toMatch(/cada parte/);

    const r = await api('post', `/atencion/${s.codigo}/respuesta`).send({ cotizacion: { ...entrada, muebles: [{ ...mueble, partes: porPartes }] }, respuesta: 'pensara' });
    expect(r.status).toBe(200);
    const sm = await prisma.solicitudMueble.findFirstOrThrow({ where: { solicitudId: s.id }, include: { telas: true } });
    expect(sm.modoTela).toBe('partes');
    expect(sm.telas).toHaveLength(partes.length);
    expect(sm.telas.find((t) => t.parteId === asiento)?.materialId).toBe(otra.id);
    // La cotización: una fila por tela con sus yardas (el precio no cambia por repartirla en partes).
    const cm = await prisma.cotizacionMueble.findFirstOrThrow({ where: { cotizacion: { solicitudId: s.id } }, include: { telas: true } });
    expect(cm.telas.map((t) => [t.materialId, Number(t.yardas)]).sort()).toEqual([[navyId, 14], [otra.id, 5]].sort());
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

describe('W4 · el cliente revisa y responde su cotización', () => {
  const cli = (metodo: 'get' | 'post', ruta: string, token = cliente) => request(app)[metodo](`/api/solicitudes${ruta}`).set('Authorization', `Bearer ${token}`);
  /** Cotización publicada a Laura («lo pensará»), con el adelanto que se indique. */
  async function publicada(adelanto: number | null = null) {
    const { s, cita, dir } = await conVisita();
    const { entrada } = await armarEnVisita(s.codigo!, cita.id, dir.id);
    const r = await api('post', `/atencion/${s.codigo}/respuesta`).send({ cotizacion: { ...entrada, adelanto }, respuesta: 'pensara' });
    expect(r.body.estado).toBe('Pendiente de respuesta');
    return s;
  }

  it('ve qué se hará, la tela, el total y el adelanto; nunca los costos internos (RG-08). Solo la suya (RG-07)', async () => {
    const s = await publicada();
    const r = await cli('get', `/${s.codigo}/cotizacion`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ estado: 'Pendiente de respuesta', traslado: 'delivery', pedido: null, eligeRecojo: false });
    expect(r.body.total).toBeGreaterThan(0);
    expect(r.body.adelanto).toBeGreaterThan(0);
    expect(r.body.diasRestantes).toBeGreaterThan(0);
    expect(r.body.muebles[0].trabajos.length).toBeGreaterThan(0);
    expect(r.body.muebles[0].telas[0].nombre).toBeTruthy();
    expect(Object.keys(r.body.muebles[0]).sort()).toEqual(['cantidad', 'foto', 'precio', 'servicio', 'tela', 'telas', 'tipo', 'trabajos']);
    expect(JSON.stringify(r.body)).not.toMatch(/sugerido|manoObra|maquinaria|costosFijos|horas/i);
    // El Administrador no entra por aquí y otro cliente no la encuentra.
    expect((await cli('get', `/${s.codigo}/cotizacion`, admin)).status).toBe(403);
    const otro = await prisma.cliente.create({ data: { tipoPersona: 'persona', nombres: 'Ana', apellidos: 'Ajena', telefono: '+19735550888', canalRegistro: 'web' } });
    const ajena = await conVisita({ clienteId: otro.id });
    expect((await cli('get', `/${ajena.s.codigo}/cotizacion`)).status).toBe(404);
  });

  it('rechaza con motivo y comentario: la solicitud se cierra; no se puede responder dos veces', async () => {
    const s = await publicada();
    expect((await cli('post', `/${s.codigo}/cotizacion/respuesta`).send({ respuesta: 'rechaza' })).status).toBe(400);
    const r = await cli('post', `/${s.codigo}/cotizacion/respuesta`).send({ respuesta: 'rechaza', motivo: 'Precio', comentario: 'Me pareció alto' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ estado: 'Rechazada', pedido: null });
    expect(await prisma.cotizacion.findFirstOrThrow({ where: { solicitudId: s.id } })).toMatchObject({ estado: 'Rechazada', motivoRechazo: 'Precio', comentarioRespuesta: 'Me pareció alto', medioRespuesta: 'Plataforma' });
    expect((await prisma.solicitud.findUniqueOrThrow({ where: { id: s.id } })).estado).toBe('Rechazada');
    expect(await prisma.bitacora.count({ where: { accion: 'cotizacion_rechazada', entidad: 'cotizacion' } })).toBeGreaterThan(0);
    expect((await cli('post', `/${s.codigo}/cotizacion/respuesta`).send({ respuesta: 'rechaza', motivo: 'Precio' })).status).toBe(409);
  });

  it('con adelanto no puede aceptar todavía: el pago en línea no existe', async () => {
    const s = await publicada();
    const r = await cli('post', `/${s.codigo}/cotizacion/respuesta`).send({ respuesta: 'acepta' });
    expect(r.status).toBe(409);
    expect((await prisma.cotizacion.findFirstOrThrow({ where: { solicitudId: s.id } })).estado).toBe('Pendiente de respuesta');
  });

  it('sin adelanto acepta: se genera el pedido y elige el día del recojo en una hora libre', async () => {
    const s = await publicada(0);
    const r = await cli('post', `/${s.codigo}/cotizacion/respuesta`).send({ respuesta: 'acepta', comentario: 'Mejor por la tarde' });
    expect(r.body).toMatchObject({ estado: 'Aceptada', eligeRecojo: true });
    expect(await prisma.pedido.findUniqueOrThrow({ where: { codigo: r.body.pedido } })).toMatchObject({ estado: 'Esperando mueble', solicitudId: s.id });
    expect((await cli('get', `/${s.codigo}/cotizacion`)).body).toMatchObject({ estado: 'Aceptada', eligeRecojo: true, pedido: { codigo: r.body.pedido, recojo: null } });

    const disp = (await cli('get', '/recojos/disponibilidad')).body as { dias: { fecha: string; horas: { inicio: string; estado: string }[] }[] };
    const dia = disp.dias.find((d) => d.horas.some((h) => h.estado === 'libre'))!;
    const hora = dia.horas.find((h) => h.estado === 'libre')!.inicio;
    expect((await cli('post', `/${s.codigo}/recojo`).send({ fecha: dia.fecha, hora })).status).toBe(200);
    expect((await cli('get', `/${s.codigo}/cotizacion`)).body.pedido.recojo).toMatchObject({ tipo: 'agendado', fecha: dia.fecha, hora });
    expect((await cli('post', `/${s.codigo}/recojo`).send({ fecha: dia.fecha, hora })).status).toBe(409);
  });
});

describe('W4 · pagar el adelanto en línea (pasarela · decisiones J)', () => {
  // Pasarela falsa (sin internet): guarda las sesiones y deja «cobrarlas» a mano, como haría Stripe en modo de prueba.
  const sesiones = new Map<string, ResultadoPago>();
  const falsa: Pasarela = {
    async crearSesion(e) {
      const id = `cs_test_${sesiones.size + 1}`;
      sesiones.set(id, { sesion: id, pagado: false, referencia: null, monto: e.monto, metadata: e.metadata });
      return e.incrustado ? { id, url: null, clientSecret: `${id}_secret_x` } : { id, url: `https://pago.prueba/${id}`, clientSecret: null };
    },
    async consultarSesion(id) { return sesiones.get(id)!; },
    async leerAviso(cuerpo, firma) {
      if (firma !== 'firma-valida') throw new Error('Firma no válida');
      return sesiones.get(JSON.parse(cuerpo.toString()).sesion) ?? null;
    },
  };
  const cobrar = (id: string) => sesiones.set(id, { ...sesiones.get(id)!, pagado: true, referencia: `pi_${id}` });
  const conPago = crearApp({ correo: new ConsolaCorreo(), almacen, rutas: rutasFijas(14), pasarela: falsa });
  const cli = (a: typeof app, metodo: 'get' | 'post', ruta: string) => request(a)[metodo](`/api/solicitudes${ruta}`).set('Authorization', `Bearer ${cliente}`);
  async function publicada(adelanto: number | null = null) {
    const { s, cita, dir } = await conVisita();
    const { entrada } = await armarEnVisita(s.codigo!, cita.id, dir.id);
    expect((await api('post', `/atencion/${s.codigo}/respuesta`).send({ cotizacion: { ...entrada, adelanto }, respuesta: 'pensara' })).body.estado).toBe('Pendiente de respuesta');
    return s;
  }

  it('sin pasarela configurada no se puede pagar en línea', async () => {
    const s = await publicada();
    expect((await cli(app, 'post', `/${s.codigo}/cotizacion/pago`)).status).toBe(503);
  });

  it('paga con tarjeta: la cotización queda Aceptada, el pago Confirmado y nace el pedido; el mismo cobro cuenta una sola vez', async () => {
    const s = await publicada();
    const cot = await prisma.cotizacion.findFirstOrThrow({ where: { solicitudId: s.id } });
    const r = await cli(conPago, 'post', `/${s.codigo}/cotizacion/pago`);
    expect(r.status).toBe(200);
    const id = r.body.url.split('/').pop() as string;
    expect(sesiones.get(id)).toMatchObject({ monto: Number(cot.adelanto), metadata: { cotizacionId: String(cot.id), solicitud: s.codigo } });

    // Volvió sin pagar (canceló): no cambia nada.
    expect((await cli(conPago, 'post', `/${s.codigo}/cotizacion/pago/confirmar`).send({ sesion: id })).body).toMatchObject({ estado: 'pendiente', pedido: null });
    expect((await prisma.cotizacion.findUniqueOrThrow({ where: { id: cot.id } })).estado).toBe('Pendiente de respuesta');

    // Pagó: al volver se confirma el cobro.
    cobrar(id);
    const ok = await cli(conPago, 'post', `/${s.codigo}/cotizacion/pago/confirmar`).send({ sesion: id });
    expect(ok.body).toMatchObject({ estado: 'registrado', pedido: expect.stringMatching(/^PED-\d{4}$/) });
    expect((await prisma.cotizacion.findUniqueOrThrow({ where: { id: cot.id } })).estado).toBe('Aceptada');
    expect(await prisma.pago.findUniqueOrThrow({ where: { referencia: `pi_${id}` } })).toMatchObject({ estado: 'Confirmado', origen: 'pasarela', metodo: 'tarjeta', concepto: 'adelanto' });
    expect((await cli(conPago, 'get', `/${s.codigo}/cotizacion`)).body).toMatchObject({ estado: 'Aceptada', pedido: { codigo: ok.body.pedido }, eligeRecojo: true });

    // Llega también el aviso de Stripe y el cliente recarga: siguen siendo un solo pago y un solo pedido.
    expect((await request(conPago).post('/api/pagos/stripe/aviso').set('stripe-signature', 'falsa').set('Content-Type', 'application/json').send(JSON.stringify({ sesion: id }))).status).toBe(400);
    expect((await request(conPago).post('/api/pagos/stripe/aviso').set('stripe-signature', 'firma-valida').set('Content-Type', 'application/json').send(JSON.stringify({ sesion: id }))).status).toBe(200);
    expect((await cli(conPago, 'post', `/${s.codigo}/cotizacion/pago/confirmar`).send({ sesion: id })).body.pedido).toBe(ok.body.pedido);
    expect(await prisma.pago.count({ where: { cotizacionId: cot.id } })).toBe(1);
    expect(await prisma.pedido.count({ where: { solicitudId: s.id } })).toBe(1);
    // Ya respondida: no se puede volver a pagar.
    expect((await cli(conPago, 'post', `/${s.codigo}/cotizacion/pago`)).status).toBe(409);
  });

  it('incrustado (W4): devuelve el clientSecret para mostrar el pago dentro de GARWEB y se confirma igual al volver', async () => {
    const s = await publicada();
    const r = await cli(conPago, 'post', `/${s.codigo}/cotizacion/pago`).send({ incrustado: true });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ url: null, clientSecret: expect.stringMatching(/_secret_/) });
    const id = (r.body.clientSecret as string).split('_secret_')[0]!;
    cobrar(id);
    expect((await cli(conPago, 'post', `/${s.codigo}/cotizacion/pago/confirmar`).send({ sesion: id })).body).toMatchObject({ estado: 'registrado', pedido: expect.stringMatching(/^PED-/) });
  });

  it('sin adelanto no hay nada que pagar en línea', async () => {
    const s = await publicada(0);
    expect((await cli(conPago, 'post', `/${s.codigo}/cotizacion/pago`)).status).toBe(409);
  });

  it('W6a · el pedido pagado aparece «En curso» con lo pagado y el saldo; sin costos internos y solo los suyos', async () => {
    const s = await publicada();
    const cot = await prisma.cotizacion.findFirstOrThrow({ where: { solicitudId: s.id } });
    const id = (await cli(conPago, 'post', `/${s.codigo}/cotizacion/pago`)).body.url.split('/').pop() as string;
    cobrar(id);
    const { pedido } = (await cli(conPago, 'post', `/${s.codigo}/cotizacion/pago/confirmar`).send({ sesion: id })).body as { pedido: string };

    const r = await cli(conPago, 'get', '/pedidos/en-curso');
    expect(r.status).toBe(200);
    const p = (r.body as { codigo: string }[]).find((x) => x.codigo === pedido) as Record<string, any>;
    const total = Number(cot.total), adelanto = Number(cot.adelanto);
    expect(p).toMatchObject({ estado: 'Esperando mueble', solicitud: s.codigo, cotizacion: cot.codigo, traslado: 'delivery', recojo: null });
    expect(p.cuenta).toMatchObject({ total, pagado: adelanto, saldo: Math.round((total - adelanto) * 100) / 100 });
    expect(p.cuenta.pagos).toEqual([expect.objectContaining({ concepto: 'adelanto', metodo: 'tarjeta', monto: adelanto })]);
    expect(p.muebles[0].trabajos.length).toBeGreaterThan(0);
    expect(JSON.stringify(r.body)).not.toMatch(/sugerido|manoObra|maquinaria|costosFijos|horas|margen/i);

    // Cancelado o entregado ya no está «En curso»; el Administrador no entra por aquí (RG-07).
    await prisma.pedido.update({ where: { codigo: pedido }, data: { estado: 'Cancelado' } });
    expect(((await cli(conPago, 'get', '/pedidos/en-curso')).body as { codigo: string }[]).some((x) => x.codigo === pedido)).toBe(false);
    expect((await request(conPago).get('/api/solicitudes/pedidos/en-curso').set('Authorization', `Bearer ${admin}`)).status).toBe(403);
  });
});
