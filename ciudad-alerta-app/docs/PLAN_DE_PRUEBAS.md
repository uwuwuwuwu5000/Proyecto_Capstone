# Plan de pruebas — Ciudad Alerta

Batería de casos de prueba para el prototipo funcional. Cubre autenticación, seguridad,
reporte ciudadano, mapa, detección de coincidencias, confirmación comunitaria, seguimiento,
enrutamiento y comportamiento en dispositivo, y lo nuevo de la versión 1.0 (final de la
sección 16).

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
| E5 | Pruebas de punta a punta: la app compilada con la maqueta en Chromium de 360 px (`npm run e2e`, `docs/GUIA_PRUEBAS.md`) |

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
| CP-SEC-34 | U3 operador cambia su propio `operadorId` | Denegada | A | S |
| CP-SEC-35 | Cuenta de la lista de administradores con el correo sin verificar intenta actuar como admin | Denegada | A | S |
| CP-SEC-36 | Crear un reporte con `createdAt` distinto de la hora del servidor | Denegada | A | S |
| CP-SEC-37 | U1 cambia `autorNombre` de su reporte a «Cuenta eliminada» y nada más | Permitida | A | S |
| CP-SEC-38 | U2 cambia `autorNombre` del reporte de U1, o U1 lo cambia a otro nombre | Denegada | A | S |
| CP-SEC-39 | U1 corrige la descripción de su reporte en «Reportado»; luego, en «En revisión» | Permitida; luego denegada | A | S |
| CP-SEC-40 | U1 retira su reporte (pasa a «Cerrado» con `retiradoPorAutor`) y escribe la entrada del historial | Permitida | A | S |
| CP-SEC-41 | U2 retira el reporte de U1; U1 lo deja en «Resuelto» al retirarlo, o anota un retiro en el historial sin cerrar el reporte | Denegada | A | S |
| CP-SEC-42 | U1 deja sus tickets de soporte con `autorNombre` «Cuenta eliminada» y `autorEmail` vacío, y nada más | Permitida | A | S |
| CP-SEC-43 | U2 lo hace en el ticket de U1; U1 cambia también el asunto, o pone otro nombre | Denegada | A | S |

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

### Protección de la privacidad (difuminado en la nube)

Desde octubre, los rostros y las personas se difuminan en el servicio de privacidad
(`servicio-privacidad/`, en Render), no en el teléfono. El plan gratuito lo duerme tras 15 minutos
sin uso: para CP-PRI-04 hay que esperar ese tiempo sin tomar fotos.

| ID | Precondición | Pasos | Resultado esperado | Pri | Tipo |
|---|---|---|---|---|---|
| CP-PRI-01 | E3, servicio despierto | Tomar una foto con una persona de frente | «Protegiendo la privacidad…» y luego la vista previa con el rostro pixelado y «1 persona difuminada» | A | F |
| CP-PRI-02 | E3 | Foto sin personas | «Sin personas detectadas»; la foto se ve igual | A | F |
| CP-PRI-03 | E3 | Foto con una persona lejana, de cuerpo entero | Se difumina su cabeza | B | F |
| CP-PRI-04 | Servicio dormido | Abrir «Crear un reporte» y tomar una foto enseguida | A los 6 s cambia a «Despertando el servicio de privacidad…»; termina antes de 90 s | A | NF |
| CP-PRI-05 | CP-PRI-04 en curso | Escribir la descripción, cambiar la categoría y pedir la ubicación mientras espera | Todo responde; bajo «Enviar» se lee que la foto está en proceso | A | NF |
| CP-PRI-06 | CP-PRI-04 en curso | Pulsar Cancelar | Se quita la foto con un aviso; el reporte se puede enviar sin foto | A | F |
| CP-PRI-07 | Modo avión | Tomar una foto | Mensaje de conexión con «Reintentar» y «Quitar»; Enviar bloqueado hasta elegir uno | A | F |
| CP-PRI-08 | CP-PRI-07 | Volver a conectar y pulsar Reintentar | Se protege y aparece la vista previa | A | F |
| CP-PRI-09 | Teléfono de gama baja (2 o 3 GB de RAM) | Tomar una foto con la cámara en su máxima resolución | La app no se congela: se puede escribir mientras se protege | A | NF |
| CP-PRI-10 | E1 | Llamar a `POST <url>/v1/proteger` sin `Authorization` | 401 `sin_sesion` | A | S |
| CP-PRI-11 | E1, misma cuenta | Más de 30 fotos en 10 minutos | 429 y el mensaje de esperar | B | S |
| CP-PRI-12 | Reporte enviado con foto | Revisar `privacidad` de la foto en la consola | `aplicada: true` y `version` que empieza con `nube:` | A | I |
| CP-PRI-13 | Reporte enviado con foto | Revisar `embedding` del reporte | 1280 números, o `null` si el servidor está sin MobileNet | B | I |
| CP-PRI-14 | Foto en proceso | Volver atrás a Inicio | No queda nada esperando ni aparecen mensajes | B | UX |
| CP-PRI-15 | E1 | Abrir `<url>/salud` | `"listo": true` y `"rostros": true` | A | I |

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
| CP-UBI-13 | E1 con el permiso de ubicación bloqueado en el navegador | «Usar mi ubicación actual» | «El permiso de ubicación está denegado…», no un error genérico | B | F |

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
| CP-CON-13 | U2, reporte de U1 resuelto, cerrado o retirado | Abrir el detalle | No ofrece confirmar: «Este reporte ya está cerrado» (o que quien lo reportó lo retiró) | A | F |

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
| CP-DET-13 | Dos avisos de reportes distintos | Abrir uno y, sin esperar, volver y abrir el otro | El detalle muestra solo el segundo, con su foto y sus confirmaciones | B | F |

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

