---
name: "garweb-contexto"
description: "Contexto completo de GARWEB (tesis URP, Tapicería Garwood LLC): módulos, 49 casos de uso, reglas de negocio, modelo de datos, stack (Docker, Supabase, PWA) y buenas prácticas. Úsala al programar GARWEB o al redactar la tesis."
---

# GARWEB — Contexto del proyecto

> **Importante:** las decisiones tomadas después del 24 oct 2026 están en `docs/contexto/decisiones-recientes.md`, `docs/contexto/agenda.md` y `docs/contexto/hu-solicitud-cotizacion.md`, y **prevalecen** sobre este documento. Ejemplos: ya no existe A10 Compras (pasó a Inventario › Qué pedir), se eliminó la muestra de tela a domicilio y la Agenda ya no crea citas sueltas. Pantallas actuales: `docs/prototipo/README.md`.


Usa este contexto siempre que trabajes en GARWEB: código (backend, frontend, base de datos, despliegue), documentación de la tesis, diagramas o presentaciones. Responde en español, de forma directa y paso a paso, explicando el porqué de cada recomendación.

## 1. Qué es

- **GARWEB**: sistema web centralizado para la administración de los procesos operativos de **Tapicería de Interiores Garwood LLC** (New Jersey, EE. UU.; 6 trabajadores; +24 años; tapicería fina y restauración).
- Tesis de Ingeniería Informática, Universidad Ricardo Palma (URP). Autores: Jesús Keith Sánchez Castillón (202010163) y Alejandro Jesús Briceño Angulo (202112454). Asesor: Ing. Humberto Víctor Linarez Coloma.
- Metodología: **RUP** (iterativo e incremental), nivel **MVP** hasta la fase de **Elaboración**.
- Prototipo navegable: https://garweb-garwood.netlify.app/
- Estado actual: documento Cap. 1–3 terminado; el asesor pidió empezar a programar. Los próximos entregables son avance de programación (video y exposiciones de ≤10 min con el flujo completo).

## 2. Stack tecnológico

Leyenda: **[Decidido]** ya acordado por el equipo · **[Recomendado]** propuesta por defecto; si el equipo elige otra, respetar su elección y actualizar esta sección.

### 2.1 Base de datos y despliegue
| Capa | Tecnología | Estado | Uso |
|---|---|---|---|
| Base de datos | **PostgreSQL** alojado en **Supabase** | [Decidido] | BD de producción/pruebas en la nube (51 tablas core) |
| Contenedores | **Docker** + **Docker Compose** | [Decidido] | Entorno local idéntico para los dos desarrolladores: `api`, `web`, `db` (PostgreSQL local para desarrollo) |
| Archivos (fotos, comprobantes, PDF, escaneos) | **Supabase Storage** (buckets privados, URLs firmadas) | [Recomendado] | Guardar solo la URL en la BD (`*_url`) |
| Migraciones y seeds | **Prisma Migrate** (o Knex) + seeds de datos de ejemplo (caso PED-0076) | [Recomendado] | El esquema se versiona en el repo; nunca se cambia la BD a mano |
| Hosting frontend | Netlify (ya usado para el prototipo) o Vercel | [Recomendado] | Despliegue del build estático de la PWA |
| Hosting backend | Contenedor Docker en Render / Railway / Fly.io | [Recomendado] | La misma imagen que se usa en local |
| CI | GitHub Actions: lint + tests + build en cada PR | [Recomendado] | Calidad antes de integrar |

Reglas de Supabase:
- El backend se conecta con la cadena de conexión de PostgreSQL (o la `service_role` key) **solo desde el servidor**; **nunca** exponer `service_role` ni credenciales en el frontend.
- La autorización por rol se hace en el backend (ver §4 RG-07/RG-08). Si en algún momento el frontend consulta Supabase directamente, activar **Row Level Security** con políticas por rol.
- Respaldo diario (CU-H08): backups automáticos de Supabase + exportación programada (`pg_dump`) a Storage.
- Variables en `.env` (no se suben al repo); entregar `.env.example`.

### 2.2 Backend
| Tecnología | Estado | Uso |
|---|---|---|
| **Node.js** (LTS) + **TypeScript** | Node [Decidido] · TS [Recomendado] | API REST |
| **Express** (o NestJS si el equipo lo prefiere) | [Recomendado] | Rutas, middlewares |
| **Prisma ORM** | [Recomendado] | Acceso a datos tipado, transacciones |
| **Zod** | [Recomendado] | Validación de DTOs de entrada |
| **JWT** (access + refresh) + **bcrypt** | [Recomendado] | CU-S01/S02, roles |
| **node-cron** (o BullMQ) | [Recomendado] | Tareas programadas: vencimiento de cotizaciones, recordatorios de cita/entrega, alertas de 7 días, respaldo |
| **Nodemailer** / Resend | [Recomendado] | Correos (RG-05) |
| Generación de PDF (pdfkit o Puppeteer) | [Recomendado] | Cotización, recibos, comprobante, orden de compra, orden de trabajo, hoja de ruta |
| **Google Maps Platform**: Places (autocompletar), Distance Matrix (transporte CU-C07), Directions (orden de ruta CU-D02) | [Decidido] | Siempre detrás de un adaptador en el backend |
| Pino / Winston | [Recomendado] | Logs estructurados |
| Swagger / OpenAPI | [Recomendado] | Documentar endpoints |

### 2.3 Frontend web
| Tecnología | Estado | Uso |
|---|---|---|
| **React** + **Vite** + **TypeScript** | React [Decidido] | SPA en español |
| React Router | [Recomendado] | Rutas por rol |
| TanStack Query | [Recomendado] | Llamadas a la API, caché, reintentos |
| React Hook Form + Zod | [Recomendado] | Formularios con la misma validación que el backend |
| Tailwind CSS (tokens de la paleta GARWEB) | [Recomendado] | Estilos consistentes con el prototipo |
| Recharts | [Recomendado] | Gráficos (A1 Panel, A8 Consumo, A11 Evaluar) |

