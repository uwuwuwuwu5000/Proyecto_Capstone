# DEF-008 · Estadísticas del operador desplazan la página en un teléfono (CORREGIDO el 2026-10-30)

**Qué pasa:** en una pantalla de 393 px, «Estadísticas» del operador se desplaza 92 px hacia los lados, en vez de desplazarse solo la
tabla dentro de su recuadro.

**Evidencia:** prueba WA8 (`e2e/resumen-operador.spec.ts`) en NOK antes de la corrección: `Evidencia/defectos/DEF-008.png`.

**Causa (dos partes)** en `portal-web/src/pages/Operador/OperadorEstadisticas.module.css`:

1. En pantallas de hasta 860 px las dos columnas pasan a `grid-template-columns: 1fr`. Un `1fr` suelto significa «mínimo: lo que mida
   su contenido», y la tabla tiene un ancho mínimo de 480 px (más el margen de la tarjeta), así que la columna se hacía más ancha que
   la pantalla.
2. Las tablas llevan en sus encabezados un texto «solo lector» (`.soloLector`) con `position: absolute`. El recuadro de la tabla
   (`.tablaScroll`, con `overflow-x: auto`) no era su bloque contenedor, así que ese texto escapaba del recuadro, quedaba más allá de
   la pantalla y ensanchaba toda la página (92 px). Se encontró ocultando los elementos uno a uno hasta que el ancho de la página bajó.

**Cambio aplicado:**

- `grid-template-columns: minmax(0, 1fr)` en el tramo de 860 px, como ya hacen las columnas de escritorio.
- `position: relative` en `.tablaScroll`, para que el texto «solo lector» quede dentro del recuadro y se recorte con él.

**Verificación:** WA8 pasa de NOK a OK y el E2E completo sin fallos nuevos.
