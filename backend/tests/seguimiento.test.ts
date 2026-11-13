import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { prisma } from '../src/shared/infrastructure/prisma.js';
import type { Correo, MensajeCorreo } from '../src/shared/infrastructure/correo.js';
import type { AlmacenArchivos } from '../src/shared/infrastructure/archivos.js';
import { hoyNegocio } from '../src/modules/comercial/domain/calendario.js';
import { enNY, instanteNY, sumarDias, turnosDe } from '../src/modules/comercial/domain/agenda.js';
import { unlink } from 'node:fs/promises';

class CorreoEnMemoria implements Correo {
  enviados: MensajeCorreo[] = [];
  async enviar(m: MensajeCorreo) {
    this.enviados.push(m);
  }
}
const correo = new CorreoEnMemoria();
const almacen: AlmacenArchivos = {
  async guardar(a, carpeta) {
    await unlink(a.path);
    return `${carpeta}/${Math.random().toString(36).slice(2)}.jpg`;
  },
  async eliminar() {},
  async urlTemporal(ruta) {
    return `/prueba/${ruta}`;
  },
};
const app = crearApp({ correo, almacen });
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0rest-of-image')]);
const CLAVE = process.env.SEED_CONTRASENA!;

let cliente = '', admin = '', clienteId = 0;
let catalogo: { tiposMueble: { id: number; codigo: string }[]; telas: { id: number }[] };
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const login = async (identificador: string) => (await request(app).post('/api/auth/login').send({ identificador, contrasena: CLAVE })).body.token as string;

function enviar(datos: unknown, token = cliente, conFoto = true, ruta = '/api/solicitudes') {
  const r = request(app).post(ruta).set(auth(token)).field('datos', JSON.stringify(datos));
  if (conFoto) r.attach('mueble_0', JPG, { filename: 'frente.jpg', contentType: 'image/jpeg' });
  return r;
}
const mueble = () => ({ tipoMuebleId: catalogo.tiposMueble.find((t) => t.codigo === 'ar')!.id, servicio: 'retapizado', cantidad: 1, modoTela: 'una', telas: [{ materialId: catalogo.telas[0]!.id }] });
const conCita = (tela: 'local' | 'domicilio') => ({ muebles: [{ ...mueble(), telas: [] }], tela, mismaTela: true, telaDescripcion: 'Azul marino, suave' });
const VISITA = { tipo: 'nueva', texto: '48 Elm St, Montclair, NJ', guardar: false };

/**
 * Solicitud de Laura que espera turno: la registra el Administrador (por teléfono no se agenda en el mismo paso),
 * así se prueban las citas que se agendan después.
 */
const enEspera = (tela: 'local' | 'domicilio') =>
  enviar({ cliente: { id: clienteId }, canal: 'telefono', esperaFotos: false, avisar: false, solicitud: conCita(tela) }, admin, true, '/api/admin/solicitudes');

/** Primer turno libre (local) o franja libre (domicilio) según la API. */
async function primerLibre(tipo: 'local' | 'domicilio') {
  const r = await request(app).get(`/api/citas/disponibilidad?tipo=${tipo}&dias=30`).set(auth(cliente));
  for (const d of r.body.dias) {
    if (tipo === 'local') { const t = d.turnos.find((x: { libre: boolean }) => x.libre); if (t) return { fecha: d.fecha, hora: t.hora }; }
    else { const f = d.franjas.find((x: { libre: boolean }) => x.libre); if (f) return { fecha: d.fecha, franja: f.codigo }; }
  }
  throw new Error('sin turnos libres');
}

beforeAll(async () => {
  cliente = await login('laura.mendez@correo.com');
  admin = await login('admin');
  clienteId = (await prisma.usuario.findFirstOrThrow({ where: { email: 'laura.mendez@correo.com' } })).clienteId!;
  catalogo = (await request(app).get('/api/solicitudes/catalogo').set(auth(cliente))).body;
});
afterAll(() => prisma.$disconnect());

