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
- **Sesiones:** `ayudas/sesion.ts` (`rutaSesion`, `paginaDe`). Una prueba que abre contextos de navegador por su
  cuenta debe **cerrarlos al terminar**: si quedan abiertos, la prueba siguiente de otro archivo puede fallar al
  cerrar su traza (así falló WX2 en las fases 8 y 10; ver `mi-reporte.spec.ts`).
- **Mapa:** `ayudas/mapa.ts` (`abrirDetalle` repite el clic hasta que el panel abre).
- **Pruebas que crean datos propios** (eliminar cuenta, corregir o retirar un reporte, fotos) crean su cuenta o su
  reporte para no depender del orden.
- **Fotos:** `datos/astronauta.jpg` es una foto de dominio público (Eileen Collins, NASA), la misma con que el
  servicio de privacidad prueba sus modelos. `fotos-privacidad.spec.ts` comprueba el difuminado de verdad
  (el detalle de la cara baja y el del fondo se conserva). Cada foto tarda unos 15 s.

## Numeración

Las pruebas llevan su identificador en el nombre (`WL11 · …`) y están en el plan de pruebas (Excel). Los NOK
conocidos son WB1, WB5 y MS7 (DEF-001 y DEF-002).
