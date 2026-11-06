# Pruebas de pantalla (Playwright)

Se ejecutan contra los emuladores de Auth y Firestore (proyecto `demo-ciudad-alerta`), nunca contra el proyecto real.
Requieren Java 21 para los emuladores. Corren en serie (un solo trabajador) porque comparten datos.

- `npx playwright test --list`: lista las pruebas sin ejecutarlas.
- `npm run test:e2e`: levanta los emuladores y ejecuta todas las pruebas.
- `npm run test:e2e:ui`: modo visual para depurar.
- `npm run manual`: no es una prueba; carga los datos de prueba y abre el portal para recorrerlo a mano
  (`manual.spec.ts`, que `npm run test:e2e` ignora). Imprime las cuentas de prueba (misma clave para todas).
- Evidencia oficial: `EVIDENCIA_DIR=../Evidencia/e2e/<fase> npm run test:e2e` deja el JUnit (`e2e-portal.xml`) en
  esa carpeta, relativa a `portal-web/`.

## Cómo están hechas

- **Datos:** `datos/semilla.ts` crea cuentas (`CUENTAS`), reportes (`reporte()`) y el resto de la base con
  `sembrar()`. `global-setup.ts` inicia sesión una vez con cada cuenta y guarda el estado en `.sesiones/`.
- **`test` y `expect`:** todas las pruebas los importan de `ayudas/prueba.ts`, que es el `test` de Playwright con una
  limpieza más: al terminar cada prueba cierra los contextos de navegador que abrió con `browser.newContext()` o con
  `paginaDe()`. Sin eso se acumulaban durante la corrida y alguna prueba cualquiera fallaba al preparar o cerrar su
  traza («trace recording timeout»; WX2 en las fases 8 y 10, RI7 en la 12).
- **Sesiones:** `ayudas/sesion.ts` (`rutaSesion`, `paginaDe`, que abre un contexto con la sesión guardada de una cuenta).
- **Mapa:** `ayudas/mapa.ts` (`abrirDetalle` repite el clic hasta que el panel abre).
- **Pruebas que crean datos propios** (eliminar cuenta, corregir o retirar un reporte, fotos) crean su cuenta o su
  reporte para no depender del orden.
- **Fotos:** `datos/astronauta.jpg` es una foto de dominio público (Eileen Collins, NASA), la misma con que el
  servicio de privacidad prueba sus modelos. `fotos-privacidad.spec.ts` comprueba el difuminado de verdad
  (el detalle de la cara baja y el del fondo se conserva). Cada foto tarda unos 15 s.

## Numeración

Las pruebas llevan su identificador en el nombre (`WL11 · …`) y están en el plan de pruebas (Excel). La suite no tiene
pruebas en NOK (los defectos del mapa, DEF-001 y DEF-002, se corrigieron en la Fase 12).
