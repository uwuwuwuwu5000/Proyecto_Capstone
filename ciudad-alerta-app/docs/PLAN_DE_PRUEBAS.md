# Plan de pruebas — Ciudad Alerta

Batería de casos de prueba para el prototipo funcional. Cubre autenticación, seguridad,
reporte ciudadano, mapa, detección de coincidencias, confirmación comunitaria, seguimiento,
enrutamiento y comportamiento en dispositivo.

---

## Convenciones

**Identificador.** `CP-<módulo>-<número>`.

**Prioridad.** `A` bloquea la entrega · `B` afecta la experiencia · `C` mejora deseable.

**Tipo.** `F` funcional · `S` seguridad · `NF` no funcional · `UX` usabilidad · `I` integración.

**Resultado.** Cada ejecución se registra como Aprobado, Fallido o Bloqueado, con fecha,
responsable y evidencia (captura o registro de consola).

### Entorno de pruebas

| Entorno | Descripción |
|---|---|
| E1 | Navegador de escritorio, `ionic serve`, Chrome |
| E2 | Emulador Android, APK debug |
| E3 | Dispositivo físico Android, APK debug |
| E4 | Consola de Firebase (Authentication, Firestore, Rules Playground) |

### Datos de prueba

| Cuenta | Correo | Rol | Uso |
|---|---|---|---|
| U1 | ciudadano1@prueba.cl | ciudadano | Autor de reportes |
| U2 | ciudadano2@prueba.cl | ciudadano | Confirmaciones |
| U3 | operador@prueba.cl | operador | Gestión de estados |
| U4 | correo real del equipo | ciudadano | Recuperación de contraseña |

Antes de comenzar, eliminar los reportes creados en sprints anteriores: los documentos sin
los campos `geohash` y `organismo` quedan fuera de las consultas del mapa y distorsionan los
resultados.

---

## 1. Registro de usuario (CA-48)

| ID | Precondición | Pasos | Resultado esperado | Pri | Tipo |
|---|---|---|---|---|---|
| CP-REG-01 | Sin sesión | Registrar con correo nuevo y contraseña de 8 caracteres | Cuenta creada, redirige a Inicio | A | F |
| CP-REG-02 | CP-REG-01 ejecutado | Revisar Authentication en consola | El usuario aparece con su correo | A | I |
| CP-REG-03 | CP-REG-01 ejecutado | Revisar `users/{uid}` en Firestore | Documento con `trustLevel: 0`, `role: ciudadano`, `validatedReports: 0` | A | I |
| CP-REG-04 | Sin sesión | Registrar con correo ya existente | Mensaje "Ese correo ya tiene una cuenta" | A | F |
| CP-REG-05 | Sin sesión | Escribir `correo@` y salir del campo | Error de formato, botón deshabilitado | A | F |
| CP-REG-06 | Sin sesión | Escribir `correo sin arroba.cl` | Error de formato | A | F |
| CP-REG-07 | Sin sesión | Contraseña de 5 caracteres | Error de longitud mínima | A | F |
| CP-REG-08 | Sin sesión | Contraseñas que no coinciden | Mensaje "Las contraseñas no coinciden" | A | F |
| CP-REG-09 | Sin sesión | Nombre para mostrar de 2 caracteres | Error "Usa al menos 3 caracteres" | B | F |
| CP-REG-10 | Sin sesión | Dejar todos los campos vacíos y tocar el botón | Botón deshabilitado, sin envío | A | F |
| CP-REG-11 | Sin sesión | Correo con mayúsculas `Rodrigo@Prueba.CL` | Se normaliza a minúsculas al guardar | B | F |
| CP-REG-12 | Sin sesión | Correo con espacios al inicio y al final | Se recorta y el registro funciona | B | F |
| CP-REG-13 | Sin sesión | Registrar sin nombre para mostrar (campo mínimo válido) | Se usa la parte previa a la arroba | C | F |
| CP-REG-14 | Modo avión | Intentar registrar | Mensaje de error de conexión, sin bloqueo de la app | A | F |
| CP-REG-15 | Sin sesión | Contraseña de 100 caracteres | Se acepta, el inicio de sesión posterior funciona | C | F |
| CP-REG-16 | Sin sesión | Nombre con emojis y tildes | Se guarda y se muestra correctamente | C | F |
| CP-REG-17 | Durante el registro | Observar el indicador de carga | Aparece y desaparece; no queda colgado | B | UX |
| CP-REG-18 | Proveedor deshabilitado en consola | Intentar registrar | Mensaje sobre el proveedor no habilitado | B | F |

---

## 2. Inicio de sesión (CA-49)

| ID | Precondición | Pasos | Resultado esperado | Pri | Tipo |
|---|---|---|---|---|---|
| CP-LOG-01 | U1 existe | Ingresar credenciales correctas | Entra a Inicio y muestra el correo | A | F |
| CP-LOG-02 | U1 existe | Contraseña incorrecta | "Correo o contraseña incorrectos" | A | F |
| CP-LOG-03 | Sin sesión | Correo inexistente | Mensaje de credenciales inválidas, sin revelar si el correo existe | A | S |
| CP-LOG-04 | Sin sesión | Campos vacíos | Botón deshabilitado | A | F |
| CP-LOG-05 | Sin sesión | Correo mal formado | Error de formato antes de enviar | A | F |
| CP-LOG-06 | Sin sesión | Seis intentos fallidos seguidos | Mensaje de demasiados intentos | B | S |
| CP-LOG-07 | Modo avión | Intentar iniciar sesión | Error de conexión controlado | A | F |
| CP-LOG-08 | Sin sesión | Alternar entre las pestañas Iniciar sesión y Crear cuenta | Los formularios cambian y los errores se limpian | B | UX |
| CP-LOG-09 | Sin sesión | Usar el botón de mostrar contraseña | Alterna entre texto y puntos | C | UX |
| CP-LOG-10 | Usuario deshabilitado en consola | Intentar entrar | Mensaje de cuenta deshabilitada | B | S |
| CP-LOG-11 | Con sesión activa | Navegar manualmente a `/login` | Redirige a Inicio (guestGuard) | A | F |
| CP-LOG-12 | Sin sesión | Correo con mayúsculas | Inicia sesión igual | B | F |