describe('CU-C03 agenda', () => {
  it('arma los turnos de 30 min dentro de cada franja y convierte la hora de Nueva Jersey', () => {
    expect(turnosDe('09:30-12:00', 30)).toEqual(['09:30', '10:00', '10:30', '11:00', '11:30']);
    expect(turnosDe('15:00-17:00', 30)).toHaveLength(4);
    expect(instanteNY('2026-11-09', '10:00').toISOString()).toBe('2026-11-09T15:00:00.000Z'); // invierno: UTC−5
    expect(instanteNY('2026-07-06', '10:00').toISOString()).toBe('2026-07-06T14:00:00.000Z'); // verano: UTC−4
    expect(enNY(new Date('2026-11-09T15:00:00Z'))).toEqual({ fecha: '2026-11-09', hora: '10:00' });
  });

  it('no ofrece domingos ni feriados, y las visitas empiezan mañana', async () => {
    const r = await request(app).get('/api/citas/disponibilidad?tipo=domicilio&dias=14').set(auth(cliente));
    expect(r.status).toBe(200);
    expect(r.body.desde).toBe(sumarDias(hoyNegocio(), 1));
    for (const d of r.body.dias) {
      if (new Date(`${d.fecha}T00:00:00Z`).getUTCDay() === 0) expect(d.cerrado).toBe(true);
    }
  });
});

