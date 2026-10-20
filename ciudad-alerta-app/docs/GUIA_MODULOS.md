# Guía de módulos · App móvil Ciudad Alerta

> Fase 2: todas las funcionalidades viven en su módulo. En `src/app/pages` quedan solo el acceso y el inicio.

La app quedó dividida en **módulos**: cada funcionalidad (mapa, confianza, soporte…) declara en un solo archivo sus pantallas, sus botones del inicio y lo que agrega a otras pantallas. Un único archivo, `src/app/modulos.config.ts`, decide cuáles están encendidos.

**Para quitar algo:** `activo: false`. **Para ponerlo de nuevo:** `activo: true`. No hay que tocar ningún otro archivo.

---

## 1. Por qué

Los problemas entre el mapa de la web y el de la app, y la duplicación entre «Mapa» y «Cerca de mí» (feedback del Sprint 5), venían de lo mismo: cada pantalla sabía demasiado de las otras. El inicio tenía los botones escritos a mano, `app.routes.ts` tenía todas las rutas, y agregar una funcionalidad obligaba a tocar 4 o 5 archivos que no eran suyos.

Ahora:

| Antes | Ahora |
|---|---|
| Rutas en `app.routes.ts` | Cada módulo trae las suyas |
| Botones del inicio escritos a mano | Cada módulo declara su botón, con su rol y su orden |
| `AppComponent` arrancaba los avisos | El módulo de avisos se arranca solo, si está activo |
| Para mostrar algo en otra pantalla había que editarla | La pantalla deja una **ranura** y el módulo la llena |
| El mapa vivía en `components/` y lo editaban todos | Pieza compartida en `compartido/mapa`, con una sola API |
| Los números de confianza estaban en un documento | Están en `dominio/parametros.ts`, y el diagnóstico los compara con las reglas |

---

## 2. Dónde está cada cosa

```
src/app/
├── modulos.config.ts          ← EL INTERRUPTOR: qué módulos están activos
├── app.routes.ts              ← solo login, home y '**'; el resto lo suman los módulos
│
├── pages/                     ← solo el esqueleto: login y home
├── nucleo/modulos/            ← la mecánica (no se toca para agregar funcionalidades)
│   ├── modulo.model.ts        qué puede declarar un módulo
│   ├── registro.ts            funciones puras: rutas, botones, problemas de configuración
│   ├── modulos.service.ts     ModulosService.activo('id') y provideModulos()
│   ├── ranuras.ts             lista de ranuras y qué recibe cada una
│   └── ranura.component.ts    <app-ranura>
│
├── compartido/                ← piezas visuales que usan varios módulos
│   ├── mapa/                  el mapa Leaflet con agrupación de reportes
│   ├── tema/                  botón claro/oscuro
│   └── version-demo/          versión en los APK de demostración
│
├── services/                  ← datos compartidos (Firebase, ubicación, catálogos)
│   auth, report, report-query, routing, historial, comuna, catalogo-comunas,
│   regiones, geolocation, camera, photo-storage, privacidad, image-similarity, theme
├── models/                    ← report.model.ts y user-profile.model.ts (forma de los documentos)
├── guards/auth-guard.ts       ← con guion
│
└── modulos/
    ├── reportes/              paginas/{report, my-reports, report-detail}
    │                          componentes/similar-reports
    │                          datos/{confirmation, duplicate-detection}.service.ts
    ├── mapa-incidencias/      paginas/mapa · parametros.ts
    ├── cercanos/              paginas/nearby
    ├── confianza/             dominio/ · datos/ · componentes/ · paginas/mi-nivel
    ├── avisos/                paginas/avisos · componentes/avisos-campana · datos/ · modelo/
    ├── soporte/               paginas/{support, support-new, support-chat, support-inbox}
    │                          datos/support.service.ts · modelo/support.model.ts
    ├── gestion-reportes/      paginas/admin-reports
    └── municipalidades/       paginas/admin-organismos · datos/organismos.service.ts
```

**Dentro de un módulo** siempre las mismas carpetas, solo las que necesite: `paginas/` (pantallas con ruta), `componentes/` (piezas sin ruta), `datos/` (servicios que leen o escriben Firestore), `modelo/` (tipos propios), `dominio/` (reglas puras, sin Angular ni Firebase), `parametros.ts` (números ajustables), el manifiesto `<id>.modulo.ts` y su `index.ts`.

**¿Módulo o `services/`?** Un servicio que solo usa un módulo va en su `datos/` (soporte, avisos, municipalidades, confirmaciones). Uno que usan varios (crear y leer reportes, ubicación, comunas, regiones, sesión) queda en `services/`.