### Veredicto del gestor y aviso al autor (sistema de confianza, 4.4)

| ID | Precondición | Pasos | Resultado esperado | Pri | Tipo |
|---|---|---|---|---|---|
| CP-VER-01 | U3, reporte de U1 asignado a U3 | Abrir el detalle | Bajo Gestión, el bloque «Veredicto» con «Es real» y «Es falso» | A | F |
| CP-VER-02 | U1 | Abrir el mismo detalle | No aparece el bloque Veredicto | A | S |
| CP-VER-03 | Operador de otra municipalidad | Abrir el detalle | No aparece el bloque Veredicto | A | S |
| CP-VER-04 | CP-VER-01 | «Es real» y confirmar | «Veredicto registrado…»; el bloque dice «Verificado como real · +10 PC al autor» | A | F |
| CP-VER-05 | CP-VER-04 | Revisar `users/{U1}/confianza/actual` en la consola | `puntosConfianza` +10, `validatedReports` +1 y `ultimoReporteId` del reporte | A | I |
| CP-VER-06 | U3, otro reporte de U1 | «Es falso» sin escribir motivo | El diálogo sigue abierto y pide el motivo | A | F |
| CP-VER-07 | CP-VER-06 | Escribir el motivo y confirmar | «Marcado como falso · −15 PC al autor»; `reportesFalsos` +1 | A | F |
| CP-VER-08 | CP-VER-04 | Cerrar y volver a abrir el detalle | Muestra el resultado, sin botones | A | F |
| CP-VER-09 | Dos gestores con el detalle abierto | Los dos dan veredicto | El segundo recibe «Otro gestor ya dio el veredicto» | B | F |
| CP-VER-10 | Admin con un reporte propio | Abrir el detalle | «Es tu propio reporte: el veredicto lo da otro gestor.» | B | S |
| CP-VER-11 | Reporte creado por una cuenta de operador | Dar un veredicto | Mensaje de que solo se da sobre reportes de vecinos; nada cambia | B | S |
| CP-VER-12 | U1, tras CP-VER-04 | Abrir la campana | Aviso «Verificado como real · +10 puntos de confianza» | A | F |
| CP-VER-13 | U1, tras CP-VER-07 | Abrir la campana | «Marcado como falso · −15 puntos de confianza» y «Motivo: …» | A | F |
| CP-VER-14 | CP-VER-12 | Tocar el aviso | Abre el detalle y el contador de la campana baja | B | F |
| CP-VER-15 | U1, tras CP-VER-04 | Abrir Mi nivel | El veredicto aparece con sus puntos | B | F |
| CP-VER-16 | Autor con 760 PC | Veredicto real | «sin cambio de PC»; el aviso dice que ya tiene el máximo | C | F |
| CP-VER-17 | U3, modo avión | «Es real» y confirmar | «Sin conexión: el veredicto no se guardó»; nada cambia | B | F |

---