describe('CU-C04 cita en el local', () => {
  it('agenda, no deja tomar el mismo turno dos veces, reprograma y cancela', async () => {
    const a = await enEspera('local');
    expect(a.body.estado).toBe('En espera de cita');
    const b = await enEspera('local');
    const turno = await primerLibre('local');

    correo.enviados = [];
    const c1 = await request(app).post('/api/citas').set(auth(cliente)).send({ solicitud: a.body.codigo, tipo: 'local', ...turno });
    expect(c1.status).toBe(201);
    expect(c1.body).toMatchObject({ estado: 'Programada', fecha: turno.fecha, hora: turno.hora });
    expect(correo.enviados.some((m) => m.asunto.includes('quedó programada'))).toBe(true);

    const ocupado = await request(app).post('/api/citas').set(auth(cliente)).send({ solicitud: b.body.codigo, tipo: 'local', ...turno });
    expect(ocupado.status).toBe(409);

    const doble = await request(app).post('/api/citas').set(auth(cliente)).send({ solicitud: a.body.codigo, tipo: 'local', ...turno });
    expect(doble.status).toBe(409);

    const otroTurno = await primerLibre('local');
    const rep = await request(app).post(`/api/citas/${c1.body.id}/reprogramar`).set(auth(cliente)).send(otroTurno);
    expect(rep.status).toBe(200);
    expect(rep.body.hora).toBe(otroTurno.hora);
    expect((await prisma.cita.findUniqueOrThrow({ where: { id: c1.body.id } })).estado).toBe('Reprogramada');

    const can = await request(app).post(`/api/citas/${rep.body.id}/cancelar`).set(auth(cliente));
    expect(can.body.estado).toBe('Cancelada');
    expect((await prisma.solicitud.findUniqueOrThrow({ where: { codigo: a.body.codigo } })).estado).toBe('En espera de cita');
  });

  it('rechaza turnos fuera de la agenda, el tipo equivocado y las solicitudes de otro cliente', async () => {
    const a = await enEspera('local');
    const turno = await primerLibre('local');
    expect((await request(app).post('/api/citas').set(auth(cliente)).send({ solicitud: a.body.codigo, tipo: 'local', fecha: turno.fecha, hora: '13:00' })).body.mensaje).toMatch(/turnos de la agenda/);
    expect((await request(app).post('/api/citas').set(auth(cliente)).send({ solicitud: a.body.codigo, tipo: 'domicilio', fecha: turno.fecha, franja: 'manana' })).body.mensaje).toMatch(/ver las telas en el local/);

    const otro = await request(app).post('/api/auth/registro').send({ tipoPersona: 'persona', nombres: 'Otra', apellidos: 'Clienta', email: `otra${Date.now()}@prueba.test`, telefono: '+19735550111', contrasena: 'Clave2026', avisosCorreo: true });
    const ajena = await request(app).post('/api/citas').set(auth(otro.body.token)).send({ solicitud: a.body.codigo, tipo: 'local', ...turno });
    expect(ajena.status).toBe(404);
  });

  it('una sola reprogramación por inasistencia; tras la segunda falta decide el Administrador (A2f)', async () => {
    const a = await enEspera('local');
    const t1 = await primerLibre('local');
    const c1 = await request(app).post('/api/citas').set(auth(cliente)).send({ solicitud: a.body.codigo, tipo: 'local', ...t1 });
    const r1 = await request(app).post(`/api/citas/${c1.body.id}/resultado`).set(auth(admin)).send({ resultado: 'no_asistio' });
    expect(r1.body).toMatchObject({ cita: 'No asistió', inasistencias: 1, puedeReprogramar: true });

    const t2 = await primerLibre('local');
    const c2 = await request(app).post('/api/citas').set(auth(cliente)).send({ solicitud: a.body.codigo, tipo: 'local', ...t2 });
    expect(c2.status).toBe(201);
    expect(c2.body.reprogramaciones).toBe(1);
    const r2 = await request(app).post(`/api/citas/${c2.body.id}/resultado`).set(auth(admin)).send({ resultado: 'no_asistio' });
    expect(r2.body).toMatchObject({ inasistencias: 2, puedeReprogramar: false });
    // No vence sola: el cliente ya no puede reagendar, pero el taller puede ofrecerle un último turno.
    expect((await prisma.solicitud.findUniqueOrThrow({ where: { codigo: a.body.codigo } })).estado).toBe('En espera de cita');
    const t3 = await primerLibre('local');
    expect((await request(app).post('/api/citas').set(auth(cliente)).send({ solicitud: a.body.codigo, tipo: 'local', ...t3 })).body.mensaje).toMatch(/comuníquese con el taller/);

    // Con una cita programada no se puede dar por vencida; sin ella, sí.
    const ultimo = await request(app).post('/api/citas').set(auth(admin)).send({ solicitud: a.body.codigo, tipo: 'local', ...t3 });
    expect(ultimo.status).toBe(201);
    expect((await request(app).post(`/api/admin/solicitudes/${a.body.codigo}/vencer`).set(auth(admin))).status).toBe(400);
    await request(app).post(`/api/citas/${ultimo.body.id}/cancelar`).set(auth(admin));
    correo.enviados = [];
    const v = await request(app).post(`/api/admin/solicitudes/${a.body.codigo}/vencer`).set(auth(admin));
    expect(v.body.estado).toBe('Vencida');
    expect(correo.enviados.some((m) => m.asunto.includes('venció'))).toBe(true);

    // El cliente no puede marcar resultados.
    expect((await request(app).post(`/api/citas/${c2.body.id}/resultado`).set(auth(cliente)).send({ resultado: 'atendida' })).status).toBe(403);
  });
});

describe('CU-C04 visita a domicilio', () => {
  it('agenda por franja con la dirección de la visita y marca atendida', async () => {
    const a = await enEspera('domicilio');
    const franja = await primerLibre('domicilio');
    const sinDir = await request(app).post('/api/citas').set(auth(cliente)).send({ solicitud: a.body.codigo, tipo: 'domicilio', ...franja });
    expect(sinDir.body.mensaje).toMatch(/dónde lo visitamos/);

    const c = await request(app).post('/api/citas').set(auth(cliente)).send({ solicitud: a.body.codigo, tipo: 'domicilio', ...franja, direccion: { tipo: 'nueva', texto: '48 Elm St, Montclair, NJ', guardar: false } });
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ tipo: 'domicilio', franja: franja.franja, hora: null });

    const at = await request(app).post(`/api/citas/${c.body.id}/resultado`).set(auth(admin)).send({ resultado: 'atendida' });
    expect(at.body.cita).toBe('Atendida');
    expect((await prisma.solicitud.findUniqueOrThrow({ where: { codigo: a.body.codigo } })).estado).toBe('Atendida');
  });
});

