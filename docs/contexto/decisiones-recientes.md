# Decisiones recientes (oct–nov 2026)

Estas decisiones salieron de la revisión del prototipo con el asesor y el administrador del negocio. **Prevalecen** sobre `.claude/skills/garweb-contexto/SKILL.md` cuando hay diferencias.

## A. Solicitud de cotización del cliente (W2)

1. **Tipo de mueble:**
   - 13 tipos de interiores (sofá de 2 y 3 cuerpos, seccional, loveseat, sillón, silla de comedor, cabecera, puff, banca, etc.);
   - "Sillón reclinable" **se eliminó** porque es lo mismo que "Sillón";
   - el dibujo del mueble cambia según el tipo elegido.
2. **Servicios:** retapizado completo · retapizado + espuma · solo espuma · reparación de estructura · fabricación a medida.
   - **Acabado** (liso, capitoneado, con canales) **solo** aparece en fabricación a medida.
   - **Medidas:** opcionales, salvo en fabricación a medida, donde son obligatorias.
3. **Fotos/videos:** mínimo 1 foto; videos de hasta 1 minuto.
4. **Yardas:** el cliente **no** indica cuántas yardas necesita; las calcula el taller.
5. **Varios muebles en una sola solicitud/cotización:** botón «+ Agregar otro mueble» y "¿Cuántos iguales?". Si son varios, se pregunta "¿La misma tela para todos?".
6. **Cómo elige la tela (paso 2)**, 5 opciones:

   | Opción | Qué pasa |
   |---|---|
   | **La traigo yo** | El taller mide la tela y avisa si no alcanza. |
   | **Ver telas en línea** | Elige del catálogo, con foto y código Pattern/color. |
   | **Ver en el local** | Pide **cita** en el local (W3). |
   | **Visita a domicilio** | Pide **visita** (W3b). Es una **cortesía, sin costo**. |
   | **No lleva tela** | Solo aparece con "solo espuma" o "reparación de estructura", y se marca sola. |

   - La **muestra de tela enviada a domicilio se eliminó** (antes: "Quiero tocar la tela"). Quien quiere tocar la tela usa *Ver en el local* o *Visita a domicilio*.
   - **"Una tela para todo"** permite elegir **solo una** tela.
   - **"Distintas telas por partes"** permite una tela por cada parte del mueble (asiento, respaldo, brazos…).
   - **"¿Qué tela busca?"** es un campo de texto libre (en local y visita). Ya no hay chips de idea de tela. *Por confirmar si es obligatorio u opcional: la última versión del prototipo lo dejó obligatorio.*
7. **Traslado (paso 3, solo si no hay cita ni visita):**
   - **Delivery** (recojo y entrega, un solo costo según distancia y tamaño) o **Lo llevo y lo recojo yo**.
   - En fabricación a medida: "¿Cómo recibe su mueble nuevo?", con entrega a domicilio o retiro en el taller, sin fecha de recojo.
   - **Recojo con Delivery · cambiado el 13/11 (reemplaza el recojo por hora del 11/11):**
     - **Al pedir la cotización (W2)** el cliente **no elige** día ni hora: solo deja la **dirección de recojo y entrega**.
     - **Lo elige el propio cliente cuando se confirma su pago** (cotización aceptada y adelanto confirmado, o adelanto 0 %:
       nace el pedido, CU-C14). Le llega el aviso y elige el día y la hora con la **misma grilla de antes, ligada a la agenda**
       (horas de 1 hora en las franjas del taller, «Ocup.» si chocan con algo o están bloqueadas). Recién ahí **ocupa la agenda**.
     - **Por qué:** el recojo solo puede hacerse cuando hay compromiso. Elegirlo al pedir la cotización permitía pedir imposibles
       (p. ej. a las 8 p. m. para mañana temprano, sin que el taller haya revisado nada) y **bloqueaba la agenda** por semanas
       aunque la cotización nunca se aceptara.
     - En W2 se quitaron la reserva, el índice único y la cuadrícula de horas; la grilla vuelve en el paso posterior al pago, que
       se construye con los backends de Cotizaciones y Pagos. Las solicitudes anteriores conservan su fecha preferida solo para mostrarla.
     - Los parámetros `recojo.duracion_min` y `recojo.dias_anticipacion_max` quedan internos (salen de A14) hasta que vuelva la grilla.
   - Con **«Lo llevo y lo recojo yo»** no se pide día ni franja.
8. **Con "Ver en el local" o "Visita a domicilio" la solicitud tiene 3 pasos** (Mueble y fotos → Tela → Cita/Visita). No hay paso de traslado: se define en la cita.
9. **Navegación del asistente:**
   - los pasos ya hechos (✓) se pueden tocar para volver; no se puede saltar hacia adelante;
   - el botón **Atrás** está en todos los pasos (en el paso 1 vuelve a Mis pedidos);
   - desde W3/W3b, «← Atrás: volver a Tela».

## B. Cita en el local (W3) y visita a domicilio (W3b) del cliente