---

## 3. Recuperación de contraseña (CA-75)

| ID | Precondición | Pasos | Resultado esperado | Pri | Tipo |
|---|---|---|---|---|---|
| CP-REC-01 | U4 con correo real | Abrir el diálogo y enviar | Mensaje de envío y correo recibido | A | F |
| CP-REC-02 | CP-REC-01 ejecutado | Abrir el enlace y fijar contraseña nueva | Permite iniciar sesión con la nueva | A | I |
| CP-REC-03 | CP-REC-02 ejecutado | Intentar entrar con la contraseña antigua | Falla con credenciales inválidas | A | S |
| CP-REC-04 | Sin sesión | Enviar con el campo vacío | Aviso de correo inválido, el diálogo no se cierra | A | F |
| CP-REC-05 | Sin sesión | Enviar con `abc` | Aviso de formato inválido | A | F |
| CP-REC-06 | Sin sesión | Correo no registrado | No revela si existe o no | B | S |
| CP-REC-07 | Correo escrito en el formulario | Abrir el diálogo | El campo llega precargado | C | UX |
| CP-REC-08 | Diálogo abierto | Pulsar Cancelar | Se cierra sin enviar nada | B | UX |
| CP-REC-09 | Modo avión | Enviar | Error de conexión controlado | B | F |
| CP-REC-10 | CP-REC-01 ejecutado | Usar el mismo enlace dos veces | El segundo uso es rechazado por Firebase | C | S |

---

## 4. Sesión y control de acceso (CA-50, CA-77)

| ID | Precondición | Pasos | Resultado esperado | Pri | Tipo |
|---|---|---|---|---|---|
| CP-SES-01 | Sin sesión | Navegar a `/home` por URL | Redirige a `/login` | A | S |
| CP-SES-02 | Sin sesión | Navegar a `/report-new` por URL | Redirige a `/login` | A | S |
| CP-SES-03 | Sin sesión | Navegar a `/map` por URL | Redirige a `/login` | A | S |
| CP-SES-04 | Sin sesión | Navegar a `/report/abc123` por URL | Redirige a `/login` | A | S |
| CP-SES-05 | Con sesión | Recargar la página | Permanece autenticado | A | F |
| CP-SES-06 | Con sesión en E3 | Cerrar la app por completo y reabrirla | Entra directo a Inicio | A | F |
| CP-SES-07 | Con sesión | Cerrar sesión y confirmar | Vuelve a `/login` | A | F |
| CP-SES-08 | CP-SES-07 ejecutado | Usar el botón atrás del teléfono | No regresa a Inicio | A | S |
| CP-SES-09 | Con sesión | Cerrar sesión y cancelar en el diálogo | La sesión se mantiene | B | UX |
| CP-SES-10 | Con sesión | Eliminar el usuario desde la consola y operar | Error controlado, sin caída | C | S |
| CP-SES-11 | Sin sesión | Navegar a una ruta inexistente | Redirige según el wildcard, sin pantalla en blanco | B | F |
| CP-SES-12 | Con sesión en E3 | Dejar la app en segundo plano 30 min y volver | La sesión sigue activa | B | NF |

---

## 5. Reglas de seguridad de Firestore (CA-79)

Ejecutar en el Rules Playground de la consola (E4).

| ID | Operación simulada | Resultado esperado | Pri | Tipo |
|---|---|---|---|---|
| CP-SEC-01 | Lectura de `users/{otroUid}` autenticado como U1 | Denegada | A | S |
| CP-SEC-02 | Lectura de `users/{propioUid}` | Permitida | A | S |
| CP-SEC-03 | Listado completo de `users` | Denegado | A | S |
| CP-SEC-04 | Lectura de cualquier documento sin autenticar | Denegada | A | S |
| CP-SEC-05 | Crear `users/{uid}` con `trustLevel: 5` | Denegada | A | S |
| CP-SEC-06 | Crear `users/{uid}` con `role: admin` | Denegada | A | S |
| CP-SEC-07 | Actualizar el propio `trustLevel` | Denegada | A | S |
| CP-SEC-08 | Actualizar el propio `displayName` | Permitida | B | S |
| CP-SEC-09 | Eliminar el propio documento de usuario | Denegada | B | S |
| CP-SEC-10 | Crear reporte con `uid` de otro usuario | Denegada | A | S |
| CP-SEC-11 | Crear reporte con descripción de 5 caracteres | Denegada | A | S |
| CP-SEC-12 | Crear reporte con descripción de 600 caracteres | Denegada | A | S |
| CP-SEC-13 | Crear reporte con `estado: resuelto` | Denegada | A | S |
| CP-SEC-14 | Crear reporte con `confirmaciones: 99` | Denegada | A | S |
| CP-SEC-15 | Crear reporte con categoría inventada | Denegada | A | S |
| CP-SEC-16 | Crear reporte con `lat: 200` | Denegada | A | S |
| CP-SEC-17 | Crear reporte sin `geohash` | Denegada | A | S |
| CP-SEC-18 | Crear reporte con `organismo.id` inexistente | Denegada | A | S |
| CP-SEC-19 | Actualizar la descripción de un reporte propio | Denegada | A | S |
| CP-SEC-20 | Eliminar un reporte propio | Denegada | B | S |
| CP-SEC-21 | Cambiar estado siendo `ciudadano` | Denegada | A | S |
| CP-SEC-22 | Cambiar estado siendo `operador` con transición válida | Permitida | A | S |
| CP-SEC-23 | Cambiar de `reportado` a `resuelto` siendo operador | Denegada (transición inválida) | A | S |
| CP-SEC-24 | Cambiar estado y descripción a la vez siendo operador | Denegada | A | S |
| CP-SEC-25 | Crear confirmación con `uid` ajeno | Denegada | A | S |
| CP-SEC-26 | Crear confirmación con `createdAt` manipulado | Denegada | A | S |
| CP-SEC-27 | Actualizar una confirmación existente | Denegada | A | S |
| CP-SEC-28 | Eliminar una confirmación | Denegada | B | S |
| CP-SEC-29 | Crear entrada en `statusHistory` siendo ciudadano | Denegada | A | S |
| CP-SEC-30 | Modificar una entrada de `statusHistory` | Denegada | A | S |
| CP-SEC-31 | Crear foto en `reportPhotos` con `ownerUid` ajeno | Denegada | A | S |
| CP-SEC-32 | Crear foto con `mimeType: application/pdf` | Denegada | A | S |
| CP-SEC-33 | Escribir en una colección no declarada | Denegada | A | S |