describe('A2 · agenda del Administrador', () => {
  /** Primer día con dos turnos seguidos libres (para una visita de 1 hora). */
  async function dosTurnosSeguidos() {
    const r = await request(app).get('/api/citas/disponibilidad?tipo=local&dias=30').set(auth(cliente));
    for (const d of r.body.dias.slice(1)) {
      const libres = d.turnos.filter((x: { libre: boolean }) => x.libre).map((x: { hora: string }) => x.hora);
      const i = libres.findIndex((h: string) => libres.includes(`${String(+h.slice(0, 2) + (h.endsWith('30') ? 1 : 0)).padStart(2, '0')}:${h.endsWith('30') ? '00' : '30'}`) && h >= '15:00');
      if (i >= 0) return { fecha: d.fecha as string, hora: libres[i] as string };
    }
    throw new Error('sin turnos seguidos');
  }

  it('el Administrador agenda una visita a una hora: ocupa 1 hora de turnos del local', async () => {
    const s = await enEspera('domicilio');
    const t = await dosTurnosSeguidos();
    const c = await request(app).post('/api/citas').set(auth(admin)).send({ solicitud: s.body.codigo, tipo: 'domicilio', ...t, direccion: VISITA });
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ tipo: 'domicilio', hora: t.hora, franja: 'tarde', duracionMin: 60 });

    const dispo = await request(app).get(`/api/citas/disponibilidad?tipo=local&desde=${t.fecha}&dias=1`).set(auth(cliente));
    const turnos = dispo.body.dias[0].turnos;
    const i = turnos.findIndex((x: { hora: string }) => x.hora === t.hora);
    expect(turnos[i].libre).toBe(false);
    expect(turnos[i + 1].libre).toBe(false);

    const semana = await request(app).get(`/api/admin/agenda?desde=${t.fecha}`).set(auth(admin));
    expect(semana.status).toBe(200);
    expect(semana.body.dias).toHaveLength(6);
    expect(semana.body.citas.find((x: { id: number }) => x.id === c.body.id)).toMatchObject({ hora: t.hora, solicitud: { codigo: s.body.codigo, telaDescripcion: 'Azul marino, suave' } });
    expect((await request(app).get('/api/admin/agenda').set(auth(cliente))).status).toBe(403);
  });

  it('bloquea turnos libres y no deja bloquear los que tienen cita', async () => {
    const t = await primerLibre('local');
    const r = await request(app).post('/api/admin/agenda/bloqueos').set(auth(admin)).send({ bloques: [t], motivo: 'Compras' });
    expect(r.status).toBe(201);
    const dispo = await request(app).get(`/api/citas/disponibilidad?tipo=local&desde=${t.fecha}&dias=1`).set(auth(cliente));
    expect(dispo.body.dias[0].turnos.find((x: { hora: string }) => x.hora === t.hora).libre).toBe(false);
    expect((await request(app).post('/api/admin/agenda/bloqueos').set(auth(admin)).send({ bloques: [t] })).body.mensaje).toMatch(/ya está bloqueado/);

    const s = await enEspera('local');
    const t2 = await primerLibre('local');
    await request(app).post('/api/citas').set(auth(admin)).send({ solicitud: s.body.codigo, tipo: 'local', ...t2 });
    expect((await request(app).post('/api/admin/agenda/bloqueos').set(auth(admin)).send({ bloques: [t2] })).body.mensaje).toMatch(/tiene una cita/);
  });

  it('quitar un bloqueo lo anula sin borrarlo y el turno vuelve a estar libre', async () => {
    const t = await primerLibre('local');
    await request(app).post('/api/admin/agenda/bloqueos').set(auth(admin)).send({ bloques: [t], motivo: 'Reunión' });
    const fila = await prisma.agendaBloqueo.findFirstOrThrow({ where: { activo: true, motivo: 'Reunión', horaInicio: t.hora }, orderBy: { id: 'desc' } });
    expect((await request(app).post(`/api/admin/agenda/bloqueos/${fila.id}/quitar`).set(auth(admin))).status).toBe(204);

    expect(await prisma.agendaBloqueo.findUniqueOrThrow({ where: { id: fila.id } })).toMatchObject({ activo: false, quitadoPor: expect.any(Number) });
    const dispo = await request(app).get(`/api/citas/disponibilidad?tipo=local&desde=${t.fecha}&dias=1`).set(auth(cliente));
    expect(dispo.body.dias[0].turnos.find((x: { hora: string }) => x.hora === t.hora).libre).toBe(true);
    expect((await request(app).post(`/api/admin/agenda/bloqueos/${fila.id}/quitar`).set(auth(admin))).status).toBe(404);
    expect(await prisma.bitacora.count({ where: { accion: 'agenda_desbloqueo', entidadId: fila.id } })).toBe(1);
  });
});

