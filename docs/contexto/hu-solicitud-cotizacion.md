# HU-C01 · Registrar solicitud de cotización (cliente, W2)

**Caso de uso:** C01 · Módulo Comercial · OE 1.1 Centralizar la recepción de solicitudes.
**Actor:** cliente con cuenta (web o celular).

**Como** cliente, **quiero** enviar mi solicitud de cotización desde la web, con fotos de mi mueble y cómo quiero elegir la tela, **para** recibir mi cotización sin llamar ni ir al taller solo a preguntar.

**Precondición:** sesión iniciada (G1). Si hay cita o visita, la agenda debe tener turnos libres.

## Flujo principal ("La traigo yo" + Delivery)

| Paso | Qué pasa |
|---|---|
| 1 | «+ Nueva solicitud» → paso **1. Mueble y fotos**. |
| 2 | Elige tipo de mueble (el dibujo cambia) y servicio. |
| 3 | Sube fotos o videos (mínimo 1 foto). Medidas opcionales. |
| 4 | Paso **2. Tela** → «La traigo yo». |
| 5 | Paso **3. Traslado** → Delivery, dirección y **día y franja preferidos de recojo** (mañana o tarde). |
| 6 | Paso **4. Revisar y enviar** → «Enviar solicitud». |
| 7 | El sistema crea la solicitud **SOL-XXXX** en estado **Nueva**. Aparece en Mis pedidos (W6c) y en la bandeja del administrador (A3 / Cotizaciones › Por armar). |

## Flujos alternos

**Según la tela:**
- **A1 Ver telas en línea** (en la bandeja del administrador: «Telas en línea»): una tela del catálogo (Pattern/color) → Traslado → Enviar.
- **A2 Ver en el local:** el paso 3 es la **cita** (W3). Queda "Cita programada". Son 3 pasos, sin Traslado.
- **A3 Visita a domicilio:** el paso 3 es la **visita** (W3b): franja y dirección. Queda "Visita programada", sin costo.
- **A4 No lleva tela:** solo con solo espuma o reparación de estructura; se marca sola.
- **A5 Distintas telas por partes:** una tela por cada parte del mueble.

**Según el mueble:**
- **A6 Varios muebles:** «+ Agregar otro mueble», "¿Cuántos iguales?", "¿La misma tela para todos?".
- **A7 Fabricación a medida:** medidas obligatorias y **Acabado**. En Traslado: entrega a domicilio o retiro en el taller, sin recojo.

**Según el traslado:**
- **A8 Lo llevo y lo recojo yo:** sin costo de traslado; no se pide día ni franja de recojo.
- **A9 Dirección nueva:** «+ Usar una dirección nueva» (puede guardarla en Mi perfil).

**Otros:**
- **A10 Guardar y seguir después:** queda como **Borrador** en Mis pedidos.
- **A11 Cliente que llama o va al local:** el administrador registra la solicitud en A3 (ver `decisiones-recientes.md` C.1).

## Excepciones

| Código | Situación | Respuesta del sistema |
|---|---|---|
| E1 | Sin fotos | No deja continuar ("mínimo 1 foto"). |
| E2 | Video > 1 min o archivo no admitido | Rechaza ese archivo y explica por qué. |
| E3 | Domingo, feriado, día pasado, más de 4 semanas adelante o franja llena | No se puede elegir. |
| E4 | Agenda sin turnos libres | Elegir otro día o semana. |
| E5 | Fabricación a medida sin medidas | No deja continuar. |
| E6 | Sesión vencida | Va a G1 y vuelve sin perder lo avanzado (borrador). |
| E7 | Falla al enviar | Avisa y conserva el borrador para reintentar. |
| E8 | Dirección muy lejana para visita o delivery | *Por definir con el dueño.* |

## Reglas
- Toda solicitud termina **cotizada, vencida o descartada con motivo**.
- Las yardas las calcula el taller.
- La visita a domicilio no tiene costo.
- El acabado solo aplica a fabricación a medida.
- Los recojos son de lunes a sábado.
- El día y la franja de recojo son una preferencia: el taller confirma el día y la hora al planificar la salida (A13).

## Criterios de aceptación
1. Con sesión iniciada, al completar mueble, ≥1 foto, tela y traslado y enviar → se crea la solicitud en estado *Nueva*, visible en W6c y en A3.
2. «Ver en el local» o «Visita» → el paso 3 es el calendario de cita o visita, sin Traslado.
3. Servicio "solo espuma" o "reparación de estructura" → "No lleva tela" marcado solo.
4. "Fabricación a medida" sin medidas → no deja continuar.
5. "Una tela para todo" → solo se puede marcar una tela.
6. Guardar y salir → la solicitud aparece como *Borrador*.
7. Un paso ya hecho (✓) se puede tocar para volver; no se puede saltar hacia adelante.