## 16. Mi perfil e inicio (feedback Sprint 5)

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
| CP-PER-10 | U1 con reportes en distintos estados | Abrir el inicio | «Tus reportes» con en curso y resueltos, y el último movimiento con su estado y hace cuánto | B | F |
| CP-PER-11 | Cuenta sin reportes | Abrir el inicio y tocar la tarjeta | «Aún no has reportado nada» lleva a crear un reporte | C | UX |
| CP-PER-12 | U3 operador | Abrir el inicio | «Por atender en tu organismo»: abiertos, sin revisar y nuevos hoy coinciden con su bandeja | A | F |
| CP-PER-13 | Cuenta admin | Abrir el inicio | «Por atender» con los conteos de todo el sistema; lleva a la bandeja | B | F |
| CP-PER-14 | U1 ciudadano | Revisar los botones del inicio | «Crear un reporte» destacado; grupos «Explorar» y «Tu cuenta»; sin «Gestión» ni espacio vacío | B | UX |

### Carga del inicio

| ID | Precondición | Pasos | Resultado esperado | Pri | Tipo |
|---|---|---|---|---|---|
| CP-CAR-01 | E3, sesión iniciada, app cerrada | Abrir la app | Pantalla de arranque con la marca y la barra, sin fondo vacío; después el inicio entero | A | NF |
| CP-CAR-02 | CP-CAR-01 | Mirar cómo aparece el inicio | Saludo, tarjetas y botones entran de arriba abajo; ninguna tarjeta aparece después de las demás | A | UX |
| CP-CAR-03 | Modo avión, sesión iniciada | Abrir la app | A los 2,5 s aparece el inicio, sin las tarjetas que necesitan red | B | NF |
| CP-CAR-04 | CP-CAR-02 | Ir a Mis reportes y volver | El inicio no se vuelve a ocultar; las tarjetas se actualizan en su lugar | B | UX |
| CP-CAR-05 | Android con «Quitar animaciones» activado | Abrir la app | El inicio aparece sin movimiento | B | UX |
| CP-CAR-06 | Sin sesión | Abrir la app | La pantalla de arranque da paso al login | B | F |
| CP-CAR-07 | U1 en el inicio | Cerrar sesión e ingresar como U2 | El inicio vuelve a esperar y saluda a U2 | C | F |

### Configuración

| ID | Precondición | Pasos | Resultado esperado | Pri | Tipo |
|---|---|---|---|---|---|
| CP-CFG-01 | U1 | Tocar el engranaje de la barra del inicio; volver y tocar «Configuración» en «Tu cuenta» | Las dos llevan a Configuración | A | F |
| CP-CFG-02 | U1 | Tamaño del texto «Muy grande», cerrar y abrir la app | Los textos crecen en todas las pantallas y siguen así al abrir, sin salto | A | F |
| CP-CFG-03 | CP-CFG-02 | Recorrer el inicio, Crear un reporte y el detalle | Nada se corta ni se superpone | B | UX |
| CP-CFG-04 | U1 | Animaciones «No» y abrir la app | El inicio aparece sin movimiento | B | F |
| CP-CFG-05 | U1 | Al abrir la app: «Crear un reporte»; cerrar y abrir la app | Abre Crear un reporte; «atrás» vuelve al inicio | A | F |
| CP-CFG-06 | Admin eligió «Todas las incidencias» | Entrar como U1 en el mismo teléfono | Se queda en el inicio | B | S |
| CP-CFG-07 | Ahorro de datos activado | Tomar una foto | El pie de la vista previa dice 800 px de lado mayor y pesa menos | A | F |
| CP-CFG-08 | Servicio de fotos dormido | «Comprobar y despertar» | «Despertando…» y luego «Estaba dormido y ya despertó (tardó N s)» | B | F |
| CP-CFG-09 | Modo avión | «Comprobar y despertar» | «No responde. Revisa tu conexión…» | B | F |
| CP-CFG-10 | U1 | «Copiar datos para soporte» y pegar en un mensaje | Versión, módulos y estado del servicio, sin el correo | B | F |
| CP-CFG-11 | U1 con «Mi nivel» ya visitado | «Borrar datos guardados» | La sesión y la configuración siguen igual; Mi nivel vuelve a mostrar la explicación inicial | B | F |
| CP-CFG-12 | U1 ciudadano | Abrir Configuración | No aparece «Para el equipo» | A | S |
| CP-CFG-13 | U3 operador; luego admin | Abrir Configuración | El operador ve «Para el equipo» sin la lista de módulos; el admin la ve | B | F |
| CP-CFG-14 | Varias opciones cambiadas | «Restablecer configuración» | Texto normal, animaciones del teléfono, sin ahorro de datos, abre en el inicio | C | F |
| CP-CFG-15 | Un reporte esperando señal (CP-BOR-03) | «Borrar datos guardados» y volver al inicio | La tarjeta «Reporte por enviar» sigue y el reporte se envía al volver la señal | A | F |

