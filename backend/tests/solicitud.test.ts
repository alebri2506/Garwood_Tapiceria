import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { prisma } from '../src/shared/infrastructure/prisma.js';
import { hoyNegocio, leerFecha, motivoSinRecojo } from '../src/modules/comercial/domain/calendario.js';
import { estadoInicial, siguientePaso } from '../src/modules/comercial/domain/solicitud.js';
import type { AlmacenArchivos } from '../src/shared/infrastructure/archivos.js';
import { unlink } from 'node:fs/promises';

/** Almacén de prueba: no deja archivos en disco y anota lo guardado y lo borrado. */
const guardados: string[] = [];
const eliminados: string[] = [];
const almacen: AlmacenArchivos = {
  async guardar(a, carpeta) {
    await unlink(a.path);
    const ruta = `${carpeta}/${guardados.length}-${a.originalname}`;
    guardados.push(ruta);
    return ruta;
  },
  async eliminar(ruta) {
    eliminados.push(ruta);
  },
  async urlTemporal(ruta) {
    return `/prueba/${ruta}`;
  },
};
const app = crearApp({ almacen });

// Archivos mínimos con la firma (primeros bytes) de cada formato.
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0rest-of-image')]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42 rest-of-video')]);
const PDF = Buffer.from('%PDF-1.7 esto no es una foto');

let token = '';
let catalogo: {
  tiposMueble: { id: number; codigo: string; partes: { id: number }[] }[];
  telas: { id: number; nombre: string }[];
};
const tipo = (codigo: string) => catalogo.tiposMueble.find((t) => t.codigo === codigo)!;

