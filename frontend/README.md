# GARWEB · frontend (garweb-web)

React + Vite + TypeScript. Pantallas implementadas según el prototipo de diseño GARWEB.

## Correr en local

```bash
npm install
npm run dev
```

Abre http://localhost:5173.

## Pantallas implementadas

| Pantalla | Ruta | CU |
|---|---|---|
| G1 Acceso · iniciar sesión | `/acceso` | S01 |
| G1 Acceso · crear cuenta (persona / empresa) | `/registro` | H01 |
| G1 Acceso · recuperar contraseña | `/acceso` → "¿Olvidó su contraseña?" | S02 |
| G1 Acceso · crear nueva contraseña (enlace del correo) | `/restablecer?token=…` | S02 |
| W2 Solicitar cotización | `/cliente/solicitud` | C01 |
| W3 Cita en el local (último paso de W2: `?nueva=1`, o agendar después: `?solicitud=SOL-…`) | `/cliente/cita` | C01, C04 |
| W3b Visita a domicilio (igual que W3) | `/cliente/visita` | C01, C04 |
| W6a Mis pedidos · en curso (lista y ficha) | `/cliente/pedidos`, `?pedido=PED-0076` | C16, C15 |
| W6b Mis pedidos · anteriores | `/cliente/pedidos/anteriores` | H06, H05 |
| W6c Mis pedidos · solicitudes y cotizaciones | `/cliente/pedidos/solicitudes` | C01, C04, C09 |
| W11 Notificaciones (y número en la campana) | `/cliente/notificaciones` | RG-05 |
| Escritorio del administrador (menú lateral por módulos) | `/admin/*` | — |
| A1 Panel de hoy · atención ahora, el día en números | `/admin` | C16, A09, D01 |
| A21 Estadísticas del mes · cobros, ventas, formas de pago, margen | `/admin/estadisticas` | C16, A09 |
| A2 Agenda de citas · semana y día, bloqueos | `/admin/agenda` | C03, C04 |
| A2c–A2e Agendar desde una solicitud (en espera, nueva, visita) | `/admin/agenda?agendar=SOL-…` (`&nueva=1`) | C04 |
| A2f–A2g No asistió · reprogramar | `/admin/agenda` → cita seleccionada | C04 |
| A2b Atender cita en el local · revisar, telas, traslado, cotización y respuesta | `/admin/agenda/atender` | C05, C07, C08, C09, C11, C14 |
| A3 Solicitudes · bandeja, ficha, descarte y nueva solicitud | `/admin/solicitudes` | C01, C02 |
| A4 Cotizaciones · lista y lo que falta armar | `/admin/cotizaciones` | C08, C09, C10 |
| A4 Cotización · armar, recotización V2, respuesta y renovar | `/admin/cotizaciones/cotizar` | C07, C08, C09, C10 |

Conectadas a la API (sin `VITE_API_URL` usan una API simulada): W2, W3, W3b, W6c, W11, A2 y A3. W6a/W6b, A1, A21, A2b y A4
son solo diseño: usan datos de ejemplo y todavía no guardan nada. Las demás rutas (A5–A20 del menú del
administrador, `/taller`, `/conductor`, W4, W5, W7, W9, W10) son temporales.

## API

Copie `.env.example` a `.env`. Con `VITE_API_URL=/api` el frontend usa la API real de `../backend`
(en desarrollo, Vite reenvía `/api` a `http://localhost:3000`). Con `VITE_API_URL` vacía usa la API
simulada en memoria (`src/features/seguridad/api/authMock.ts`), útil para revisar pantallas sin backend.

### Google Maps

W2 (dirección de recojo) usa `@vis.gl/react-google-maps`: mapa con marcador y autocompletado de direcciones con
Places API (New). Configure en `.env` (y en `../.env` para `docker compose`):

- `VITE_GOOGLE_MAPS_API_KEY`: clave de navegador de Google Cloud, con las APIs **Maps JavaScript API** y
  **Places API (New)** habilitadas y restringida a sus dominios (`localhost:5173`, `localhost:8090`, el de producción).
  Al tocar el mapa, la dirección se busca en OpenStreetMap (Nominatim): no necesita clave ni Geocoding API.
- `VITE_GOOGLE_MAPS_MAP_ID`: opcional; vacío usa `DEMO_MAP_ID`.

Sin clave, la pantalla muestra el mapa ilustrado del diseño y un campo de dirección normal.

Usuarios de prueba (contraseña `Sofa2026`): `laura.mendez@correo.com` (Cliente), `admin`, `tapicero`, `conductor`.

## Estructura

```
src/
  app/                 router y páginas temporales
  features/seguridad/  G1 Acceso: formularios, validaciones (Zod) y API
  shared/ui/           componentes del sistema de diseño (TextField, Alert, EmptyState, Icon)
  shared/styles/       tokens.css, base.css y ui.css copiados del prototipo
  shared/api/          cliente HTTP y sesión
```