### 2.4 Apartado móvil (tablet del taller y celular/tablet del conductor)
**Decisión: no hay app nativa.** GARWEB es una sola aplicación React instalable como **PWA (Progressive Web App)**, con interfaces específicas por rol. Motivo: un solo código para web y móvil, sin publicar en tiendas, menor costo y tiempo para un MVP, y el cliente ya es solo web.

| Necesidad | Solución | Estado |
|---|---|---|
| Instalar en tablet/celular | PWA con `vite-plugin-pwa` (manifest + service worker), "Agregar a pantalla de inicio" | [Recomendado] |
| **Funcionar sin señal** (conductor) | Service worker (Workbox) cachea la app y la hoja de ruta; los registros se guardan en **IndexedDB** (Dexie.js) en una **cola de sincronización** | [Recomendado] |
| Sincronizar al volver la señal | Reenvío de la cola con **clave de idempotencia** por operación (UUID generado en el dispositivo); el backend guarda `fecha_sincronizacion` y rechaza duplicados | [Recomendado] |
| Fotos (recojo, entrega, daño oculto, merma) | `<input type="file" accept="image/*" capture="environment">` + compresión en el cliente antes de subir | [Recomendado] |
| Firma del cliente (CU-D06) | Canvas (`react-signature-canvas`) → imagen en Storage | [Recomendado] |
| Mapa y ruta del conductor | Google Maps JavaScript API; enlace "Abrir en Google Maps" para navegar | [Recomendado] |
| Usabilidad en taller | Botones ≥ 56 px, alto contraste, un toque para ✓, sin teclear de más | [Decidido] |

Alcance del modo sin conexión (MVP): CU-D03 (leer hoja de ruta), CU-D04 (validar carga), CU-D05 (recojo), CU-D06 (entrega, cobro, firma), CU-D07 (incidencia). El tapicero trabaja con conexión del taller; si falla, mostrar aviso y reintentar.

### 2.5 Calidad y pruebas
- ESLint + Prettier + Husky (pre-commit) · Conventional Commits.
- Pruebas: **Vitest/Jest** (unitarias de servicios y reglas), **Supertest** (API), **Playwright** (flujo E2E del caso PED-0076). Prioridad: reglas de negocio y cálculos (precio sugerido, adelanto, saldo, disponible, cargo de cancelación).
- Referencias de la tesis: ISO/IEC 25010 (calidad), ISO/IEC 27001 (seguridad), IEEE 829 (pruebas), ISO 9241 (usabilidad), UML, BPMN.
- Herramientas del equipo: VS Code, StarUML, draw.io, MS Project, Figma, GitHub.

## 3. Roles y dispositivos

| Rol | Dispositivo | Qué hace |
|---|---|---|
| Cliente (persona o empresa) | Web adaptable (computadora o celular, sin app nativa) | Solicita, agenda cita, responde cotizaciones, informa pagos, sigue su pedido, confirma recojos/entregas, reclama, repite trabajos |
| Administrador (dueño/asistente; atiende él mismo las citas) | Escritorio | Cotiza, decide precios, confirma pagos, planifica, controla almacén y compras, planifica salidas, configura |
| Tapicero / costurera | Tablet del taller (PWA, botones grandes) | Ejecuta órdenes: retiros de material, avance, mermas, daño oculto |
| Conductor | Tablet/celular (PWA); **debe funcionar sin señal** y sincronizar después | Recojos, validación de carga, entregas, cobros, incidencias, cierre de salida |
| Sistema | — | Calcula, reserva, valida, notifica, genera documentos, respalda |

Fuera del sistema: proveedor (entrega con guía en papel).

## 4. Reglas generales (aplicarlas en todo el código)

- **RG-01** El sistema sugiere y la persona decide (precio, adelanto, lista de compra, agrupación de paradas son sugerencias editables).
- **RG-02** Auditoría total: todo cambio guarda usuario, fecha y hora; si cambia un valor, también valor anterior y nuevo (tabla `bitacora`). Los cambios de estado de pedido y OT van además a `historial_estado_pedido` / `historial_estado_ot`.
- **RG-03** Nada se borra: soft delete (campo `activo`) o estados finales. Versiones rechazadas, cancelaciones, pagos rechazados, incidencias y clientes se conservan.
- **RG-04** Ninguna regla de negocio es constante en el código: todo valor de negocio sale de la tabla `parametro` (con `parametro_historial`).
- **RG-05** Todo lo que se envía por correo también aparece como notificación en la plataforma (`notificacion`).
- **RG-06** Se registra lo que pasa, no lo que se supone: el stock físico baja cuando el tapicero retira material, no cuando el cliente acepta.
- **RG-07** Cada rol ve solo lo suyo (cliente: sus pedidos; tapicero: sus órdenes; conductor: su hoja de ruta).
- **RG-08** El cliente nunca ve datos internos: precio sugerido, desglose de costos, márgenes, costos de materiales.
- **RG-09** Un solo ciclo de estados del pedido, visible para todos.
- **RG-10** El negocio opera en USD.

## 5. Parámetros (tabla `parametro`)

Vigencia de cotización (1 mes) · aviso antes de vencer (3 días) · % adelanto cliente sin comprobantes (40 %) · % adelanto cliente con historial (0 %) · plazo para pagar adelanto (por confirmar) · duración del turno de cita (30 min, por confirmar) · reprogramaciones por inasistencia (1) · tarifa hora mano de obra · tarifa hora por máquina (en `maquina`) · costos fijos % · margen % · matriz de transporte por distancia · plazo respuesta V2 (5 días) · alerta pedido terminado esperando (7 días) · límite reprogramar entrega (24 h) · plazo reclamo (7 días) · mínimo fotos recepción (1) · semanas de consumo para compra sugerida (2) · día de conteo (martes).