1. **Cita:** turnos de 30 min.
2. **Visita · cambiado el 13/11 con el diseño W3b:** el cliente elige el **día y la hora** (ya no solo la franja).
   - Horas de **1 hora** (`visita.duracion_min` = 60) dentro de las franjas de visita: **9:00, 10:00, 11:00, 15:00 y 16:00**
     (`visita.franja_manana` 9:00–12:00 y `visita.franja_tarde` 15:00–17:00); de lunes a sábado, sin domingos ni feriados, desde mañana.
   - **Ligada a la agenda del administrador (A2):** la hora sale **«Ocup.»** si choca con una cita en el local, otra visita o un
     bloqueo; al confirmar, **ocupa esa hora** en la agenda. Ya no rige «una visita por franja»: puede haber varias en la mañana si
     no se cruzan.
   - En la misma pantalla, arriba de la grilla: **la dirección de la visita** (guardada u otra nueva, con mapa).
   - El administrador llega **a la hora elegida** (± 15 min por el tráfico). La visita dura aprox. 1 hora y no tiene costo.
   - Las visitas anteriores que solo guardaron la franja se siguen mostrando así y ocupan toda su franja.
3. **Pantalla de confirmación:** fecha, hora o franja, dirección, etiquetas ("Sin costo", duración) y "Cómo será su visita/cita". Son 3 pasos **informativos, sin estados**.
   - Lista "Tenga listo".
   - Reprogramar / Cancelar en un bloque aparte.
   - **No** hay "añadir al calendario" ni aviso de "salimos del taller".
4. **Estados de la visita/cita y quién los cambia:**
   - **Programada:** la pone el cliente al confirmar.
   - **Atendida:** el administrador, al terminar la guía A2b.
   - **No lo encontramos / No asistió:** el administrador, desde la Agenda.
   - **Cancelada:** el cliente.
5. **Inasistencia:** el cliente puede reprogramar **una sola vez**; si falta otra vez, la solicitud **vence**.

## C. Administrador

1. **Nueva solicitud registrada por el administrador (A3)** (cliente que llamó, escribió o vino):
   - Tela = *Ver en el local* o *Visita* → **no** hay pantalla "Revisar y registrar"; el botón es **«Registrar y elegir turno»** y abre la Agenda en modo agendar.
   - Medio **En persona** + "La elige ahora": botones «Atenderlo ahora» (A2b) o «Guardarle un turno para otro día» (Agenda). En persona se ocultan "Telas en línea" y "¿Qué tela busca?".
   - Con cita o visita se salta el paso Traslado.
2. **Agenda de citas:** ver `agenda.md`.
3. **Atender cita (A2b):**
   - la misma guía sirve para el local y para la **visita a domicilio** (en la tablet);
   - tiene el botón **«Guardar y terminar en el taller»**: la solicitud queda **Atendida · por cotizar** en **Cotizaciones › Por armar**.
4. **Cotización (A4):**
   - **sin pestañas**: la pantalla cambia según el estado (borrador / publicada / vencida / V2);
   - una cotización puede tener **varios muebles**, con un total por mueble y un total general;
   - **transporte = distancia + tamaño de carga**; tarifas provisionales: chica $15, mediana $30, grande $45 (en Parámetros);
   - "¿Qué le envía al cliente?": Cotización final o Presupuesto estimado.
5. **Cliente W4:** se **eliminó** «Quiero cambiar de tela». Si quiere otra tela, la rechaza con motivo o el administrador usa «Cambiar tela», que genera V2.
6. **Compras:** **A10 Compras se eliminó**. Su función pasó a **Inventario (A8) → pestaña "Qué pedir"** (Para pedir con «Lo pedí» · Por llegar con «Llegó», que suma al stock).
7. **Panel (A1):** panel **operacional**, solo "lo que pasa hoy" para decidir ahora: atención ahora (p. ej. recojos de hoy que siguen sin hacerse, pedidos atrasados), contadores, agenda del día, salidas, taller, material que se acaba con los pedidos que lo esperan, pagos por confirmar.
   - **No** muestra parámetros ni valores fijos (p. ej. "tiempo para cotizar un pedido grande") ni resultados del mes; solo un enlace «¿Cómo va el mes?» a Estadísticas.
   - **Estadísticas (A21)** van aparte y son mensuales: ventas, cobros y margen **comparados con el mes anterior y con el mismo mes del año anterior** (si aún no hay datos de ese año, se indica), formas de pago en porcentaje y lo que más se vende.
   - Los indicadores de la tesis (valor inicial y meta) **no** se muestran en las pantallas.
   - *Decidido con el asesor (clase del 04/11): "el dashboard operacional es para que el paciente no se muera; lo mensual es estadística".*
8. **Solicitudes y cotizaciones (A3 · diseño del 11/11):** el menú tiene **una sola opción**, «Solicitudes y cotizaciones»; la lista de A4 Cotizaciones se eliminó (A4 queda solo como la pantalla de una cotización).
   - Cada solicitud avanza por **4 etapas**, una por pestaña: **Cita / visita** (En espera de cita / de visita) → **Por cotizar** (Nueva, Atendida) → **Esperando al cliente** (Esperando respuesta, Aceptada · falta adelanto) → **Cerradas** (Aceptada → pedido, Rechazada, Vencida, Descartada).
   - Arriba: indicadores Por cotizar, Esperando al cliente y Aceptadas; filtro por **fecha de solicitud** (Todas, Hoy, Últimos 7 días, Este mes, Rango).
   - La ficha tiene **un solo botón** con lo que toca hacer (Ver cita, Ir a la cita, Ver visita, Armar cotización, Ver cotización…).
   - La etapa no se guarda: se calcula del estado. Los estados de la cotización (Esperando respuesta, Aceptada, Rechazada) llegarán con el backend de A4; hasta entonces «Esperando al cliente» queda vacía.
