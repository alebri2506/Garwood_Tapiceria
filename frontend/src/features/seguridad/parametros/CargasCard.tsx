import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { Toast } from '../../../shared/ui/Toast';
import { parametrosApi, type CargaMueble, type TamanoCarga } from './parametrosApi';

// A14 › Tamaño de carga por tipo de mueble (decisiones K): cuánto suma cada mueble al transporte de la cotización.
// La tarifa de cada tamaño está en «Tarifas»; con varios muebles las cargas se suman. Se guarda al elegir.

const TAMANOS: { valor: TamanoCarga; etiqueta: string }[] = [
  { valor: 'chica', etiqueta: 'Chica' }, { valor: 'mediana', etiqueta: 'Mediana' }, { valor: 'grande', etiqueta: 'Grande' },
];

export function CargasCard({ alCambiar }: { alCambiar(): void }) {
  const [cargas, setCargas] = useState<CargaMueble[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(() => {
    setError(null);
    parametrosApi.cargas().then(setCargas).catch((e) => setError(e instanceof ApiError ? e.message : 'No pudimos cargar los tipos de mueble.'));
  }, []);
  useEffect(cargar, [cargar]);

  const cambiar = async (c: CargaMueble, tamano: TamanoCarga) => {
    setGuardando(c.id);
    setAviso(null);
    try {
      const r = await parametrosApi.cambiarCarga(c.id, tamano);
      setCargas((xs) => xs?.map((x) => (x.id === c.id ? r : x)) ?? null);
      if (!r.sinCambios) { setAviso(`${r.nombre}: ahora es carga ${r.tamanoCarga}. Las cotizaciones nuevas ya la usan.`); alCambiar(); }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos guardar el cambio.');
    } finally {
      setGuardando(null);
    }
  };

  return (
    <section className="card stack" aria-labelledby="grp-cargas">
      <h2 id="grp-cargas" style={{ fontSize: 18 }}>Tamaño de carga por tipo de mueble</h2>
      <p className="muted pr-nota">
        Cuánto suma cada mueble al transporte de la cotización: chica, mediana o grande (la tarifa de cada tamaño está en «Tarifas»).
        Con varios muebles en el mismo viaje, las cargas se suman. Cada cambio queda en el historial.
      </p>
      {aviso && <Toast title="Tamaño guardado" onClose={() => setAviso(null)}>{aviso}</Toast>}
      {error && <Alert tone="danger" title="No se pudo completar">{error} <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" onClick={cargar}>Reintentar</button></Alert>}
      {!cargas && !error && <p className="muted" role="status">Cargando tipos de mueble…</p>}
      {cargas && (
        <div className="tbl-box pr-tabla">
          <table className="t">
            <thead><tr><th>Tipo de mueble</th><th>Tamaño de carga</th></tr></thead>
            <tbody>
              {cargas.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.nombre}</b></td>
                  <td>
                    <select className="gw-input" aria-label={`Tamaño de carga de ${c.nombre}`} value={c.tamanoCarga} disabled={guardando === c.id} onChange={(e) => cambiar(c, e.target.value as TamanoCarga)}>
                      {TAMANOS.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
