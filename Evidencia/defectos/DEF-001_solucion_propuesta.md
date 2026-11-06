# DEF-001 · Solución propuesta (aplicada en la Fase 12)

**Defecto:** el mapa público muestra más de 500 reportes por región (con 520 reportes en La Serena muestra 520).

**Causa:** `unirReportesDeRegion` (portal-web/src/components/Map/useReportesRegion.ts) suma a los 500 reportes de la consulta
principal los que encuentra por comuna. La condición aceptaba también los que ya tienen la misma región
(`region === nombreRegion`), que son justamente los que quedaron fuera del tope de 500.

**Cambio propuesto:** aceptar solo los reportes sin región (antiguos).

```ts
// antes
return region === undefined || region === null || region === '' || region === nombreRegion
// después
return region === undefined || region === null || region === ''
// (y quitar el parámetro nombreRegion de la función y de su llamada)
```

**Prueba unitaria a ajustar:** portal-web/rules-tests/mapa.test.ts («une la consulta de la región con los antiguos…»):
el reporte `f` con `Región X` que viene solo por comuna ya no debe incluirse.

**Verificación:** pruebas E2E WB5 (500 incidencias) y la unitaria de mapa.test.ts.

## Aplicada (Fase 12, 04-11-2026)

- `unirReportesDeRegion` (`portal-web/src/components/Map/useReportesRegion.ts`) acepta solo los reportes **sin región** de la consulta por comuna, y se quitó el parámetro `nombreRegion`.
- Decisión D26: además, el resultado se ordena por fecha (el más reciente primero) y se limita a `MAXIMO_POR_REGION` (500). Así el aviso «Se muestran las 500 más recientes» es siempre cierto, incluso con reportes antiguos sin región que se suman a la consulta principal.
- Pruebas: la unitaria de `rules-tests/mapa.test.ts` (6 casos de `unirReportesDeRegion`) y las de pantalla **WB5** y **WB10** (520 reportes con región más 3 antiguos sin región: muestra exactamente 500). Evidencia: `Evidencia/e2e/fase12/`.
- Estado: **Cerrado** con la evidencia automática (decisión D27).
