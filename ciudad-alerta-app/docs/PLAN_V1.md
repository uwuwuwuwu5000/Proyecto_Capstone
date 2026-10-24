# Plan para la versión 1.0 · Ciudad Alerta

Qué falta para la entrega final, de lo más urgente a lo que puede esperar. El tamaño (S, M, L) es una estimación del trabajo: S cabe en una tarde; M, en uno o dos días; L, en una semana. «Reglas» quiere decir que hay que cambiar `firestore.rules` y desplegarlas.

## 1. Imprescindible para entregar

| # | Qué | Por qué | Tamaño |
|---|---|---|---|
| 1 | **Versión 1.0.0 sin el aviso de prueba.** Agregar `--final` a `apk-demo.mjs` para que escriba `nombre: '1.0.0'`, `demo: false` y el `versionName` de Gradle. | El login y el pie todavía dicen «Versión de prueba», y la app aparece como 0.9.0. | S |
| 2 | **Ícono y pantalla de arranque propios** de Android, generados con `@capacitor/assets` desde un PNG de 1024 px. | Hoy el ícono y el arranque nativo son la «X» azul de Capacitor. La pantalla de arranque dentro de la app ya tiene la marca nueva. | S |
| 3 | **Cerrar las dos brechas de seguridad** que marca `npm run diagnostico`: un operador puede cambiarse su propio `operadorId`, y `esCorreoAdministrador()` no exige correo verificado. De paso, `createdAt == request.time` al crear reportes. | Son las únicas brechas abiertas; el diagnóstico trae la línea exacta que hay que agregar a cada regla. | S · reglas |
| 4 | **Contactar al organismo** desde el detalle del reporte: botones «Llamar» y «Escribir» (`tel:` y `mailto:`) con el teléfono y el correo del operador asignado. | Es lo que más pide un vecino cuando el reporte no avanza. `OperadorDoc` ya tiene `telefonoContacto`, `correoContacto` y `direccionContacto`, y las reglas ya dejan leerlos. Falta llenarlos para cada operador y, si un reporte no tiene operador, mostrar la OIRS municipal. | M |
| 5 | **Emergencias:** si la categoría puede ser un riesgo inmediato (árbol peligroso, fuga de agua, cables), mostrar antes de enviar «Si hay peligro ahora, llama» con 133 (Carabineros), 132 (Bomberos) y 131 (SAMU). | Ciudad Alerta no reemplaza a emergencias; hay que decirlo donde importa. | S |
| 6 | **Términos y privacidad**, aceptados al registrarse: qué se guarda (correo, ubicación de cada reporte, fotos con caras difuminadas en un servidor de Render en EE. UU.), para qué y cómo pedir que se borre. | La Ley 21.719 de protección de datos personales entra en vigor el 1 de diciembre de 2026. | M |
| 7 | **Eliminar mi cuenta** desde Mi perfil, y también desde un enlace web. | Google Play lo exige a toda app que permita crear cuentas. Borrar la cuenta de Auth se puede hacer desde la app (pide volver a iniciar sesión); hay que decidir qué pasa con los reportes (anonimizarlos, no borrarlos). | M · reglas |

## 2. Muy recomendable

| # | Qué | Por qué | Tamaño |
|---|---|---|---|
| 8 | **Notificaciones push** (Firebase Cloud Messaging) para los avisos. | Hoy la campana solo se actualiza con la app abierta. Sin el plan Blaze, el servicio de Render podría enviarlas con una clave de cuenta de servicio guardada como secreto en Render (nunca en el repositorio). | L |
| 9 | **Editar o retirar un reporte propio** mientras siga en «Reportado». | Hoy un error de tipeo o un reporte duplicado no se puede corregir. | M · reglas |
| 10 | **Borrador sin conexión:** si no hay red al enviar, guardar el reporte y enviarlo solo cuando vuelva. | En la calle la señal falla justo al reportar. | M |
| 11 | **Primer uso:** tres pantallas al abrir la app por primera vez (qué es, cómo reportar, cómo funciona la confianza). | El sistema de confianza no se entiende solo. | S |
| 12 | **Ajustes del equipo en Firestore:** un anuncio para el inicio de todos y los teléfonos de cada municipio, editables por un administrador desde Configuración. | Hoy Configuración solo cambia el teléfono propio; esto permitiría «editar cosas de la app» sin publicar otro APK. | M · reglas |
| 13 | **Revisión de accesibilidad con TalkBack** y el texto «Muy grande» en todas las pantallas. | Configuración ya permite agrandar el texto; falta probar que nada se corte. | S |

## 3. Después de la entrega

- **Portal web:** que use `comun/`, muestre el aviso de veredicto y difumine con el servicio de Render en vez de en el navegador.
- **Servicio de fotos siempre despierto:** el plan gratuito de Render se duerme tras 15 minutos. Un plan pagado lo evita; un monitor externo que consulte `/salud` también, pero hay que revisar las condiciones de Render antes.
- **Estadísticas públicas por comuna:** reportes abiertos, resueltos y tiempo de respuesta.
- **Compartir un reporte** (requiere el plugin `@capacitor/share`).
- **Quitar TensorFlow de `package.json`:** la app ya no lo usa (comando en GUIA_MODULOS, sección 11).

## Antes de generar el APK final

1. `npm run test:una-vez`, `npm run test:comun`, `npm test` en `servicio-privacidad` y `npm run diagnostico`: todo en verde.
2. `npm run diagnostico:reglas` con el emulador: sin bloqueos fallidos.
3. Regresión mínima del plan de pruebas (sección 19) en un teléfono real, incluido uno de gama baja.
4. `/salud` del servicio de privacidad responde `"listo": true`.
5. `npm run apk:demo` (o `--final` cuando exista) y probar la actualización encima de la versión anterior.