---

## 6. Fotografía del reporte

| ID | Precondición | Pasos | Resultado esperado | Pri | Tipo |
|---|---|---|---|---|---|
| CP-FOT-01 | E3, sesión activa | Tomar fotografía con la cámara | Se muestra la vista previa | A | F |
| CP-FOT-02 | E3 | Elegir imagen de la galería | Se muestra la vista previa | A | F |
| CP-FOT-03 | CP-FOT-01 ejecutado | Revisar el pie de la vista previa | Muestra dimensiones y peso en KB | B | F |
| CP-FOT-04 | Foto cargada | Pulsar Cambiar | Permite capturar otra y reemplaza la anterior | A | F |
| CP-FOT-05 | Foto cargada | Pulsar Quitar y confirmar | La vista previa desaparece | A | F |
| CP-FOT-06 | Foto cargada | Pulsar Quitar y cancelar | La fotografía se conserva | B | UX |
| CP-FOT-07 | E3 | Abrir la cámara y cancelar | Vuelve al formulario sin mensaje de error | B | UX |
| CP-FOT-08 | E1 | Seleccionar un archivo PDF | Mensaje "El archivo debe ser una imagen JPG, PNG o WEBP" | A | F |
| CP-FOT-09 | E1 | Seleccionar un archivo de texto renombrado a `.jpg` | Se rechaza al no poder decodificarse | A | S |
| CP-FOT-10 | E3 | Fotografía de 12 MP | Se comprime por debajo de 200 KB | A | NF |
| CP-FOT-11 | CP-FOT-10 ejecutado | Verificar el lado mayor | No supera 1024 px | B | NF |
| CP-FOT-12 | E3, permiso denegado | Intentar tomar fotografía | Mensaje que indica activar el permiso en ajustes | A | F |
| CP-FOT-13 | Reporte enviado con foto | Revisar `reportPhotos/{reportId}` | Documento con `dataUrl`, `mimeType` y `ownerUid` | A | I |
| CP-FOT-14 | Reporte enviado con foto | Revisar el campo `foto` del reporte | Contiene `kind`, `path`, `mimeType` y `sizeBytes` | A | I |
| CP-FOT-15 | Reporte enviado sin foto | Revisar el documento | `foto` es `null` y el reporte es válido | A | F |
| CP-FOT-16 | E3 | Tomar la foto en horizontal | Se muestra con la orientación correcta | C | UX |
| CP-FOT-17 | E3, almacenamiento lleno | Intentar capturar | Error controlado, sin caída | C | F |
| CP-FOT-18 | Imagen PNG con transparencia | Adjuntarla | Se convierte a JPEG y se acepta | C | F |

---

## 7. Ubicación del reporte (CA-52)

| ID | Precondición | Pasos | Resultado esperado | Pri | Tipo |
|---|---|---|---|---|---|
| CP-UBI-01 | E3, primera vez | Pulsar "Usar mi ubicación actual" | Aparece el diálogo de permiso del sistema | A | F |
| CP-UBI-02 | CP-UBI-01, aceptar | Esperar | Muestra coordenadas, precisión y mapa | A | F |
| CP-UBI-03 | CP-UBI-01, rechazar | Observar | Mensaje comprensible, la app no se cierra | A | F |
| CP-UBI-04 | Permiso denegado antes | Pulsar de nuevo | Mensaje que indica cómo activarlo en ajustes | A | UX |
| CP-UBI-05 | E3, GPS apagado | Pulsar el botón | Mensaje de servicio no disponible | A | F |
| CP-UBI-06 | E3, interior sin señal | Esperar 15 segundos | Mensaje de tiempo agotado | B | F |
| CP-UBI-07 | Ubicación obtenida | Pulsar "Actualizar ubicación" | Recalcula y actualiza el mapa | B | F |
| CP-UBI-08 | Sesión recién iniciada | Abrir la app sin ir a reportar | No se solicita el permiso de ubicación | A | S |
| CP-UBI-09 | Reporte enviado | Revisar Firestore | `ubicacion` con `lat`, `lng` y `accuracy` numéricos | A | I |
| CP-UBI-10 | Reporte enviado | Revisar Firestore | El campo `geohash` existe y no está vacío | A | I |
| CP-UBI-11 | E2 con ubicación simulada | Cambiarla en el emulador y reintentar | Las coordenadas cambian acordes | B | F |
| CP-UBI-12 | Sin ubicación registrada | Intentar enviar el reporte | El botón permanece deshabilitado | A | F |

---

## 8. Descripción y creación del reporte