9. **Agenda · quitar un bloqueo (11/11):** al tocar un horario bloqueado se ve en «Configurar agenda» con el botón «Quitar». El bloqueo **no se borra**: queda anulado con quién y cuándo, y el turno vuelve a estar libre.
10. **Mis pedidos del cliente (W6c):** cada tarjeta muestra su estado y "qué le toca" al cliente. La visita a domicilio tiene sus estados (Visita programada / No lo encontramos / Preparando cotización).

## D. Seguridad y parámetros (A20, A14 · decidido el 10/11)

### D.1 Usuarios y roles (CU-S03, S04)
1. **Rol "Producción":** en pantalla se muestra **"Producción"** (incluye tapiceros y costureras, como en A20). En la base el rol sigue llamándose `Tapicero`; solo cambia la etiqueta visible.
2. **Correo y nombre** (cambiado por el equipo el 10/11):
   - el personal se registra con **nombres y apellidos** y **correo**, ambos obligatorios para todos los roles;
   - **no hay un nombre de usuario aparte** (como "pedro.taller"), porque se podía confundir: la persona **entra con su correo**, igual que los clientes; por dentro, el nombre de usuario de la cuenta es el mismo correo;
   - con correo, todo el personal puede usar "¿Olvidó su contraseña?"; el Administrador igual puede generarle una contraseña temporal nueva;
   - las cuentas de prueba del seed (`admin`, `tapicero`, `conductor`) siguen entrando con ese usuario o con su correo.
3. **Contraseña temporal:**
   - el sistema la genera y se le **muestra una sola vez al Administrador**, que la entrega en persona (no se envía por correo);
   - no vence;
   - el usuario **debe cambiarla en su primer ingreso**, en una pantalla nueva con el estilo de G1.
4. **Editar un usuario:**
   - se puede cambiar **nombres y apellidos, rol, dispositivo y correo**; el correo no se puede dejar vacío;
   - si se cambia el correo, la persona entra con el nuevo y el anterior deja de servir; el historial se conserva (la bitácora guarda a la persona, no su correo);
   - el Administrador puede generarle una contraseña temporal nueva.
5. **Protecciones:** nadie puede desactivarse a sí mismo, y siempre debe quedar **al menos un Administrador activo**.
6. **Desactivar o cambiar de rol:** el acceso se corta cuando vence el token de acceso (`JWT_ACCESS_MINUTOS` = 15 min). Al renovar la sesión se compara `version_sesion`, que sube al desactivar, cambiar el rol o cambiar la contraseña.
7. **Dispositivo:** lista fija **Computadora · Celular · Tablet**, solo informativa.
8. **Último acceso:** se calcula desde la bitácora (último inicio de sesión); no se guarda aparte.
9. **Roles fijos, sin pestaña "Roles y permisos"** (equipo, 10/11): los roles (Administrador, Producción, Conductor, Cliente) y lo que puede hacer cada uno son fijos según la tesis y se validan en el backend (RG-07). No se configuran ni se muestran en una pestaña aparte: A20 queda con **Usuarios** y **Registro de actividad**, y el Administrador solo elige el rol de cada persona.

### D.2 Auditoría (CU-S06)
1. **Exportar:** en **CSV**. Período por defecto: **últimos 30 días**.
2. **Qué se registra:** cerrar sesión también va a la bitácora.
3. **Protección:** la bitácora **no se puede editar ni borrar**; la base de datos lo impide.
4. **Filtros del registro de actividad** (equipo, 10/11): en lugar de una lista con cada usuario (no sirve con decenas de clientes):
   - **Quién:** todos · Personal del taller · Clientes · Sistema;
   - **Módulo** y **Período** (últimos 30 días, 7 días, hoy o fechas elegidas);
   - **buscador** por nombre, correo, solicitud o acción, para encontrar a una persona concreta;
   - la columna Usuario muestra el **nombre** y, debajo, el correo.

### D.3 Parámetros (CU-S05, A14)
1. **Qué se muestra en A14:**
   - **todos** los parámetros de negocio que el Administrador puede cambiar, agrupados;
   - además de los grupos del prototipo, se agregan **"Seguridad"** (intentos fallidos, minutos de bloqueo, duración del enlace de recuperación) y los de agenda (horario, duración del turno, franjas);
   - los valores técnicos (JWT, claves, URLs) siguen en `.env` y no aparecen en pantalla.
2. **Parámetros de módulos aún no construidos** (vigencia, adelanto, margen, tarifas, transporte…): se cargan con los valores del prototipo, marcados en su ayuda como **"Provisional: por confirmar con el dueño"**.
3. **No entran en este desarrollo:**
   - unidades de medida → con **Almacén**;
   - métodos de pago → con **Pagos**;
   - respaldo → solo informativo por ahora (Supabase ya hace copias).
4. **Rangos:**
   - adelanto **0–50 %**;
   - margen **0–200 %**;
   - vigencia de la cotización **1–90 días**;
   - plazos y tarifas **no negativos**;
   - porcentajes **≤ 100**.

   Los límites se guardan en las columnas `minimo` y `maximo` de `parametro`, para poder ajustarlos sin tocar el código.
5. **Cambiar el horario o las franjas con citas ya agendadas fuera del nuevo horario:** **no se bloquea**. Se guarda y se muestra un aviso con la lista de citas afectadas para que el Administrador las reprograme; las citas existentes se mantienen.
6. **Solo hacia adelante:** lo existente (citas, solicitudes y, luego, cotizaciones) conserva los valores con que se creó; el cambio aplica solo a lo nuevo. Cada cambio queda en `parametro_historial` y en la bitácora.