## 6. Estados

- **Solicitud:** Nueva → En espera de cita → Atendida → Cotizada · Vencida · Descartada
- **Cita:** Programada → Atendida · No asistió · Reprogramada · Cancelada
- **Cotización:** Borrador → Pendiente de respuesta → Aceptada: pendiente de adelanto → Aceptada · Rechazada · Vencida · Reemplazada
- **Pedido:** Generado → Esperando mueble / Esperando material → Listo para producir → En producción ⇄ En pausa → Terminado → En reparto / Listo para retiro → Entregado → Cerrado · Cancelado
- **Orden de trabajo:** Emitida → En proceso ⇄ Pausada → Terminada → Cerrada
- **Pago:** Por confirmar → Confirmado · Rechazado
- **Orden de compra:** Sugerida → Generada → Recibida conforme · Recibida con diferencias
- **Parada:** Pendiente → Asignada → Confirmada → En ruta → Realizada (Fallida/Retirada vuelve a Pendiente)
- **Salida:** Planificada → En confirmación → Lista para cargar → En ruta → Cerrada
- **Reclamo:** Abierto → En atención → Resuelto · Fuera de plazo

Implementar cada ciclo como **máquina de estados** con transiciones permitidas explícitas (ver §11).

## 7. Módulos y casos de uso (49)

Regla de la tesis: **cada caso de uso pertenece a un solo módulo y a un solo objetivo específico**; no se repite entre módulos (sí puede tener varios actores). En el código, cada módulo es un módulo de backend y una sección del frontend.

### Comercial (OE1: eficiente gestión de cotizaciones) — 16
| CU | Nombre | Actor | Reglas clave |
|---|---|---|---|
| C01 | Registrar solicitud de cotización | Cliente / Admin | Fotos/videos, tipo mueble, servicio, medidas opc. Tela: no lleva · la trae (costo 0) · catálogo en línea (solo activas) · catálogo en local (exige cita). Logística: Delivery = recojo+entrega ida y vuelta, un solo costo, dirección obligatoria (Google Maps) + fecha/franja preferida; o "lo llevo yo" |
| C02 | Gestionar bandeja de solicitudes | Admin | Toda solicitud termina en Cotizada, Vencida o Descartada con motivo |
| C03 | Configurar disponibilidad de la agenda | Admin | Un turno = un cliente; bloqueos con motivo (`agenda_bloqueo`) |
| C04 | Programar/reprogramar/cancelar cita | Cliente / Admin | Solo turnos libres; citas solo para elegir tela en el local; 1 reprogramación por inasistencia, la 2.ª vence la solicitud; recordatorio |
| C05 | Registrar atención de la cita | Admin | Tela, medidas, fotos; puede cotizar en el momento |
| C06 | Gestionar plantillas de cotización | Admin | Por tipo de mueble + servicio; actividades (horas persona, máquina, horas máquina) con materiales; versionadas; incluyen insumos de proceso |
| C07 | Calcular transporte ida y vuelta | Sistema | Google Maps + matriz; sin delivery = 0; si no ubica, Admin ingresa manual (auditado) |
| C08 | Armar cotización y definir precio propuesto | Admin | Carga plantilla → "carrito" de actividades. **Sugerido** = materiales + mano de obra + maquinaria + costos fijos + margen (no editable, sin transporte). **Propuesto** editable libre, motivo opcional; se guardan ambos. Cantidades solo cambian si cambia el trabajo. Faltante no bloquea ("requiere compra"). Vigencia = min(parámetro, vigencia precio tela). Validar antes de publicar (logística, nada descontinuado, costos vigentes). Publica en plataforma + correo PDF. **V2 por daño oculto** = V1 + cobro adicional (siempre sube, mantiene transporte, única causa de cambio de precio tras aceptar). Guardar `minutos_elaboracion` |
| C09 | Revisar y responder cotización | Cliente / Admin | Cliente ve trabajos sin montos, precio, transporte, total, vigencia. Acepta/rechaza (motivo opc.) o pide renovar. Admin registra respuestas por teléfono con el medio. También responde la V2. Sin respuesta → Vencida; V2 sin respuesta en plazo → cancelación |
| C10 | Recalcular cotización vencida | Sistema / Admin | Nueva versión (`cotizacion_origen_id`); revisa materiales activos y costos; avisa si hay plantilla más nueva; nunca reutiliza precio |
| C11 | Registrar adelanto sugerido o modificado | Admin | **Todos pasan por el pago. No existe campo tipo_cliente.** Sin comprobantes (nuevo) → 40 %; con comprobantes → 0 %. Editable, se audita quién y cuándo. Sobre total con transporte. Si es 0 → genera pedido directo |
| C12 | Informar y confirmar pagos | Cliente / Admin | Métodos: transferencia, Zelle, cheque, efectivo, tarjeta. **Sin pasarela en línea.** Cliente sube foto del comprobante (JPG/PNG/PDF ≤5 MB) → Por confirmar → Admin confirma o rechaza con motivo; cliente puede re-subir. Admin registra pagos en el local. Conductor solo registra; solo Admin confirma. Saldo = total − pagos confirmados (calculado, nunca escrito) |
| C13 | Emitir recibos y comprobante final | Sistema | Recibo por pago confirmado; comprobante final al saldo 0. **Un comprobante reúne varios pagos (pago.comprobante_id, N:1)**. Tipo según persona/empresa |
| C14 | Generar pedido y congelar cotización | Sistema | Código PED-0000; congela versión aceptada; envía a Almacén (planificar/reservar) y Despacho (parada de recojo) |
| C15 | Cancelar pedido con cálculo del cargo | Cliente (solicita) / Admin (confirma) | No es automática. Sin intervención → devolución total. Con intervención → horas × tarifa + materiales usados/comprados + transporte realizado. Libera reservas, recibo de devolución. Solo antes de la entrega |
| C16 | Consultar estado y saldo del pedido | Cliente / Admin | Cliente: línea de tiempo, saldo. Admin: kanban por estado + ficha con pestañas Resumen, Pagos, Producción (solo lectura), Despacho, Actividad |

