# DEF-010 · «Por veredicto» no muestra los reportes validados por la app (falta el campo `validacion.veredicto`)

**Detectado el 2026-10-31** al cambiar a mano un reporte a «validado» en Firestore: «Reportes» lo muestra como
«Validado por la comunidad · Falta veredicto», pero «Por veredicto» dice «Mostrando 0 de 0 reportes».

**Evidencia:** `DEF-010_reportes-falta-veredicto.png`, `DEF-010_por-veredicto-vacio.png` y `DEF-010_prueba-WV16-NOK.png` (la
prueba WV16 falla antes de corregir: espera 3 tarjetas y hay 2).

## Causa

- La consulta de `useReportesPorVeredicto.ts` pedía `where('validacion.veredicto', '==', null)`. En Firestore esa igualdad **solo
  encuentra documentos donde el campo existe y vale `null`**; un documento sin el campo no entra.
- La app móvil **nunca escribe `validacion.veredicto`**: al crear el reporte no manda `validacion` y la transacción de confirmación
  escribe `validacion.{puntos, votos, validado}` sin `veredicto`. Las reglas lo permiten (`v.get('veredicto', null) == null`).
  Solo lo escribe el veredicto del operador. Por eso casi todos los reportes reales quedaban fuera.
- «Reportes» sí los muestra: `leerValidacion` lee un `veredicto` ausente como `null`.
- Las pruebas no lo vieron: todas las semillas escribían `veredicto: null` de forma explícita.

## Cómo corregirlo

Firestore no puede preguntar «el campo no existe». Entonces:

1. La consulta pide solo `operadorId == X` y `validacion.validado == true` (igualdades: usan los índices de un solo campo, sin índices
   nuevos). Los pendientes se separan en el navegador con `esPendienteDeVeredicto`, que ya trata la ausencia como «sin veredicto».
2. Como esa consulta también trae los reportes que ya tienen veredicto, el tope de lectura sube a 1.000 y, si se alcanza, el total
   exacto se calcula con tres conteos: validados − con veredicto «real» − con veredicto «falso».
3. Pruebas: semillas con y sin la clave en `veredictos-consultas.test.ts` y la prueba E2E **WV16**.

## Mientras tanto (solución rápida en la base)

En el documento del reporte, dentro del mapa `validacion`, agregar el campo `veredicto` con tipo `null`.