describe('W2 + W3/W3b · la solicitud se envía junto con la cita', () => {
  it('cita en el local: guarda la solicitud y el turno juntos, con un solo aviso (RG-05)', async () => {
    const turno = await primerLibre('local');
    correo.enviados = [];
    const s = await enviar({ ...conCita('local'), telaDescripcion: undefined, cita: turno });
    expect(s.status).toBe(201);
    expect(s.body).toMatchObject({ estado: 'En espera de cita', siguiente: 'cita', cita: { estado: 'Programada', fecha: turno.fecha, hora: turno.hora } });
    const db = await prisma.solicitud.findUniqueOrThrow({ where: { codigo: s.body.codigo }, include: { citas: true } });
    expect(db.telaDescripcion).toBeNull();
    expect(db.citas).toHaveLength(1);
    expect(correo.enviados.filter((m) => m.asunto.includes(s.body.codigo))[0]?.texto).toMatch(/quedó para el/);

    const avisos = await request(app).get('/api/notificaciones').set(auth(cliente));
    expect(avisos.body.notificaciones.some((n: { tipo: string; solicitud: string }) => n.tipo === 'solicitud_registrada' && n.solicitud === s.body.codigo)).toBe(true);
    expect(avisos.body.sinLeer).toBeGreaterThan(0);
    await request(app).post('/api/notificaciones/leer-todas').set(auth(cliente));
    expect((await request(app).get('/api/notificaciones').set(auth(cliente))).body.sinLeer).toBe(0);
  });

  it('si el turno ya se ocupó, no guarda nada', async () => {
    const turno = await primerLibre('local');
    expect((await enviar({ ...conCita('local'), cita: turno })).status).toBe(201);
    const antes = await prisma.solicitud.count();
    const r = await enviar({ ...conCita('local'), cita: turno });
    expect(r.status).toBe(409);
    expect(await prisma.solicitud.count()).toBe(antes);
  });

  it('visita a domicilio: exige qué tela busca, la franja y la dirección', async () => {
    const franja = await primerLibre('domicilio');
    const sinTexto = await enviar({ ...conCita('domicilio'), telaDescripcion: '', cita: { ...franja, direccion: VISITA } });
    expect(sinTexto.body.errores?.telaDescripcion).toMatch(/qué tela busca/);
    const sinDir = await enviar({ ...conCita('domicilio'), cita: franja });
    expect(sinDir.body.errores?.['cita.direccion']).toMatch(/dónde lo visitamos/);

    const ok = await enviar({ ...conCita('domicilio'), cita: { ...franja, direccion: VISITA } });
    expect(ok.status).toBe(201);
    expect(ok.body.cita).toMatchObject({ tipo: 'domicilio', franja: franja.franja, hora: null });
    const d = await request(app).get(`/api/solicitudes/${ok.body.codigo}`).set(auth(cliente));
    expect(d.body).toMatchObject({ telaDescripcion: 'Azul marino, suave', cita: { direccion: '48 Elm St, Montclair, NJ' } });
  });

  it('con telas del catálogo no se agenda cita', async () => {
    const r = await enviar({ muebles: [mueble()], tela: 'catalogo', mismaTela: true, traslado: 'propio', cita: await primerLibre('local') });
    expect(r.body.errores?.cita).toMatch(/solo se agenda/);
  });
});

