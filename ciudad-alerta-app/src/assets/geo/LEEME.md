# Límites comunales

Estos archivos permiten detectar, dentro del teléfono, en qué comuna se creó un reporte.

| Archivo | Contenido |
|---|---|
| `indice.json` | Caja envolvente de cada una de las 345 comunas y su región (26 KB) |
| `region-NN.geojson` | Límites de las comunas de la región NN, con su código CUT |

La app lee primero el índice y descarga **solo** el archivo de la región donde cae la ubicación.
Un reporte en Santiago descarga `region-13.geojson`, de 84 KB, en lugar de los más de 3 MB del
país completo.

## Fuente

Biblioteca del Congreso Nacional de Chile, límites comunales generalizados, obtenidos del
repositorio `cortega26/chile-hub` (licencia MIT). Citar en el informe.

La geometría se simplificó para reducir peso. En las regiones de Aysén y Magallanes, cuyas costas
fragmentadas multiplican el tamaño, la simplificación es mayor y se descartaron islotes de menos
de unos 0,1 km². Ninguna comuna perdió su territorio principal.

La comuna Antártica no tiene geometría en la fuente. Un reporte allí no detectaría comuna y
quedaría con el organismo genérico.

## Validación

Se verificó con seis ubicaciones conocidas, cada una en su comuna correcta: Plaza de Armas de
Santiago, plaza de Maipú, Frutillar Bajo, Plaza Sotomayor en Valparaíso, Plaza de la
Independencia en Concepción y el centro de Punta Arenas.

## Archivo propio

Si el equipo prefiere usar otros límites, puede borrar `indice.json` y dejar un único
`comunas.geojson` en esta carpeta: la app lo usará como respaldo. El código CUT de cada comuna
debe venir en alguna de estas propiedades: `CUT_COM`, `COD_COMUNA`, `CODIGO`, `cod_comuna` o
`codigo_comuna`.
