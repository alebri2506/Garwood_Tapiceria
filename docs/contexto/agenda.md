# Agenda de citas (administrador) — lógica aprobada

Casos de uso: **C03** Configurar disponibilidad · **C04** Programar, reprogramar o cancelar cita · **C05** Registrar atención. Objetivo 1.2 *Controlar las citas*.

## 1. Idea central
**Una cita siempre nace de una solicitud.** No existen citas sueltas. La Agenda **muestra** y **gestiona** las citas. Solo se elige un turno cuando se llega desde una solicitud.

## 2. Qué muestra
- **Calendario:**
  - vista Semana o Día;
  - lunes a sábado;
  - turnos de **30 min** (parámetro): mañana 9:30–12:00 y tarde 15:00–17:00;
  - franja fija "12:00–15:00 almuerzo".
- **Tipos de cuadro:**

  | Cuadro | Color / estilo |
  |---|---|
  | Cita en el local | Azul |
  | Visita a domicilio | Morado, **2 turnos = 1 h** |
  | Retiro en taller | Ámbar |
  | Atendida | Verde |
  | No asistió / No lo encontramos | Rojo |
  | Bloqueado | Gris rayado con candado |
  | Libre | Vacío |

- **Filtros:** Todas · Visitas al local · Retiros.
- **No muestra** recojos ni entregas a domicilio: los hace el conductor y están en **Salidas (A13)**.
- **Panel derecho:** el detalle de lo que se toque.

## 3. Modos
| Modo | Cómo se entra | Qué permite |
|---|---|---|
| **Ver** (normal) | Menú → Agenda | Tocar una cita para ver su detalle → **Atender** (A2b), **Reprogramar**, **No asistió / No lo encontramos**. Los turnos libres **no** responden. **No** hay botón "+ Nueva cita". |
| **Agendar** | Solo desde una solicitud: (a) Solicitudes → ficha "En espera de cita" → «Agendar cita»; (b) Nueva solicitud → «Registrar y elegir turno» | Franja azul arriba ("Agendando cita para…"). Panel con el **detalle de la solicitud vinculada**: cliente, teléfono, correo, mueble, servicio, tela, lo que busca, fotos, medio de contacto y dirección si es visita. Los turnos libres muestran «Elegir». **No** se puede elegir otro cliente. Botón **Confirmar cita**. Visita: solo turnos con 1 h libre seguida. Si la solicitud ya existía hay «Cancelar y volver a Solicitudes»; si es nueva, no hay botón para salir. |
| **Reprogramar** | Cita → «Reprogramar», o tras una inasistencia → «Reprogramar con el cliente» / «Ofrecer último turno» | Igual que agendar, mostrando el **turno actual**. Al confirmar, el turno anterior se libera (si venía de una inasistencia, se queda en rojo como historial) y suma 1 reprogramación. |
| **Bloquear** | Configurar agenda → «+ Bloquear horario» | Franja gris. El administrador toca **varios** turnos libres (en distintos días) → «Bloquear N bloques». **Sin motivo.** No se pueden bloquear turnos con cita (primero se reprograma). El cliente deja de verlos. |

**Quitar bloqueo:**
- tocar un bloque gris → panel "Horario bloqueado" → «Quitar bloqueo» (si el bloqueo abarca varios turnos, quita todos); o
- Configurar agenda → lista de bloqueos → «Quitar».

El turno queda libre al instante.

## 4. Estados y reglas
```
Programada ──Atender──► Atendida → cotización (o «Guardar y terminar en el taller» → Cotizaciones › Por armar)
    ├─ No asistió / No lo encontramos (1.ª vez) → «Reprogramar con el cliente», o el cliente reprograma desde su cuenta
    ├─ No asistió (2.ª vez) → «Dar por vencida» (regla) u «Ofrecer último turno» (excepción)
    ├─ Reprogramar → Programada en el nuevo turno (máximo 1 reprogramación)
    └─ El cliente cancela en la web (hasta el día anterior) → Cancelada
```
- Un turno = un cliente.
- La visita ocupa 2 turnos seguidos.
- Al confirmar, reprogramar o marcar una inasistencia, se avisa al cliente (correo y su cuenta).
- Todo queda en la bitácora: quién bloqueó, desbloqueó, agendó o reprogramó, y cuándo.

## 5. Pantallas del prototipo (docs/prototipo)
| Pantalla | Archivo |
|---|---|
| Agenda en modo ver | `A2-Agenda.dc.html` |
| Atender cita o visita | `A2b-AtenderCita.dc.html` |
| Agendar: solicitud en espera / nueva / visita | `A2c` · `A2d` · `A2e` |
| No asistió | `A2f-NoAsistio.dc.html` |
| Reprogramar | `A2g-Reprogramar.dc.html` |
