# Plan para la versión 1.0 · Ciudad Alerta

Qué falta para la entrega final, de lo más urgente a lo que puede esperar. El tamaño (S, M, L) es una estimación del trabajo: S cabe en una tarde; M, en uno o dos días; L, en una semana. «Reglas» quiere decir que hay que cambiar `firestore.rules` y desplegarlas.

**Estado (24 de octubre):** hechos los puntos 1 a 7, 9, 10 y 11, en los commits de la versión 1.0 (GUIA_MODULOS, sección 13). Quedan 8, 12 y 13, y lo de la sección 3. Antes de publicar falta lo que no se puede hacer desde el código: desplegar las reglas, `CORREO_CONTACTO` en Render, el contacto de cada operador y la revisión del texto legal.

## 1. Imprescindible para entregar

| # | Qué | Por qué | Tamaño | Estado |
|---|---|---|---|---|
| 1 | **Versión 1.0.0 sin el aviso de prueba.** Agregar `--final` a `apk-demo.mjs` para que escriba `nombre: '1.0.0'`, `demo: false` y el `versionName` de Gradle. | El login y el pie todavía dicen «Versión de prueba», y la app aparece como 0.9.0. | S | Hecho: `npm run apk:final` |
| 2 | **Ícono y pantalla de arranque propios** de Android, generados con `@capacitor/assets` desde un PNG de 1024 px. | Hoy el ícono y el arranque nativo son la «X» azul de Capacitor. La pantalla de arranque dentro de la app ya tiene la marca nueva. | S | Hecho: `resources/icono.svg` y sus PNG, sin dependencias nuevas |
| 3 | **Cerrar las dos brechas de seguridad** que marca `npm run diagnostico`: un operador puede cambiarse su propio `operadorId`, y `esCorreoAdministrador()` no exige correo verificado. De paso, `createdAt == request.time` al crear reportes. | Son las únicas brechas abiertas; el diagnóstico trae la línea exacta que hay que agregar a cada regla. | S · reglas | Hecho |
| 4 | **Contactar al organismo** desde el detalle del reporte: botones «Llamar» y «Escribir» (`tel:` y `mailto:`) con el teléfono y el correo del operador asignado. | Es lo que más pide un vecino cuando el reporte no avanza. `OperadorDoc` ya tiene `telefonoContacto`, `correoContacto` y `direccionContacto`, y las reglas ya dejan leerlos. Falta llenarlos para cada operador y, si un reporte no tiene operador, mostrar la OIRS municipal. | M | Hecho. Sin operador, el detalle lo dice; falta llenar el contacto de cada operador |
| 5 | **Emergencias:** si la categoría puede ser un riesgo inmediato (árbol peligroso, fuga de agua, cables), mostrar antes de enviar «Si hay peligro ahora, llama» con 133 (Carabineros), 132 (Bomberos) y 131 (SAMU). | Ciudad Alerta no reemplaza a emergencias; hay que decirlo donde importa. | S | Hecho (también calle deteriorada) |
| 6 | **Términos y privacidad**, aceptados al registrarse: qué se guarda (correo, ubicación de cada reporte, fotos con caras difuminadas en un servidor de Render en EE. UU.), para qué y cómo pedir que se borre. | La Ley 21.719 de protección de datos personales entra en vigor el 1 de diciembre de 2026. | M | Hecho; el texto lo revisa el profesor guía |
| 7 | **Eliminar mi cuenta** desde Mi perfil, y también desde un enlace web. | Google Play lo exige a toda app que permita crear cuentas. Borrar la cuenta de Auth se puede hacer desde la app (pide volver a iniciar sesión); hay que decidir qué pasa con los reportes (anonimizarlos, no borrarlos). | M · reglas | Hecho: quedan como «Cuenta eliminada». Página web en `/eliminar-cuenta` |

## 2. Muy recomendable

| # | Qué | Por qué | Tamaño | Estado |
|---|---|---|---|---|
| 8 | **Notificaciones push** (Firebase Cloud Messaging) para los avisos. | Hoy la campana solo se actualiza con la app abierta. Sin el plan Blaze, el servicio de Render podría enviarlas con una clave de cuenta de servicio guardada como secreto en Render (nunca en el repositorio). | L | Pendiente |
| 9 | **Editar o retirar un reporte propio** mientras siga en «Reportado». | Hoy un error de tipeo o un reporte duplicado no se puede corregir. | M · reglas | Hecho |
| 10 | **Borrador sin conexión:** si no hay red al enviar, guardar el reporte y enviarlo solo cuando vuelva. | En la calle la señal falla justo al reportar. | M | Hecho: un borrador a la vez, sin duplicados |
| 11 | **Primer uso:** tres pantallas al abrir la app por primera vez (qué es, cómo reportar, cómo funciona la confianza). | El sistema de confianza no se entiende solo. | S | Hecho: módulo `bienvenida` |
| 12 | **Ajustes del equipo en Firestore:** un anuncio para el inicio de todos y los teléfonos de cada municipio, editables por un administrador desde Configuración. | Hoy Configuración solo cambia el teléfono propio; esto permitiría «editar cosas de la app» sin publicar otro APK. | M · reglas | Pendiente |
| 13 | **Revisión de accesibilidad con TalkBack** y el texto «Muy grande» en todas las pantallas. | Configuración ya permite agrandar el texto; falta probar que nada se corte. | S | Pendiente (CP-CFG-03) |

## 3. Después de la entrega

- **Portal web:** que use `comun/`, muestre el aviso de veredicto y difumine con el servicio de Render en vez de en el navegador.
- **Servicio de fotos siempre despierto:** el plan gratuito de Render se duerme tras 15 minutos. Un plan pagado lo evita; un monitor externo que consulte `/salud` también, pero hay que revisar las condiciones de Render antes.
- **Estadísticas públicas por comuna:** reportes abiertos, resueltos y tiempo de respuesta.
- **Compartir un reporte** (requiere el plugin `@capacitor/share`).
- **Quitar TensorFlow de `package.json`:** la app ya no lo usa (comando en GUIA_MODULOS, sección 11).

## Antes de generar el APK final

1. `npm run test:una-vez`, `npm run test:comun`, `npm test` en `servicio-privacidad` y `npm run diagnostico`: todo en verde.
2. `npm run diagnostico:reglas` con el emulador: sin controles ni bloqueos fallidos. Luego `firebase deploy --only firestore:rules`.
3. `CORREO_CONTACTO` en Render y el contacto de cada operador en `operadores/{id}`.
4. Regresión mínima del plan de pruebas (sección 19) en un teléfono real, incluido uno de gama baja.
5. `/salud` del servicio de privacidad responde `"listo": true`; `/privacidad` y `/eliminar-cuenta` se abren.
6. `npm run apk:final` y probar la actualización encima de la versión de prueba.
