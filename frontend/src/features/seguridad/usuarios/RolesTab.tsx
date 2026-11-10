// A20 › Roles y permisos (CU-S04): los roles son fijos según la tesis; la autorización se valida en el backend (RG-07).
// y = gestiona · r = acceso parcial · n = sin acceso (mismos textos que el prototipo).
type Celda = [texto: string, tipo: 'y' | 'r' | 'n'];
const NO: Celda = ['—', 'n'];

const PERMISOS: [string, Celda, Celda, Celda, Celda][] = [
  ['Solicitudes y citas', ['Gestiona', 'y'], NO, NO, ['Propias', 'y']],
  ['Cotización: costos, sugerido y margen', ['Gestiona', 'y'], NO, NO, NO],
  ['Cotización: trabajos, precio y total', ['Gestiona', 'y'], NO, NO, ['Ve la suya', 'r']],
  ['Pagos', ['Confirma y registra', 'y'], NO, ['Cobra en ruta', 'r'], ['Informa', 'y']],
  ['Órdenes de trabajo', ['Planifica', 'y'], ['Todas las del taller', 'y'], NO, NO],
  ['Retiros de material', ['Consulta', 'r'], ['De órdenes en producción', 'y'], NO, NO],
  ['Inventario, conteo y compras', ['Gestiona', 'y'], NO, NO, NO],
  ['Historial y clientes', ['Gestiona', 'y'], NO, NO, ['Sus pedidos', 'r']],
  ['Salidas, recojos y entregas', ['Planifica', 'y'], NO, ['Registra', 'y'], ['Confirma fecha', 'r']],
  ['Reclamos', ['Gestiona', 'y'], NO, ['Incidencias', 'r'], ['Reporta', 'y']],
  ['Parámetros, usuarios y auditoría', ['Gestiona', 'y'], NO, NO, NO],
];

export function RolesTab() {
  return (
    <div className="stack">
      <div className="tbl-box">
        <table className="t us-roles">
          <thead><tr><th>Funcionalidad</th><th className="c">Administrador</th><th className="c">Producción</th><th className="c">Conductor</th><th className="c">Cliente</th></tr></thead>
          <tbody>
            {PERMISOS.map(([funcion, ...celdas]) => (
              <tr key={funcion}>
                <td>{funcion}</td>
                {celdas.map(([texto, tipo], i) => <td key={i} className={`c ${tipo}`}>{tipo === 'n' ? <span aria-label="Sin acceso">{texto}</span> : texto}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="audit">Los roles son fijos según la tesis; el Administrador asigna el rol a cada usuario.</p>
    </div>
  );
}