| ID | Precondición | Pasos | Resultado esperado | Pri | Tipo |
|---|---|---|---|---|---|
| CP-DES-01 | Formulario abierto | Escribir 9 caracteres | Error de longitud mínima | A | F |
| CP-DES-02 | Formulario abierto | Escribir exactamente 10 caracteres | Se acepta | A | F |
| CP-DES-03 | Formulario abierto | Intentar escribir 501 caracteres | El campo corta en 500 | A | F |
| CP-DES-04 | Formulario abierto | Observar el contador | Refleja los caracteres usados | B | UX |
| CP-DES-05 | Formulario abierto | Escribir solo espacios | Se rechaza al recortarse | A | F |
| CP-DES-06 | Formulario abierto | Escribir con tildes, ñ y emojis | Se guarda y se muestra idéntico | B | F |
| CP-DES-07 | Formulario abierto | Escribir un salto de línea | Se conserva en el detalle | C | F |
| CP-DES-08 | Formulario completo | Enviar | Mensaje de éxito y vuelta a Inicio | A | F |
| CP-DES-09 | CP-DES-08 ejecutado | Revisar Firestore | Campo `descripcion` con el texto exacto | A | I |
| CP-DES-10 | CP-DES-08 ejecutado | Revisar Firestore | `estado: reportado`, `confirmaciones: 0` | A | I |
| CP-DES-11 | CP-DES-08 ejecutado | Volver a abrir el formulario | Los campos están limpios | B | UX |
| CP-DES-12 | Modo avión | Enviar el reporte | Error de conexión, sin documento creado | A | F |
| CP-DES-13 | Con foto, modo avión | Enviar | No queda fotografía huérfana en `reportPhotos` | A | I |
| CP-DES-14 | Formulario abierto | Cambiar la categoría varias veces | El valor se refleja al guardar | B | F |
| CP-DES-15 | Envío en curso | Pulsar Enviar repetidamente | El indicador bloquea; se crea un solo reporte | A | F |
| CP-DES-16 | Sesión expirada | Enviar | Mensaje sobre volver a iniciar sesión | B | F |
| CP-DES-17 | Reporte enviado | Revisar el campo `organismo` | Corresponde a la categoría elegida | A | I |
| CP-DES-18 | Categoría Fuga de agua | Enviar y revisar | Organismo tipo `empresa_sanitaria` | B | I |
| CP-DES-19 | Categoría Luminaria | Enviar y revisar | Organismo tipo `empresa_electrica` | B | I |
| CP-DES-20 | Categoría Otro | Enviar y revisar | Organismo OIRS Municipal | C | I |

---

## 9. Componente de mapa (CA-51)

| ID | Precondición | Pasos | Resultado esperado | Pri | Tipo |
|---|---|---|---|---|---|
| CP-MAP-01 | Ubicación obtenida | Observar el mapa | Se dibuja completo, sin mosaico descolocado | A | F |
| CP-MAP-02 | Mapa visible | Buscar la atribución | Aparece el crédito a OpenStreetMap | A | S |
| CP-MAP-03 | Mapa visible | Verificar el marcador | Cae en las coordenadas indicadas | A | F |
| CP-MAP-04 | Modo avión | Abrir una pantalla con mapa | Mensaje de fallo con las coordenadas y botón Reintentar | A | F |
| CP-MAP-05 | CP-MAP-04 ejecutado | Restaurar red y pulsar Reintentar | El mapa carga correctamente | A | F |
| CP-MAP-06 | Detalle de incidencia | Abrir la pantalla | El mapa se dibuja aunque el contenedor nazca con altura cero | A | F |
| CP-MAP-07 | Mapa en vista previa | Intentar arrastrarlo | No se mueve (modo no interactivo) | B | UX |
| CP-MAP-08 | Mapa de incidencias | Arrastrar y hacer zoom | Responde con normalidad | B | UX |
| CP-MAP-09 | Página Cerca de mí | Observar el círculo | Coincide con el radio seleccionado | B | F |
| CP-MAP-10 | Navegar entre pantallas con mapa | Repetir diez veces | Sin fugas de memoria ni mapas duplicados | B | NF |
| CP-MAP-11 | Conexión muy lenta | Abrir el mapa | Muestra el estado de carga y no queda en blanco | B | NF |
| CP-MAP-12 | Mapa con marcadores | Tocar un marcador | Abre el detalle correspondiente | A | F |

---

## 10. Detección de coincidencias (HU-20)

| ID | Precondición | Pasos | Resultado esperado | Pri | Tipo |
|---|---|---|---|---|---|
| CP-DUP-01 | Un reporte reciente cerca, misma categoría | Obtener ubicación en un reporte nuevo | Aparece la tarjeta de coincidencia | A | F |
| CP-DUP-02 | CP-DUP-01 | Revisar los motivos | Indican distancia y antigüedad | A | F |
| CP-DUP-03 | CP-DUP-01 | Cambiar a otra categoría | La coincidencia desaparece | A | F |
| CP-DUP-04 | Reporte a más de 150 m | Repetir | No se propone | A | F |
| CP-DUP-05 | Reporte de hace más de 72 h | Repetir | No se propone | A | F |
| CP-DUP-06 | Reporte marcado `resuelto` | Repetir | No se propone | A | F |
| CP-DUP-07 | Reporte marcado `cerrado` | Repetir | No se propone | A | F |
| CP-DUP-08 | Zona sin reportes | Obtener ubicación | No aparece nada y la consola queda limpia | A | F |
| CP-DUP-09 | Coincidencia visible | Observar el botón de envío | Sigue habilitado | A | F |
| CP-DUP-10 | Coincidencia visible | Enviar el reporte igualmente | Se crea sin restricciones | A | F |
| CP-DUP-11 | Cuatro reportes cercanos | Obtener ubicación | Se muestran como máximo tres | B | F |
| CP-DUP-12 | Varias coincidencias | Revisar el orden | De mayor a menor puntaje | B | F |
| CP-DUP-13 | Foto muy similar a la del reporte previo | Comparar el puntaje | Superior al del mismo caso sin foto | B | NF |
| CP-DUP-14 | Modo avión al tomar la foto | Continuar | El modelo no carga y la detección sigue por ubicación | A | F |
| CP-DUP-15 | Reporte previo sin foto | Detectar | Se propone igual, con puntaje redistribuido | B | F |
| CP-DUP-16 | Reporte enviado con foto | Revisar `embedding` en Firestore | Arreglo numérico presente | B | I |
| CP-DUP-17 | Primera detección de la sesión | Medir el tiempo | El modelo carga y responde en un plazo tolerable | B | NF |
| CP-DUP-18 | Segunda detección | Medir el tiempo | Notablemente más rápida (modelo en caché) | C | NF |