### Almacén e Inventario (OE2: control preciso y actualizado del almacén) — 10
Incluye el control de producción (el consumo real mueve el stock). Por material: **físico**, **reservado**, **disponible = físico − reservado**.
| CU | Nombre | Actor | Reglas clave |
|---|---|---|---|
| A01 | Gestionar catálogo de materiales y telas | Admin | Una sola unidad de medida por material. Solo la **tela** se compra bajo pedido; lo demás es de stock. Precio + fecha de precio alimentan el sugerido. Desactivar, no borrar |
| A02 | Reservar materiales y avisar faltantes/stock mínimo | Sistema | Reserva baja disponible, no físico. Tela bajo pedido y tela del cliente no se reservan. Faltante con fecha requerida → lista de compra. Alerta de mínimo. Avisa si la compra no llega a tiempo. Listo para producir solo con materiales completos + mueble en taller |
| A03 | Generar órdenes de compra | Admin | Lista sugerida por proveedor: (consumo prom × 2 semanas) + reservado − disponible, sin duplicados. Tela bajo pedido asignada al pedido. Compra urgente |
| A04 | Confirmar recepción de mercadería | Admin | Verificación en papel con la guía; en sistema "Recibido conforme" o corregir líneas + foto de guía. Suma stock, actualiza costo, asigna tela, libera pedidos |
| A05 | Planificar el pedido | Admin | Al generarse el pedido: responsable + fecha objetivo; emite OT desde la cotización congelada (OT = desglose de la cotización) |
| A06 | Registrar retiro de materiales | Tapicero | Por partes; baja físico al instante y libera reserva; nombre y hora; solo materiales de sus órdenes; exceso = consumo adicional → aviso al Admin; devoluciones; insumos de proceso se descuentan al cierre |
| A07 | Registrar avance, mermas y daño oculto | Tapicero | Iniciar/pausar (motivo)/reanudar; ✓ actividades + horas reales; merma útil → retazo costo 0; merma no útil → pérdida con causa; consumo adicional e insumos de proceso NO son merma; avisa tela dañada (Admin compra urgente); daño oculto con foto → pausa + V2; terminar y devolver sobrante |
| A08 | Cerrar y evaluar la orden | Admin / Sistema | Lista final de piezas (= lista de empaque); descuenta insumos de proceso; cotizado vs ejecutado (separar diferencia por cantidad y por precio) y margen real vs esperado; diferencia repetida → "revisar plantilla"; merma repetida → "alerta de calidad"; pedido → Terminado |
| A09 | Consultar stock, alertas, movimientos y consumo | Admin | Consumo real = retirado − devuelto − retazos |
| A10 | Registrar conteo semanal y ajustes | Admin | Martes; conteo a ciegas (sin cantidad esperada); ajuste con motivo obligatorio; luego lista de compra |

### Historial de Clientes (OE3) — 8
El historial **se arma solo** con lo registrado en los otros módulos.
| CU | Nombre | Actor | Reglas clave |
|---|---|---|---|
| H01 | Registrar cliente | Cliente / Admin | Persona o empresa; sin duplicados (documento o correo); crea `usuario` rol Cliente; no se guarda nuevo/recurrente |
| H02 | Actualizar o desactivar cliente | Cliente / Admin | Varias direcciones (una principal); expediente del cliente; desactivar, nunca borrar |
| H03 | Adjuntar evidencias y archivar pedido | Admin | Foto mueble terminado + foto orden firmada; sin ellas no se archiva |
| H04 | Buscar trabajos | Admin | Una sola barra (cliente, teléfono, mueble, tela + fecha), miniaturas, **< 15 s** (usar índices / búsqueda de texto de PostgreSQL) |
| H05 | Ver ficha y repetir trabajo | Admin / Cliente | Antes/después, tela, especificaciones, versiones; "Repetir trabajo" = nueva solicitud precargada con precios de hoy |
| H06 | Consultar mis pedidos anteriores | Cliente | Nunca costos ni márgenes; comprobantes descargables |
| H07 | Digitalizar órdenes antiguas | Admin | Una vez; prioridad: 45 recurrentes, últimos 2 años, resto |
| H08 | Respaldar y recuperar | Sistema / Admin | Respaldo diario en la nube; recuperación con confirmación |

### Despacho (OE4) — 8
Parada = una visita (recojo, entrega, recojo/entrega por reclamo). Salida = recorrido del camión con varias paradas.
| CU | Nombre | Actor | Reglas clave |
|---|---|---|---|
| D01 | Consultar pendientes de reparto | Admin | Sin días fijos; entrega estimada 1–2 semanas; alerta > 7 días de espera |
| D02 | Planificar salida grupal y confirmar | Admin / Cliente / Sistema | Mezcla recojos y entregas; ruta con Google Maps y franja por parada; aviso correo+notificación; cliente Confirma o "No estaré" (hasta 24 h antes); sin respuesta se mantiene; recordatorio día anterior |
| D03 | Generar lista de empaque y hoja de ruta | Sistema | Por parada: tipo, dirección, contacto, franja, piezas, estado de pago (Pagado / Cobrar $X / A cuenta); mapa; disponible sin conexión |
| D04 | Validar carga pieza por pieza | Conductor | **Si falta una pieza, se bloquea**; si no aparece, esa entrega se retira a pendientes y las demás salen. **No hay entregas parciales.** Medir segundos por pieza (< 15 s). Funciona sin conexión |
| D05 | Registrar recepción del mueble | Conductor (recojo) / Admin (taller) | N.º de piezas + mínimo 1 foto (no se borran; van al historial como "antes"); pedido → listo para producir o esperando material |
| D06 | Registrar entrega, cobro y conformidad | Conductor / Admin (retiro en taller) / Cliente | Revisión pieza por pieza, foto, cobro (queda Por confirmar), firma; cliente sin delivery agenda turno de retiro; saldo 0 → comprobante final y Cerrado |
| D07 | Registrar incidencias y reclamos con reposición | Conductor / Cliente / Admin | Cliente ausente → parada a pendientes; pieza dañada/faltante cuenta para indicador; reclamo hasta 7 días; reposición prioritaria valorizada en dinero (OT de reposición + parada por reclamo) |
| D08 | Cerrar la salida de reparto | Conductor / Admin | Resumen de paradas, fallidas, incidencias, cobros; declarar efectivo; se cuadra al confirmar pagos en C12 |