## E. Mi perfil del cliente (W10 · decidido el 10/11)
Solo el lado del cliente; la ficha que ve el Administrador (A17) se hace más adelante.

### E.1 Datos
1. **Persona o empresa:** se muestra, pero **no se cambia** desde el perfil; si el cliente lo necesita, lo pide al taller.
2. **Empresa:**
   - el **EIN** se muestra sin poder cambiarlo;
   - se pueden editar el nombre de la empresa, la persona de contacto, el cargo y el teléfono.
3. **Nombre:** dos campos, **Nombres** y **Apellidos**, igual que en el registro (G1).
4. **Correo** (con él entra a GARWEB). El cliente puede cambiarlo:
   - se le pide su **contraseña actual**;
   - se envía un **enlace de confirmación al correo nuevo**, y el cambio **solo se aplica cuando lo confirma** (un error de tipeo no lo deja sin acceso);
   - se avisa al **correo anterior** que se pidió el cambio;
   - mientras no confirme, sigue entrando con el correo de siempre.

### E.2 Direcciones de entrega
1. **Agregar:** con etiqueta (Casa, Oficina…) y Google Maps. La primera dirección guardada queda como **principal**.
2. **Quitar:** sí, pero **se oculta, no se borra**; las solicitudes que la usaron la conservan.
3. **Editar:** no. Si la dirección cambió, se agrega otra.
4. **Principal:**
   - se propone al pedir delivery en W2 y en el despacho;
   - si se quita la principal, la siguiente pasa a ser principal;
   - mientras tenga direcciones, siempre hay **una sola** principal.

### E.3 Avisos
1. **Obligatorios** (siempre llegan por correo y a la campana; no se pueden apagar):
   - **citas y visitas**: programada, reprogramada, inasistencia y sus recordatorios;
   - solicitud **vencida** y **descartada**;
   - cuando existan: recojo, entrega, retiro en el taller y daño oculto (V2).
2. **Informativos por correo** (el cliente puede apagarlos):
   - "Recibimos su solicitud" y "Recibimos sus fotos";
   - luego, el avance del pedido, la cotización y los pagos;
   - es la preferencia que ya se elige al registrarse ("Quiero recibir avisos de mis pedidos por correo").
3. **Bloque en W10, simplificado por el equipo el 10/11.** El bloque del prototipo se veía recargado; queda solo:
   - el título **"Avisos por correo"**;
   - un interruptor: **"Avance de mis pedidos, cotizaciones y pagos"** (los informativos);
   - la línea *"Los avisos de citas, recojos y entregas siempre le llegan."*;
   - el enlace **"Ver mis notificaciones"**.

   Ya **no se muestran** la lista de obligatorios con candado, el texto sobre el conductor ni el interruptor "Recordatorios y novedades del taller". Como hoy no se envían promociones, ese interruptor no hacía nada. La columna `acepta_novedades` queda en la base, apagada y sin uso, por si más adelante hay promociones (entonces se vuelve a mostrar).
4. **Campana:** dentro de GARWEB (W11) el cliente **siempre ve todos** sus avisos; el interruptor solo afecta al correo.

### E.4 Seguridad
1. **Cambiar contraseña:** en una **pantalla aparte con el estilo de G1**:
   - pide la contraseña actual;
   - cierra las sesiones en otros equipos (`version_sesion`);
   - avisa por correo y en la campana: "Su contraseña cambió".
2. **Último ingreso:** solo fecha y hora ("Último ingreso: hoy 09:12"), sacado de la bitácora. Es el ingreso anterior al actual.
3. **Desactivar la cuenta:** no está en W10; lo hará el Administrador en A17 (H02).

## H. Almacén e Inventario y Parámetros (diseño del 12/11)

### H.1 Solicitud y pedido son entidades distintas (CU-C14)
1. **Solicitud** (`SOL-0000`): lo que pide el cliente; puede terminar sin pedido (descartada, vencida, rechazada).
2. **Pedido** (`PED-0000`, código propio): nace cuando se acepta la cotización y se paga el adelanto (o el adelanto es 0 %).
   Tabla `pedido` enlazada a su solicitud de origen; la cotización congelada se enlaza cuando exista su backend.
3. Inventario, taller, pagos y despacho trabajan sobre el **pedido** (`pedido_id`), no sobre la solicitud.
4. En A3, una solicitud que ya tiene pedido queda en **Cerradas · «Aceptada → pedido PED-…»** (se calcula, no se guarda).
5. Por ahora los pedidos son **datos de prueba** (seed `seed-inventario.ts`); A6 Pedidos sigue con datos de ejemplo.

### H.2 Inventario: cinco pestañas y el conteo
1. **Stock (A15):** en el estante, reservado, **disponible = en el estante − reservado**, mínimo, «alcanza para» y estado
   (OK · Bajo el mínimo · Falta para un pedido · Pedido). Nada de esto se guarda: se calcula de reservas, compras y movimientos.
2. **Telas (A15b):** muestrario digital **sin cantidades**. Descontinuar = `activo` en falso (no se borra). «Mostrar al cliente en
   Telas en línea» (`en_web`): el cliente en W2 solo ve las telas activas y en la web; el Administrador ve todas.
3. **Reponer (A8):** telas para encargar (tras el adelanto) · materiales por proveedor con **cantidad sugerida =
   consumo × `inventario.semanas_compra` − disponible − lo que ya viene, nunca menos de lo que falta para el mínimo** · por llegar.
   GARWEB no le escribe al proveedor: «Marcar como pedido» y «Llegó» solo lo anotan. «Llegó» suma todo lo pedido; si llegó
   menos, se corrige en Movimientos («Llegó menos de lo pedido»). La tela llega asignada a su pedido y **no entra al stock**.
