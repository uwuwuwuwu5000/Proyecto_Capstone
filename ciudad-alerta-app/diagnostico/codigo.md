# Diagnóstico del código · Ciudad Alerta

Generado el 15-10-2026, 5:43:40 p. m. en 2.2 s.

| Severidad | Cantidad | Significado |
|---|---:|---|
| ✖ Errores | 0 | Rompen el build o una funcionalidad. |
| ⛨ Brechas de seguridad | 2 | Permiten algo que no debería estar permitido. |
| ⚠ Advertencias | 6 | Bugs probables o riesgos a futuro. |
| ℹ Información | 3 | Datos útiles; no requieren acción inmediata. |

## ⛨ Brechas de seguridad

- **[Reglas de seguridad (análisis estático)]** Un operador puede cambiar su propio operadorId y gestionar reportes de otra municipalidad — `firestore.rules`
  - users/{userId} update permite operadorId en la lista blanca, pero camposProtegidosIntactos() no lo protege.
  - Solución: En camposProtegidosIntactos(): && request.resource.data.get('operadorId', null) == resource.data.get('operadorId', null)
- **[Reglas de seguridad (análisis estático)]** esCorreoAdministrador() no exige correo verificado — `firestore.rules`
  - Quien registre primero un correo de la lista (sin verificarlo) obtiene rol admin. Revisa con diagnostico/datos que todos existan ya en Authentication.
  - Solución: && request.auth.token.email_verified == true (y verifica los correos de la lista).

## ⚠ Advertencias

- **[Reglas de seguridad (análisis estático)]** Creación sin lista blanca de campos (keys().hasOnly) en: users (línea 143), reports (línea 432), reports/confirmations (línea 497), reports/statusHistory (línea 522), reportPhotos (línea 552), supportTickets (línea 735), supportTickets/messages (línea 767) — `firestore.rules`
  - Un cliente modificado puede guardar campos extra (por ejemplo validadoComunidad: true) o inflar documentos hasta 1 MiB.
  - Solución: Agrega request.resource.data.keys().hasOnly([...]) con los campos que la app escribe.
- **[Reglas de seguridad (análisis estático)]** reports create no exige createdAt == request.time: se pueden crear reportes con fecha falsa — `firestore.rules`
  - Solución: && request.resource.data.createdAt == request.time
- **[Reglas de seguridad (análisis estático)]** reportPhotos create no comprueba que exista el reporte: se pueden subir fotos huérfanas de hasta 950 KB — `firestore.rules`
  - existsAfter() ve el estado posterior al lote, así que funciona con la escritura conjunta foto + reporte.
  - Solución: && existsAfter(/databases/$(database)/documents/reports/$(reportId)) && getAfter(/databases/$(database)/documents/reports/$(reportId)).data.uid == request.auth.uid
- **[Reglas de seguridad (análisis estático)]** Se pueden crear mensajes de soporte en tickets que no existen (quedan huérfanos) — `firestore.rules`
  - Solución: Reemplaza !exists(ticket) por existsAfter(ticket) && getAfter(ticket).data.uid == request.auth.uid.
- **[Seguridad del cliente y secretos]** Archivo secreto dentro del proyecto (ignorado por git): keystore.properties
  - Solución: Mejor guárdalo fuera de la carpeta del proyecto, por ejemplo en C:\claves.
- **[Android, Capacitor y build]** AndroidManifest: allowBackup="true" copia la sesión de Firebase en los respaldos de Android — `android/app/src/main/AndroidManifest.xml`

## ℹ Información

- **[Dependencias e imports]** Dependencias declaradas que el código de src/ no importa: @capacitor/app, @capacitor/haptics, @capacitor/keyboard, @capacitor/status-bar, @mediapipe/face_detection, jsdom
  - Pueden ser plugins de Capacitor usados solo desde Android o restos de pruebas anteriores.
- **[Reglas de seguridad (análisis estático)]** Cualquier usuario con sesión puede leer: reports, reports/confirmations, reports/statusHistory, reportPhotos, organismos, categorias, operadores
  - Incluye uid, nombre y ubicación exacta de cada reporte. Es intencional en el MVP; tenlo presente para la política de privacidad.
- **[Seguridad del cliente y secretos]** 3 llamadas a console.log/debug/info en src/

## Comprobaciones ejecutadas

- Dependencias e imports
- Componentes, plantillas e íconos
- Rutas y navegación
- Firestore: colecciones, índices y catálogos
- Reglas de seguridad (análisis estático)
- Suscripciones, temporizadores y eventos
- Seguridad del cliente y secretos
- Android, Capacitor y build
