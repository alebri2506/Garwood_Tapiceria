# GARWEB · API (garweb-api)

Node.js + TypeScript + Express 5 + Prisma (PostgreSQL). Por ahora: autenticación (CU-S01, S02) y registro de clientes (CU-H01).

## Correr en local (Docker)

1. Con Docker Desktop abierto, desde la carpeta raíz del proyecto: `docker compose up -d db`
   (PostgreSQL en el puerto 5433; la primera vez también crea la base `garweb_test`).
2. Variables: copie `.env.example` a `.env` y complete `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET`.
3. Instalar, migrar y cargar datos de prueba:
   ```bash
   npm install
   npx prisma migrate deploy
   npm run db:seed
   ```
4. `npm run dev` → http://localhost:3000/api/salud (y el frontend con `npm run dev` en `../frontend`).

Para levantar todo en contenedores (base + API + web): `docker compose up -d --build` desde la raíz
→ web en http://localhost:8090. La API aplica sola las migraciones al arrancar; el seed se corre desde el equipo
(paso 3), porque la imagen de producción no incluye las herramientas de desarrollo.

## Desplegar la base en Supabase

Supabase aloja la **base de datos**; la API (Express) corre aparte como contenedor Docker (Render, Railway o Fly.io)
y el frontend en Netlify. Pasos:

1. En el panel del proyecto de Supabase, botón **Connect** → copie dos cadenas:
   - **Transaction pooler** (puerto 6543) → `DATABASE_URL`, agregando `?pgbouncer=true&connection_limit=1`.
   - **Session pooler** (puerto 5432) → `DIRECT_URL` (Prisma la usa solo para migrar).
2. Guárdelas en un archivo `.env.supabase` (no se sube al repo; copie el resto de variables de `.env`).
3. Aplicar el esquema y, si es un entorno de pruebas, los datos de ejemplo:
   ```bash
   npm run supabase:deploy
   npm run supabase:seed
   ```
   En producción no corra el seed con usuarios de prueba: cree el Administrador real y cambie su contraseña.
4. En el servicio donde corra la API, configure las mismas variables (`DATABASE_URL`, `DIRECT_URL`, secretos JWT,
   `APP_URL` = URL pública del frontend, SMTP).

La migración `seguridad_rls` activa **Row Level Security** en todas las tablas y quita los permisos a los roles
`anon` y `authenticated` de Supabase: la API REST pública de Supabase no puede leer nada (por ejemplo los hashes de
contraseña). Todo el acceso pasa por esta API, que se conecta como dueña de las tablas.
La migración `supabase_privilegios_futuros` hace que las tablas que se creen después también nazcan sin permisos
para esos roles; aun así, en cada migración que cree tablas agregue `ALTER TABLE "x" ENABLE ROW LEVEL SECURITY;`.

Las claves `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` que muestra Supabase para React **no se usan**:
el frontend nunca habla directo con Supabase, solo con esta API.

## Roles

Cada usuario tiene un rol (`Administrador`, `Tapicero`, `Conductor`, `Cliente`) que viaja en el access token.
- La API protege cada ruta con `autenticar` + `exigirRol(...)` (`src/shared/http/middlewares.ts`), p. ej.
  `router.get('/ordenes', autenticar, exigirRol('Tapicero', 'Administrador'), ...)`. Otro rol recibe 403.
- El frontend lleva a cada rol a su zona (`/admin`, `/cliente`, `/taller`, `/conductor`) y no le deja abrir las
  demás; eso es solo navegación, la protección real es la de la API (RG-07).
- Las cuentas de personal las crea el Administrador (CU-S03, pendiente); el registro web siempre crea rol Cliente.

Usuarios del seed (contraseña = `SEED_CONTRASENA`, por defecto `Sofa2026`): `laura.mendez@correo.com` (Cliente),
`admin`, `tapicero`, `conductor`.

## Pruebas

`npm test` corre las pruebas de API (Vitest + Supertest) contra la base de `.env.test`, que se **borra** en cada
corrida. Cree `.env.test` copiando `.env`, agregue `NODE_ENV=test` y apunte `DATABASE_URL` y `DIRECT_URL` a
`postgresql://garweb:garweb@localhost:5433/garweb_test` (las pruebas se niegan a correr si el nombre no contiene `test`).