4. **Movimientos (A8c):** kardex con saldo. «Corregir stock» exige motivo; «Retiro para un pedido» y «Sobró de un pedido»
   exigen un pedido en proceso. Nunca sale más de lo que hay en el estante.
5. **Proveedores (A8p):** nombre, teléfono o WhatsApp, días que tarda (desde–hasta) y si vende materiales de stock o telas.
6. **Conteo (A9):** a ciegas (la lista no muestra lo que dice el sistema); cada diferencia se ajusta con motivo y lo que
   coincide queda como constancia «Conteo de inventario · coincide».
7. **Consumo promedio:** retiros − devoluciones de pedidos de las últimas `inventario.semanas_promedio` semanas (parámetro
   interno, 4) ÷ semanas.
8. **Unidad de cada material:** se elige al registrarlo y no se cambia una vez que tiene movimientos.
9. **En esta entrega solo el Administrador** registra movimientos; los retiros y devoluciones del taller (T2/T3) se agregan con
   la app del taller (la API ya descuenta la reserva al retirar para un pedido).

### H.3 Parámetros (A14)
1. **Unidades de la solicitud y la cotización:** telas (yarda/metro) y medidas del mueble (pulgada/centímetro). **Solo cambia
   cómo se muestra**: lo guardado sigue en yardas y pulgadas (1 yd = 0.914 m · 1 in = 2.54 cm). Tipo de parámetro nuevo «opción».
2. Se agregan «Compra sugerida · semanas de consumo» (2) y «Plazo estándar para terminar un pedido» (14 días).
3. Salen de la pantalla (no se borran, quedan sin grupo): «Aviso de precio por revisar» y «Horas extra por tela difícil».

## I. Plantillas de cotización (A16 · CU-C06 · 14/11)
1. **Una plantilla por tipo de mueble + servicio** (matriz de 12 × 5). Cada una tiene **actividades** (horas persona, máquina
   opcional y horas de máquina) y cada actividad sus **materiales** con cantidad.
2. **Versionadas:** «Guardar cambios» crea una **versión nueva** y la anterior queda inactiva (no se borra). Las cotizaciones
   nuevas usan la vigente; las ya armadas conservan la suya. Si no cambió nada, no se crea versión. Solo puede haber una versión
   activa por combinación; si otra persona guardó antes, se avisa y se recarga.
3. **Precio sugerido = (materiales + mano de obra + maquinaria + costos fijos) × (1 + margen)**, redondeado al dólar, sin transporte:
   - mano de obra = horas persona × `tarifa.hora_persona`;
   - maquinaria = horas de máquina × la **tarifa por hora de cada máquina** (tabla `maquina`, RG-04);
   - materiales = cantidad × **precio de hoy** del material en el Inventario;
   - la **tela no va en la plantilla** (decisión del 14/11): los materiales son solo los de stock del Inventario. La tela la
     elige el cliente y se agrega en la cotización con su precio real (o 0 si la trae). Por eso el precio sugerido de la
     plantilla es **sin tela**. El parámetro `tarifa.tela_referencia` dejó de usarse y quedó oculto en Parámetros;
   - costos fijos = `tarifa.costos_fijos_pedido` (una vez, si tiene actividades); margen = `cotizacion.margen_pct`.
4. **Validaciones:** al menos una actividad con horas; sin máquina no lleva horas de máquina; las máquinas y los materiales deben
   estar activos (los materiales son los de stock del Inventario; las telas del muestrario no van en plantillas); sin materiales
   repetidos en una actividad.
5. **Máquinas:** se cargan con el seed (Mesa de corte $4/h, Máquina de coser industrial $6/h, Cortadora de espuma $8/h,
   Engrapadora neumática $5/h · provisionales, por confirmar con el dueño). **Se administran en Parámetros › Máquinas**
   (agregado propio del 14/11, el diseño no lo traía; por revisar con Jesús): agregar, cambiar nombre o tarifa, desactivar y
   reactivar. No se borran (RG-03). Cada cambio va a la bitácora y aparece en el «Historial de cambios» de A14 (RG-02). Se guardan
   fila por fila, no con «Guardar cambios». Cambiar una tarifa actualiza al instante el precio sugerido de las plantillas que la
   usan. Una máquina desactivada ya no se ofrece al armar plantillas; las que ya la tienen la muestran «(desactivada)» con su
   tarifa, y al guardarlas otra vez hay que elegir otra máquina.
6. **«Usada en N cotizaciones»** muestra 0 hasta que exista el backend de Cotizaciones (A4).

## J. Pagos (A5 y W5 · diseño del 14/11 · solo frontend por ahora)
1. **Pago en línea con pasarela** (cambia CU-C12, que decía «sin pasarela en línea»): el cliente puede pagar con **tarjeta**
   (se confirma al instante) o **cuenta bancaria ACH** (queda «En proceso» 2 a 3 días hábiles y se confirma sola). GARWEB nunca
   ve ni guarda datos de tarjetas ni cuentas: los maneja la pasarela. La pasarela (proveedor, comisiones) está **por definir**.
2. **Otras formas:** Zelle (sube la captura; obligatoria), cheque (foto opcional) y efectivo (solo en persona). Zelle y cheque
   quedan «Por confirmar» hasta que el taller los revise.