### Seguridad y Administración (transversal) — 7
S01 Iniciar y cerrar sesión (contraseña con bcrypt, usuarios inactivos no entran, bloqueo tras intentos fallidos) · S02 Recuperar contraseña (enlace por correo con caducidad) · S03 Gestionar usuarios (desactivar, no borrar) · S04 Asignar roles y permisos (Administrador, Tapicero, Conductor, Cliente) · S05 Configurar parámetros (con historial; aplica solo hacia adelante) · S06 Consultar auditoría (`bitacora` filtrable) · S07 Consultar panel de indicadores (calculados, nadie los digita).

Pantallas de apoyo (no son CU): W1 Inicio (servicios, trabajos, telas, FAQ) y W11 Notificaciones.

## 8. Pantallas del prototipo

- Cliente (W): W1 Inicio · W2 Solicitud (asistente 4 pasos) · W3 Cita · W4 Cotización · W5 Pagos · W6a Mis pedidos En curso · W6b Anteriores · W7 Entrega · W8 Daño oculto · W9 Reclamos · W10 Perfil · W11 Notificaciones
- Común: G1 Acceso
- Administrador (A): A1 Panel · A2 Agenda · A3 Solicitudes · A4 Cotizar · A5 Pagos · A6 Pedidos (kanban) · A6b Ficha del pedido · A7 Planificar · A8 Inventario · A9 Conteo · A10 Compras · A11 Evaluar · A12 Historial · A13 Salida · A14 Parámetros · A15 Catálogo · A16 Plantillas · A17 Clientes · A18 Taller · A19 Reclamos · A20 Usuarios
- Tapicero (T, PWA tablet): T1 Mis órdenes · T2 Orden de trabajo · T3 Terminar
- Conductor (D, PWA sin conexión): D1 Hoja de ruta · D1b Mapa · D2 Carga · D2b Bloqueo · D3 Recojo · D4 Entrega · D5 Cierre

