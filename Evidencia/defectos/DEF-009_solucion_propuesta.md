# DEF-009 · Faltan índices de Firestore en el proyecto real (listados y conteos fallan con «The query requires an index»)

**Detectado el 2026-10-31** al abrir el portal contra el proyecto real `ciudadalerta`. Las pruebas automáticas no lo ven: el emulador
de Firestore **no comprueba índices**; solo Firestore real lo hace.

**Evidencia:** `DEF-009_consola-resumen-1.png` y `-2.png` (Resumen del administrador), `DEF-009_consola-operador.png` (Reportes del
operador) y `DEF-009_indices-proyecto-1.png` y `-2.png` (índices que tenía el proyecto).

## Qué fallaba

| Pantalla | Consulta | Lo que pidió Firestore |
|---|---|---|
| Resumen del administrador (`useConteo.ts`) | contar reportes con `estado == reportado` y `createdAt < antes de ayer` («sin atender») | `estado` + `createdAt` (en ese momento el proyecto no tenía ningún índice compuesto de `reports` del portal) |
| Reportes del operador (`useReportesPaginados.ts`, listado y total) | `operadorId == X` + `estado == reportado` + rango de `createdAt` (31-jul a 1-nov), ordenado por fecha | `estado` + `operadorId` + `createdAt` |

## Por qué Firestore pide un índice compuesto

- Una consulta solo con **igualdades** (con o sin orden por fecha) se resuelve **combinando índices**: basta un índice `campo + createdAt`
  por cada campo. Por eso `operadorId`, `estado`, `categoria`, `comuna` y `validacion.validado`, cada uno con `createdAt` descendente,
  cubren sus combinaciones **sin rango de fechas**.
- En cuanto la consulta lleva un **rango de fechas** (`desde` / `hasta`, o el aviso de «reportes nuevos», o el conteo de «sin atender»),
  la documentación solo permite combinar índices para consultas de igualdad: hace falta **un índice compuesto con todos los campos de
  igualdad más `createdAt`**. Cada combinación de filtros + rango necesita el suyo.

## Qué había en el proyecto frente al archivo `portal-web/firestore.indexes.json` (14 índices)

El proyecto (captura del 2026-10-31, 14 índices) tenía 13 de los 14 del archivo y 1 que el archivo no tenía:

| Índice | En el proyecto | En el archivo |
|---|---|---|
| `validacion.veredicto` ↑ + `createdAt` ↓ | **No** | Sí |
| `estado` ↑ + `operadorId` ↑ + `createdAt` ↓ | Sí (creado con el enlace del error; compilando) | **No** (un despliegue ofrecería borrarlo) |
| `operadorId` ↑ + `createdAt` ↓ | Compilando | Sí |
| los otros 12 (uid, categoria, comuna, region, estado, validado, organismo.id + validado, uid + updatedAt, categoria + geohash, 2 de `supportTickets`, 1 de `organismos`) | Habilitados | Sí |

Mientras un índice figura «Compilando» las consultas que lo usan siguen fallando; parte de lo visto en consola era eso.

## Índices que hay que tener

**1. Falta en el proyecto (ya está en el archivo): desplegarlo**
- `reports`: `validacion.veredicto` ↑, `createdAt` ↓. Lo usa el filtro «Real» / «Falso» de los listados (con y sin fechas).

**2. Está en el proyecto y faltaba en el archivo: agregarlo al archivo**
- `reports`: `estado` ↑, `operadorId` ↑, `createdAt` ↓.

**3. Recomendados, faltan en ambos (listado del operador con rango de fechas y un filtro más): se agregan al archivo**
- `reports`: `categoria` ↑, `operadorId` ↑, `createdAt` ↓
- `reports`: `validacion.validado` ↑, `operadorId` ↑, `createdAt` ↓
- `reports`: `validacion.veredicto` ↑, `operadorId` ↑, `createdAt` ↓

**4. Resto de combinaciones con rango de fechas: crearlas solo cuando se usen**
- Operador: con dos o más filtros a la vez más el rango (categoría + estado, estado + verificación…): 8 combinaciones más.
- Administrador: unas 40 combinaciones (categoría, estado, comuna, verificación y operador entre sí, con rango).
- El listado ya muestra «Falta un índice de Firestore para esta combinación de filtros» con un botón **Crear el índice**. Al crearlo
  con ese enlace hay que **agregarlo también al archivo**, para que un despliegue no lo borre.

## Límites de Firestore a tener en cuenta

- **Índices compuestos por base de datos: 200** si el proyecto no tiene facturación y **1.000** con facturación. Hoy hay 14; con lo
  recomendado quedan **18**. Crear las ~50 combinaciones restantes también cabría, pero no conviene: **cada índice compuesto se actualiza
  en cada escritura de un reporte** (más costo y más tiempo de escritura) y casi nadie usa esas combinaciones.
- Límites por documento: 40.000 entradas de índice y 1 MiB; con unos 20 índices no hay riesgo.
- Un índice nuevo tarda desde segundos hasta varios minutos en pasar de «Compilando» a «Habilitado».

## Cambio aplicado (sin desplegar)

Se agregaron al archivo `portal-web/firestore.indexes.json` los puntos 2 y 3 (4 índices; el punto 1 ya estaba). Queda en **18 índices**.
**Falta desplegarlo y comprobar en el portal real**: eso no lo puede hacer una prueba automática.

```cmd
cd portal-web
firebase deploy --only firestore:indexes --project ciudadalerta
```

Si la herramienta pregunta si borrar índices que no están en el archivo, responder **No**. Esperar a que todos digan «Habilitado» en
Firebase → Firestore → Índices, recargar el portal y repetir los pasos de la prueba WX5.

## Aviso para el equipo móvil

Un despliegue de índices con **su** archivo (11 índices de `reports`) borraría los del portal que no están allí. Lo ideal es que usen el
mismo archivo (los 18) o que no usen `--force`.