3. **A5 Pagos** tiene 3 pestañas: **Por confirmar** (cobros que el conductor registró en la entrega; el Administrador confirma
   cuando recibe el dinero, o rechaza con motivo), **Confirmados** (pasarela y manuales, con filtro; los manuales se anulan con
   motivo, los de pasarela no) y **Saldos pendientes** (saldo = total − pagos confirmados; un pedido con un cobro por confirmar no
   se repite aquí).
4. **Registrar pago manual** (efectivo, cheque, Zelle, transferencia, tarjeta con el terminal): queda confirmado al guardar y
   emite el recibo. El monto no puede pasar de lo que debe el pedido.
5. **Por aclarar con Jesús / el dueño:** en el diseño de A5, «Por confirmar» solo muestra los cobros del conductor; los pagos por
   Zelle o cheque que el cliente informa en W5 no aparecen en ninguna pestaña de A5. Se implementó tal cual el diseño.

## K. Armar cotización con uno o varios muebles (A4 · diseño del 14/11 · backend del 14/11)
1. Una cotización reúne **todos los muebles de la solicitud**. Cada mueble tiene su plantilla, su tela y yardas, sus fotos,
   sus actividades y su **precio propuesto**; el total se suma solo.
2. El **transporte se cobra una sola vez**: distancia + tamaño de la carga de todos los muebles juntos (se recogen y
   entregan en el mismo viaje).
3. Las telas a comprar se juntan por tela (p. ej. sofá y otomán con la misma tela suman sus yardas).
4. Para publicar, el Administrador tiene que **revisar el precio de cada mueble** («Revisado» / «Por revisar»).
5. El adelanto sugerido (40 %) se calcula sobre el total con transporte y se puede cambiar solo para ese pedido.
6. **Transporte automático, como una app de taxi** (confirmado con Alejandro): millas **por calle** desde el taller
   (parámetro `taller.direccion`: 469 South Avenue E B, Westfield, NJ 07090) hasta la dirección del cliente × 2 viajes ×
   `transporte.por_milla` + la carga. Las direcciones se ubican con OpenStreetMap (Nominatim) y la ruta con OSRM; para
   ubicarlas se quita el local, la suite o el departamento («E B», «Apt 4B»). Si no se puede calcular, se ingresa a mano
   con motivo (queda registrado). Sin delivery, el transporte es $0.
7. **Carga:** cada tipo de mueble tiene su tamaño (chica, mediana o grande) en **Parámetros › Tamaño de carga por tipo de
   mueble**; la tarifa de cada tamaño está en «Tarifas». Con varios muebles **se suman** (cada uno ocupa su lugar en el
   camión). La cantidad de un mueble («2 × sofá») no multiplica la carga (por confirmar con el dueño).
8. **Tela de cada mueble** (confirmado con Alejandro): la trae el cliente → «Lo brinda el cliente» ($0); la eligió en línea →
   esa tela (con «misma tela para todos», la del primer mueble); el taller **solo escribe las yardas**, porque mide. Si es de
   cita o visita, la tela todavía no existe y no se puede publicar (hasta que la atención de la cita tenga backend).
   Servicios sin tela (espuma, estructura) no llevan tela. Una tela sin precio en Inventario no deja publicar.
9. **Adelanto** (CU-C11): una sola línea «Adelanto: $X · N % del total» con «Cambiar»; al cambiarlo se ve el porcentaje que
   resulta, el máximo (`pago.adelanto_sin_historial_pct` → máximo 50 %) y «Volver al sugerido». Sugerido: 40 % sin pedidos
   cerrados, 0 % con al menos uno. Se quitó «Tela bajo pedido» de Condiciones (repetía la revisión).
10. **Observaciones para el cliente:** opcionales y vacías por defecto, solo para lo particular del trabajo. Las reglas
    generales («la tela se pide al pagar el adelanto…», «si encontramos algo distinto, recotización…») las ve siempre el
    cliente como texto fijo de la cotización.
11. **Costos fijos por pedido:** se cargan una sola vez, al precio sugerido del primer mueble.
11b. **Cantidad del mueble (15/11):** las actividades de la plantilla son **por unidad**; con «2 × sofá» las horas, la
    maquinaria y los materiales se multiplican por 2. Las yardas de tela las escribe el taller para toda la línea (no se
    multiplican) y los costos fijos siguen una sola vez. El **precio propuesto empieza igual al sugerido** (RG-01) y lo
    sigue mientras el Administrador no escriba otro; «Volver al sugerido» lo devuelve. Con varios muebles el panel
    muestra «Precio de este mueble» y el total de la cotización con el transporte (una sola vez).
12. **Guardar y publicar:** «Guardar borrador» guarda lo armado (COT-0000) sin crear filas que luego haya que borrar
    (RG-03). «Publicar y avisar al cliente» revisa todo, congela los precios de ese momento, fija la vigencia
    (`cotizacion.vigencia_dias`), pasa la solicitud a «Cotizada» y avisa al cliente por notificación y correo. Ya
    publicada no se edita. Falta: la vista del cliente (W4), registrar su respuesta, la V2 y renovar (siguen de ejemplo).