## Endpoints

| Método | Ruta | CU | Cuerpo | Respuesta |
|---|---|---|---|---|
| POST | `/api/auth/login` | S01 | `{ identificador, contrasena, recordarme }` | `{ token, usuario: { id, nombre, rol } }` + cookie `garweb_refresh` |
| POST | `/api/auth/registro` | H01 | `{ tipoPersona, nombres, apellidos, email, telefono (+1XXXXXXXXXX), contrasena, avisosCorreo, razonSocial?, documento? (EIN), cargo? }` | 201, igual que login |
| POST | `/api/auth/recuperar` | S02 | `{ email }` | 200 siempre (no revela si el correo existe) |
| POST | `/api/auth/restablecer` | S02 | `{ token, contrasena }` | 200 / 400 si el enlace venció o ya se usó |
| POST | `/api/auth/refresh` | — | cookie `garweb_refresh` | nueva sesión |
| POST | `/api/auth/logout` | — | — | 204, borra la cookie |
| GET | `/api/auth/me` | — | `Authorization: Bearer <token>` | `{ id, nombre, rol, email }` |
| GET | `/api/solicitudes/catalogo` | C01 | Cliente | tipos de mueble con sus partes, servicios, acabados, telas activas, franjas y límites |
| GET | `/api/solicitudes/direcciones` | C01 | Cliente | direcciones guardadas en su perfil |
| GET | `/api/solicitudes` | C01 | Cliente | sus solicitudes (solo las suyas), con el resumen de su última cotización publicada |
| GET | `/api/solicitudes/:codigo/cotizacion` | C09 | Cliente | W4: trabajos, telas, traslado, total, adelanto, vigencia, pedido y recojo (sin costos internos) |
| POST | `/api/solicitudes/:codigo/cotizacion/respuesta` | C09, C14 | Cliente · `{ respuesta: 'rechaza', motivo, comentario? }` o `{ respuesta: 'acepta', comentario? }` | rechazar; aceptar solo sin adelanto (con adelanto: 409 hasta que exista la pasarela) |
| GET | `/api/solicitudes/recojos/disponibilidad` | D | Cliente | horas del camión para el recojo de su pedido |
| POST | `/api/solicitudes/:codigo/recojo` | D | Cliente · `{ fecha, hora }` | agenda el recojo de su pedido (un recojo por hora) |
| POST | `/api/solicitudes` | C01 | Cliente · `multipart/form-data`: campo `datos` (JSON) y las fotos de cada mueble en `mueble_0`, `mueble_1`… | 201 `{ codigo, estado, siguiente, cita }` (`siguiente`: cita, visita o cotizacion). Con cita en el local o visita, `datos.cita` (`fecha`, `hora` o `franja`, y `direccion` en la visita) es obligatorio desde la web: la solicitud y el turno se guardan juntos |
| GET | `/api/solicitudes/:codigo` | C01 | Cliente | su solicitud con muebles, telas, fotos (enlaces firmados) y cita |
| POST | `/api/solicitudes/:codigo/fotos` | C01 | Cliente · multipart, `mueble_0`… | sube las fotos que el taller pidió por enlace |
| GET | `/api/citas/disponibilidad` | C03, C04 | `?tipo=local\|domicilio&desde=AAAA-MM-DD&dias=N` | turnos (local) u horas de visita de 1 hora (domicilio) libres por día |
| POST | `/api/citas` | C04 | Cliente / Admin · `{ solicitud, fecha, hora, direccion? }` | 201 cita programada (la visita también va con hora) |
| POST | `/api/citas/:id/reprogramar` · `/cancelar` | C04 | Cliente (la suya) / Admin | cita actualizada |
| POST | `/api/citas/:id/resultado` | C05 | Admin · `{ resultado: atendida \| no_asistio }` | `{ cita, inasistencias, puedeReprogramar }` |
| GET | `/api/admin/agenda?desde=AAAA-MM-DD` | C03, C04 | Admin | A2: la semana (lunes a sábado; el domingo, la siguiente) con citas, visitas, bloqueos y horario |
| POST | `/api/admin/agenda/bloqueos` | C03 | Admin · `{ bloques: [{ fecha, hora }], motivo? }` | 201; solo turnos libres y futuros |
| POST | `/api/admin/agenda/bloqueos/:id/quitar` | C03 | Admin | 204; el bloqueo queda anulado (no se borra) y el turno vuelve a estar libre |
| POST | `/api/admin/solicitudes/:codigo/vencer` | C04 | Admin | tras la 2.ª inasistencia, la da por vencida y avisa al cliente |
| GET | `/api/admin/solicitudes?q=&desde=&hasta=` | C02 | Admin | A3 Solicitudes y cotizaciones: cada fila con su `etapa` (Cita / visita · Por cotizar · Esperando al cliente · Cerradas), `estadoVisible`, hora de envío, cita y atraso; `desde`/`hasta` filtran por día de solicitud (Nueva York) |
| GET | `/api/admin/solicitudes/:codigo` | C02 | Admin | ficha completa con historial |
| POST | `/api/admin/solicitudes/:codigo/descartar` | C02 | Admin · `{ motivo }` | Descartada con motivo; cancela la cita y avisa |
| GET | `/api/admin/clientes?q=` | H01 | Admin | busca clientes por nombre, correo o teléfono |
| POST | `/api/admin/solicitudes` | C01, H01 | Admin · multipart (cliente existente o nuevo, `canal`, `esperaFotos`) | 201; cliente nuevo con correo recibe invitación |
| GET | `/api/notificaciones` | RG-05 | cualquier rol | `{ sinLeer, notificaciones }` |
| POST | `/api/notificaciones/:id/leida` · `/leer-todas` | RG-05 | cualquier rol | 204 |
| GET | `/api/archivos/*` | — | enlace firmado (`vence`, `firma`) | el archivo, solo mientras el enlace no vence |
| GET | `/api/admin/parametros/maquinas` | S05 | Admin | A14 › Máquinas: nombre, tarifa por hora, activa y en cuántas plantillas vigentes se usa |
| POST | `/api/admin/parametros/maquinas` | S05 | Admin · `{ nombre, tarifaHora }` | 201; 409 si el nombre ya existe |
| PUT | `/api/admin/parametros/maquinas/:id` | S05 | Admin · `{ nombre?, tarifaHora? }` | bitácora con valor anterior y nuevo (`sinCambios` si no cambió nada) |
| PUT | `/api/admin/parametros/maquinas/:id/estado` | S05 | Admin · `{ activo }` | desactivar o reactivar (no se borra) |
| GET | `/api/admin/atencion/:solicitud` | C05 | Admin | A2b: cliente, cita o visita (con hora), muebles con fotos, direcciones, cotización y pedido |
| PUT | `/api/admin/atencion/:solicitud/traslado` | C07 | Admin · `{ traslado, direccion? }` | delivery (dirección guardada o nueva) o lo lleva el cliente |
| POST | `/api/admin/atencion/:solicitud/respuesta` | C09, C11, C14 | Admin · `{ cotizacion, respuesta, pagaAhora?, metodo?, motivo? }` | publica y registra la respuesta: pedido + adelanto si acepta y paga |
| GET | `/api/admin/atencion/recojos/disponibilidad` | D | Admin | horas del camión para el recojo (libre, ocupada, pasada, cerrada) |
| POST | `/api/admin/atencion/pedidos/:pedido/recojo` | D | Admin · `{ tipo: 'agendado', fecha, hora }` o `{ tipo: 'en_visita' }` | un recojo por hora; «en la visita» solo a domicilio |
| GET | `/api/admin/cotizaciones/armar/:solicitud` | C07, C08, C11 | Admin | A4: la propuesta (plantillas, telas, fotos, transporte calculado, adelanto sugerido) o el borrador guardado o la cotización publicada |
| PUT | `/api/admin/cotizaciones/armar/:solicitud` | C08 | Admin · `{ muebles, transporte, adelanto, observaciones }` | guarda el borrador (crea COT-0000 la primera vez) |
| POST | `/api/admin/cotizaciones/armar/:solicitud/publicar` | C08 | Admin · igual que guardar | revisa, congela precios, solicitud → Cotizada y avisa al cliente |
| GET | `/api/admin/parametros/cargas` | S05 | Admin | tipos de mueble con su tamaño de carga |
| PUT | `/api/admin/parametros/cargas/:id` | S05 | Admin · `{ tamanoCarga }` | chica, mediana o grande (bitácora e historial) |
| GET | `/api/admin/plantillas` | C06 | Admin | A16: tipos de mueble × servicios, máquinas con tarifa, materiales con precio, parámetros del costo y plantillas activas con su precio sugerido |
| GET | `/api/admin/plantillas/:id` | C06 | Admin | actividades, costeo, versión y quién la editó |
| POST | `/api/admin/plantillas` | C06 | Admin · `{ tipoMuebleId, servicio, actividades }` | 201; versión 1 (409 si ya existe) |
| PUT | `/api/admin/plantillas/:id` | C06 | Admin · `{ actividades }` | crea la versión nueva y deja inactiva la anterior (`sinCambios` si no cambió nada) |
| GET | `/api/admin/inventario/stock` | A01, A02, A09 | Admin | A15: cada material con en el estante, reservado, disponible, mínimo, consumo, «alcanza para» y estado |
| GET · POST · PUT | `/api/admin/inventario/materiales[/:id]` | A01 | Admin | ficha con últimos movimientos; nuevo material (entra con 0); editar (la unidad no cambia si ya tiene movimientos) |
| GET · POST · PUT | `/api/admin/inventario/telas[/:id]` · `PUT /telas/:id/oferta` | A01 | Admin | A15b muestrario sin cantidades; descontinuar / volver a ofrecer |
| GET · POST · PUT | `/api/admin/inventario/proveedores[/:id]` | A03 | Admin | A8p |
| GET | `/api/admin/inventario/reponer` | A02, A03 | Admin | telas para encargar, materiales por proveedor con cantidad sugerida y compras por llegar |
| POST | `/api/admin/inventario/compras` · `/encargos` · `/compras/:id/llegada` | A03, A04 | Admin | «Marcar como pedido», «Marcar como encargada» y «Llegó» |
| GET · POST | `/api/admin/inventario/movimientos` | A09 | Admin | kardex (`materialId`, `tipo`, `desde`, `hasta`) y «Corregir stock» |
| GET | `/api/admin/inventario/pedidos-en-proceso?q=` | A09 | Admin | pedidos a los que se les puede retirar o devolver material |
| GET · POST | `/api/admin/inventario/conteo` · `/conteo/comparar` | A10 | Admin | lista a ciegas, comparar y guardar con el motivo de cada diferencia |

