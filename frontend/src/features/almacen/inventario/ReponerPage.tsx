import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { Icon } from '../../../shared/ui/Icon';
import { Aviso, CabeceraInventario, Pasos, cantidad, diaCorto, dinero, enUnidadTela } from './comunes';
import { inventarioApi, type Reponer } from './inventarioApi';

// A8 Reponer (CU-A02, A03, A04): qué encargar, qué pedir y qué llegó. GARWEB no le escribe al proveedor:
// el Administrador pide por teléfono o WhatsApp como siempre y aquí solo lo marca.

export function ReponerPage() {
  const [datos, setDatos] = useState<Reponer | null>(null);
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ t: string; b: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(() => inventarioApi.reponer().then((r) => {
    setDatos(r);
    setCantidades(Object.fromEntries(r.porProveedor.flatMap((p) => p.lineas.map((l) => [l.materialId, l.sugerido]))));
  }).catch((e) => setError(e instanceof ApiError ? e.message : 'No pudimos cargar la lista de reposición.')), []);
  useEffect(() => { cargar(); }, [cargar]);

  const accion = async (clave: string, fn: () => Promise<{ t: string; b: string }>) => {
    setOcupado(clave);
    setError(null);
    try {
      setAviso(await fn());
      await cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo completar. Intente de nuevo.');
    } finally {
      setOcupado(null);
    }
  };

  const u = enUnidadTela(datos?.unidadTelas ?? 'yd');
  const porReponer = datos?.porProveedor.reduce((t, p) => t + p.lineas.length, 0);

  return (
    <div className="iv iv-reponer">
      <CabeceraInventario seccion="Reponer" porReponer={porReponer} />
      {aviso && <Aviso titulo={aviso.t} onClose={() => setAviso(null)}> {aviso.b}</Aviso>}
      {error && <Alert tone="danger" title="No se pudo completar" compact>{error}</Alert>}
      {!datos && !error && <p className="muted" role="status">Cargando…</p>}

      {datos && (
        <>
          <div className="sh"><h2>Telas para encargar <em>{datos.telasParaEncargar.length}</em></h2><p>Bajo pedido · no hay stock de telas</p></div>
          <section className="pv">
            {datos.telasParaEncargar.map((t) => (
              <div key={t.materialId} className="ln tl3">
                <div className="nm3">
                  <b>Tela {t.nombre}{t.modelo ? ` · ${t.modelo}` : ''}</b>
                  {t.necesitaEl && <span className={t.urgente ? 'tag bad' : 'tag'} style={{ alignSelf: 'flex-start' }}>Se necesita {diaCorto(t.necesitaEl)}{t.urgente ? ' · encargar hoy' : ''}</span>}
                  <small>{t.pedidos.map((p) => `${p.codigo} (${u.cantidad(p.cantidad)} ${u.abrev})`).join(' + ')}</small>
                </div>
                <div className="nm3"><b>{u.cantidad(t.cantidad)} {u.abrev}</b><small>lo cotizado · {dinero(u.precio(t.precio))} por {u.abrev}</small></div>
                <div className="sub"><b>{dinero(t.subtotal)}</b><small>{t.proveedor ? `${t.proveedor.nombre} · ${t.proveedor.tarda}` : 'Sin proveedor'}</small></div>
                <div className="bt2">
                  <button type="button" className="gw-btn gw-btn-primary gw-btn-sm" disabled={ocupado === `tela-${t.materialId}`}
                    onClick={() => accion(`tela-${t.materialId}`, async () => { const r = await inventarioApi.encargarTela(t.materialId); return { t: `Tela encargada · ${t.nombre}`, b: `Pasó a «Por llegar» (${r.codigo}, llega ${diaCorto(r.llegaEl)}). Al llegar quedará asignada a sus pedidos.` }; })}>
                    Marcar como encargada
                  </button>
                </div>
              </div>
            ))}
            {datos.telasParaEncargar.length === 0 && <p className="vacio">No hay telas por encargar.</p>}
            <p className="hint3">La tela se elige en el <b>libro de muestras</b> del proveedor (modelo y color) y se encarga recién cuando el cliente paga el adelanto. Al llegar queda asignada a su pedido, no entra al stock; si sobra, es del cliente.</p>
          </section>

          <div className="sh"><h2>Materiales de stock por reponer <em>{datos.porProveedor.length} {datos.porProveedor.length === 1 ? 'proveedor' : 'proveedores'}</em></h2><p>Revise la cantidad sugerida, pida al proveedor como siempre y márquelo como pedido</p></div>
          <p className="why">Cantidad sugerida = consumo de {datos.semanas} {datos.semanas === 1 ? 'semana' : 'semanas'} − disponible − lo que ya viene (nunca menos de lo que falta para el mínimo). Las semanas se cambian en Parámetros.</p>
          {datos.sinProveedor.length > 0 && <Alert tone="warning" title="Materiales sin proveedor" compact>{datos.sinProveedor.join(', ')}: asígneles un proveedor en Stock para poder pedirlos.</Alert>}
          {datos.porProveedor.map((p) => {
            const total = p.lineas.reduce((s, l) => s + (cantidades[l.materialId] ?? 0) * l.precio, 0);
            const lineas = p.lineas.map((l) => ({ materialId: l.materialId, cantidad: cantidades[l.materialId] ?? 0 })).filter((l) => l.cantidad > 0);
            return (
              <section key={p.id} className="pv">
                <div className="pvh"><div><b>{p.nombre}</b><small>{p.canal} {p.contacto} · tarda {p.tarda}</small></div><div className="tot"><small>Costo estimado</small><b>{dinero(total)}</b></div></div>
                {p.lineas.map((l) => (
                  <div key={l.materialId} className="ln">
                    <div className="nm3"><b>{l.nombre}</b><span className={l.urgente ? 'tag bad' : 'tag warn'} style={{ alignSelf: 'flex-start' }}>{l.razon}</span><small>{l.calculo}</small></div>
                    <Pasos valor={cantidades[l.materialId] ?? 0} unidad={l.unidad} etiqueta={l.nombre} onChange={(n) => setCantidades((c) => ({ ...c, [l.materialId]: n }))} />
                    <div className="sub"><b>{dinero((cantidades[l.materialId] ?? 0) * l.precio)}</b><small>× {dinero(l.precio)}</small></div>
                  </div>
                ))}
                <div className="pvf">
                  <span className="hint">Se pide por {p.canal}</span>
                  <button type="button" className="gw-btn gw-btn-primary gw-btn-sm" disabled={!lineas.length || ocupado === `prov-${p.id}`}
                    onClick={() => accion(`prov-${p.id}`, async () => { const r = await inventarioApi.marcarPedido(p.id, lineas); return { t: `Marcado como pedido · ${p.nombre}`, b: `Pasó a «Por llegar» (${r.codigo}, llega ${diaCorto(r.llegaEl)}). Cuando llegue, marque «Llegó».` }; })}>
                    Marcar como pedido
                  </button>
                </div>
              </section>
            );
          })}
          {datos.porProveedor.length === 0 && <section className="pv"><p className="vacio"><Icon name="check" size={16} /> Nada por reponer: todo está sobre el mínimo o ya viene en camino.</p></section>}

          <div className="sh"><h2>Por llegar <em>{datos.porLlegar.length}</em></h2><p>Cuando llegue, un clic en «Llegó»: los materiales suman al stock y la tela queda en su pedido</p></div>
          <div className="pl2">
            {datos.porLlegar.map((w) => (
              <div key={`${w.compraId}-${w.nombre}`} className="pr2">
                <div className="nm3"><b>{w.nombre}</b><small>{w.proveedor} · {w.codigo} · pedido {diaCorto(w.pedidoEl)}</small><small>{w.para}</small></div>
                <span className="qy">{w.esTela ? `${u.cantidad(w.cantidad)} ${u.abrev}` : cantidad(w.cantidad, w.unidad)}</span>
                <div className="wh">
                  <b>Llega {diaCorto(w.llegaEl)}</b>
                  <span className={w.tiempo === 'tarde' ? 'tag bad' : w.tiempo === 'a_tiempo' ? 'tag ok' : 'tag'} style={{ alignSelf: 'flex-start' }}>
                    {w.tiempo === 'reposicion' ? 'Reposición' : `${w.tiempo === 'tarde' ? 'Llega tarde' : 'A tiempo'} · se necesita ${diaCorto(w.necesitaEl)}`}
                  </span>
                </div>
                <div className="bt">
                  <button type="button" className="gw-btn gw-btn-primary gw-btn-sm" disabled={ocupado === `compra-${w.compraId}`}
                    onClick={() => accion(`compra-${w.compraId}`, async () => { const r = await inventarioApi.llego(w.compraId); return { t: `${r.codigo} recibida`, b: `${r.efectos.join(' · ')}. Si llegó menos, corríjalo en Movimientos › Corregir stock.` }; })}>
                    Llegó
                  </button>
                </div>
              </div>
            ))}
            {datos.porLlegar.length === 0 && <div className="pr2"><span className="muted">No hay compras en camino.</span></div>}
          </div>
          <p className="why">«Llegó» suma todo lo pedido. Si llegó incompleto, corríjalo en <b>Movimientos › Corregir stock › Sale › «Llegó menos de lo pedido»</b>.</p>
        </>
      )}
    </div>
  );
}