## L. Atender la visita a domicilio: el recojo al final (A2b · diseño del 14/11, ajustado el 14/11 · con backend desde el 15/11)
1. En «Traslado» ya no se pide fecha de recojo (como A.7): solo delivery o lo lleva el cliente, y la dirección.
2. Si el cliente acepta y el **pedido se genera en la visita** (pagó el adelanto, o su adelanto es 0 % porque tiene pedidos
   cerrados) y eligió delivery, el último paso es **«¿Cuándo recogemos el sofá?»**
   (antes repetía «¿Cómo llega el sofá al taller?», la pregunta del paso Traslado):
   - **Agendar el recojo:** eligen juntos día y hora en la grilla de la agenda del camión (lun–sáb, franjas del taller).
     El recojo ocupa `recojo.duracion_min` (1 h), no «20 minutos» como decía el diseño.
   - **Me lo llevo ahora** (solo en la visita a domicilio; en una cita en el local el mueble no está): un solo botón,
     «Registrar recojo y llevármelo». **Sin piezas, fotos ni firma** (decisión de Alejandro, 14/11: agiliza la visita y no
     agrega funciones): las fotos ya se tomaron en el paso 1 y las piezas y fotos de llegada las registra la recepción del
     taller (A18). Es la opción que prefiere el dueño cuando todo sale bien: cerrar todo en la visita.
   - No hay opción «Que lo elija ella» (decisión de Alejandro, 14/11): con el cliente presente, el recojo se agenda ahí o se
     lleva en la visita. En una cita en el local solo queda «Agendar el recojo» (sin selector de opciones).
3. Llevárselo en la visita **no crea un estado nuevo**: el pedido sigue «Esperando mueble» hasta que el taller lo recibe
   (A18 · RG-09). El diseño decía «Recogido · en camino al taller», que no existe en el ciclo del pedido.
4. Si el cliente lleva el mueble él mismo, el mensaje final ya no habla de recojo.
5. **Transporte cuando se lo lleva en la visita** (decisión de Alejandro, 14/11): se cobra igual el transporte ida y vuelta
   cotizado. El viaje de la visita hace de recojo y la entrega se hace igual; el total que aceptó el cliente no cambia.
   Cuidado: si algún día la visita a domicilio se cobra aparte (pendiente F), no cobrar dos veces el mismo viaje.
6. Sin pedido no hay recojo: si el cliente acepta pero paga el adelanto después, no se lleva el mueble (el pedido nace con
   el adelanto); elige el día del recojo desde su cuenta cuando pague.

### L.2 Backend de la atención (15/11 · decisiones de Alejandro)
1. **Empezar** registra la visita como atendida (endpoint de resultado que ya existía); **«No lo encontramos»** registra la
   inasistencia con su regla de reprogramaciones y aviso al cliente, y vuelve a la Agenda.
2. **Tela en la cita o la visita:** se elige del muestrario (A15b) y viaja en el borrador de la cotización de A4, con las
   yardas que mide el taller. Sin tela no se puede cerrar la respuesta.
   **Igual que W2 (15/11):** «Una tela para todo» o «Distintas telas por partes», con el mismo dibujo del mueble y la
   lista de partes; con partes, **cada parte necesita su tela**. Las yardas van **por tela** (las mide el taller). Mientras
   se arma viaja en el borrador; **al publicar** queda en la solicitud como la del catálogo en línea (`modo_tela` y
   `solicitud_tela` con su parte), y la cotización guarda una fila por tela con sus yardas.
   El paso Traslado usa el mismo campo de dirección y **mapa** de W2 (autocompletado de Google si hay clave).
3. **Traslado:** se guarda en la solicitud (delivery con dirección guardada o nueva, o lo lleva el cliente); el transporte
   lo calcula A4 automáticamente.
4. **La cotización se arma con A4** (mismas reglas). La respuesta la publica y, según lo que decide el cliente:
   «Lo pensará» → Pendiente de respuesta · «No acepta» → Rechazada con motivo y la **solicitud queda Rechazada** ·
   «Acepta, paga después» → **Aceptada: pendiente de adelanto** (A3 la muestra «Aceptada · falta adelanto») ·
   «Acepta, paga ahora» o adelanto 0 % → **Aceptada**, se genera el **pedido PED-0000** en «Esperando mueble» y, si hay
   adelanto, un **pago mínimo** (tabla `pago`: monto, medio, origen visita/local, Confirmado). Medio de respuesta: «En persona».
5. **Constancia sin firma:** al aceptar, el cliente recibe por correo y en su cuenta lo que aceptó (avisos obligatorios
   `cotizacion_aceptada` / `pedido_generado`).
6. **Recojo** (tabla `recojo`): agendado en la agenda del camión (lunes a sábado, franjas del taller, `recojo.duracion_min`,
   hasta `recojo.dias_anticipacion_max` días, sin domingos, feriados ni bloqueos de la agenda; **un recojo por hora**,
   un camión) con aviso obligatorio `recojo_programado`; o «en la visita» (solo a domicilio, queda Realizado). El pedido
   sigue «Esperando mueble» hasta la recepción en el taller (A18).
7. **Atención a medias (15/11):** si se sale antes de publicar, la cita queda «Atendida» y la solicitud «Atendida». En la
   Agenda y en A3 el botón es **«Continuar la atención»** (no «Armar cotización», porque la tela y el traslado se definen
   en la atención) y se retoma en el primer paso que falta: telas → traslado → cotización. La pantalla sigue el diseño
   A2b: pasos a la izquierda y el resumen «Se guarda mientras avanza / Lo que se lleva el cliente» a la derecha; fotos
   en un visor compacto (la foto entera, sin recortar).
8. **La agenda del cliente (W3/W3b) es la misma del Administrador (A2):** ocupan turno las citas Programadas **y las
   Atendidas** (una empezada antes de su hora sigue en A2), las visitas con hora (su duración) y las visitas antiguas
   solo con franja (toda la franja). Un bloqueo por horas tapa el turno si toca **cualquier parte** de él.