Errores: `{ "mensaje": "..." }` en español, listo para mostrar. Los 400 de validación traen además `errores` por campo.

## Reglas implementadas

- **CU-S01**: contraseñas con bcrypt; mismo mensaje y mismo tiempo de respuesta si el correo no existe o la contraseña
  es errada; bloqueo tras `login.max_intentos` fallos durante `login.minutos_bloqueo` (tabla `parametro`, RG-04);
  la cuenta inactiva solo se informa a quien acertó la contraseña; límite de intentos por IP.
- **CU-S02**: el enlace guarda solo el SHA-256 del token, vence en `recuperacion.minutos_vigencia`, sirve una vez,
  un enlace nuevo anula los anteriores, y cambiar la contraseña levanta el bloqueo. Sin `SMTP_HOST` el correo se
  imprime en la consola.
- **CU-H01**: crea `cliente` + `usuario` con rol Cliente en una transacción; sin duplicados por correo ni EIN.
- **CU-C01** (solicitud de cotización del cliente): hasta `solicitud.max_muebles` muebles, cada uno con tipo, servicio,
  cantidad (1–99) y al menos una foto (hasta `solicitud.max_archivos_mueble` archivos; fotos ≤ 10 MB y videos ≤ 50 MB;
  se revisa la firma del archivo, no solo la extensión). Fabricación a medida exige medidas y acabado. «No lleva tela»
  solo si ningún servicio la necesita. Catálogo en línea: solo telas activas; una sola tela para todo el mueble o, por
  partes, una tela para cada parte. «¿Qué tela busca?» es obligatoria solo con visita a domicilio (en el local es
  opcional). Con cita en el local o visita a domicilio queda «En espera de cita», se guarda junto con el turno elegido
  (si el turno se ocupó, no se guarda nada) y el traslado se define en la cita; si no, queda «Nueva» y pide traslado; con delivery, solo la dirección: el
  cliente **no** elige día ni hora de recojo al pedir la cotización y nada se reserva en la agenda; lo elige cuando se confirma
  su pago (decisiones A.7 del 13/11).
  Las direcciones guardadas deben ser del cliente. Todo en una transacción; si falla, se borran los archivos.
  Las fotos se guardan con `STORAGE=disco` en `UPLOADS_DIR` (volumen `garweb-uploads` en Docker) o con
  `STORAGE=supabase` en un bucket privado de Supabase Storage (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
  `STORAGE_BUCKET`); nunca hay enlaces públicos, solo enlaces firmados que vencen.
