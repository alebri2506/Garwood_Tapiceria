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
   - **Recojo preferido (solo con Delivery):** mini agenda semanal por **día + franja**, no por horas:
     - franja **mañana 9:00–12:00** o **tarde 15:00–17:00** (parámetros `taller.franja_manana` y `taller.franja_tarde`); de 12:00 a 15:00 está cerrado;
     - de lunes a sábado, sin domingos ni feriados;
     - se puede elegir hasta 4 semanas adelante;
     - cada franja tiene un **cupo** de recojos; una franja llena aparece como «Llena» y no se puede elegir (valor del cupo: ver F);
     - es una **preferencia**: la hora exacta la fija el administrador al planificar la salida (A13), y el recojo ocurre después de aceptar la cotización;
     - los recojos **no** van en la Agenda de citas (ver `agenda.md`).
     - *Decidido con el asesor (clase del 04/11): el cliente indica en qué parte del día estará en casa; se descartó elegir una hora exacta.*
   - Con **«Lo llevo y lo recojo yo»** no se pide día ni franja.
8. **Con "Ver en el local" o "Visita a domicilio" la solicitud tiene 3 pasos** (Mueble y fotos → Tela → Cita/Visita). No hay paso de traslado: se define en la cita.
9. **Navegación del asistente:**
   - los pasos ya hechos (✓) se pueden tocar para volver; no se puede saltar hacia adelante;
   - el botón **Atrás** está en todos los pasos (en el paso 1 vuelve a Mis pedidos);
   - desde W3/W3b, «← Atrás: volver a Tela».

## B. Cita en el local (W3) y visita a domicilio (W3b) del cliente

1. **Cita:** turnos de 30 min.
2. **Visita:** franja **mañana 9:00–12:00** o **tarde 15:00–17:00**, más la dirección (guardada u otra).
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
8. **Mis pedidos del cliente (W6c):** cada tarjeta muestra su estado y "qué le toca" al cliente. La visita a domicilio tiene sus estados (Visita programada / No lo encontramos / Preparando cotización).

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
   - cuando existan: recojo, entrega, retiro en el taller y daño oculto (V2);
   - en W10 se listan: Citas y visitas · Recojo del mueble en su casa · Entrega del pedido · Retiro en el taller · Daño oculto (V2).
2. **Informativos por correo** (el cliente puede apagarlos):
   - "Recibimos su solicitud" y "Recibimos sus fotos";
   - luego, el avance del pedido, la cotización y los pagos;
   - es la preferencia que ya se elige al registrarse ("Quiero recibir avisos de mis pedidos por correo").
3. **Recordatorios y novedades del taller:** por ahora **solo se guarda la preferencia**, para promociones o novedades a futuro. Viene **apagado**. Los recordatorios de una cita **no** van aquí: son obligatorios.
4. **Campana:** dentro de GARWEB (W11) el cliente **siempre ve todos** sus avisos; los interruptores solo afectan al correo.

### E.4 Seguridad
1. **Cambiar contraseña:** en una **pantalla aparte con el estilo de G1**:
   - pide la contraseña actual;
   - cierra las sesiones en otros equipos (`version_sesion`);
   - avisa por correo y en la campana: "Su contraseña cambió".
2. **Último ingreso:** solo fecha y hora ("Último ingreso: hoy 09:12"), sacado de la bitácora. Es el ingreso anterior al actual.
3. **Desactivar la cuenta:** no está en W10; lo hará el Administrador en A17 (H02).

## F. Pendientes por confirmar con el dueño (vía Alejandro)
- Duración real de la cita para ver telas (prototipo: 30 min).
- Límite de distancia para la visita a domicilio gratuita.
- Tarifas reales de transporte por tamaño de carga.
- Qué pasa si la tela que trae el cliente no alcanza (propuesta: recotización V2).
- Si "¿Qué tela busca?" es obligatorio u opcional (y si "¿Qué tela trae?" es opcional).
- **Cupo de recojos por franja** (cuántos caben en la mañana y en la tarde). Mientras no se confirme, el sistema no limita el cupo.
- Fotos y códigos reales de las telas: están en los libros del dueño; por ahora el catálogo usa datos de prueba.

## G. Por decidir en el equipo (reunión del 08/11)
- A3: quitar «Pedírselas por enlace» y el estado «Esperando fotos».
- A3: «¿Por dónde se comunicó?» como lista desplegable en vez de tarjetas.
- Menú: si «Cotizaciones» se junta con «Solicitudes».
- Supabase desde ahora o recién en Tesis 2 (hoy se trabaja en local con Docker).