## 3. Las cuatro piezas

### 3.1 El manifiesto: `modulos/<id>/<id>.modulo.ts`

Todo lo que la app necesita saber de un módulo:

```ts
export const MODULO_MAPA_INCIDENCIAS: ModuloApp = {
  id: 'mapa-incidencias',                 // igual que el nombre de la carpeta
  nombre: 'Mapa de incidencias',
  descripcion: 'Mapa con los reportes de la zona visible…',
  opcionales: ['confianza'],              // lo usa si está activo
  rutas: [
    { path: 'map', canActivate: [authGuard],
      loadComponent: () => import('./paginas/mapa/mapa.page').then((m) => m.MapaPage) },
  ],
  accesos: [                              // botones del inicio
    { id: 'mapa-incidencias', texto: 'Mapa de incidencias', icono: 'map-outline', ruta: '/map', orden: 20 },
  ],
  iconos: { 'map-outline': mapOutline },  // los íconos de esos botones
};
```

| Campo | Para qué |
|---|---|
| `requiere` | Módulos sin los que este **no funciona**. Activarlo sin ellos es un error. |
| `opcionales` | Módulos que usa **si están**. El código pregunta `modulos.activo('id')`. |
| `rutas` | Sus pantallas. Siempre con `loadComponent` (carga diferida). |
| `accesos` | Botones del inicio: `roles` (quién los ve), `orden`, `estilo` (`principal`, `gestion`), `textoSegunRol`. |
| `ranuras` | Lo que pone en pantallas de otros módulos (ver 3.3). |
| `proveedores` | Servicios que deben arrancar con la app (ej. avisos). |

**Orden de los botones:** 10–50 ciudadano (los actuales), 60–90 nuevos para ciudadano, 100–199 staff.

**Guards:** el archivo es `src/app/guards/auth-guard.ts` (con guion, no `auth.guard.ts`). Desde un manifiesto:

```ts
import { authGuard, staffGuard } from '../../guards/auth-guard';
```

`npm run modulo -- nuevo` busca el archivo que exporta `authGuard` y escribe el import correcto solo.

### 3.2 El interruptor: `modulos.config.ts`

```ts
export const CONFIG_MODULOS: readonly EntradaModulo[] = [
  { modulo: MODULO_REPORTES, activo: true },
  { modulo: MODULO_MAPA_INCIDENCIAS, activo: true },
  …
  { modulo: MODULO_MUNICIPALIDADES, activo: false },   // ← quitado
];
```

Al desactivar un módulo desaparecen sus pantallas, sus botones y sus piezas en otras pantallas. Un enlace viejo a una pantalla desactivada lleva al inicio; nunca deja la pantalla en blanco.

### 3.3 Las ranuras: piezas en pantallas ajenas

Una pantalla deja un hueco con nombre:

```html
<app-ranura nombre="tarjeta-reporte.insignias" [entradas]="{ reporte: reporte }" />
```

y cualquier módulo lo llena desde su manifiesto:

```ts
ranuras: [
  { ranura: RANURAS.tarjetaReporteInsignias,
    cargar: () => import('./componentes/insignia-validacion.component').then((m) => m.InsigniaValidacionComponent) },
],
```

La pantalla **no importa al módulo**. Si nadie llena la ranura, muestra lo que tenga dentro (o nada). Así el detalle del reporte conserva su botón «Confirmar que existe» de siempre cuando el sistema de confianza está apagado.

| Ranura | Dónde | Entradas | Hoy la llena |
|---|---|---|---|
| `detalle-reporte.verificacion` | Detalle del reporte | `reporte`, `esAutor`, `alConfirmar` | confianza: barra y confirmación con peso |
| `tarjeta-reporte.insignias` | Mis reportes, Cerca de mí, Gestión | `reporte` | confianza: «Validado», «Verificación 45 %» |
| `inicio.resumen` | Inicio | `perfil` | confianza: tarjeta de nivel |
| `cabecera.acciones` | Barra superior de inicio, mapa, Mis reportes y Cerca de mí | (ninguna) | avisos: la campana |

Una ranura nueva se agrega en `nucleo/modulos/ranuras.ts` (con su contrato) y se pone en la pantalla. El componente que la llene necesita un `input()` por cada entrada, con el mismo nombre.

### 3.4 `compartido/` y `dominio/`

- **`compartido/`**: piezas sin pantalla que usan varios módulos: el mapa, el botón de tema y la versión demo. Se importan siempre desde la carpeta (`'../../compartido/mapa'`), nunca desde el archivo interno.
- **`dominio/`** (dentro de un módulo): TypeScript puro, sin Angular ni Firebase. `confianza/dominio/calculos.ts` es exactamente la lógica de las reglas de Firestore. **El portal web puede importarlo tal cual** desde el mismo repositorio, y así la web y la app nunca calculan distinto.