- **CU-C02**: bandeja por estado, atrasadas tras `solicitud.dias_atraso` días; descarte solo con motivo, sin borrar.
- **CU-C03 / C04**: turnos de `cita.duracion_min` en `agenda.turnos_manana/tarde`, lunes a sábado sin feriados ni
  bloqueos (`agenda_bloqueo`); un cliente por turno (índices únicos parciales en la base, así dos clientes no toman el mismo turno a la vez).
  Una sola cita programada por solicitud. **Visita a domicilio (13/11):** el cliente elige día y hora en bloques de
  `visita.duracion_min` dentro de `visita.franja_manana/tarde`; no puede cruzarse con citas, otras visitas ni bloqueos, y
  ocupa esa parte de la agenda. El Administrador también puede fijarla a otra hora que entre completa en la franja (A2e). El cliente reprograma una vez tras una inasistencia (`cita.reprogramaciones_inasistencia`);
  si vuelve a faltar, el Administrador decide: darla por vencida u ofrecerle un último turno. Hora del negocio: New York.
- **A4 Armar cotización (CU-C07, C08, C11 · decisiones K)**: una por solicitud con todos sus muebles. Transporte = millas por
  calle desde `taller.direccion` (OpenStreetMap + OSRM, `shared/infrastructure/rutas.ts`; en las pruebas, fijas) × 2 ×
  `transporte.por_milla` + la suma de la carga de cada mueble; a mano con motivo si no se puede calcular. Adelanto sugerido
  según pedidos cerrados, entre 0 y el máximo de Parámetros. El borrador se guarda en `cotizacion.borrador`; al publicar se
  crean las filas con los precios congelados y la solicitud pasa a «Cotizada».
