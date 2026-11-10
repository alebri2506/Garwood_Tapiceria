import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AccesoPage } from '../features/seguridad/AccesoPage';
import { RutaRol, SoloInvitado } from './auth/guards';
import { PanelRol } from './layout/PanelRol';
import { ClienteLayout } from './layout/ClienteLayout';
import { AdminLayout } from './layout/AdminLayout';
import { PanelPage } from '../features/panel/PanelPage';
import { EstadisticasPage } from '../features/panel/EstadisticasPage';
import { AgendaPage } from '../features/comercial/agenda/AgendaPage';
import { AtenderCitaPage } from '../features/comercial/atender/AtenderCitaPage';
import { SolicitudesAdminPage } from '../features/comercial/bandeja/SolicitudesAdminPage';
import { CotizacionesPage } from '../features/comercial/cotizaciones/CotizacionesPage';
import { CotizarPage } from '../features/comercial/cotizaciones/CotizarPage';
import { SolicitudPage } from '../features/comercial/solicitud/SolicitudPage';
import { CitaPage } from '../features/comercial/cita/CitaPage';
import { MisPedidosLayout } from '../features/comercial/pedidos/MisPedidosLayout';
import { EnCursoPage } from '../features/comercial/pedidos/EnCursoPage';
import { SolicitudesPage } from '../features/comercial/pedidos/SolicitudesPage';
import { AnterioresPage } from '../features/comercial/pedidos/AnterioresPage';
import { PendientePage } from './PendientePage';
import { NotificacionesPage } from '../features/notificaciones/NotificacionesPage';
import { ParametrosPage } from '../features/seguridad/parametros/ParametrosPage';
import { UsuariosPage } from '../features/seguridad/usuarios/UsuariosPage';

// Pantallas A del diseño que aún no se implementan (ruta del menú lateral → pantalla).
const PANTALLAS_ADMIN: [string, string][] = [
  ['pagos', 'A5 Pagos'],
  ['pedidos', 'A6 Pedidos'], ['plantillas', 'A16 Plantillas'], ['inventario', 'A8 Inventario'], ['catalogo', 'A15 Catálogo de materiales y telas'],
  ['historial', 'A12 Historial'], ['clientes', 'A17 Clientes y expediente'], ['salidas', 'A13 Planificar salidas'],
  ['taller', 'A18 Taller: recepciones y retiros'], ['reclamos', 'A19 Reclamos e incidencias'],
];

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/acceso" replace /> },

  // G1 Acceso (común a todos los roles)
  {
    element: <SoloInvitado />,
    children: [
      { path: '/acceso', element: <AccesoPage modo="login" /> },
      { path: '/registro', element: <AccesoPage modo="registro" /> },
    ],
  },
  { path: '/restablecer', element: <AccesoPage modo="restablecer" /> },
  { path: '/terminos', element: <PendientePage titulo="Términos y condiciones" /> },
  { path: '/privacidad', element: <PendientePage titulo="Política de privacidad" /> },

  // Una zona por rol (RG-07). Las pantallas W, A, T y D del diseño van como hijas de cada zona.
  {
    path: '/cliente',
    element: <RutaRol roles={['Cliente']} />,
    children: [{
      element: <ClienteLayout />,
      children: [
        { index: true, element: <Navigate to="pedidos" replace /> },
        {
          path: 'pedidos',
          element: <MisPedidosLayout />,
          children: [
            { index: true, element: <EnCursoPage /> },
            { path: 'solicitudes', element: <SolicitudesPage /> },
            { path: 'anteriores', element: <AnterioresPage /> },
          ],
        },
        { path: 'solicitud', element: <SolicitudPage /> },
        { path: 'cita', element: <CitaPage tipo="local" /> },
        { path: 'visita', element: <CitaPage tipo="domicilio" /> },
        { path: 'cotizacion', element: <PendientePage titulo="W4 Mi cotización" /> },
        { path: 'pagos', element: <PendientePage titulo="W5 Mis pagos" /> },
        { path: 'entrega', element: <PendientePage titulo="W7 Aviso de entrega" /> },
        { path: 'reclamos', element: <PendientePage titulo="W9 Reclamos" /> },
        { path: 'notificaciones', element: <NotificacionesPage /> },
        { path: 'perfil', element: <PendientePage titulo="W10 Mi perfil" conCerrarSesion /> },
      ],
    }],
  },
  {
    path: '/admin',
    element: <RutaRol roles={['Administrador']} />,
    children: [{
      element: <AdminLayout />,
      children: [
        { index: true, element: <PanelPage /> },
        { path: 'estadisticas', element: <EstadisticasPage /> },
        { path: 'agenda', element: <AgendaPage /> },
        { path: 'agenda/atender', element: <AtenderCitaPage /> },
        { path: 'solicitudes', element: <SolicitudesAdminPage /> },
        { path: 'cotizaciones', element: <CotizacionesPage /> },
        { path: 'cotizaciones/cotizar', element: <CotizarPage /> },
        { path: 'parametros', element: <ParametrosPage /> },
        { path: 'usuarios', element: <UsuariosPage /> },
        ...PANTALLAS_ADMIN.map(([path, titulo]) => ({ path, element: <PendientePage titulo={titulo} /> })),
      ],
    }],
  },
  {
    path: '/taller',
    element: <RutaRol roles={['Tapicero']} />,
    children: [{ element: <PanelRol />, children: [{ index: true, element: <PendientePage titulo="T1 Órdenes del taller" /> }] }],
  },
  {
    path: '/conductor',
    element: <RutaRol roles={['Conductor']} />,
    children: [{ element: <PanelRol />, children: [{ index: true, element: <PendientePage titulo="D1 Hoja de ruta" /> }] }],
  },

  { path: '*', element: <Navigate to="/acceso" replace /> },
]);