describe('Seguimiento del cliente', () => {
  it('el detalle trae enlaces temporales a las fotos y solo para el dueño', async () => {
    const s = await enviar({ muebles: [mueble()], tela: 'catalogo', mismaTela: true, traslado: 'propio' });
    const d = await request(app).get(`/api/solicitudes/${s.body.codigo}`).set(auth(cliente));
    expect(d.body.muebles[0].archivos[0]).toMatchObject({ tipo: 'foto', url: expect.stringMatching(/^\/prueba\/solicitudes\//) });
    const otro = await request(app).post('/api/auth/registro').send({ tipoPersona: 'persona', nombres: 'Otro', apellidos: 'Más', email: `otro${Date.now()}@prueba.test`, telefono: '+19735550112', contrasena: 'Clave2026', avisosCorreo: true });
    expect((await request(app).get(`/api/solicitudes/${s.body.codigo}`).set(auth(otro.body.token))).status).toBe(404);
  });
});

describe('A3 · el Administrador', () => {
  it('ve la bandeja y la ficha, y descarta con motivo (nada se borra)', async () => {
    const s = await enviar({ muebles: [mueble()], tela: 'catalogo', mismaTela: true, traslado: 'propio' });
    const b = await request(app).get('/api/admin/solicitudes?q=laura').set(auth(admin));
    expect(b.status).toBe(200);
    expect(b.body.solicitudes.some((x: { codigo: string }) => x.codigo === s.body.codigo)).toBe(true);
    expect(b.body.motivosDescarte).toContain('Trabajo que no hacemos');

    // A3 Solicitudes y cotizaciones: cada fila trae su etapa y la fecha filtra por el día en Nueva York.
    const fila = b.body.solicitudes.find((x: { codigo: string }) => x.codigo === s.body.codigo);
    expect(fila).toMatchObject({ estado: 'Nueva', estadoVisible: 'Nueva', etapa: 'Por cotizar', hora: expect.stringMatching(/^\d{2}:\d{2}$/) });
    const hoy = hoyNegocio();
    const deHoy = await request(app).get(`/api/admin/solicitudes?desde=${hoy}&hasta=${hoy}`).set(auth(admin));
    expect(deHoy.body.solicitudes.some((x: { codigo: string }) => x.codigo === s.body.codigo)).toBe(true);
    const deAyer = await request(app).get(`/api/admin/solicitudes?desde=${sumarDias(hoy, -1)}&hasta=${sumarDias(hoy, -1)}`).set(auth(admin));
    expect(deAyer.body.solicitudes.some((x: { codigo: string }) => x.codigo === s.body.codigo)).toBe(false);
    const visita = await enEspera('domicilio');
    const filaVisita = (await request(app).get('/api/admin/solicitudes').set(auth(admin))).body.solicitudes.find((x: { codigo: string }) => x.codigo === visita.body.codigo);
    expect(filaVisita).toMatchObject({ estadoVisible: 'En espera de visita', etapa: 'Cita / visita' });

    const f = await request(app).get(`/api/admin/solicitudes/${s.body.codigo}`).set(auth(admin));
    expect(f.body).toMatchObject({ cliente: { nombre: 'Laura Méndez', email: 'laura.mendez@correo.com' }, puedeDescartarse: true, registradaPor: 'el cliente' });
    expect(f.body.historial[0].accion).toBe('solicitud_registrada');

    expect((await request(app).post(`/api/admin/solicitudes/${s.body.codigo}/descartar`).set(auth(admin)).send({ motivo: '' })).status).toBe(400);
    const d = await request(app).post(`/api/admin/solicitudes/${s.body.codigo}/descartar`).set(auth(admin)).send({ motivo: 'Trabajo que no hacemos' });
    expect(d.body).toMatchObject({ estado: 'Descartada', motivoDescarte: 'Trabajo que no hacemos', puedeDescartarse: false });
    expect((await request(app).post(`/api/admin/solicitudes/${s.body.codigo}/descartar`).set(auth(admin)).send({ motivo: 'Otro motivo' })).status).toBe(400);

    expect((await request(app).get('/api/admin/solicitudes').set(auth(cliente))).status).toBe(403);
  });

  it('registra por teléfono a un cliente nuevo, le crea la cuenta y le pide las fotos por enlace', async () => {
    correo.enviados = [];
    const email = `paula${Date.now()}@prueba.test`;
    const datos = {
      cliente: { nuevo: { tipoPersona: 'persona', nombres: 'Paula', apellidos: 'Reyes', telefono: '+19085550147', email } },
      canal: 'telefono', esperaFotos: true, avisar: true,
      solicitud: { muebles: [mueble()], tela: 'catalogo', mismaTela: true, traslado: 'propio' },
    };
    const r = await enviar(datos, admin, false, '/api/admin/solicitudes');
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ estado: 'Nueva', esperaFotos: true, cuentaCreada: true });
    expect(correo.enviados.some((m) => m.para === email && m.asunto.includes('Cree su contraseña'))).toBe(true);
    const s = await prisma.solicitud.findUniqueOrThrow({ where: { codigo: r.body.codigo }, include: { cliente: true } });
    expect(s).toMatchObject({ canal: 'telefono', esperaFotos: true });
    expect(s.cliente.canalRegistro).toBe('telefono');

    // La clienta crea su contraseña con el enlace y sube las fotos pedidas.
    const token = /token=([\w-]+)/.exec(correo.enviados.find((m) => m.para === email && m.asunto.includes('Cree su contraseña'))!.texto)![1];
    expect((await request(app).post('/api/auth/restablecer').send({ token, contrasena: 'Paula2026' })).status).toBe(200);
    const paula = (await request(app).post('/api/auth/login').send({ identificador: email, contrasena: 'Paula2026' })).body.token;
    const fotos = await request(app).post(`/api/solicitudes/${r.body.codigo}/fotos`).set(auth(paula)).attach('mueble_0', JPG, { filename: 'sillon.jpg', contentType: 'image/jpeg' });
    expect(fotos.status).toBe(200);
    expect(fotos.body).toMatchObject({ esperaFotos: false });
    expect(fotos.body.muebles[0].archivos).toHaveLength(1);
  });

  it('en persona exige foto y a un cliente persona sin correo lo registra sin cuenta', async () => {
    const datos = (esperaFotos: boolean) => ({
      cliente: { nuevo: { tipoPersona: 'persona', nombres: 'Juan', apellidos: 'Pérez', telefono: '+19085550188' } },
      canal: 'local', esperaFotos, avisar: true,
      solicitud: { muebles: [mueble()], tela: 'local', mismaTela: true },
    });
    const sinFoto = await enviar(datos(true), admin, false, '/api/admin/solicitudes');
    expect(sinFoto.body.mensaje).toMatch(/al menos una foto/);
    const ok = await enviar(datos(false), admin, true, '/api/admin/solicitudes');
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ cuentaCreada: false, estado: 'En espera de cita' });

    const busca = await request(app).get('/api/admin/clientes?q=5550188').set(auth(admin));
    expect(busca.body[0]).toMatchObject({ nombre: expect.stringContaining('Juan') });
  });

  it('pide los datos obligatorios del cliente nuevo', async () => {
    const r = await enviar({ cliente: { nuevo: { tipoPersona: 'empresa', nombres: 'Daniel', telefono: '908' } }, canal: 'telefono', esperaFotos: true, solicitud: { muebles: [mueble()], tela: 'local', mismaTela: true } }, admin, false, '/api/admin/solicitudes');
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.errores)).toEqual(expect.arrayContaining(['cliente.nuevo.telefono']));
  });
});