### Versión 1.0: entrega y arranque

| ID | Precondición | Pasos | Resultado esperado | Pri | Tipo |
|---|---|---|---|---|---|
| CP-APK-01 | APK de `npm run apk:final` | Instalar y abrir | El login y Configuración no dicen «Versión de prueba»; la versión es 1.0.0 | A | F |
| CP-APK-02 | Versión de prueba instalada con sesión iniciada | Instalar el APK final encima | Se actualiza sin desinstalar y la sesión sigue | A | I |
| CP-APK-03 | E3 | Mirar el ícono en el escritorio y abrir la app | Pin con «!» sobre fondo oscuro, no la «X» de Capacitor; el arranque nativo usa el mismo fondo | A | UX |
| CP-APK-04 | E3 con respaldo de Google activo | Revisar «Respaldo» de la app en Ajustes | La app no se respalda (`allowBackup="false"`) | B | S |

### Versión 1.0: contactar al organismo y emergencias

| ID | Precondición | Pasos | Resultado esperado | Pri | Tipo |
|---|---|---|---|---|---|
| CP-CTO-01 | Reporte con operador que tiene teléfono y correo | Abrir el detalle | «Contactar al organismo» con «Llamar» y «Escribir» | A | F |
| CP-CTO-02 | CP-CTO-01, E3 | Tocar «Llamar» | Abre el marcador con el número, sin llamar solo | A | I |
| CP-CTO-03 | CP-CTO-01, E3 | Tocar «Escribir» | Abre el correo con el asunto (categoría y comuna) y el código del reporte | A | I |
| CP-CTO-04 | Reporte sin operador | Abrir el detalle | Dice que el organismo aún no tiene a alguien asignado | B | F |
| CP-CTO-05 | Operador sin teléfono ni correo | Abrir el detalle | «Aún no publicó un teléfono ni un correo»; muestra la dirección si la tiene | B | F |
| CP-CTO-06 | Modo avión | Abrir un detalle ya visto | «No pudimos cargar los datos de contacto», sin bloquear la pantalla | C | F |
| CP-EMG-01 | Crear un reporte | Elegir «Árbol peligroso» | «Si hay peligro ahora, llama» con 133, 132 y 131 | A | F |
| CP-EMG-02 | CP-EMG-01 | Cambiar a luminaria, fuga de agua y calle deteriorada | El aviso sigue, con el riesgo de cada categoría | B | F |
| CP-EMG-03 | Crear un reporte | Elegir «Microbasural» u «Otro» | Sin aviso de emergencia | B | F |
| CP-EMG-04 | CP-EMG-01, E3 | Tocar «133» | Abre el marcador con 133 | A | I |

### Versión 1.0: términos, privacidad y eliminar la cuenta