---

## 11. Confirmación comunitaria (HU-21/22)

| ID | Precondición | Pasos | Resultado esperado | Pri | Tipo |
|---|---|---|---|---|---|
| CP-CON-01 | U2, reporte de U1 | Confirmar desde el detalle | Mensaje de confirmación registrada | A | F |
| CP-CON-02 | CP-CON-01 | Revisar Firestore | Documento en `confirmations/{uidU2}` | A | I |
| CP-CON-03 | CP-CON-02 | Revisar el documento | Contiene `uid`, `reportId` y `createdAt` | A | I |
| CP-CON-04 | CP-CON-01 | Intentar confirmar otra vez | Mensaje "Ya confirmaste este reporte" | A | F |
| CP-CON-05 | CP-CON-01 | Recargar el detalle | Se muestra la condición de ya confirmado | A | F |
| CP-CON-06 | U1 en su propio reporte | Abrir el detalle | Mensaje que impide autoconfirmarse | A | F |
| CP-CON-07 | CP-CON-01 | Revisar el contador | Aumenta en uno | A | F |
| CP-CON-08 | Tres usuarios confirman | Revisar el contador | Muestra tres | B | F |
| CP-CON-09 | Modo avión | Confirmar | Mensaje de error de conexión | B | F |
| CP-CON-10 | Desde la tarjeta de coincidencia | Confirmar | Se registra y vuelve a Inicio | A | F |
| CP-CON-11 | Sin sesión, vía consola | Intentar crear confirmación | Rechazada por las reglas | A | S |
| CP-CON-12 | Confirmación existente | Intentar modificarla desde la consola | Rechazada | A | S |

---

## 12. Mapa de incidencias y Cerca de mí (HU-25)

| ID | Precondición | Pasos | Resultado esperado | Pri | Tipo |
|---|---|---|---|---|---|
| CP-INC-01 | Varios reportes en el sector | Abrir el mapa | Aparecen los marcadores | A | F |
| CP-INC-02 | Reportes en distintos estados | Observar los colores | Se distinguen entre sí | A | F |
| CP-INC-03 | Mapa abierto | Filtrar por una categoría | Solo quedan los de esa categoría | A | F |
| CP-INC-04 | Mapa abierto | Filtrar por estado | Solo quedan los de ese estado | A | F |
| CP-INC-05 | Mapa abierto | Combinar ambos filtros | Se aplican los dos | B | F |
| CP-INC-06 | Filtros sin resultados | Observar | Mensaje explicativo, sin error | A | F |
| CP-INC-07 | Mapa abierto | Volver a Todas | Reaparecen todos los marcadores | B | F |
| CP-INC-08 | Mapa abierto | Pulsar el botón de retroceso | Vuelve a Inicio | A | UX |
| CP-INC-09 | Cerca de mí | Seleccionar 500 m | Solo reportes dentro de ese radio | A | F |
| CP-INC-10 | Cerca de mí | Cambiar a 5 km | Aparecen más resultados | A | F |
| CP-INC-11 | Cerca de mí | Revisar el orden | De menor a mayor distancia | A | F |
| CP-INC-12 | Cerca de mí | Revisar las distancias | En metros bajo 1 km y en km sobre ese valor | B | UX |
| CP-INC-13 | Cerca de mí, radio 500 m sin datos | Observar | Sugiere ampliar el radio | B | UX |
| CP-INC-14 | Cerca de mí | Tocar una tarjeta | Abre el detalle correcto | A | F |
| CP-INC-15 | Reporte antiguo sin `geohash` | Abrir Cerca de mí | No aparece ahí (busca por geohash); en el mapa por región sí. `scripts/ubicaciones-reportes.mjs` lo marca y `--aplicar` le pone geohash | B | I |
| CP-INC-16 | Cincuenta reportes en el sector | Abrir el mapa | Carga sin bloquear la interfaz | B | NF |
| CP-INC-17 | Mapa abierto | Revisar el tráfico de red | No se descargan fotografías | A | NF |
| CP-INC-18 | Permiso de ubicación denegado | Abrir el mapa | Mensaje controlado, sin caída | A | F |
| CP-INC-19 (MS8) | Reportes creados en Maipú, Cerrillos y Estación Central | Abrir el mapa → Categoría: Todas → Estado: Todos | Cada incidencia aparece en sus coordenadas registradas; ninguna se concentra en Maipú ni en un punto predeterminado | A | F |
| CP-INC-20 (MS9) | Varias incidencias con coordenadas iguales o a menos de 30 m | Abrir el mapa | Se ve un círculo con el total; al tocarlo el mapa se acerca y se separan; si siguen juntas con el acercamiento máximo, se abre la lista con «Ver detalle» de cada una | A | F |
| CP-INC-21 | Usuario con ubicación en la Región Metropolitana | Abrir el mapa | El selector dice «Mi región · Metropolitana de Santiago» y aparecen todas las incidencias de la región, no solo las cercanas | A | F |
| CP-INC-22 | Mapa abierto | Elegir Valparaíso en «Región» | Aparecen solo las incidencias de Valparaíso y el mapa se ajusta a ellas | A | F |
| CP-INC-23 | Región sin reportes | Elegirla | Mensaje «No hay incidencias en …» y el mapa muestra la región completa | B | UX |
| CP-INC-24 | Permiso de ubicación denegado | Abrir el mapa y elegir una región | Las incidencias de esa región se ven igual | A | F |
| CP-INC-25 | Reporte antiguo con comuna y sin campo `region` | Abrir el mapa de su región | Aparece (se busca también por comuna) | B | I |
| CP-INC-26 | Clave de cuenta de servicio configurada | `node scripts/ubicaciones-reportes.mjs` | Lista reportId, comuna, latitud y longitud de todos los reportes; agrupa los que están en el mismo punto y marca coordenadas faltantes, invertidas o por defecto | B | I |
| CP-INC-27 | Cualquier lista de selección o diálogo | Abrirla | El botón «Cancelar» se ve en rojo | B | UX |