/** Próximo día con recojo (lunes a sábado, sin feriados). */
function diaConRecojo(desde = 1) {
  const d = leerFecha(hoyNegocio())!;
  d.setUTCDate(d.getUTCDate() + desde);
  while (motivoSinRecojo(d.toISOString().slice(0, 10), 60)) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function domingo() {
  const d = leerFecha(hoyNegocio())!;
  do d.setUTCDate(d.getUTCDate() + 1); while (d.getUTCDay() !== 0);
  return d.toISOString().slice(0, 10);
}

const base = () => ({
  muebles: [{ tipoMuebleId: tipo('s3').id, servicio: 'retapizado', cantidad: 1, modoTela: 'una', telas: [{ materialId: catalogo.telas[0]!.id }] }],
  tela: 'catalogo',
  mismaTela: true,
  traslado: 'delivery',
  direccion: { tipo: 'nueva', texto: '48 Park St, Montclair, NJ 07042', guardar: true },
  fechaPrefRecojo: diaConRecojo(),
  franjaRecojo: 'manana',
});

function enviar(datos: unknown, archivos: { campo: string; nombre: string; tipo: string; contenido: Buffer }[] = [{ campo: 'mueble_0', nombre: 'frente.jpg', tipo: 'image/jpeg', contenido: JPG }], t = token) {
  const r = request(app).post('/api/solicitudes').set('Authorization', `Bearer ${t}`).field('datos', JSON.stringify(datos));
  for (const a of archivos) r.attach(a.campo, a.contenido, { filename: a.nombre, contentType: a.tipo });
  return r;
}

beforeAll(async () => {
  const login = await request(app).post('/api/auth/login').send({ identificador: 'laura.mendez@correo.com', contrasena: process.env.SEED_CONTRASENA, recordarme: false });
  token = login.body.token;
  catalogo = (await request(app).get('/api/solicitudes/catalogo').set('Authorization', `Bearer ${token}`)).body;
});
afterAll(() => prisma.$disconnect());

describe('CU-C01 reglas de la solicitud', () => {
  it('con cita en el local o visita espera el turno; si no, queda Nueva', () => {
    expect(estadoInicial('local')).toBe('En espera de cita');
    expect(estadoInicial('domicilio')).toBe('En espera de cita');
    expect(estadoInicial('catalogo')).toBe('Nueva');
    expect(siguientePaso('catalogo')).toBe('cotizacion');
    expect(siguientePaso('local')).toBe('cita');
    expect(siguientePaso('domicilio')).toBe('visita');
  });

  it('no hay recojos en domingo, feriados ni fechas pasadas', () => {
    expect(motivoSinRecojo('2026-11-08', 60, '2026-11-07')).toMatch(/domingos/);
    expect(motivoSinRecojo('2026-11-26', 60, '2026-11-07')).toMatch(/Thanksgiving/);
    expect(motivoSinRecojo('2026-11-06', 60, '2026-11-07')).toMatch(/pasó/);
    expect(motivoSinRecojo('2027-02-30', 60, '2026-11-07')).toMatch(/no es válida/);
    expect(motivoSinRecojo('2026-11-09', 60, '2026-11-07')).toBeNull();
  });
});

describe('CU-C01 catálogo y acceso', () => {
  it('muestra los tipos de mueble con sus partes y solo las telas activas', () => {
    expect(catalogo.tiposMueble).toHaveLength(13);
    expect(tipo('s3').partes).toHaveLength(6);
    expect(catalogo.telas.map((t) => t.nombre)).not.toContain('Terciopelo Gris 300');
    expect(catalogo.telas.length).toBeGreaterThanOrEqual(9);
  });

  it('pide sesión y solo deja entrar a clientes (RG-07)', async () => {
    expect((await request(app).get('/api/solicitudes/catalogo')).status).toBe(401);
    const admin = await request(app).post('/api/auth/login').send({ identificador: 'admin', contrasena: process.env.SEED_CONTRASENA });
    expect((await enviar(base(), undefined, admin.body.token)).status).toBe(403);
  });
});

describe('CU-C01 registrar solicitud', () => {
  it('registra la solicitud con su mueble, tela, foto, dirección y bitácora', async () => {
    const res = await enviar(base());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ codigo: expect.stringMatching(/^SOL-\d{4}$/), estado: 'Nueva', siguiente: 'cotizacion' });

    const s = await prisma.solicitud.findUniqueOrThrow({
      where: { codigo: res.body.codigo },
      include: { direccion: true, muebles: { include: { telas: true, adjuntos: true } } },
    });
    expect(s.direccion).toMatchObject({ direccion: '48 Park St, Montclair, NJ 07042', ciudad: 'Montclair', guardada: true });
    expect(s.muebles[0]!.telas).toHaveLength(1);
    expect(s.muebles[0]!.adjuntos[0]).toMatchObject({ tipo: 'foto', mime: 'image/jpeg', nombreOriginal: 'frente.jpg' });
    expect(await prisma.bitacora.count({ where: { entidad: 'solicitud', entidadId: s.id, accion: 'solicitud_registrada' } })).toBe(1);

    const direcciones = await request(app).get('/api/solicitudes/direcciones').set('Authorization', `Bearer ${token}`);
    expect(direcciones.body.map((d: { direccion: string }) => d.direccion)).toContain('48 Park St, Montclair, NJ 07042');
  });

  it('desde la web, ver las telas en el local se envía junto con el turno de la cita (último paso)', async () => {
    const datos = { ...base(), tela: 'local', muebles: [{ tipoMuebleId: tipo('ar').id, servicio: 'retapizado_espuma', cantidad: 2 }] };
    const res = await enviar(datos);
    expect(res.status).toBe(400);
    expect(res.body.mensaje).toMatch(/día y la hora de su cita/);
  });

  it('acepta varios muebles, telas por partes y una dirección guardada', async () => {
    const guardada = (await request(app).get('/api/solicitudes/direcciones').set('Authorization', `Bearer ${token}`)).body[0];
    const silla = tipo('ch');
    const datos = {
      ...base(),
      mismaTela: false,
      direccion: { tipo: 'guardada', id: guardada.id },
      muebles: [
        base().muebles[0],
        { tipoMuebleId: silla.id, servicio: 'retapizado', cantidad: 6, modoTela: 'partes', telas: silla.partes.map((p, i) => ({ materialId: catalogo.telas[i]!.id, parteId: p.id })) },
      ],
    };
    const res = await enviar(datos, [
      { campo: 'mueble_0', nombre: 'sofa.jpg', tipo: 'image/jpeg', contenido: JPG },
      { campo: 'mueble_1', nombre: 'silla.jpg', tipo: 'image/jpeg', contenido: JPG },
      { campo: 'mueble_1', nombre: 'silla.mp4', tipo: 'video/mp4', contenido: MP4 },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.siguiente).toBe('cotizacion');
    const s = await prisma.solicitud.findUniqueOrThrow({ where: { codigo: res.body.codigo }, include: { muebles: { include: { telas: true, adjuntos: true }, orderBy: { orden: 'asc' } } } });
    expect(s).toMatchObject({ direccionId: guardada.id, mismaTela: false });
    expect(s.muebles[1]).toMatchObject({ cantidad: 6, modoTela: 'partes' });
    expect(s.muebles[1]!.telas.every((t) => t.parteId)).toBe(true);
    expect(s.muebles[1]!.adjuntos.map((a) => a.tipo).sort()).toEqual(['foto', 'video']);
  });

  it('en fabricación a medida pide medidas y acabado, y no pide fecha de recojo', async () => {
    const sin = { ...base(), muebles: [{ tipoMuebleId: tipo('hb').id, servicio: 'fabricacion', cantidad: 1, modoTela: 'una', telas: [{ materialId: catalogo.telas[0]!.id }] }] };
    const r1 = await enviar(sin);
    expect(r1.status).toBe(400);
    expect(r1.body.errores['muebles.0.medidas']).toMatch(/medidas/);
    expect(r1.body.errores['muebles.0.acabado']).toMatch(/acabado/);

    const con = { ...sin, fechaPrefRecojo: undefined, franjaRecojo: undefined, muebles: [{ ...sin.muebles[0], medidas: '160 × 120 cm', acabado: 'capitoneado' }] };
    const r2 = await enviar(con);
    expect(r2.status).toBe(201);
  });

  it('rechaza lo obligatorio que falta o no cumple las reglas', async () => {
    const casos: [string, unknown, RegExp][] = [
      ['sin muebles', { ...base(), muebles: [] }, /al menos un mueble/],
      ['retapizado sin tela', { ...base(), tela: 'sin', muebles: [{ tipoMuebleId: tipo('s3').id, servicio: 'retapizado', cantidad: 1 }] }, /necesita tela/],
      ['catálogo sin telas', { ...base(), muebles: [{ ...base().muebles[0], telas: [] }] }, /Elija la tela del catálogo/],
      ['dos telas para todo el mueble', { ...base(), muebles: [{ ...base().muebles[0], telas: [{ materialId: catalogo.telas[0]!.id }, { materialId: catalogo.telas[1]!.id }] }] }, /una sola tela/],
      ['visita sin decir qué tela busca', { ...base(), tela: 'domicilio', muebles: [{ tipoMuebleId: tipo('s3').id, servicio: 'retapizado', cantidad: 1 }] }, /qué tela busca/],
      ['delivery sin dirección', { ...base(), direccion: undefined }, /dirección de recojo/],
      ['delivery sin fecha', { ...base(), fechaPrefRecojo: undefined }, /día que prefiere/],
      ['sin traslado', { ...base(), traslado: undefined }, /cómo llega/],
      ['cantidad 0', { ...base(), muebles: [{ ...base().muebles[0], cantidad: 0 }] }, /mínima es 1/],
    ];
    for (const [caso, datos, mensaje] of casos) {
      const res = await enviar(datos);
      expect(res.status, caso).toBe(400);
      expect(JSON.stringify(res.body), caso).toMatch(mensaje);
    }
  });

  it('rechaza lo que no cuadra con la base: tela inactiva, partes incompletas, domingo y dirección ajena', async () => {
    const inactiva = await prisma.material.findUniqueOrThrow({ where: { codigo: 'TP-300-8' } });
    const r1 = await enviar({ ...base(), muebles: [{ ...base().muebles[0], telas: [{ materialId: inactiva.id }] }] });
    expect(r1.body.mensaje).toMatch(/ya no está disponible/);

    const silla = tipo('ch');
    const r2 = await enviar({ ...base(), muebles: [{ tipoMuebleId: silla.id, servicio: 'retapizado', cantidad: 1, modoTela: 'partes', telas: [{ materialId: catalogo.telas[0]!.id, parteId: silla.partes[0]!.id }] }] });
    expect(r2.body.mensaje).toMatch(/cada parte/);

    const r3 = await enviar({ ...base(), fechaPrefRecojo: domingo() });
    expect(r3.body.mensaje).toMatch(/domingos/);

    const otro = await prisma.cliente.create({ data: { tipoPersona: 'persona', nombres: 'Otro', apellidos: 'Cliente', email: `otro${Date.now()}@prueba.test`, telefono: '+19735550199', canalRegistro: 'web' } });
    const ajena = await prisma.direccion.create({ data: { clienteId: otro.id, direccion: '1 Main St, Newark, NJ', guardada: true } });
    const r4 = await enviar({ ...base(), direccion: { tipo: 'guardada', id: ajena.id } });
    expect(r4.status).toBe(400);
    expect(r4.body.mensaje).toMatch(/no está en el perfil/);
  });

  it('pide al menos una foto por mueble y revisa el tipo real de cada archivo', async () => {
    const r1 = await enviar(base(), []);
    expect(r1.body.mensaje).toMatch(/al menos una foto/);

    const r2 = await enviar(base(), [{ campo: 'mueble_0', nombre: 'video.mp4', tipo: 'video/mp4', contenido: MP4 }]);
    expect(r2.body.mensaje).toMatch(/al menos una foto/);

    const r3 = await enviar(base(), [{ campo: 'mueble_0', nombre: 'factura.jpg', tipo: 'image/jpeg', contenido: PDF }]);
    expect(r3.status).toBe(400);
    expect(r3.body.mensaje).toMatch(/dañado o no es del tipo/);

    const r4 = await enviar(base(), [{ campo: 'mueble_0', nombre: 'notas.txt', tipo: 'text/plain', contenido: Buffer.from('hola') }]);
    expect(r4.status).toBe(400);
    expect(r4.body.mensaje).toMatch(/no es una foto ni un video/);

    const r5 = await enviar(base(), [{ campo: 'mueble_3', nombre: 'frente.jpg', tipo: 'image/jpeg', contenido: JPG }]);
    expect(r5.body.mensaje).toMatch(/no corresponde a ningún mueble/);
  });

  it('si la transacción falla, borra los archivos que ya había guardado', async () => {
    const antes = eliminados.length;
    const original = prisma.$transaction.bind(prisma);
    (prisma as unknown as { $transaction: unknown }).$transaction = () => Promise.reject(new Error('fallo simulado'));
    try {
      const res = await enviar(base());
      expect(res.status).toBe(500);
    } finally {
      (prisma as unknown as { $transaction: unknown }).$transaction = original;
    }
    expect(eliminados.length).toBe(antes + 1);
  });

  it('lista solo las solicitudes del cliente con sesión', async () => {
    const res = await request(app).get('/api/solicitudes').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
    expect(res.body[0]).toMatchObject({ codigo: expect.stringMatching(/^SOL-/), muebles: expect.any(Array) });
  });
});