| ID | Precondición | Pasos | Resultado esperado | Pri | Tipo |
|---|---|---|---|---|---|
| CP-TER-01 | Sin sesión | Registrarse sin marcar «Acepto los términos de uso y la política de privacidad» | No deja crear la cuenta | A | F |
| CP-TER-02 | CP-TER-01 | Tocar «Leerlos» | Abre «Términos y privacidad» sin sesión; atrás vuelve al registro | A | F |
| CP-TER-03 | Registro con la casilla marcada | Revisar `users/{uid}` en la consola (E4) | `terminosVersion` vigente y `terminosAceptadosAt` con la hora del servidor | A | S |
| CP-TER-04 | Cuenta creada antes de la 1.0 | Iniciar sesión | Pide aceptar los términos antes del inicio | A | F |
| CP-TER-05 | CP-TER-04 | Aceptar | Llega al inicio y no lo vuelve a pedir | A | F |
| CP-TER-06 | U1 | Configuración → «Términos y privacidad» | Se leen sin pedir aceptar otra vez | B | F |
| CP-TER-07 | Navegador | Abrir `/privacidad` y `/eliminar-cuenta` del servicio | Las dos páginas cargan sin sesión; la segunda muestra el correo de `CORREO_CONTACTO` | A | I |
| CP-ELI-01 | U1 | Mi perfil → «Eliminar mi cuenta» con una contraseña equivocada | «La contraseña no es correcta»; la cuenta sigue | A | S |
| CP-ELI-02 | U1 con reportes | Eliminar con la contraseña correcta | Mensaje de cuenta eliminada y vuelve al login | A | F |
| CP-ELI-03 | CP-ELI-02 | Iniciar sesión con la cuenta eliminada | No existe | A | S |
| CP-ELI-04 | CP-ELI-02, otra cuenta | Abrir un reporte de U1 | Sigue publicado, firmado «Cuenta eliminada» | A | F |
| CP-ELI-05 | CP-ELI-02, consola (E4) | Revisar `users/{uid}` | Sin correo y con nombre «Cuenta eliminada» | A | S |
| CP-ELI-06 | Modo avión | Intentar eliminar | Mensaje de conexión; la cuenta no se elimina | B | F |
| CP-ELI-07 | CP-ELI-02 | Registrarse otra vez con el mismo correo | Se crea una cuenta nueva, sin los reportes ni el nivel de antes | C | F |
| CP-ELI-08 | CP-ELI-02, U1 con conversaciones de soporte, consola (E4) | Revisar sus `supportTickets` | Nombre «Cuenta eliminada» y sin correo, como promete `/eliminar-cuenta` | A | S |

### Versión 1.0: corregir o retirar un reporte propio

| ID | Precondición | Pasos | Resultado esperado | Pri | Tipo |
|---|---|---|---|---|---|
| CP-AUT-01 | U1 con un reporte en «Reportado» | Abrir su detalle | Bloque «Tu reporte» con «Corregir descripción» y «Retirar reporte» | A | F |
| CP-AUT-02 | CP-AUT-01 | Corregir con un texto válido | «Descripción corregida»; el detalle muestra el texto nuevo y «Descripción corregida por quien lo reportó» | A | F |
| CP-AUT-03 | CP-AUT-01 | Corregir con menos de 10 caracteres | La ventana no se cierra y pide el largo correcto | B | F |
| CP-AUT-04 | CP-AUT-01 | Retirar con un motivo | «Cerrado»; el historial dice «Retirado por quien lo reportó: <motivo>», sin el nombre de U1 | A | F |
| CP-AUT-05 | Reporte de U1 en «En revisión» | Abrir su detalle | Sin el bloque «Tu reporte» | A | S |
| CP-AUT-06 | U2 | Abrir el reporte de U1 en «Reportado» | Sin el bloque «Tu reporte» | A | S |
| CP-AUT-07 | U1 con el detalle abierto; U3 lo pasa a «En revisión» | U1 intenta retirar | «El organismo ya empezó a revisar este reporte…»; no cambia | B | F |
| CP-AUT-08 | CP-AUT-04 | U3 abre el reporte desde su bandeja | «Cerrado», con «Quien lo reportó lo retiró antes de que lo revisaran» y la entrada en el historial | B | I |

### Versión 1.0: borrador sin conexión

| ID | Precondición | Pasos | Resultado esperado | Pri | Tipo |
|---|---|---|---|---|---|
| CP-BOR-01 | E3 en modo avión | Abrir «Crear un reporte» | Aviso «Sin señal…» y el botón dice «Guardar y enviar con señal» | A | F |
| CP-BOR-02 | CP-BOR-01, con ubicación | Tomar una foto | No se puede difuminar sin señal, pero no bloquea el envío | A | F |
| CP-BOR-03 | CP-BOR-02 | Guardar | Vuelve al inicio con «Reporte por enviar» | A | F |
| CP-BOR-04 | CP-BOR-03 | Quitar el modo avión, sin tocar nada | En unos segundos «Enviamos el reporte que guardaste sin señal»; la tarjeta desaparece | A | F |
| CP-BOR-05 | CP-BOR-04 | Abrir el reporte en Mis reportes | La foto tiene las caras difuminadas y el reporte está asignado al organismo de la comuna | A | S |
| CP-BOR-06 | CP-BOR-03 | Cerrar la app, quitar el modo avión y abrirla | Se envía al abrir | A | F |
| CP-BOR-07 | CP-BOR-03 | Intentar guardar un segundo reporte sin señal | «Ya tienes un reporte esperando señal»; el formulario queda como estaba | B | F |
| CP-BOR-08 | CP-BOR-03 | «Descartar» y confirmar | La tarjeta desaparece y no se envía nada | B | F |
| CP-BOR-09 | CP-BOR-03 | Cerrar sesión e ingresar con U2 | U2 no ve el borrador de U1; al volver U1, sigue ahí | B | S |
| CP-BOR-10 | Señal débil (el envío falla por conexión) | Enviar un reporte | Se guarda como borrador en vez de perderse, y se envía una sola vez | B | F |
| CP-BOR-11 | E1 (versión web) con sesión, sin haber abierto «Crear un reporte» | Cortar la red (DevTools → Offline) y tocar «Crear un reporte»; luego reconectar y tocarlo otra vez | Primero «Sin señal no pudimos abrir esa pantalla…» y sigue en el inicio; con señal se abre | B | F |

