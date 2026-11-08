import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { Icon, type IconName } from '../../shared/ui/Icon';
import { useAuth } from '../auth/AuthProvider';
import './admin.css';

type Modulo = 'panel' | 'com' | 'alm' | 'his' | 'des' | 'seg';

interface Opcion { a: string; texto: string; icono: IconName; cnt?: number }
interface Seccion { modulo: Modulo; titulo?: string; opciones: Opcion[] }

/** Nombre del módulo en la etiqueta de cada pantalla (color por módulo del diseño v3). */
const NOMBRE_MODULO: Record<Modulo, string> = {
  panel: 'Panel', com: 'Comercial', alm: 'Almacén e Inventario', his: 'Historial de Clientes', des: 'Despacho', seg: 'Seguridad y Administración',
};

// Los contadores son de ejemplo hasta que existan las bandejas en la API.
const MENU: Seccion[] = [
  { modulo: 'panel', opciones: [{ a: '/admin', texto: 'Panel principal', icono: 'dashboard' }, { a: '/admin/estadisticas', texto: 'Estadísticas', icono: 'trending-up' }] },
  {
    modulo: 'com', titulo: 'Comercial', opciones: [
      { a: '/admin/agenda', texto: 'Agenda de citas', icono: 'calendar' },
      { a: '/admin/solicitudes', texto: 'Solicitudes', icono: 'inbox', cnt: 6 },
      { a: '/admin/cotizaciones', texto: 'Cotizaciones', icono: 'quote' },
      { a: '/admin/pagos', texto: 'Pagos', icono: 'payment', cnt: 3 },
      { a: '/admin/pedidos', texto: 'Pedidos', icono: 'kanban' },
      { a: '/admin/plantillas', texto: 'Plantillas', icono: 'clipboard' },
    ],
  },
  {
    modulo: 'alm', titulo: 'Almacén e Inventario', opciones: [
      { a: '/admin/inventario', texto: 'Inventario', icono: 'package' },
      { a: '/admin/catalogo', texto: 'Catálogo de materiales', icono: 'scissors' },
    ],
  },
  {
    modulo: 'his', titulo: 'Historial', opciones: [
      { a: '/admin/historial', texto: 'Historial', icono: 'history' },
      { a: '/admin/clientes', texto: 'Clientes', icono: 'user' },
    ],
  },
  {
    modulo: 'des', titulo: 'Despacho', opciones: [
      { a: '/admin/salidas', texto: 'Salidas', icono: 'truck' },
      { a: '/admin/taller', texto: 'Taller: recepciones', icono: 'sofa' },
      { a: '/admin/reclamos', texto: 'Reclamos', icono: 'alert', cnt: 1 },
    ],
  },
  {
    modulo: 'seg', titulo: 'Configuración', opciones: [
      { a: '/admin/parametros', texto: 'Parámetros', icono: 'sliders' },
      { a: '/admin/usuarios', texto: 'Usuarios y seguridad', icono: 'lock' },
    ],
  },
];

const moduloDe = (pathname: string): Modulo => {
  if (pathname === '/admin' || pathname === '/admin/') return 'panel';
  return MENU.find((s) => s.opciones.some((o) => o.a !== '/admin' && pathname.startsWith(o.a)))?.modulo ?? 'panel';
};

const ESTRECHO = '(max-width: 900px)';

const iniciales = (nombre: string) =>
  nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

interface AdminContexto { modulo: string }

/** Cabecera de una pantalla A: etiqueta del módulo, migas y título. */
export function TopAdmin({ crumb, titulo, children, debajo }: { crumb: ReactNode; titulo: ReactNode; children?: ReactNode; debajo?: ReactNode }) {
  const { modulo } = useOutletContext<AdminContexto>();
  return (
    <div className="top">
      <div>
        <div className="crumb"><span className="modtag">{modulo}</span>{crumb}</div>
        <h1>{titulo}</h1>
        {debajo}
      </div>
      {children}
    </div>
  );
}

/** Escritorio del administrador: barra lateral por módulos (contraíble; en tablet y celular se abre encima). */
export function AdminLayout() {
  const { sesion, salir } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuT, setMenuT] = useState(false);
  const modulo = moduloDe(pathname);

  // En tablet y celular el menú se cierra al elegir una pantalla.
  useEffect(() => { if (window.matchMedia(ESTRECHO).matches) setMenuT(false); }, [pathname]);

  useEffect(() => {
    if (!menuT) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && window.matchMedia(ESTRECHO).matches) setMenuT(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [menuT]);

  if (!sesion) return null;

  const cerrar = async () => {
    await salir();
    navigate('/acceso', { replace: true });
  };

  return (
    <div className={menuT ? 'app menu-t' : 'app'} style={{ '--mod': `var(--m-${modulo})` } as CSSProperties}>
      <button type="button" className="hbg-m" aria-label="Abrir el menú" aria-expanded={menuT} aria-controls="gw-side" onClick={() => setMenuT(true)}>
        <Icon name="menu" size={22} strokeWidth={2} />
      </button>
      <div className="nav-dim" aria-hidden="true" onClick={() => setMenuT(false)} />
      <nav id="gw-side" className="side" aria-label="Navegación principal">
        <div className="brand">
          <button type="button" className="hbg" aria-label="Contraer o expandir el menú" onClick={() => setMenuT((v) => !v)}>
            <Icon name="menu" size={22} strokeWidth={2} />
          </button>
          <span className="bt"><b>GARWEB</b><span>Garwood · Tapicería de Interiores</span></span>
        </div>
        {MENU.map((s) => (
          <Fragment key={s.modulo}>
            {s.titulo && <span className={`nav-h nh-${s.modulo}`}>{s.titulo}</span>}
            {s.opciones.map((o) => (
              <NavLink key={o.a} to={o.a} end={o.a === '/admin'} title={o.texto} className={({ isActive }) => (isActive ? 'nav on' : 'nav')}>
                <Icon name={o.icono} /><span>{o.texto}</span>
                {o.cnt != null && <span className="cnt" aria-label={`${o.cnt} pendientes`}>{o.cnt}</span>}
              </NavLink>
            ))}
          </Fragment>
        ))}
        <div className="me">
          <i aria-hidden="true">{iniciales(sesion.usuario.nombre)}</i>
          <div>
            <b>{sesion.usuario.nombre}</b>
            <small>Gerencia</small>
            <button type="button" className="me-out" onClick={cerrar}>Cerrar sesión</button>
          </div>
        </div>
      </nav>
      <main className="main">
        <Outlet context={{ modulo: NOMBRE_MODULO[modulo] } satisfies AdminContexto} />
      </main>
    </div>
  );
}
