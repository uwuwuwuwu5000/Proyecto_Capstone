# DEF-001 · Solución propuesta (NO aplicada)

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
