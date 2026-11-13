import { Router, type Request } from 'express';
import { autenticar, exigirRol, validar } from '../../../shared/http/middlewares.js';
import {
  cambiarOfertaTela, crearMaterial, crearProveedor, crearTela, editarMaterial, editarProveedor, editarTela, fichaMaterial, listarProveedores, listarStock,
  listarTelas, opcionesInventario,
} from '../application/catalogo.js';
import { encargarTela, marcarComoPedido, registrarLlegada, reponer } from '../application/reponer.js';
import { compararConteo, corregirStock, guardarConteo, listaConteo, listarMovimientos, pedidosEnProceso } from '../application/movimientos.js';
import {
  compararConteoSchema, compraSchema, correccionSchema, encargoSchema, guardarConteoSchema, materialSchema, ofertaTelaSchema, proveedorSchema, telaSchema,
} from './inventario.schemas.js';

const quien = (req: Request) => ({ usuarioId: req.usuario!.id, ip: req.ip });
const idDe = (req: Request) => Number(req.params.id);
const fecha = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

/** Almacén e Inventario (A15, A15b, A8, A8c, A8p, A9): solo el Administrador en esta entrega. */
export function inventarioRoutes() {
  const r = Router();
  r.use(autenticar, exigirRol('Administrador'));

  r.get('/opciones', async (_req, res) => { res.json(await opcionesInventario()); });

  // A15 Stock
  r.get('/stock', async (_req, res) => { res.json(await listarStock()); });
  r.get('/materiales/:id', async (req, res) => { res.json(await fichaMaterial(idDe(req))); });
  r.post('/materiales', validar(materialSchema), async (req, res) => { res.status(201).json(await crearMaterial(req.body, quien(req))); });
  r.put('/materiales/:id', validar(materialSchema), async (req, res) => { res.json(await editarMaterial(idDe(req), req.body, quien(req))); });

  // A15b Telas (muestrario)
  r.get('/telas', async (_req, res) => { res.json(await listarTelas()); });
  r.post('/telas', validar(telaSchema), async (req, res) => { res.status(201).json(await crearTela(req.body, quien(req))); });
  r.put('/telas/:id', validar(telaSchema), async (req, res) => { res.json(await editarTela(idDe(req), req.body, quien(req))); });
  r.put('/telas/:id/oferta', validar(ofertaTelaSchema), async (req, res) => { res.json(await cambiarOfertaTela(idDe(req), req.body.activa, quien(req))); });

  // A8p Proveedores
  r.get('/proveedores', async (_req, res) => { res.json(await listarProveedores()); });
  r.post('/proveedores', validar(proveedorSchema), async (req, res) => { res.status(201).json(await crearProveedor(req.body, quien(req))); });
  r.put('/proveedores/:id', validar(proveedorSchema), async (req, res) => { res.json(await editarProveedor(idDe(req), req.body, quien(req))); });

  // A8 Reponer
  r.get('/reponer', async (_req, res) => { res.json(await reponer()); });
  r.post('/compras', validar(compraSchema), async (req, res) => { res.status(201).json(await marcarComoPedido(req.body.proveedorId, req.body.lineas, quien(req))); });
  r.post('/encargos', validar(encargoSchema), async (req, res) => { res.status(201).json(await encargarTela(req.body.materialId, quien(req))); });
  r.post('/compras/:id/llegada', async (req, res) => { res.json(await registrarLlegada(idDe(req), quien(req))); });

  // A8c Movimientos y «Corregir stock»
  r.get('/movimientos', async (req, res) => {
    const tipo = ['entrada', 'salida', 'ajuste'].includes(String(req.query.tipo)) ? (req.query.tipo as 'entrada' | 'salida' | 'ajuste') : undefined;
    res.json(await listarMovimientos({ materialId: Number(req.query.materialId) || undefined, tipo, desde: fecha(req.query.desde), hasta: fecha(req.query.hasta), limite: Number(req.query.limite) || undefined }));
  });
  r.post('/movimientos', validar(correccionSchema), async (req, res) => { res.status(201).json(await corregirStock(req.body, quien(req))); });
  r.get('/pedidos-en-proceso', async (req, res) => { res.json(await pedidosEnProceso(req.query.q ? String(req.query.q) : undefined)); });

  // A9 Conteo de inventario
  r.get('/conteo', async (_req, res) => { res.json(await listaConteo()); });
  r.post('/conteo/comparar', validar(compararConteoSchema), async (req, res) => { res.json(await compararConteo(req.body.contados)); });
  r.post('/conteo', validar(guardarConteoSchema), async (req, res) => { res.status(201).json(await guardarConteo(req.body.contados, quien(req))); });

  return r;
}
