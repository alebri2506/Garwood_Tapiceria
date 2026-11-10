# Prototipo de GARWEB (referencia)

Estas son las pantallas **aprobadas** del prototipo. Son la referencia de diseño, textos y comportamiento para programar el frontend.
Prototipo navegable: https://garweb-garwood.netlify.app/

## Cómo leer un archivo `.dc.html`
- **Arriba:** el HTML de la pantalla (los textos y la estructura).
- **Variables:** `{{nombre}}` es un valor que calcula la lógica.
- **Bloques:** `<sc-if>` se muestra solo si se cumple una condición; `<sc-for>` repite un bloque por cada elemento de una lista.
- **Abajo:** un `<script>` con `class Component` que contiene los datos de ejemplo, los estados y las reglas de la pantalla. Úsalo para entender el **comportamiento**, no para copiarlo tal cual.
- **Estilos:** `screens.css` tiene los estilos comunes. Los componentes `Garweb.*` (Alert, StatusChip, TextField…) son del sistema de diseño: azul primario #2563EB, navy #0A1630, fuentes Plus Jakarta Sans e Inter, iconos Lucide.

## Pantallas

| Rol | Archivo | Qué es |
|---|---|---|
| Mapa de flujos | `Main.dc.html` | Mapa de flujos — PED-0076 |
| Común (acceso) | `G1-Acceso.dc.html` | G1 Acceso — todos los roles (Seguridad) |
| Cliente (web adaptable) | `W1-Inicio.dc.html` | W1 Inicio (web) |
| Cliente (web adaptable) | `W2-Solicitud.dc.html` | W2 Solicitar cotización · Comercial |
| Cliente (web adaptable) | `W3-Cita.dc.html` | W3 Agendar cita · Comercial |
| Cliente (web adaptable) | `W3b-Visita.dc.html` | W3b Agendar visita a domicilio · Comercial |
| Cliente (web adaptable) | `W4-Cotizacion.dc.html` | W4 Mi cotización · Comercial |
| Cliente (web adaptable) | `W5-Pagos.dc.html` | W5 Mis pagos · Comercial |
| Cliente (web adaptable) | `W6c-Solicitudes.dc.html` | W6c Mis pedidos: solicitudes y cotizaciones · Comercial |
| Cliente (web adaptable) | `W6a-EnCurso.dc.html` | W6a Mis pedidos: en curso · Comercial |
| Cliente (web adaptable) | `W6b-Anteriores.dc.html` | W6b Mis pedidos: anteriores · Historial |
| Cliente (web adaptable) | `W7-Entrega.dc.html` | W7 Aviso de entrega / Agendar retiro · Despacho |
| Cliente (web adaptable) | `W8-DanoOculto.dc.html` | W8 Daño oculto (V2) · Comercial |
| Cliente (web adaptable) | `W9-Reclamos.dc.html` | W9 Reclamos y su estado · Despacho |
| Cliente (web adaptable) | `W10-Perfil.dc.html` | W10 Mi perfil · Historial |
| Cliente (web adaptable) | `W11-Notificaciones.dc.html` | W11 Notificaciones (transversal) |
| Producción (celular) | `T1-Ordenes.dc.html` | T1 Órdenes del taller · Inventario |
| Producción (celular) | `T2-Orden.dc.html` | T2 Orden de trabajo · Inventario |
| Producción (celular) | `T3-Terminar.dc.html` | T3 Terminar y devolver sobrante · Inventario |
| Conductor (celular · PWA) | `D1-Ruta.dc.html` | D1 Hoja de ruta |
| Conductor (celular · PWA) | `D1b-Mapa.dc.html` | D1b Mapa de la ruta |
| Conductor (celular · PWA) | `D2-Carga.dc.html` | D2 Validar carga |
| Conductor (celular · PWA) | `D2b-Bloqueo.dc.html` | D2b Pedido bloqueado |
| Conductor (celular · PWA) | `D3-Recojo.dc.html` | D3 Recojo / recojo por reclamo |
| Conductor (celular · PWA) | `D4-Entrega.dc.html` | D4 Entrega / entrega por reclamo |
| Conductor (celular · PWA) | `D5-Cierre.dc.html` | D5 Cierre de salida |
| Administrador (escritorio) | `A1-Panel.dc.html` | A1 Panel principal |
| Administrador (escritorio) | `A21-Estadisticas.dc.html` | A21 Estadísticas del mes |
| Administrador (escritorio) | `A2-Agenda.dc.html` | A2 Agenda de citas · semana y día |
| Administrador (escritorio) | `A2b-AtenderCita.dc.html` | A2b Atender cita en el local · telas, medidas, cotización y respuesta |
| Administrador (escritorio) | `A2c-AgendarCita.dc.html` | A2c Agendar cita (solicitud en espera) · desde Solicitudes |
| Administrador (escritorio) | `A2d-AgendarNueva.dc.html` | A2d Agendar cita (solicitud nueva) · desde Solicitudes |
| Administrador (escritorio) | `A2e-AgendarVisita.dc.html` | A2e Agendar visita a domicilio · desde Solicitudes |
| Administrador (escritorio) | `A2f-NoAsistio.dc.html` | A2f Cliente no asistió · desde la Agenda |
| Administrador (escritorio) | `A2g-Reprogramar.dc.html` | A2g Reprogramar cita (administrador) · desde la Agenda |
| Administrador (escritorio) | `A3-Solicitudes.dc.html` | A3 Solicitudes + nueva solicitud |
| Administrador (escritorio) | `A4-Cotizaciones.dc.html` | A4 Cotizaciones · bandeja y por armar |
| Administrador (escritorio) | `A4-Cotizar.dc.html` | A4 Cotización (cambia según su estado) |
| Administrador (escritorio) | `A5-Pagos.dc.html` | A5 Pagos + registrar pago en el local |
| Administrador (escritorio) | `A6-Pedidos.dc.html` | A6 Pedidos · planning y lista |
| Administrador (escritorio) | `A6b-FichaPedido.dc.html` | A6b Ficha del pedido |
| Administrador (escritorio) | `A16-Plantillas.dc.html` | A16 Plantillas · lista, detalle y borrador |
| Administrador (escritorio) | `A16b-NuevaPlantilla.dc.html` | A16b Nueva plantilla · definir, ajustar, activar |
| Administrador (escritorio) | `A7-Planificar.dc.html` | A7 Planificar pedido |
| Administrador (escritorio) | `A8-Inventario.dc.html` | A8 Inventario + qué pedir |
| Administrador (escritorio) | `A9-Conteo.dc.html` | A9 Conteo del martes |
| Administrador (escritorio) | `A11-Evaluar.dc.html` | A11 Cerrar y evaluar orden |
| Administrador (escritorio) | `A15-Catalogo.dc.html` | A15 Catálogo de materiales y telas |
| Administrador (escritorio) | `A12-Historial.dc.html` | A12 Historial · búsqueda con filtros + digitalizar folders |
| Administrador (escritorio) | `A17-Clientes.dc.html` | A17 Clientes y expediente |
| Administrador (escritorio) | `A13-Salida.dc.html` | A13 Planificar salidas grupales |
| Administrador (escritorio) | `A18-Taller.dc.html` | A18 Taller: recepciones y retiros |
| Administrador (escritorio) | `A19-Reclamos.dc.html` | A19 Reclamos e incidencias |
| Administrador (escritorio) | `A14-Parametros.dc.html` | A14 Parámetros + respaldo |
| Administrador (escritorio) | `A20-Usuarios.dc.html` | A20 Usuarios, roles y auditoría |