- **CU-C06 Plantillas (A16 · decisiones I)**: una por tipo de mueble + servicio, versionada (guardar crea una versión nueva; una
  sola activa por índice único parcial). Precio sugerido = (materiales a precio de hoy + horas × `tarifa.hora_persona` + horas de
  máquina × tarifa de la máquina + `tarifa.costos_fijos_pedido`) × (1 + `cotizacion.margen_pct`). Solo materiales de
  stock: la tela no va en la plantilla (se agrega en la cotización), así que el sugerido es sin tela. Todo queda en `bitacora`.
- **Inventario (A15, A15b, A8, A8c, A8p, A9 · decisiones H)**: disponible = en el estante − reservado; reservado y consumo se
  calculan de `reserva_material` y `movimiento_inventario`; la cantidad sugerida usa `inventario.semanas_compra`; el estante
  nunca queda en negativo (también lo impide un CHECK); la tela bajo pedido (`encargo_tela`) no entra al stock; el conteo es a
  ciegas y cada diferencia exige motivo. Todo queda en `bitacora` (módulo `almacen`).
- **RG-05**: cada aviso al cliente o al taller se guarda en `notificacion` y se envía por correo después de confirmar
  la transacción.
- **RG-07**: el cliente solo ve y cambia sus solicitudes, citas y avisos.
- **RG-02**: login, fallos, bloqueos, recuperaciones, registros y solicitudes quedan en `bitacora`.
- Sesión: access token JWT de 15 min en el cuerpo; refresh token de 30 días en cookie `HttpOnly`
  ("Recordarme" la hace persistente; si no, dura hasta cerrar el navegador).