---

## 13. Detalle de la incidencia (HU-26)

| ID | Precondición | Pasos | Resultado esperado | Pri | Tipo |
|---|---|---|---|---|---|
| CP-DET-01 | Reporte con foto | Abrir el detalle | Muestra estado, fecha, descripción, categoría y responsable | A | F |
| CP-DET-02 | CP-DET-01 | Observar el mapa | Centrado en la ubicación del reporte | A | F |
| CP-DET-03 | CP-DET-01 | Pulsar "Ver fotografía" | Se carga y se muestra | A | F |
| CP-DET-04 | CP-DET-01 | Revisar el tráfico antes de pulsar | La imagen no se descargó aún | A | NF |
| CP-DET-05 | Foto eliminada de Firestore | Pulsar "Ver fotografía" | Mensaje de no disponible; el resto funciona | A | F |
| CP-DET-06 | Reporte sin foto | Abrir el detalle | Indica que se envió sin fotografía | B | F |
| CP-DET-07 | Reporte antiguo sin `organismo` | Abrir el detalle | Muestra "Sin asignar", sin romper la vista | B | F |
| CP-DET-08 | Id inexistente en la URL | Abrir | Mensaje de incidencia no encontrada | A | F |
| CP-DET-09 | Detalle abierto | Pulsar retroceso | Vuelve a la pantalla anterior | A | UX |
| CP-DET-10 | Reporte con confirmaciones | Abrir el detalle | El contador coincide con la subcolección | A | I |
| CP-DET-11 | Reporte con historial | Abrir el detalle | Se muestra la sección Seguimiento | B | F |
| CP-DET-12 | Descripción de 500 caracteres | Abrir el detalle | Se muestra completa y legible | C | UX |

---

## 14. Historial del usuario (HU-27)

| ID | Precondición | Pasos | Resultado esperado | Pri | Tipo |
|---|---|---|---|---|---|
| CP-HIS-01 | U1 con reportes | Abrir Mis reportes | Aparecen solo los suyos | A | S |
| CP-HIS-02 | CP-HIS-01 | Revisar el orden | Del más reciente al más antiguo | A | F |
| CP-HIS-03 | CP-HIS-01 | Revisar cada tarjeta | Categoría, fecha, estado y confirmaciones | A | F |
| CP-HIS-04 | Usuario sin reportes | Abrir Mis reportes | Estado vacío con acceso a crear el primero | A | UX |
| CP-HIS-05 | Doce reportes | Abrir la pantalla | Se muestran diez y aparece "Ver anteriores" | A | F |
| CP-HIS-06 | CP-HIS-05 | Pulsar "Ver anteriores" | Se agregan los siguientes sin repetir | A | F |
| CP-HIS-07 | Exactamente diez reportes | Abrir | No se ofrece paginación innecesaria | B | F |
| CP-HIS-08 | CP-HIS-01 | Tocar una tarjeta | Abre el detalle correcto | A | F |
| CP-HIS-09 | U2 autenticado | Abrir Mis reportes | No ve los reportes de U1 | A | S |
| CP-HIS-10 | Índice no desplegado | Abrir la pantalla | Error controlado con mensaje | B | I |
| CP-HIS-11 | Crear un reporte y volver | Abrir Mis reportes | Aparece el recién creado | A | F |

---

## 15. Enrutamiento y estados (HU-28)

| ID | Precondición | Pasos | Resultado esperado | Pri | Tipo |
|---|---|---|---|---|---|
| CP-EST-01 | U3 con rol operador | Abrir un detalle | Aparece la sección Gestión | A | F |
| CP-EST-02 | U1 ciudadano | Abrir el mismo detalle | No aparece la sección Gestión | A | S |
| CP-EST-03 | U3, reporte en `reportado` | Ver las opciones | En revisión, Derivado y Cerrado | A | F |
| CP-EST-04 | U3, reporte en `reportado` | Marcar En revisión con comentario | Estado actualizado y registro en el historial | A | F |
| CP-EST-05 | CP-EST-04 | Revisar `statusHistory` | Documento con `desde`, `hacia`, `autorUid` y fecha | A | I |
| CP-EST-06 | U3, reporte en `en_revision` | Ver las opciones | Derivado y Cerrado; no aparece Reportado | A | F |
| CP-EST-07 | U3, reporte en `cerrado` | Abrir el detalle | Sin opciones de transición | A | F |
| CP-EST-08 | U3 | Cambiar estado sin comentario | Se acepta igual | B | F |
| CP-EST-09 | U3, modo avión | Cambiar estado | Error controlado y estado sin cambios | B | F |
| CP-EST-10 | Rol cambiado a ciudadano en consola | Intentar cambiar estado | Rechazo por reglas | A | S |
| CP-EST-11 | Varios cambios sucesivos | Revisar el historial | Todos los movimientos en orden cronológico | B | F |
| CP-EST-12 | CP-EST-04 | Revisar el documento del reporte | Solo cambiaron `estado` y `updatedAt` (al resolver o cerrar, además los campos de CP-EST-15 y CP-EST-16) | A | S |
| CP-EST-13 | U3 | Cancelar el diálogo de cambio | No se modifica nada | B | UX |
| CP-EST-14 | U3, reporte asignado en `en_proceso` | Marcar Resuelto | El detalle muestra «Resolución: Resuelto en …» (F12) | A | F |
| CP-EST-15 | CP-EST-14 | Revisar el documento en la consola | `resueltoAt` con la hora del servidor y `tiempoResolucionMs` ≈ ahora − `createdAt` | A | I |
| CP-EST-16 | U3, reporte en `en_revision` | Marcar Cerrado | «Resolución: Cerrado sin resolver» y `cerradoSinResolverAt` en el documento | B | F |
| CP-EST-17 | Reporte resuelto antes de la fase 3 (sin `tiempoResolucionMs`) | Abrir el detalle | El tiempo de resolución se deduce del seguimiento | B | F |
| CP-EST-18 | U1 con un reporte resuelto en CP-EST-14 | Abrir Mis reportes | La tarjeta dice «Resuelto en …» | B | F |
| CP-EST-19 | Reporte con al menos un cambio de estado | Abrir el detalle | «Primera respuesta» con el tiempo hasta el primer cambio | B | F |
| CP-EST-20 | Operador de otra municipalidad | Abrir el detalle de un reporte ajeno | Bloque Gestión con el motivo y sin botones de estado | A | S |