Diseño: paleta azul (primario #2563EB, navy #0A1630, acento #38BDF8, fondo #EFF6FF), Plus Jakarta Sans + Inter, iconos Lucide, chips de estado con texto e icono, áreas táctiles ≥ 56 px en tablet, contraste AA.

## 9. Modelo de datos core (PostgreSQL en Supabase, 51 tablas)

Convenciones: tablas y columnas en **snake_case** y en español (como en el diagrama); PK `id`; FK `<tabla>_id`; auditoría con `*_por` (FK a usuario) y `fecha_*` (`timestamptz`); montos `numeric(10,2)`; estados como enum o `varchar` con `CHECK`.

**Seguridad/config:** usuario(id, cliente_id, rol_id, nombre_usuario, contrasena_hash, dispositivo, activo, fecha_creacion) · rol(id, nombre, permisos) · bitacora(id, usuario_id, modulo, accion, entidad, entidad_id, valor_anterior, valor_nuevo, fecha) · parametro(id, clave, valor, unidad, descripcion, modificado_por) · parametro_historial(id, parametro_id, valor_anterior, valor_nuevo, usuario_id, fecha) · notificacion(id, usuario_id, pedido_id, tipo, mensaje, leida, fecha)

**Comercial:** cliente(id, tipo_persona, nombres, apellidos, razon_social, documento, email, telefono, canal_registro, fecha_registro) · direccion(id, cliente_id, direccion, ciudad, latitud, longitud, es_principal) · solicitud(id, cliente_id, tipo_mueble_id, direccion_id, canal, tipo_servicio, descripcion, medidas, requiere_tela, logistica, fecha_pref_recojo, estado, fecha_solicitud) · solicitud_adjunto(id, solicitud_id, tipo, url, fecha_subida) · cita(id, solicitud_id, pedido_id, tipo, fecha_hora, duracion_min, reprogramaciones, estado, observaciones, registrado_por) · agenda_bloqueo(id, fecha, hora_inicio, hora_fin, motivo, creado_por) · cotizacion(id, solicitud_id, cotizacion_origen_id, plantilla_id, version, es_ajuste_danio, viable_v1, plazo_respuesta, descargo_aceptado, fecha_descargo, distancia_km, costo_transporte, sugerido_materiales, sugerido_mano_obra, sugerido_maquinaria, sugerido_costos_fijos, sugerido_margen, precio_sugerido, precio_propuesto, motivo_cambio, propuesto_por, total, estado, fecha_emision, fecha_vencimiento, medio_respuesta, fecha_respuesta, respuesta_registrada_por, motivo_perdida, minutos_elaboracion) · cotizacion_actividad(id, cotizacion_id, maquina_id, nombre, horas_persona, horas_maquina, es_adicional_v2, orden) · cotizacion_material(id, cotizacion_actividad_id, material_id, origen, cantidad, costo_unitario) · cotizacion_adjunto(id, cotizacion_id, url, descripcion, fecha_subida) · pedido(id, codigo, cliente_id, cotizacion_id, origen, monto_total, adelanto_sugerido_pct, adelanto_acordado, adelanto_modificado_por, fecha_modificacion, estado, fecha_confirmacion, fecha_entrega_prometida, fecha_entrega_real, motivo_cancelacion, monto_retenido_cancelacion) · historial_estado_pedido(id, pedido_id, estado_anterior, estado_nuevo, usuario_id, fecha) · pago(id, pedido_id, comprobante_id, parada_id, tipo, metodo, monto, fecha_pago, referencia_operacion, estado, registrado_por, confirmado_por, fecha_confirmacion, fecha_sincronizacion) · pago_adjunto(id, pago_id, url, fecha_subida) · comprobante(id, pedido_id, tipo, serie_numero, monto, fecha_emision, pdf_url)

**Almacén:** material(id, proveedor_id, codigo, nombre, categoria, origen, unidad_medida, color, stock_fisico, stock_reservado, stock_minimo, costo_unitario, precio_fecha, lead_time_dias, es_retazo, activo) · proveedor(id, razon_social, tipo, contacto, telefono, email, es_referencia, activo) · tipo_mueble(id, nombre, tarifa_base, mano_obra_base, activo) · maquina(id, nombre, tarifa_hora, activo) · plantilla(id, tipo_mueble_id, tipo_servicio, version, activa_desde, creada_por) · plantilla_actividad(id, plantilla_id, maquina_id, nombre, horas_persona, horas_maquina, orden) · plantilla_material(id, plantilla_actividad_id, material_id, cantidad) · movimiento_inventario(id, material_id, orden_trabajo_id, orden_compra_id, conteo_id, usuario_id, tipo, cantidad, stock_fisico_resultante, stock_disponible_resultante, motivo, fecha) · alerta_stock(id, material_id, movimiento_id, stock_disponible, stock_minimo, estado, fecha_generada, fecha_atendida) · orden_compra(id, proveedor_id, codigo, estado, total, generada_por, fecha_generacion, recibido_por, fecha_recepcion) · orden_compra_detalle(id, orden_compra_id, material_id, pedido_id, cantidad, cantidad_recibida, costo_unitario) · guia_remision(id, orden_compra_id, numero, foto_url, fecha_recepcion, firmada) · conteo(id, usuario_id, fecha, estado) · conteo_detalle(id, conteo_id, material_id, cantidad_contada, cantidad_sistema, diferencia)

**Producción:** orden_trabajo(id, pedido_id, reclamo_id, responsable_id, codigo, tipo, fecha_objetivo, especificaciones, danio_oculto_detectado, estado, fecha_emision, fecha_inicio, motivo_pausa, fecha_pausa, costo_cotizado, costo_ejecutado, margen_esperado, margen_real, cerrada_por, fecha_cierre) · ot_actividad(id, orden_trabajo_id, cotizacion_actividad_id, horas_plan, horas_reales, hecho, marcado_por, fecha_marcado) · consumo_ot(id, orden_trabajo_id, material_id, cantidad_planificada, cantidad_retirada, consumo_adicional, sobrante_devuelto, merma_util, merma_no_util, causa_merma, estado_reserva) · ot_adjunto(id, orden_trabajo_id, tipo, url, descripcion, fecha_subida) · historial_estado_ot(id, orden_trabajo_id, usuario_id, estado_anterior, estado_nuevo, fecha_cambio, comentario)

**Historial/postventa:** reclamo(id, pedido_id, responsable_id, codigo, canal, descripcion, fecha, dentro_plazo, estado, prioridad, costo_valorizado, registrado_por) · reclamo_adjunto(id, reclamo_id, url, fecha_subida) · folder_digitalizado(id, cliente_id, pedido_id, codigo, anio, archivo_url, digitalizado_por)

**Despacho:** salida(id, conductor_id, codigo, fecha, vehiculo, estado, distancia_total_km, tiempo_estimado_min, creada_por, fecha_cierre) · parada(id, salida_id, pedido_id, reclamo_id, direccion_id, tipo, orden, franja_inicio, franja_fin, confirmacion_cliente, estado, motivo_retiro, piezas_registradas, monto_a_cobrar, firma_url, nombre_recibe, fecha_realizada, fecha_sincronizacion) · parada_foto(id, parada_id, angulo, url, fecha) · lista_empaque(id, pedido_id, fecha_generacion, total_items, generado_por) · item_empaque(id, lista_empaque_id, codigo_pieza, descripcion, tipo_item, cantidad) · validacion_carga(id, salida_id, usuario_id, intento, fecha_hora_inicio, fecha_hora_fin, resultado) · validacion_detalle(id, validacion_id, item_empaque_id, presente, fecha_hora_check, segundos_registro) · incidencia(id, parada_id, tipo, descripcion, foto_url, requiere_segundo_viaje, costo_adicional, fecha)

**Relaciones clave:** usuario→cliente (1:1) · pedido→cotizacion (1:1) · pago→comprobante (N:1, nullable) · pago→parada (nullable) · cotizacion→cotizacion (origen) · cotizacion_material→cotizacion_actividad · ot_actividad→cotizacion_actividad · orden_trabajo→pedido y →reclamo (reposición) · lista_empaque→pedido (1:1) · alerta_stock→movimiento_inventario (1:1) · movimiento_inventario→material/orden_trabajo/orden_compra/conteo · parada→salida/pedido/reclamo/direccion · validacion_carga→salida · validacion_detalle→item_empaque.

Cálculos derivados (no guardar a mano): saldo del pedido = monto_total − Σ pagos confirmados; cliente nuevo = sin comprobantes; disponible = stock_fisico − stock_reservado; consumo real = retirado − devuelto − merma útil.

Para soportar sincronización sin conexión, las tablas que escribe el conductor (`parada`, `parada_foto`, `pago`, `validacion_detalle`, `incidencia`) deben aceptar un identificador de operación del dispositivo (p. ej. `id_cliente_uuid` único) para idempotencia; agregarlo en la migración correspondiente.

## 10. Integración entre módulos

C01 → Despacho (dirección/fecha recojo) · C14 → A05/A02 (planificar, OT, reservar) y D05 (parada recojo) · D05 → Almacén (mueble en taller) e Historial (fotos "antes") · A07 daño oculto → C08 (V2) · A08 cierre → Comercial (cotizado vs ejecutado), Despacho (Terminado, lista de empaque, aviso) · D06 → C12/C13 · D07 → OT de reposición + parada por reclamo · H05 → C01 · todo → Historial, bitácora e indicadores.

Implementar estas integraciones con **eventos de dominio** (ver §11), no llamando directamente a servicios de otro módulo.

## 11. Arquitectura de software, buenas prácticas y patrones

### 11.1 Arquitectura
- **Cliente-servidor en 3 capas**: PWA React → API REST Node.js → PostgreSQL (Supabase) + Storage.
- **Backend como monolito modular** (adecuado para un MVP de 2 desarrolladores): un módulo por área de negocio, alineado con los módulos de la tesis: `comercial`, `almacen`, `historial`, `despacho`, `seguridad` (+ `shared`).
- Dentro de cada módulo, **arquitectura por capas con dependencias hacia adentro** (inspirada en Clean Architecture):
  - `routes` → `controllers` (HTTP, sin lógica de negocio) → `services` / casos de uso (reglas de negocio) → `repositories` (acceso a datos) → BD.
  - `domain`: entidades, value objects, enums de estados, reglas puras (sin Express ni Prisma).
  - Servicios externos (Google Maps, correo, Storage, PDF) detrás de **interfaces + adaptadores**.
- Un **caso de uso de la tesis = un servicio/método de aplicación** identificable (ej. `RegistrarAdelantoService` para CU-C11). Nombrar archivos y endpoints de forma que se pueda trazar CU → código (anotar el código del CU en un comentario o en el nombre del test).
- Backend y frontend en **repositorios o carpetas separadas**, cada uno con su `Dockerfile`; `docker-compose.yml` en la raíz para levantar todo.

Estructura sugerida del backend:
```
garweb-api/
  src/
    modules/
      comercial/   (cotizacion, solicitud, cita, pago, pedido)
        domain/  application/  infrastructure/  http/
      almacen/     (material, reserva, orden_trabajo, compra, conteo)
      historial/   (cliente, expediente, busqueda, respaldo)
      despacho/    (salida, parada, validacion, reclamo)
      seguridad/   (auth, usuario, rol, parametro, bitacora, panel)
    shared/
      domain/ (errores, value objects: Dinero, Cantidad)
      infrastructure/ (prisma, mail, maps, storage, pdf, eventos, logger)
      http/ (middlewares: auth, rol, auditoria, errores, validacion)
    config/  main.ts
  prisma/ (schema.prisma, migrations/, seed.ts)
  tests/  Dockerfile  .env.example
```
Estructura sugerida del frontend:
```
garweb-web/
  src/
    app/ (router, providers, layout por rol)
    features/ (comercial, almacen, historial, despacho, seguridad)  ← pantallas por CU
    shared/ (ui: botones, chips de estado, tablas; api client; hooks; utils)
    offline/ (dexie db, cola de sincronización, service worker)
  public/manifest.webmanifest  Dockerfile
```
Si el equipo usa como referencia la estructura de otro proyecto propio (p. ej. SWEFIRE), adaptarse a ella manteniendo estos principios.

### 11.2 Patrones de diseño a aplicar
| Patrón | Dónde en GARWEB |
|---|---|
| **Repository** | Acceso a datos por agregado (`PedidoRepository`, `MaterialRepository`); los servicios no usan Prisma directamente |
| **Service Layer / Use Case** | Un servicio por caso de uso con las reglas de negocio |
| **DTO + validación (Zod)** | Entrada/salida de la API; DTOs distintos por rol (el DTO del cliente **no** contiene sugerido, costos ni márgenes → RG-08) |
| **State** (máquina de estados) | Ciclos de pedido, cotización, OT, pago, parada, salida: transiciones permitidas en un solo lugar; transición inválida = error |
| **Strategy** | Cálculo del precio sugerido, del transporte (matriz por distancia), del adelanto sugerido (sin comprobantes / con historial), del cargo de cancelación |
| **Observer / Eventos de dominio** | `PedidoGenerado` → Almacén (planificar, reservar) y Despacho (parada recojo); `OrdenCerrada` → Despacho y Comercial; `DanioOcultoReportado` → Comercial (V2); `PagoConfirmado` → recibo/comprobante; cualquier evento → notificación + bitácora |
| **Adapter** | Google Maps, correo, Supabase Storage, generador de PDF (intercambiables y simulables en pruebas) |
| **Factory / Builder** | Crear la cotización desde una plantilla; crear la OT desde la cotización congelada; crear V2 desde V1 |
| **Unit of Work / transacciones** | Operaciones que tocan varias tablas (generar pedido + reservar; retiro de material + movimiento + alerta; confirmar pago + comprobante) en una sola transacción |
| **Middleware (Chain of Responsibility)** | Autenticación → autorización por rol → validación → auditoría → manejo de errores |
| **Outbox / cola offline** | Cola de sincronización del conductor con idempotencia |

### 11.3 Principios y Clean Code
- **SOLID**, **DRY**, **KISS**, **YAGNI** (es un MVP: no sobre-diseñar).
- Funciones cortas con un solo propósito; nombres descriptivos del dominio en español, iguales a los de la tesis y la BD (`pedido`, `cotizacion`, `precioSugerido`, `stockDisponible`); identificadores técnicos en inglés solo si es convención (`controller`, `repository`). camelCase en código, PascalCase en clases/componentes, snake_case en BD.
- Sin números mágicos: valores de negocio desde `parametro` (RG-04); constantes técnicas en `config`.
- Manejo de errores centralizado con errores de dominio tipados (`ReglaNegocioError`, `NoAutorizadoError`, `TransicionInvalidaError`) y mensajes claros en español para el usuario.
- Dinero con `numeric` en BD y aritmética decimal segura en código (no `float`).
- Fechas en UTC en BD (`timestamptz`), mostradas en la zona del negocio (America/New_York).
- Comentarios solo para explicar el **porqué** (referenciar la regla: `// RN-C32: sin comprobantes → 40 %`).
- Componentes React pequeños y reutilizables; lógica en hooks; sin llamadas a la API dentro de componentes de presentación.
- Code review entre los dos integrantes antes de fusionar a `main`; ramas `feature/CU-C11-adelanto`.

### 11.4 Seguridad (ISO/IEC 27001, OWASP)
- Autorización **en el backend** por rol y por pertenencia (un cliente solo accede a sus pedidos; un tapicero solo a sus OT; un conductor solo a su salida).
- Contraseñas con bcrypt; JWT de corta duración + refresh; HTTPS; CORS restringido; rate limiting en login.
- Validar y sanear toda entrada; consultas parametrizadas (ORM); límites de tamaño y tipo de archivo.
- URLs firmadas y temporales para archivos privados (comprobantes, firmas, fotos).
- Secretos solo en variables de entorno; nunca en el repo ni en el frontend.

### 11.5 Pruebas y definición de "terminado"
Un CU está terminado cuando: cumple sus reglas (§7), tiene pruebas unitarias de sus reglas y una prueba de API, registra auditoría, respeta la visibilidad por rol, está documentado en OpenAPI y funciona en Docker.

## 12. Indicadores (valor inicial → meta, tiempo)

- Tiempo cotización pedido grande: 30–60 min → < 15 min (6 meses) · mueble simple: 10–15 min → < 5 min (6 meses)
- Cotizaciones concretadas: 200 de 250/mes → 230/mes (12 meses)
- Actualización de inventario: 7 días → inmediata · quiebres de stock: 2/mes → 0 · espera por material: 1–2 días → 0 · compras con datos: 0 % → 100 % (6 meses)
- Búsqueda de antecedente: 5–30 min → < 15 s · órdenes archivadas con fotos: 0 % → 100 % (6 meses) · clientes recurrentes: 45 → 56/año (12 meses)
- Entregas incompletas: 4/mes → 0 · costo segundos viajes: S/ 776/mes → S/ 0 (6 meses; S/ 194 por viaje)

El sistema debe guardar los datos que permiten medirlos (ej. `minutos_elaboracion`, `segundos_registro`, incidencias valorizadas) y mostrarlos en A1 Panel (CU-S07).

## 13. Reglas para redactar la tesis

- Indicadores siempre con valor inicial (dato real del dueño), meta y tiempo de medición.
- Problemas y antecedentes cuantificados en números y, si se puede, en dinero (análisis económico en soles, tipo de cambio S/ 3.36 por USD).
- RUP hasta Elaboración, nivel MVP.
- Un caso de uso = un solo objetivo/módulo.
- APA 7.ª edición; Times New Roman 12, doble espacio, márgenes 2.54 cm.
- Lenguaje claro, no técnico (el asesor no es programador). Evitar frases que suenen generadas por IA.
- Diagramas con aspecto profesional hecho a mano (draw.io, estilo PK/FK con pata de gallo).
- No inventar cifras ni fuentes; verificar que existan.
- Al describir el stack en la tesis, justificar cada tecnología en lenguaje simple (ej. "Docker permite que el sistema funcione igual en cualquier computadora"; "la PWA se instala en la tablet sin pasar por una tienda de aplicaciones y funciona sin señal").

## 14. Cómo trabajar con este contexto al programar

1. Antes de escribir código de un CU, ubica su módulo, actores, reglas y tablas en este documento.
2. Diseña primero el caso de uso (entrada → reglas → salida → tablas afectadas → eventos que emite) y luego codifica capa por capa.
3. Nunca codifiques valores de negocio fijos: léelos de `parametro`.
4. Toda escritura registra auditoría (`bitacora`) y, si cambia estado, el historial de estados, usando la máquina de estados.
5. No implementes borrado físico de datos de negocio.
6. Respeta la visibilidad por rol en el backend, en especial RG-08 (DTO por rol).
7. Calcula los derivados (saldo, disponible, cliente nuevo) en consultas, no como campos editables.
8. Para el conductor, guarda en IndexedDB y sincroniza con idempotencia.
9. Usa transacciones en operaciones multi-tabla y eventos de dominio entre módulos.
10. Escribe pruebas de las reglas de negocio junto con el código; ejecuta lint y tests antes de cada commit.
11. Todo cambio de esquema va en una migración versionada; nunca modificar la BD de Supabase a mano.
12. Si una regla no está definida aquí (ver pendientes), pregunta antes de asumir.

## 15. Pendientes por confirmar con el dueño (vía Alejandro)

Duración real del turno de cita · plazo para pagar el adelanto · cobro de tela comprada al cancelar · plazo de pago para clientes con historial · tela por unidad completa o por lo usado · unidades de medida e insumos de proceso · 5–6 tipos de mueble más frecuentes y sus piezas · año desde el que digitalizar folders · capacidad del camión · descuento si pagó delivery y retira en taller · si se permite solo entrega sin recojo · tipo de comprobante (persona/empresa).

Pendientes técnicos por confirmar con el equipo: Express o NestJS · Prisma o Knex · hosting del backend · proveedor de correo.