### Versión 1.0: bienvenida

| ID | Precondición | Pasos | Resultado esperado | Pri | Tipo |
|---|---|---|---|---|---|
| CP-BIE-01 | App recién instalada | Iniciar sesión | Tres pantallas: reportar, seguir el reporte y la confianza | A | F |
| CP-BIE-02 | CP-BIE-01 | «Siguiente», «Atrás» y «Empezar» | Recorre los pasos y termina en el inicio; no se vuelve a mostrar | A | F |
| CP-BIE-03 | App recién instalada | «Saltar» | Va al inicio y no se vuelve a mostrar | B | F |
| CP-BIE-04 | U1 | Configuración → «Ver la introducción» | Muestra las tres pantallas otra vez | C | F |
| CP-BIE-05 | U3 operador en un teléfono nuevo | Iniciar sesión | No aparece la bienvenida | B | F |
| CP-BIE-06 | «Al abrir la app: Crear un reporte» | Primera entrada | Primero la bienvenida; en la entrada siguiente, Crear un reporte | C | F |

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
| CP-ACC-11 | Nombres para el lector de pantalla | TalkBack anuncia cada botón, enlace y campo con su nombre (los de solo ícono también) | B | UX |

---

## 19. Regresión mínima antes de cada entrega

Primero las pruebas automáticas (sección 21): `npm run test:una-vez`, `npm run test:comun`,
`npm run diagnostico`, `npm run diagnostico:reglas` y `npm run e2e`. Luego, en este orden; si
alguno falla, la entrega se detiene.