---

## 16. Mi perfil (feedback Sprint 5)

| ID | Precondición | Pasos | Resultado esperado | Pri | Tipo |
|---|---|---|---|---|---|
| CP-PER-01 | U1 autenticado | Inicio → «Mi perfil» | Nombre, correo, tipo de cuenta «Vecino o vecina» y «Miembro desde» | A | F |
| CP-PER-02 | U3 operador | Abrir Mi perfil | Tipo «Operador municipal» y el nombre de su organismo | B | F |
| CP-PER-03 | Cuenta con correo sin verificar | Abrir Mi perfil y pulsar «Enviar correo de verificación» | Mensaje de envío; aparece «Ya lo verifiqué» | A | F |
| CP-PER-04 | CP-PER-03 y enlace abierto | Pulsar «Ya lo verifiqué» | Desaparece el bloque y «Correo verificado: Sí» | A | F |
| CP-PER-05 | Cuenta con correo sin verificar | Abrir el inicio | Recordatorio «Verifica tu correo» que lleva a Mi perfil | B | UX |
| CP-PER-06 | U1 en Mi perfil | Cerrar sesión y confirmar | Vuelve al acceso; el botón atrás no regresa | A | S |
| CP-PER-07 | Cerrar sesión e ingresar con U2 | Abrir Mi perfil | Muestra los datos de U2, no los de U1 | A | S |
| CP-PER-08 | `npm run modulo -- desactivar perfil` | Abrir el inicio | Saludo y «Cerrar sesión» siguen; no aparece «Mi perfil» | B | F |
| CP-PER-09 | U1 | Abrir el inicio | «Hola, <nombre>», sin identificador ni texto de sprints anteriores | C | UX |

---

## 17. Comportamiento en dispositivo Android

| ID | Precondición | Pasos | Resultado esperado | Pri | Tipo |
|---|---|---|---|---|---|
| CP-AND-01 | APK instalado | Abrir la app | Carga sin pantalla en blanco | A | I |
| CP-AND-02 | E3 | Revisar el manifiesto | Permisos de Internet, ubicación y cámara declarados | A | I |
| CP-AND-03 | E3 | Verificar el `applicationId` | `cl.ciudadalerta.app` | A | I |
| CP-AND-04 | E3 | Usar el botón atrás del sistema en cada pantalla | Navega correctamente, sin salidas inesperadas | A | UX |
| CP-AND-05 | E3 | Rotar el dispositivo | La interfaz se adapta | B | UX |
| CP-AND-06 | E3 | Abrir el teclado en los formularios | No tapa los campos activos | B | UX |
| CP-AND-07 | E3 | Cortar la red durante un envío | Mensaje controlado | A | F |
| CP-AND-08 | E3 | Pasar a segundo plano durante la carga del modelo | Al volver, sin bloqueo | B | NF |
| CP-AND-09 | E3 | Revisar `chrome://inspect` tras un recorrido completo | Sin errores de JavaScript | A | NF |
| CP-AND-10 | E3 | Medir el tiempo de arranque en frío | Dentro de lo aceptable para el piloto | B | NF |
| CP-AND-11 | E3 con batería baja | Obtener ubicación | Funciona o informa el modo de ahorro | C | NF |
| CP-AND-12 | E3 | Denegar todos los permisos | La app sigue utilizable en lo que no los requiere | A | F |

---

## 18. Accesibilidad e interfaz

| ID | Verificación | Resultado esperado | Pri | Tipo |
|---|---|---|---|---|
| CP-ACC-01 | Contraste del texto sobre el fondo | Cumple el mínimo AA | B | UX |
| CP-ACC-02 | Contraste de los botones de acción | Cumple el mínimo AA | B | UX |
| CP-ACC-03 | Navegación por teclado en E1 | Todos los controles alcanzables | B | UX |
| CP-ACC-04 | Indicador de foco visible | Presente en cada control | B | UX |
| CP-ACC-05 | Textos alternativos en imágenes | Presentes y descriptivos | B | UX |
| CP-ACC-06 | Mensajes de error con `role="alert"` | Anunciados por el lector de pantalla | B | UX |
| CP-ACC-07 | Tamaño de fuente del sistema al 130% | La interfaz no se rompe | B | UX |
| CP-ACC-08 | Área táctil de los botones | Suficiente para uso con el pulgar | B | UX |
| CP-ACC-09 | Información transmitida solo por color | No existe; hay etiqueta de estado además del color | A | UX |
| CP-ACC-10 | Consistencia de la paleta | Todas las pantallas usan las variables del tema | C | UX |