9. **Una sola agenda sin cruces (15/11 · decisión de Alejandro):** a veces el Administrador va con el chico del delivery a
   recoger, así que **recojos, citas en el local, visitas y bloqueos comparten una sola agenda** y nunca se cruzan. Esto
   reemplaza «el recojo no ocupa la agenda del Administrador» (A.7 y L.6). Un recojo agendado ocupa su bloque de
   `recojo.duracion_min` (1 h: tapa dos turnos de cita de 30 min); una cita o visita tapa las horas de recojo que toca.
   Sigue **un recojo a la vez** (un camión). **Las horas de inicio del recojo van cada 30 min, las mismas de la Agenda**
   (`agenda.turnos_*`, 9:30, 10:00, 10:30, 11:00 · 15:00, 15:30, 16:00): así se aprovecha un hueco como 9:30–10:30. El
   recojo sigue durando `recojo.duracion_min` (1 h) y solo se ofrece si la hora entera cabe antes del almuerzo o del cierre. **Lo mismo
   para la visita a domicilio (W3b):** empieza cada 30 min en las horas de la Agenda y dura `visita.duracion_min` (1 h). Los recojos se ven en la Agenda de citas como bloques naranjas («Recojo ·
   cliente», con el pedido y la dirección) y no se pueden elegir ni bloquear. Costo aceptado: las horas de recojo se
   restan de las de citas aunque el chico vaya solo; si más adelante molesta, se agrega «Va el Administrador» por recojo.
10. **Estado «En atención» (15/11 · decisión de Alejandro):** «Empezar» deja la cita o la visita **y su solicitud** «En
    atención» (no «Atendida»). Así una atención a medias no se ve terminada. Se puede cotizar, cambiar el traslado y
    descartar (la cita en curso se cancela); sigue ocupando la agenda y no admite «No asistió». **Al registrar la
    respuesta del cliente** (se publica la cotización) la cita pasa a «Atendida» y la solicitud a «Cotizada». En la
    Agenda se ve en otro color con «Continuar la atención»; en A3 está en la etapa «Cita / visita»; el cliente (W6c) ve
    «Cita en curso». Migración `en_atencion` (CHECK de cita y solicitud). Las atenciones a medias de antes de este
    cambio quedaron «Atendida» y se siguen retomando igual.
11. Pendiente para Pagos y Despacho: pantallas A5/W5 sobre la tabla `pago`; reservar materiales al nacer el pedido; salidas
   que usen la tabla `recojo`.

## M. El cliente revisa y responde su cotización (W4 · 15/11 · decisiones de Alejandro)
1. **W6c** muestra en la tarjeta de cada solicitud su última cotización publicada: total («incluye traslado ida y vuelta»
   si hay transporte), días para responder, adelanto y el botón **«Ver y responder»** (lleva a W4). Aceptada sin
   adelanto, con pedido, rechazada o vencida cambian la tarjeta (las tres últimas pasan a Cerradas).
2. **W4** muestra lo que hará el taller con cada mueble (los nombres de las actividades, sin horas, máquinas ni costos:
   RG-08), la tela, el traslado, las observaciones del taller (una por línea), el total con el transporte, el adelanto y el
   saldo. El precio por mueble solo se lista con varios muebles.
3. **Rechazar** funciona: motivo obligatorio (Precio · Plazo de entrega · Elegí otro taller · Otro motivo) y comentario
   opcional (`cotizacion.comentario_respuesta`). Medio de respuesta «Plataforma». La solicitud queda **Rechazada**.
4. **«Aceptar y pagar el adelanto» todavía no hace nada:** no hay pasarela de pago. El botón se ve deshabilitado con la
   nota «El pago en línea estará disponible pronto…» y el backend responde 409 si se intenta por la API.
5. **Adelanto 0 %** (cliente con pedidos cerrados): «Aceptar y generar el pedido» sí funciona (no pasa por la pasarela):
   pedido en «Esperando mueble» con su constancia, y si es con delivery el cliente **elige el día del recojo** en la misma
   agenda del camión que usa A2b (mismas reglas: una hora libre, un recojo por hora).
6. **Vencida:** se trata como vencida si pasó su vigencia aunque el estado diga «Pendiente de respuesta» (no hay todavía
   tarea que la venza sola). Como la renovación (C10) no existe, en vez de «Pedir que la renueven» se indica llamar.
7. No se muestran todavía: la tarjeta de muestra de tela (ese flujo no existe), «Tiempo estimado» (no hay parámetro) y
   la orden de servicio en PDF.

## F. Pendientes por confirmar con el dueño (vía Alejandro)
- Duración real de la cita para ver telas (prototipo: 30 min).
- Límite de distancia para la visita a domicilio gratuita.
- Tarifas reales de transporte por tamaño de carga.
- Qué pasa si la tela que trae el cliente no alcanza (propuesta: recotización V2).
- Si "¿Qué tela busca?" es obligatorio u opcional (y si "¿Qué tela trae?" es opcional).
- Fotos y códigos reales de las telas: están en los libros del dueño; por ahora el catálogo usa datos de prueba.

## G. Por decidir en el equipo (reunión del 08/11)
- A3: quitar «Pedírselas por enlace» y el estado «Esperando fotos».
- A3: «¿Por dónde se comunicó?» como lista desplegable en vez de tarjetas.
- Supabase desde ahora o recién en Tesis 2 (hoy se trabaja en local con Docker).