| Orden | Caso | Descripción breve |
|---|---|---|
| 1 | CP-REG-01 | Registrar una cuenta nueva |
| 2 | CP-LOG-01 | Iniciar sesión |
| 3 | CP-CAR-01 | Pantalla de arranque y el inicio entero |
| 4 | CP-SES-01 | Verificar el bloqueo de rutas privadas |
| 5 | CP-SES-06 | Persistencia tras cerrar la app |
| 6 | CP-PRI-15 | El servicio de privacidad responde |
| 7 | CP-FOT-01 | Adjuntar fotografía |
| 8 | CP-PRI-01 | La foto vuelve con el rostro difuminado |
| 9 | CP-UBI-02 | Obtener ubicación |
| 10 | CP-DES-08 | Enviar un reporte completo |
| 11 | CP-DUP-01 | Detectar una coincidencia |
| 12 | CP-CON-01 | Confirmar un reporte ajeno |
| 13 | CP-INC-01 | Ver el mapa de incidencias |
| 14 | CP-DET-03 | Abrir el detalle y ver la fotografía |
| 15 | CP-HIS-01 | Revisar el historial propio |
| 16 | CP-EST-04 | Cambiar un estado como operador |
| 17 | CP-EST-14 | Resolver un reporte y ver su tiempo de resolución |
| 18 | CP-VER-04 | Dar un veredicto real como operador |
| 19 | CP-VER-12 | El autor ve el aviso del veredicto |
| 20 | CP-PER-01 | Abrir Mi perfil |
| 21 | CP-CFG-01 | Abrir Configuración |
| 22 | CP-APK-01 | Versión 1.0.0 sin el aviso de prueba |
| 23 | CP-TER-04 | Una cuenta antigua acepta los términos |
| 24 | CP-CTO-01 | Contactar al organismo desde el detalle |
| 25 | CP-AUT-04 | Retirar un reporte propio |
| 26 | CP-BOR-04 | Un reporte guardado sin señal se envía al volver la conexión |
| 27 | CP-ELI-02 | Eliminar una cuenta de prueba |
| 28 | CP-SES-07 | Cerrar sesión |

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
| CA-79 Reglas | CP-SEC-01 a CP-SEC-43 |
| CA-51 Mapa | CP-MAP-01 a CP-MAP-12 |
| CA-52 Geolocalización | CP-UBI-01 a CP-UBI-13 |
| Fotografía | CP-FOT-01 a CP-FOT-18 |
| Privacidad en la nube | CP-PRI-01 a CP-PRI-15 |
| Descripción | CP-DES-01 a CP-DES-20 |
| Validación inicial | CP-SEC-11 a CP-SEC-18, CP-DES-09, CP-DES-10 |
| HU-20 Coincidencias | CP-DUP-01 a CP-DUP-18 |
| HU-21/22 Confirmación | CP-CON-01 a CP-CON-13 |
| HU-25 Mapa de incidencias | CP-INC-01 a CP-INC-27 (MS8 = CP-INC-19, MS9 = CP-INC-20) |
| HU-26 Detalle | CP-DET-01 a CP-DET-13 |
| HU-27 Historial | CP-HIS-01 a CP-HIS-11 |
| HU-28 Enrutamiento y estados | CP-EST-01 a CP-EST-13, CP-EST-20 |
| F12 Tiempo de resolución | CP-EST-14 a CP-EST-19 |
| Veredicto y aviso (confianza 4.4) | CP-VER-01 a CP-VER-17 |
| Mi perfil e inicio (feedback Sprint 5) | CP-PER-01 a CP-PER-14 |
| Carga del inicio | CP-CAR-01 a CP-CAR-07 |
| Configuración | CP-CFG-01 a CP-CFG-15 |
| 1.0 · Versión, ícono y respaldo | CP-APK-01 a CP-APK-04 |
| 1.0 · Contactar al organismo y emergencias | CP-CTO-01 a CP-CTO-06, CP-EMG-01 a CP-EMG-04 |
| 1.0 · Términos, privacidad y eliminar la cuenta | CP-TER-01 a CP-TER-07, CP-ELI-01 a CP-ELI-08, CP-SEC-37, CP-SEC-38, CP-SEC-42, CP-SEC-43 |
| 1.0 · Brechas cerradas | CP-SEC-34 a CP-SEC-36 |
| 1.0 · Corregir o retirar un reporte | CP-AUT-01 a CP-AUT-08, CP-SEC-39 a CP-SEC-41 |
| 1.0 · Borrador sin conexión | CP-BOR-01 a CP-BOR-11, CP-CFG-15 |
| 1.0 · Bienvenida | CP-BIE-01 a CP-BIE-06 |