---

## 19. Regresión mínima antes de cada entrega

Primero las pruebas automáticas (sección 21): `npm run test:una-vez`, `npm run test:comun` y
`npm run diagnostico`. Luego, en este orden; si alguno falla, la entrega se detiene.

| Orden | Caso | Descripción breve |
|---|---|---|
| 1 | CP-REG-01 | Registrar una cuenta nueva |
| 2 | CP-LOG-01 | Iniciar sesión |
| 3 | CP-SES-01 | Verificar el bloqueo de rutas privadas |
| 4 | CP-SES-06 | Persistencia tras cerrar la app |
| 5 | CP-FOT-01 | Adjuntar fotografía |
| 6 | CP-UBI-02 | Obtener ubicación |
| 7 | CP-DES-08 | Enviar un reporte completo |
| 8 | CP-DUP-01 | Detectar una coincidencia |
| 9 | CP-CON-01 | Confirmar un reporte ajeno |
| 10 | CP-INC-01 | Ver el mapa de incidencias |
| 11 | CP-DET-03 | Abrir el detalle y ver la fotografía |
| 12 | CP-HIS-01 | Revisar el historial propio |
| 13 | CP-EST-04 | Cambiar un estado como operador |
| 14 | CP-EST-14 | Resolver un reporte y ver su tiempo de resolución |
| 15 | CP-PER-01 | Abrir Mi perfil |
| 16 | CP-SES-07 | Cerrar sesión |

---

## 20. Trazabilidad

| Historia o tarea | Casos asociados |
|---|---|
| CA-45 / CA-78 Firebase | CP-REG-02, CP-LOG-01, CP-AND-01 |
| CA-48 Registro | CP-REG-01 a CP-REG-18 |
| CA-49 Inicio de sesión | CP-LOG-01 a CP-LOG-12 |
| CA-50 Control de acceso | CP-SES-01 a CP-SES-12 |
| CA-75 Recuperación | CP-REC-01 a CP-REC-10 |
| CA-77 Cierre de sesión | CP-SES-07 a CP-SES-09 |
| CA-79 Reglas | CP-SEC-01 a CP-SEC-33 |
| CA-51 Mapa | CP-MAP-01 a CP-MAP-12 |
| CA-52 Geolocalización | CP-UBI-01 a CP-UBI-12 |
| Fotografía | CP-FOT-01 a CP-FOT-18 |
| Descripción | CP-DES-01 a CP-DES-20 |
| Validación inicial | CP-SEC-11 a CP-SEC-18, CP-DES-09, CP-DES-10 |
| HU-20 Coincidencias | CP-DUP-01 a CP-DUP-18 |
| HU-21/22 Confirmación | CP-CON-01 a CP-CON-12 |
| HU-25 Mapa de incidencias | CP-INC-01 a CP-INC-27 (MS8 = CP-INC-19, MS9 = CP-INC-20) |
| HU-26 Detalle | CP-DET-01 a CP-DET-12 |
| HU-27 Historial | CP-HIS-01 a CP-HIS-11 |
| HU-28 Enrutamiento y estados | CP-EST-01 a CP-EST-13, CP-EST-20 |
| F12 Tiempo de resolución | CP-EST-14 a CP-EST-19 |
| Mi perfil (feedback Sprint 5) | CP-PER-01 a CP-PER-09 |

**Total: 278 casos** — 177 de prioridad A, 84 de prioridad B y 17 de prioridad C.

Los casos de prioridad A constituyen el criterio de aceptación de la entrega: ninguno puede
quedar en estado Fallido. Los de prioridad B se registran como deuda conocida si no alcanzan
a resolverse, y los de prioridad C quedan como observaciones para el informe final.

---

## 21. Pruebas automáticas

Además de los casos manuales, el repositorio trae pruebas que se ejecutan solas. Desde
`ciudad-alerta-app`, en `cmd`:

```cmd
npm run test:una-vez
npm run test:comun
npm run diagnostico
```

| Comando | Qué prueba | Dónde |
|---|---|---|
| `npm run test:una-vez` | Pantallas, componentes, guards y servicios de la app con Vitest (`ng test`), sin red ni proyecto real | `src/**/*.spec.ts`, ayudas en `src/testing/` |
| `npm run test:comun` | Reglas compartidas con el portal: estados, transiciones, confianza, tiempos, territorio, privacidad | `../comun/test/` (antes, una vez: `cd ..\comun` y `npm install`) |
| `npm run diagnostico` | Estructura, imports, rutas, catálogos y módulos contra las reglas | `scripts/diagnostico/` |
| `npm run diagnostico:reglas` | Las reglas en el emulador: 20 controles, 54 bloqueos y 6 brechas conocidas | `scripts/diagnostico/reglas.mjs` |

`npm test` deja Vitest mirando los cambios mientras se programa.

**Qué cubren.** Las pruebas de la app usan Firebase de prueba (`src/testing/firebase-de-prueba.ts`):
Firestore y Storage reales de un proyecto `demo-*` que nunca se conectan, y una sesión
simulada. Por eso prueban la lógica y lo que se ve en pantalla, pero no lo que Firestore
acepta: eso lo prueba `diagnostico:reglas` en el emulador. Entre otras cosas:

- núcleo de módulos: dependencias, rutas y botones repetidos, ranuras, y que al desactivar
  cualquier módulo solo se quejen los que lo requieren;
- guards (`guards/auth-guard.ts`) por sesión y rol;
- coincidencias cercanas (v2-D2 a v2-D5), bloque de gestión (HU-28), tiempos de resolución
  (F12), Mi perfil, inicio por rol y cierre de sesión;
- historial público, catálogo de comunas y regiones del mapa.

Una prueba nueva va junto al archivo que prueba, con el mismo nombre y `.spec.ts`.