---

## 4. Recetas

Todos los comandos se ejecutan en `cmd` desde la carpeta del proyecto.

### Ver qué módulos hay

```cmd
npm run modulos
```

### Quitar una funcionalidad (ejemplo: Municipalidades, como pide el feedback)

```cmd
npm run modulo -- desactivar municipalidades
ionic serve
```

o a mano: `activo: false` en su línea de `modulos.config.ts`. Para volver: `npm run modulo -- activar municipalidades`.

Si otro módulo activo lo **requiere**, el comando se niega y dice cuál.

### Borrar un módulo del todo

1. Desactívalo y prueba la app.
2. Borra su carpeta `src\app\modulos\<id>` y sus dos líneas en `modulos.config.ts` (el `import` y la entrada).
3. `npm run diagnostico`: avisa si alguien lo seguía nombrando (`opcionales`, `activo('id')`).

Probado: borrando la carpeta completa de `confianza`, la app compila y funciona con la confirmación simple.

### Crear un módulo nuevo (ejemplo: mapa de calor para staff)

```cmd
npm run modulo -- nuevo mapa-calor --nombre "Mapa de calor" --staff
ionic serve
```

Crea `src\app\modulos\mapa-calor\` con manifiesto, `index.ts` y una pantalla `/mapa-calor`, y lo agrega activo a `modulos.config.ts`. El botón aparece en el inicio (con `--staff`, solo para operador y admin). Después:

1. Escribe la pantalla en `paginas\mapa-calor\`.
2. Si lee o escribe Firestore, agrega la regla en `firestore.rules`.
3. `npm run diagnostico`.

### Mostrar algo de mi módulo en una pantalla de otro

Usa una ranura existente o crea una (3.3). No edites la pantalla del otro módulo más allá de poner `<app-ranura>`.

### Usar código de otro módulo

1. Que lo exporte en su `index.ts`.
2. Declararlo en `requiere` (si sin él no funcionas) u `opcionales` (si puedes vivir sin él).
3. Importar **solo** desde la carpeta: `import { nivelDePuntos } from '../confianza';`
4. Si es opcional, preguntar antes: `if (modulos.activo('confianza')) { … }`.

---

## 5. Reglas de convivencia (las revisa `npm run diagnostico`)

| Regla | Si no se cumple |
|---|---|
| Cada carpeta de `modulos/` tiene `<id>.modulo.ts` con el mismo `id` | error |
| Cada módulo está en `modulos.config.ts` | advertencia: la app no lo carga |
| Un módulo activo no requiere uno inactivo o inexistente | error |
| Dos módulos activos no comparten ruta ni botón | error |
| Los íconos de los botones están en `iconos` | error |
| Las ranuras usadas en pantallas y manifiestos existen en `ranuras.ts` | error |
| Nadie importa el **interior** de otro módulo (solo su `index.ts`) | advertencia |
| Un módulo que usa otro lo declara en `requiere` u `opcionales` | advertencia |
| El código fuera de `modulos/` no importa módulos (usa ranuras o `activo()`) | advertencia |
| `activo('id')` nombra un módulo que existe | advertencia |
| En `src/app/pages` solo hay `login` y `home`, y no existe `src/app/components` | advertencia |
| Los números de `confianza/dominio/parametros.ts` son los de `firestore.rules` | error |

La última compara, valor por valor, `nivelDePuntos` (0 a 800 PC), `pesoDeNivel` y `limiteDiario` (niveles 0 a 10), el día con desfase UTC−3, la pausa de 20 s, las 24 h, el umbral 100/3 y los +10/−15 con tope 760.

---

## 6. Mapa de incidencias: tu región completa

Feedback del Sprint 5 y casos **MS8** y **MS9** de Claudio:

- *«Solo se ven incidencias cercanas»*: el mapa buscaba 2-3 km alrededor del usuario, así que para alguien en Maipú los reportes de Cerrillos o Estación Central no existían.
- Varios reportes en el mismo punto se tapaban.

Ahora:

- **Abre con todas las incidencias de tu región.** La región sale de tu ubicación, con los mismos límites comunales que se usan al crear un reporte. El selector dice «Mi región · Metropolitana de Santiago».
- **«Región» permite ver cualquiera de las 16**, de norte a sur. Funciona aunque no des permiso de ubicación.
- **Cada reporte se dibuja en sus coordenadas** (`ubicacion.lat/lng`) y el mapa se ajusta para mostrarlos todos (MS8).
- **Los que están juntos se agrupan** en un círculo con el total. Al tocarlo, el mapa se acerca hasta separarlos; si siguen juntos con el máximo acercamiento, aparece la lista con «Ver detalle» (MS9).
- Los validados por la comunidad llevan un pin con ✓ (si el módulo de confianza está activo).
- Al volver desde el detalle no se vuelve a consultar; para eso está **Actualizar**.

**Cómo consulta.** `ReportQueryService.porRegion()` hace una consulta `where('region', '==', …)` ordenada por fecha, con un máximo de 500 reportes (los más recientes). Para eso hay un **índice nuevo**, `reports(region, createdAt)`, en `firestore.indexes.json`:

```cmd
firebase deploy --only firestore:indexes
```

Mientras el índice no esté, la consulta se repite sin ordenar y el mapa funciona igual (con un aviso en la consola).

**Reportes antiguos sin `region`.** Se buscan además por comuna (`incluirSinRegion` en `modulos/mapa-incidencias/parametros.ts`). Cuando el script de abajo haya completado la región de todos, cámbialo a `false`: ahorra 2 consultas en la Metropolitana.

**«Cerca de mí»** sigue siendo la lista ordenada por distancia alrededor del usuario. Ahora cada pantalla tiene un propósito distinto.

### Revisar las coordenadas guardadas (lo que pidió Claudio)

```cmd
set GOOGLE_APPLICATION_CREDENTIALS=C:\claves\ciudad-alerta-admin.json
node scripts/ubicaciones-reportes.mjs --csv
```

Lista cada reporte con **reportId, comuna, latitud y longitud** tal como están en Firestore, más la precisión y el campo donde vienen las coordenadas. Agrupa los que están a menos de 30 m y marca:

- coordenadas faltantes, invertidas, fuera de Chile o en un punto por defecto;
- precisión baja (más de 500 m): típico de un computador sin GPS, que pone a todos en el mismo lugar;
- comuna o región que no calza con las coordenadas;
- geohash incorrecto.

Deja `diagnostico\ubicaciones.md` y `diagnostico\ubicaciones.csv` (se abre en Excel). Con `--aplicar` completa `region`, `comuna` faltante y `geohash`, y guarda antes un respaldo. Nunca toca coordenadas, comunas ya guardadas, organismo ni operador.

**Cómo leer el resultado:**

- Si los 13 reportes salen con coordenadas casi iguales en Maipú, el mapa está bien: los agrupa (MS9).
- Si se crearon en lugares distintos, el problema está en cómo se tomó la ubicación al reportar (precisión baja o el mismo teléfono), no en Leaflet.

## 7. Sistema de confianza en la app

Implementado **exactamente sobre las reglas del equipo** (el `firestore.rules` nuevo). Donde `sistema_confianza.md` y las reglas difieren, manda lo que dicen las reglas.

| Historia | Estado en la app |
|---|---|
| **A2** Mi nivel | Pantalla `/mi-nivel`: nivel y nombre, PC, barra al siguiente nivel, reportes reales/falsos, valor del voto, confirmaciones de hoy, historial de veredictos, aviso de subida de nivel (una vez), copia sin conexión |
| **A3** Confirmar con peso | Barra 0–100 %, personas que confirmaron, «Validado por la comunidad», transacción voto + suma + contador (si dos confirman a la vez, Firestore repite la segunda) |
| **A4** Mensajes de límites | Límite diario con hora de reinicio, pausa con cuenta regresiva, suspendido, correo sin verificar, cuenta de menos de 24 h, propio, ya confirmado, revisado por un operador |
| **A5** (parte app) | Insignia en Mis reportes, Cerca de mí y Gestión; pin destacado en el mapa |
| **A11** Explicación | Se ofrece tras la primera confirmación; sección «¿Cómo funciona?» con tabla de niveles en `/mi-nivel` |
| A6–A8, A12 | Web o fase siguiente: no están en la app |

**Cómo confirma la app** (`confianza/datos/confianza.service.ts`), en una transacción:

1. lee el reporte, su voto, `users/{uid}/confianza/actual` y `users/{uid}/limites/{día}`;
2. calcula nivel, peso, suma y contador con `dominio/calculos.ts`;
3. escribe `confirmations/{uid}` `{uid, reportId, createdAt, nivel, peso}`, `validacion.*` del reporte (solo si el peso es mayor que 0) y el contador del día.

**Bordes cubiertos:**

- **Correo recién verificado:** las reglas leen `email_verified` del token de sesión. Si Auth ya lo sabe, pero el token es viejo, la app lo renueva antes de confirmar.
- **Medianoche y 24 h:** si las reglas rechazan cerca de esos bordes, la app reintenta con el día o la antigüedad de un reloj corrido ±2 minutos (5.3, «borde de la medianoche»).

### Puntos para coordinar con el equipo

1. **Perfiles sin `createdAt`.** Su voto pesa 0 para siempre. La app completa la fecha la primera vez (las reglas lo permiten una vez), así que pesan desde 24 h después. El script de migración (A9) debería copiar la fecha real de Firebase Auth con el Admin SDK.
2. **Las correcciones DIAG no están en las reglas nuevas.** Las brechas DIAG-1 (operador cambia su `operadorId`) y DIAG-2 (correo de admin sin verificar) volvieron. Con los veredictos, DIAG-1 ahora también permite **restar puntos a vecinos de otra comuna**. Conviene reaplicarlas sobre esta versión.
3. **`notifLeidasHasta`** (5.7) no está en la lista blanca de `users`: el portal no podrá guardarlo así.
4. **Veredicto revertido (A8)**: las reglas actuales no lo permiten.
5. **Nuevos reportes sin `validacion`:** las reglas lo aceptan y la app lo lee como cero. Si el portal filtra `where('validacion.validado', '==', false)`, esos reportes no aparecen. O se crea el mapa en cero al reportar, o lo pone el script A9.

---

## 8. El portal web (mismo repositorio)

- `src/app/modulos/confianza/dominio/` no depende de Angular ni de Ionic. El portal puede importarlo directamente (o con un alias de `tsconfig`), y así la web y la app calculan igual: niveles, pesos, porcentajes y efecto de un veredicto (`puntosTrasVeredicto`).
- `compartido/mapa/map-view.component.ts` es Angular + Leaflet sin Ionic: el portal puede usar el mismo componente, con agrupación y `[encuadre]`, en vez de mantener otro mapa. Necesita los estilos de `src/theme/mapa.scss`.
- `services/regiones.service.ts` y `ReportQueryService.porRegion()` le sirven al mapa de calor por comuna: las regiones, sus comunas y sus cajas salen de los mismos archivos de la app.
- La misma estructura (`nucleo/`, `modulos/`, `modulos.config.ts`) se puede aplicar al portal cuando lo decidan.

---

## 9. Instalar la fase 2

La fase 2 viene en `modularizacion-fase2.bundle`: **21 commits a nombre de Rodrigo0000000** encima del último commit de `main-mobile` en GitHub (`21a2929`, «hotfixes: map-view auth report-detail»), dentro de `ciudad-alerta-app/`. Un *bundle* es un repositorio en un solo archivo.

En la carpeta del repositorio (`Proyecto_Capstone`), en `cmd`:

```cmd
:: 1. Deja main-mobile igual que en GitHub
git switch main-mobile
git pull origin main-mobile
git status
:: Si aparecen archivos de entregas que copiaste a mano, guárdalos aparte (ya vienen en los commits):
git stash -u