**Total: 405 casos** — 251 de prioridad A, 129 de prioridad B y 25 de prioridad C.

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
npm run e2e
cd ..\servicio-privacidad
npm test
```

La primera vez, antes de `npm run e2e`: `npm run e2e:preparar` (descarga el Chromium de
Playwright). Cómo escribir cada tipo de prueba: `docs/GUIA_PRUEBAS.md`.

| Comando | Qué prueba | Dónde |
|---|---|---|
| `npm run test:una-vez` | Pantallas, componentes, guards y servicios de la app con Vitest (`ng test`), sin red ni proyecto real | `src/**/*.spec.ts`, ayudas en `src/testing/` |
| `npm run test:comun` | Reglas compartidas con el portal: estados, transiciones, confianza, tiempos, territorio, privacidad | `../comun/test/` (antes, una vez: `cd ..\comun` y `npm install`) |
| `npm run diagnostico` | Estructura, imports, rutas, catálogos y módulos contra las reglas | `scripts/diagnostico/` |
| `npm test` en `servicio-privacidad` | El difuminado con los modelos reales y una foto de dominio público, el token de sesión, los límites y las respuestas del servidor | `servicio-privacidad/test/` (antes, una vez: `npm install`) |
| `npm run diagnostico:reglas` | Las reglas en el emulador: 27 controles, 70 bloqueos y 3 brechas conocidas | `scripts/diagnostico/reglas.mjs` |
| `npm run e2e` | La app compilada en un teléfono simulado (E5): 26 pantallas en tema oscuro y claro y con texto «Muy grande» (contraste, desbordes, nombres accesibles, consola sin errores) y los flujos completos de reporte, cuenta, equipo y configuración, con y sin señal | `e2e/` (informe: `npm run e2e:informe`) |

`npm test` deja Vitest mirando los cambios mientras se programa.

**Cómo se preparan.** Cada `*.spec.ts` que usa `TestBed` llama a `usarEntornoDePrueba()`
(`src/testing`) antes del `describe`. No se hace en `src/test-setup.ts` porque en Windows lo que se
configura ahí no llega a las pruebas. El Firestore de prueba nace sin red: toda lectura falla
enseguida con `unavailable`, igual en Windows y en Linux.

**Qué cubren.** Las pruebas de la app usan Firebase de prueba (`src/testing/firebase-de-prueba.ts`):
Firestore y Storage reales de un proyecto `demo-*` que nunca se conectan, y una sesión
simulada. Por eso prueban la lógica y lo que se ve en pantalla, pero no lo que Firestore
acepta: eso lo prueba `diagnostico:reglas` en el emulador. Entre otras cosas:

- núcleo de módulos: dependencias, rutas y botones repetidos, ranuras, y que al desactivar
  cualquier módulo solo se quejen los que lo requieren;
- guards (`guards/auth-guard.ts`) por sesión y rol;
- coincidencias cercanas (v2-D2 a v2-D5), bloque de gestión (HU-28), tiempos de resolución
  (F12), Mi perfil, inicio por rol y cierre de sesión;
- historial público, catálogo de comunas y regiones del mapa;
- la protección de la foto en la nube con `fetch` simulado: respuesta correcta, sesión vencida,
  límite, foto ilegible, sin red, tiempo máximo, cancelar y el aviso de «despertando»;
- el veredicto (qué campos escribe en cada documento, comparados con las reglas) y su aviso
  en la campana;
- la espera del inicio (oculto hasta que cada tarjeta avisa, y visible igual a los 2,5 s), la
  pantalla de arranque, las preferencias (valores dañados, ahorro de datos, pantalla al abrir) y
  la pantalla de Configuración por rol.
- 1.0: contacto con el organismo y aviso de emergencia, términos (aceptación y quién debe
  aceptarlos), eliminar la cuenta (errores de contraseña y de red), corregir y retirar un
  reporte (qué campos escribe y qué pasa si ya lo están revisando), el borrador sin conexión
  (guardar, foto sin proteger, sin duplicar, envío al volver la señal y al abrir la app) y la
  bienvenida (pasos, saltar, operadores y el orden con la pantalla elegida).

- revisión de octubre: carreras al pasar rápido de un reporte a otro o al cambiar filtros
  seguidos, escuchas que quedaban abiertas (campana y chat), la asignación con mala señal,
  confirmar un reporte cerrado, el permiso de ubicación en el navegador, los tickets al eliminar
  la cuenta, la navegación sin señal en la web y «Borrar datos guardados» con un reporte por
  enviar. Cada arreglo trae la prueba que falla sin él (`GUIA_PRUEBAS.md`, sección 4).

**De punta a punta (E5).** Corren la app compilada de verdad con Firebase reemplazado por una
maqueta en memoria (`e2e/maqueta`), así que prueban lo que ve y hace la persona: lo que muestra
cada pantalla, que se lea, que nada se salga de la pantalla en un teléfono de 360 px, y los flujos
de punta a punta, incluido cortar la señal. Cubren de forma automática, entre otros, CP-ACC-01,
CP-ACC-02, CP-ACC-11, CP-DES-08, CP-DUP-01, CP-BOR-01 a CP-BOR-04, CP-BOR-11, CP-TER-04,
CP-TER-05, CP-ELI-01 a CP-ELI-03, CP-ELI-06, CP-ELI-08, CP-BIE-02, CP-CFG-02, CP-CFG-05,
CP-CFG-15, CP-CTO-01 y CP-EMG-01. No reemplazan los casos en el
teléfono (sección 17): la cámara, el GPS, los permisos de Android y Firebase real quedan fuera.

Una prueba nueva va junto al archivo que prueba, con el mismo nombre y `.spec.ts`; si usa
`TestBed`, empieza con `usarEntornoDePrueba()`.