## Cambios respecto al modelo de datos de la tesis

- `usuario.email`: el personal también necesita correo para recuperar su contraseña.
- `usuario.intentos_fallidos`, `usuario.bloqueado_hasta`: bloqueo por intentos (CU-S01).
- `cliente.cargo`, `cliente.acepta_avisos_correo`, `cliente.activo`: los pide el formulario de registro / RG-03.
- Tabla nueva `token_recuperacion` (CU-S02).
- CU-C01: la solicitud del diseño trae varios muebles, así que `tipo_mueble_id`, servicio y medidas pasan de `solicitud`
  a la tabla nueva `solicitud_mueble`; `solicitud_tela` guarda las telas de cada mueble (y la parte, si es por partes);
  `solicitud_adjunto` cuelga del mueble. `tipo_mueble_parte` guarda las partes de cada mueble. `material` agrega
  `familia`, `pattern`, `numero_color` y `color_hex` (cada tela se identifica por su pattern y color).
  `direccion.guardada` indica si aparece en Mi perfil. **Las telas del seed (`TP-…`) son datos de prueba** hasta que
  exista A15 Catálogo.
- `solicitud` agrega el descarte (`motivo_descarte`, `descartada_por`, `fecha_descarte`) y `espera_fotos` (registrada por el
  administrador, fotos pendientes por enlace).
- `cita` agrega `tipo` (local / domicilio), `franja` y `direccion_id` para la visita a domicilio.
- `cliente.email` es opcional: el administrador registra clientes que llaman por teléfono sin correo.
- Respuesta del cliente (migración `respuesta_cliente`): `cotizacion.comentario_respuesta`.
- Atención (migraciones `atencion_respuesta_recojo` y `solicitud_rechazada`): `pago` (registro mínimo del adelanto),
  `recojo` (índice único parcial: un recojo programado por hora), `pedido.cotizacion_id`, respuesta en `cotizacion`
  (medio, motivo, fecha) y el estado «Rechazada» en la solicitud.
- Cotizaciones (migración `cotizaciones`): `cotizacion` (COT-0000, transporte, adelanto, vigencia, borrador), `cotizacion_mueble`
  (sugerido y propuesto), `cotizacion_actividad`, `cotizacion_material` y `cotizacion_tela` (precios congelados);
  `tipo_mueble.tamano_carga`. Parámetro nuevo `taller.direccion` (correr el seed con `SEED_DATOS_EJEMPLO=no`).
- Plantillas (migración `plantillas`): tablas `maquina` (tarifa por hora), `plantilla` (tipo de mueble + servicio + versión),
  `plantilla_actividad` y `plantilla_material` (solo materiales de stock; migración `plantillas_sin_tela`). Las máquinas se siembran siempre; las plantillas
  de ejemplo, solo con `SEED_DATOS_EJEMPLO`.
- Inventario (migraciones `inventario` e `inventario_reglas`): `material` agrega proveedor, precio con su fecha, en el estante,
  mínimo, ubicación, `en_web`, libro y color para buscar; tablas nuevas `proveedor`, `pedido` (código `PED-0000` propio, enlazado
  a su solicitud), `reserva_material`, `encargo_tela`, `compra` / `compra_linea`, `movimiento_inventario` (kardex con saldo) y
  `conteo` / `conteo_linea`. `parametro.opciones` para el tipo «opción» (unidades de A14). **Los pedidos, proveedores y
  materiales del seed son datos de prueba** (`seed-inventario.ts`).
- Diseño v4: se quitó la muestra de tela a domicilio (migración `sin_muestra_tela`): la tela se elige en el catálogo,
  en el local o en la visita.