:: 2. Trae los commits y avanza main-mobile
git fetch C:\ruta\modularizacion-fase2.bundle modularizacion-fase2:modularizacion-fase2
git merge --ff-only modularizacion-fase2

:: 3. Revisa y sube
cd ciudad-alerta-app
npm install
npm run modulos
npm run diagnostico
ionic serve
git push origin main-mobile
```

Si `git merge --ff-only` se niega, es porque `main-mobile` tiene commits locales que no están en GitHub: no fuerces nada y avísame.

**Después de subir:**

```cmd
firebase deploy --only firestore:indexes
node scripts/ubicaciones-reportes.mjs --csv
```

### Commits

`git log --oneline origin/main-mobile..modularizacion-fase2` los lista:

1. Entregas pendientes del 9 al 20 de octubre (lo que no estaba en GitHub).
2. «modularización fase 1»: núcleo de módulos, mapa compartido, sistema de confianza y reglas del equipo.
3. Tema y versión demo pasan a `compartido/`.
4. Ranura `cabecera.acciones`: la campana llega por ella.
5–11. Avisos, soporte, gestión, municipalidades, cercanos y reportes (dos commits) pasan a sus módulos; desaparece `src/app/components`. Los `*.spec.ts` y archivos sobrantes de cada carpeta se mueven con ella.
12–14. Regiones: catálogo, consulta por región con índice y encuadre en el mapa compartido.
15–16. Mapa con todas las incidencias de la región y selector.
17. «Cancelar» en rojo (feedback).
18–19. Script de ubicaciones y casos MS8/MS9 en el plan de pruebas.
20. Diagnóstico de la estructura.
21. «modularización fase 2»: esta guía.
