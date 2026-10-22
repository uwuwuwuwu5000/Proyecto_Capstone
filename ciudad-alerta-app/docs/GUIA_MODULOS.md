# Guía de módulos · App móvil Ciudad Alerta

> **Fase 3.** La lógica que debe dar lo mismo en la app y en el portal está en un paquete compartido, `comun/`. El cambio de estado pasa al módulo de gestión, hay un módulo «Mi perfil», los servicios de un solo módulo viven en ese módulo y la app tiene pruebas automáticas (`npm run test:una-vez`). La rama `main-web` no se tocó.
>
> **Octubre.** El difuminado de rostros corre en la nube (`servicio-privacidad/`) y el teléfono ya no carga TensorFlow; quien gestiona un reporte puede marcarlo como real o falso, y el autor recibe el aviso. Ver la sección 11.

La app está dividida en **módulos**: cada funcionalidad (mapa, confianza, soporte…) declara en un solo archivo sus pantallas, sus botones del inicio y lo que agrega a otras pantallas. Un único archivo, `src/app/modulos.config.ts`, decide cuáles están encendidos.

**Para quitar algo:** `activo: false`. **Para ponerlo de nuevo:** `activo: true`. No hay que tocar ningún otro archivo.

---

## 1. Por qué

Los problemas entre el mapa de la web y el de la app, y la duplicación entre «Mapa» y «Cerca de mí» (feedback del Sprint 5), venían de lo mismo: cada pantalla sabía demasiado de las otras, y la web y la app repetían a mano las mismas reglas.

| Antes | Ahora |
|---|---|
| Rutas en `app.routes.ts` | Cada módulo trae las suyas |
| Botones del inicio escritos a mano | Cada módulo declara su botón, con su rol y su orden |
| Para mostrar algo en otra pantalla había que editarla | La pantalla deja una **ranura** y el módulo la llena |
| El detalle de un reporte decidía quién podía cambiar el estado | Lo decide el módulo de gestión, en la ranura `detalle-reporte.gestion` |
| Estados, colores, confianza y privacidad copiados en la app y en el portal | Una sola copia en `comun/`, con pruebas que la comparan con `firestore.rules` |
| Los datos de la cuenta estaban en el inicio | Están en «Mi perfil»; el inicio quedó liviano |
| 37 pruebas vacías («should create»), una ni compilaba | Pruebas reales que corren sin red: `npm run test:una-vez` |

---

## 2. Dónde está cada cosa

```
Proyecto_Capstone/
├── comun/                         ← PAQUETE COMPARTIDO con el portal (TypeScript puro)
│   ├── src/reportes/              estados, categorías, descripción, tiempos, gestión
│   ├── src/confianza/             niveles, pesos, límites, validación, veredictos
│   ├── src/territorio/ · geo/     comunas, códigos CUT, cajas, distancias
│   ├── src/privacidad/            umbrales y geometría del difuminado
│   └── test/                      npm test (Vitest)
│
├── servicio-privacidad/           ← DIFUMINADO EN LA NUBE (Node, en Render): LEEME.md
│   ├── src/                       servidor, token de sesión, modelos, pixelado
│   └── modelos/                   coco-ssd y face-detection (antes en la app)
├── render.yaml                    cómo lo publica Render
│
└── ciudad-alerta-app/src/
    ├── testing/                   ← ayudas de pruebas: Firebase sin red, módulos ficticios
    ├── test-setup.ts              registra esas ayudas para todas las pruebas
    └── app/
        ├── modulos.config.ts      ← EL INTERRUPTOR: qué módulos están activos
        ├── app.routes.ts          ← solo login, home y '**'; el resto lo suman los módulos
        ├── pages/                 ← solo el esqueleto: login y home
        ├── nucleo/modulos/        ← la mecánica (no se toca para agregar funcionalidades)
        ├── compartido/            ← mapa, tema, sesion (Cerrar sesión), version-demo
        ├── core/                  ← Firebase y la lista de administradores
        ├── services/              ← lo que usan varios módulos:
        │   auth, report-query, routing (asignación e historial), historial,
        │   comuna, catalogo-comunas, geolocation, theme
        ├── models/                ← report.model (tipos de un reporte), organismo.model,
        │                            user-profile.model
        ├── guards/auth-guard.ts   ← con guion
        └── modulos/
            ├── reportes/          paginas/{report, my-reports, report-detail} · componentes/similar-reports
            │                      datos/ (report, camera, photo-storage, privacidad → nube, image-similarity,
            │                      confirmation, duplicate-detection) · modelo/ · parametros.ts (URL del servicio)
            │                      · rutas.ts · resolucion.ts
            ├── mapa-incidencias/  paginas/mapa · datos/regiones.service.ts · parametros.ts
            ├── cercanos/          paginas/nearby · parametros.ts
            ├── confianza/         datos/ (confianza, veredicto) · componentes/ (… veredicto-reporte)
            │                      · paginas/mi-nivel (los números, en comun)
            ├── avisos/            paginas/avisos · componentes/avisos-campana · datos/ · modelo/
            ├── soporte/           paginas/{support, support-new, support-chat, support-inbox} · datos/ · modelo/
            ├── gestion-reportes/  paginas/admin-reports · componentes/gestion-reporte · datos/cambio-estado.service.ts
            ├── municipalidades/   paginas/admin-organismos · datos/organismos.service.ts
            └── perfil/            paginas/mi-perfil · componentes/{verificacion-correo, aviso-verificacion}
                                   datos/perfil.service.ts · modelo.ts
```

**Dentro de un módulo** siempre las mismas carpetas, solo las que necesite: `paginas/` (pantallas con ruta), `componentes/` (piezas sin ruta), `datos/` (servicios que leen o escriben Firestore, o que usan la cámara o un servicio externo), `modelo/` (tipos propios), `parametros.ts` (números ajustables), el manifiesto `<id>.modulo.ts` y su `index.ts`. Las reglas puras que también necesita el portal ya no van en `dominio/`: van en `comun/`.

**¿Módulo, `services/` o `comun/`?**

- Un servicio que **solo usa un módulo** va en su `datos/` (crear reportes, cámara y fotos en `reportes`; regiones en `mapa-incidencias`; cambio de estado en `gestion-reportes`).
- Uno que **usan varios** queda en `services/` (sesión, consultas de reportes, comunas, ubicación, historial).
- Una **regla que debe dar lo mismo en la app y en el portal**, sin Angular ni Firebase, va en `comun/`.

## 3. Las piezas

### 3.1 El manifiesto: `modulos/<id>/<id>.modulo.ts`

```ts
export const MODULO_MAPA_INCIDENCIAS: ModuloApp = {
  id: 'mapa-incidencias',                 // igual que el nombre de la carpeta
  nombre: 'Mapa de incidencias',
  descripcion: 'Mapa con todas las incidencias de tu región…',
  requiere: ['reportes'],                 // cada marcador abre el detalle del reporte
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
| `accesos` | Botones del inicio: `roles` (quién los ve), `orden`, `estilo` (`principal`, `gestion`), `seccion` (`explorar`, `cuenta`, `gestion`) y `textoSegunRol`. |
| `ranuras` | Lo que pone en pantallas de otros módulos (ver 3.3), con `orden` si hay varios. |
| `proveedores` | Lo que debe existir en toda la app: los avisos arrancan con ella; reportes registra `PHOTO_STORAGE`. |

**Orden de los botones:** 10–50 ciudadano, 60–90 nuevos para ciudadano (Mi perfil es 90), 100–199 staff.

**Grupos del inicio** (`seccion`): la acción principal va sola y destacada; debajo, en cuadros de dos columnas, «Explorar» (mapa, cerca de mí), «Tu cuenta» (mis reportes, quejas, perfil) y «Gestión» (solo staff). Sin `seccion`, un botón con `estilo: 'gestion'` va a «Gestión» y el resto a «Tu cuenta». Un grupo sin botones para el rol no aparece.

**Guards:** el archivo es `src/app/guards/auth-guard.ts` (con guion, no `auth.guard.ts`):

```ts
import { authGuard, staffGuard } from '../../guards/auth-guard';
```

`npm run modulo -- nuevo` escribe ese import solo.

### 3.2 El interruptor: `modulos.config.ts`

```ts
export const CONFIG_MODULOS: readonly EntradaModulo[] = [
  { modulo: MODULO_REPORTES, activo: true },
  …
  { modulo: MODULO_MUNICIPALIDADES, activo: false },   // ← quitado
  { modulo: MODULO_PERFIL, activo: true },
];
```

Al desactivar un módulo desaparecen sus pantallas, sus botones y sus piezas en otras pantallas. Un enlace viejo a una pantalla desactivada lleva al inicio.

Desactivar `reportes` sin desactivar antes avisos, cercanos, confianza, gestión y el mapa es un error: los cinco lo **requieren** (abren el detalle de un reporte).

### 3.3 Las ranuras: piezas en pantallas ajenas

Una pantalla deja un hueco con nombre:

```html
<app-ranura nombre="detalle-reporte.gestion" [entradas]="{ reporte: item, alCambiar: alCambiarEstado }" />
```

y cualquier módulo lo llena desde su manifiesto:

```ts
ranuras: [
  { ranura: RANURAS.detalleReporteGestion,
    cargar: () => import('./componentes/gestion-reporte/gestion-reporte.component').then((m) => m.GestionReporteComponent) },
],
```

La pantalla **no importa al módulo**. Si nadie llena la ranura, muestra lo que tenga dentro (o nada).

| Ranura | Dónde | Entradas | Hoy la llena |
|---|---|---|---|
| `detalle-reporte.verificacion` | Detalle del reporte | `reporte`, `esAutor`, `alConfirmar` | confianza: barra y confirmación con peso |
| `detalle-reporte.gestion` | Detalle del reporte, al final | `reporte`, `alCambiar` | gestión: botones de estado, motivo para otro operador, «Reportado por» (orden 0) · confianza: veredicto «Es real / Es falso» (10) |
| `tarjeta-reporte.insignias` | Mis reportes, Cerca de mí, Gestión | `reporte` | confianza: «Validado», «Verificación 45 %» |
| `inicio.resumen` | Inicio, bajo el saludo | `perfil` | perfil: «Verifica tu correo» (orden −10) · reportes: «Tus reportes» (0) · gestión: «Por atender» (5, solo staff) · confianza: nivel (10) |
| `perfil.resumen` | Mi perfil | `perfil` | confianza: tarjeta de nivel |
| `cabecera.acciones` | Barra superior | (ninguna) | avisos: la campana |

Las tarjetas del inicio usan `compartido/tarjeta-resumen` (ícono, título, detalle, nota y enlace) para verse todas igual.

**Contrato:** la pieza que llena una ranura declara un `input()` **por cada entrada**, con el mismo nombre, aunque no la use. Si falta uno, Angular falla con NG0303 al abrir la pantalla; el diagnóstico lo detecta antes.

### 3.4 `compartido/`

Piezas sin pantalla que usan varios módulos: el mapa, el botón de tema, la versión demo y `sesion` (el botón «Cerrar sesión», que usan el inicio y Mi perfil). Se importan desde la carpeta (`'../../compartido/sesion'`).

### 3.5 `comun/`: lo que comparten la app y el portal

Está en la **raíz del repositorio**, al lado de `ciudad-alerta-app/`, y la app lo usa con un alias:

```ts
import { ETIQUETAS_ESTADO, formatearDuracion, permisoDeGestion } from '@ciudad-alerta/comun';
```

El alias está en `ciudad-alerta-app/tsconfig.json` (`paths`). No se instala nada en la app: Angular compila esos archivos como propios.

| Carpeta | Qué hay |
|---|---|
| `reportes/` | Estados, transiciones, etiquetas, colores, categorías, largo de la descripción |
| `reportes/tiempos.ts` | Primera atención, resolución, mediana, «2 h 15 min» (traído del portal) |
| `reportes/gestion.ts` | Quién puede cambiar el estado (`permisoDeGestion`) y qué datos de resolución acompañan al cambio |
| `confianza/` | Niveles, pesos, límites diarios, validación, veredictos (antes `confianza/dominio`) |
| `territorio/` · `geo/` | Comunas, códigos CUT, mapa de calor por comuna, cajas, distancias |
| `privacidad/` | Umbrales y geometría del difuminado de rostros |

Reglas:

1. **TypeScript puro.** Nada de Angular, React, Ionic ni Firebase. El diagnóstico lo revisa.
2. **Lo que dependa de `firestore.rules` debe coincidir con ellas.** Las pruebas de `comun/test` transcriben las fórmulas de las reglas.
3. **Un commit que toca `comun/` no toca nada más.** Así se puede pasar tal cual a `main-web` cuando el equipo lo decida (`comun/LEEME.md` explica cómo, sin modificar la rama ahora).

```cmd
cd comun
npm install
npm test
npm run tipos
```

---

## 4. Recetas

Todos los comandos se ejecutan en `cmd` desde `ciudad-alerta-app`.

### Ver qué módulos hay

```cmd
npm run modulos
```

### Quitar una funcionalidad (ejemplo: Municipalidades)

```cmd
npm run modulo -- desactivar municipalidades
ionic serve
```

o a mano: `activo: false` en su línea de `modulos.config.ts`. Si otro módulo activo lo **requiere**, el comando se niega y dice cuál.

### Borrar un módulo del todo

1. Desactívalo y prueba la app.
2. Borra su carpeta `src\app\modulos\<id>` y sus dos líneas en `modulos.config.ts`.
3. `npm run diagnostico` y `npm run test:una-vez`: avisan si alguien lo seguía nombrando.

### Crear un módulo nuevo

```cmd
npm run modulo -- nuevo mapa-calor --nombre "Mapa de calor" --staff
```

Crea el manifiesto, `index.ts` y una pantalla, y lo agrega activo. Así se creó `perfil` en esta fase (commit «módulo Mi perfil creado con npm run modulo»). Después: escribe la pantalla, agrega la regla en `firestore.rules` si lee o escribe Firestore, y `npm run diagnostico`.

### Mostrar algo de mi módulo en una pantalla de otro

Usa una ranura existente o crea una en `nucleo/modulos/ranuras.ts` (con su contrato) y ponla en la pantalla con `<app-ranura>`.

### Usar código de otro módulo

1. Que lo exporte en su `index.ts`.
2. Declararlo en `requiere` u `opcionales`.
3. Importar **solo** desde la carpeta.
4. Si es opcional, preguntar antes: `if (modulos.activo('confianza')) { … }`.

Ejemplo de esta fase, para abrir el detalle de un reporte desde otro módulo:

```ts
import { RUTAS_REPORTES } from '../../../reportes';

this.router.navigate(RUTAS_REPORTES.detalle(reporte.id));
```

### Escribir una prueba

Junto al archivo, con el mismo nombre y `.spec.ts`, y **siempre** empezando con `usarEntornoDePrueba()`: registra Ionic, el router y Firebase sin red para cada prueba del archivo. Lo que lea datos se simula reemplazando el servicio:

```ts
import { usarEntornoDePrueba } from '../../testing';

usarEntornoDePrueba();

describe('MiPantalla', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { user: { uid: 'u1' }, getUserProfile: vi.fn() } }],
    });
  });
  …
});
```

No se pone en `src/test-setup.ts`: en Windows, Angular carga ese archivo con otra copia de `TestBed` y los proveedores no llegan a las pruebas (fallaban 32 con «No provider found for InjectionToken FIRESTORE»). `test-setup.ts` queda solo para polyfills. El diagnóstico avisa si una prueba no llama a `usarEntornoDePrueba()`.

Para el núcleo hay módulos ficticios en `src/testing/modulos-de-prueba.ts` y el token `CONFIGURACION_MODULOS`.

```cmd
npm run test:una-vez
npm test
```

`npm test` se queda mirando los cambios. Lo que Firestore acepta o rechaza no se prueba aquí: eso es `npm run diagnostico:reglas`, en el emulador.

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
| Cada pieza de ranura declara los inputs que la pantalla le pasa | error (NG0303) |
| Nadie importa el **interior** de otro módulo (solo su `index.ts`); `src/testing` sí puede | advertencia |
| Un módulo que usa otro lo declara en `requiere` u `opcionales` | advertencia |
| `activo('id')` nombra un módulo que existe | advertencia |
| En `src/app/pages` solo hay `login` y `home` | advertencia |
| `comun/` no importa Angular, React, Ionic ni Firebase | error |
| La app importa `comun` con el alias, no con una ruta relativa | advertencia |
| Categorías, transiciones y organismos genéricos son los de `firestore.rules` | error |
| Los números de `comun/src/confianza/parametros.ts` son los de `firestore.rules` | error |

Las pruebas (`npm run test:una-vez`) revisan además la configuración real: sin problemas, y al desactivar cualquier módulo solo se quejan los que lo requieren.

---

## 6. Mapa de incidencias: tu región completa

Feedback del Sprint 5 y casos **MS8** y **MS9** de Claudio:

- **Abre con todas las incidencias de tu región.** La región sale de tu ubicación, con los mismos límites comunales que se usan al crear un reporte.
- **«Región» permite ver cualquiera de las 16**, de norte a sur, aunque no des permiso de ubicación.
- **Cada reporte se dibuja en sus coordenadas** y el mapa se ajusta para mostrarlos todos (MS8).
- **Los que están juntos se agrupan** en un círculo con el total; al tocarlo se separan (MS9).
- Al volver desde el detalle no se vuelve a consultar; para eso está **Actualizar**.

`ReportQueryService.porRegion()` consulta `where('region', '==', …)` ordenado por fecha, hasta 500 reportes, con el índice `reports(region, createdAt)`. Las regiones salen de `modulos/mapa-incidencias/datos/regiones.service.ts`, que ahora usa las cajas y los códigos de `comun`.

Para revisar las coordenadas guardadas:

```cmd
set GOOGLE_APPLICATION_CREDENTIALS=C:\claves\ciudad-alerta-admin.json
node scripts/ubicaciones-reportes.mjs --csv
```

---

## 7. Sistema de confianza en la app

Implementado **exactamente sobre las reglas del equipo**. Los números y las fórmulas están en `comun/src/confianza` (antes `modulos/confianza/dominio`); el módulo `confianza` los reexporta en su `index.ts`, así que quien los importaba desde ahí no cambia nada.

Cómo confirma la app (`confianza/datos/confianza.service.ts`), en una transacción: lee el reporte, el voto, `users/{uid}/confianza/actual` y el contador del día; calcula nivel, peso, suma y contador con `comun`; escribe la confirmación, `validacion.*` y el contador.

Cómo da un veredicto (`confianza/datos/veredicto.service.ts`), también en una transacción: relee el reporte (si otro gestor ya lo decidió, se detiene) y `users/{autor}/confianza/actual`; calcula con `efectoDeVeredicto()` de `comun` (+10 PC y un validado si es real, −15 PC y un falso si no, con tope 760 y piso 0); escribe `validacion.veredicto*` en el reporte, la confianza del autor y el espejo `trustLevel` y `validatedReports` en su perfil. Son los mismos campos del lote de `diagnostico:reglas`. El autor se entera por la campana: `AvisosService` arma el aviso con `validacion.veredicto` del propio reporte.

Puntos para coordinar con el equipo (siguen vigentes): perfiles sin `createdAt`, las brechas DIAG-1 y DIAG-2 en las reglas nuevas, `notifLeidasHasta` fuera de la lista blanca, veredicto revertido (A8) y reportes nuevos sin `validacion`.

---

## 8. Qué cambió en la fase 3

### Gestión de estados fuera del detalle

El detalle de un reporte ya no sabe de roles: deja la ranura `detalle-reporte.gestion`. El módulo de gestión la llena con:

- los botones de transición, para el admin o el operador asignado;
- el motivo por el que otro operador no puede cambiarlo;
- «Reportado por».

El cambio de estado está en `gestion-reportes/datos/cambio-estado.service.ts` (transacción con el historial y la firma del organismo). `services/routing.service.ts` conserva lo que usan varios: asignar organismo y operador al crear, y leer el historial. Se corrigió además una doble lectura del historial que dejaba el orden antiguo tras un cambio.

### F12 · Tiempo de respuesta y de resolución

- Al **resolver**, la app guarda `resueltoAt` (hora del servidor) y `tiempoResolucionMs`; al **cerrar sin resolver**, `cerradoSinResolverAt`. Son los mismos campos que ya escribe el portal y que `firestore.rules` acepta. Si las reglas los rechazan, la app reintenta sin ellos: el cambio de estado nunca se bloquea.
- El **detalle** muestra «Primera respuesta» y «Resolución» («Resuelto en 2 h 15 min», «Cerrado sin resolver»). En reportes antiguos el tiempo se deduce del seguimiento.
- **Mis reportes** muestra «Resuelto en …» cuando el dato existe.

### Mi perfil e inicio

- Módulo nuevo `perfil` (`/perfil`): nombre, correo, tipo de cuenta, organismo del operador, miembro desde, identificador para soporte, verificación de correo y cerrar sesión (feedback Sprint 5).
- El **inicio** quedó con el saludo, el resumen (ranura `inicio.resumen`), los botones agrupados y «Cerrar sesión». Se quitaron el identificador y el texto del «próximo sprint».
- **Resumen del inicio:** «Verifica tu correo» mientras no esté verificado; «Tus reportes» (en curso, resueltos y el último movimiento, o una invitación a crear el primero); «Por atender» para operadores (su organismo) y administradores (todo el sistema, con conteos en el servidor, sin índices nuevos); y el nivel de confianza. Cada tarjeta es de su módulo: si el módulo se desactiva, la tarjeta desaparece.
- **Botones agrupados:** «Crear un reporte» destacado y el resto en «Explorar», «Tu cuenta» y «Gestión», en cuadros de dos columnas. Se quitó el espacio vacío que dejaba la tarjeta de nivel «flotando».
- Si se desactiva `perfil`, el inicio sigue funcionando (incluido cerrar sesión), pero no hay dónde verificar el correo.

### Cada cosa en su módulo

- `report`, `camera`, `photo-storage`, `privacidad`, `image-similarity` y `tensorflow` pasaron a `modulos/reportes/datos`. `PHOTO_STORAGE` lo registra el manifiesto de reportes, no `main.ts`.
- `regiones.service` pasó a `modulos/mapa-incidencias/datos`.
- `report.model.ts` se dividió: organismos en `models/organismo.model.ts`; coincidencias, fotos y confirmaciones en `modulos/reportes/modelo`; radios de búsqueda en `modulos/cercanos/parametros.ts`.
- Los enlaces al detalle desde otros módulos usan `RUTAS_REPORTES` de la API pública de reportes.

### Pruebas

`npm run test:una-vez` corre las pruebas de la app (Vitest, sin red; cada archivo empieza con `usarEntornoDePrueba()`) y `npm run test:comun` las del paquete compartido. El diagnóstico de reglas suma seis casos de F12 (80 en total). El detalle está en `PLAN_DE_PRUEBAS.md`, sección 21.

---

## 9. El portal web

`main-web` **no se modificó**. Cuando el equipo lo decida, el portal puede usar `comun/` igual que la app: se trae la carpeta a esa rama, se agrega el alias en `vite.config.ts` y `tsconfig.app.json`, y se reemplazan de a poco sus copias (`constants/reportes.ts`, `components/Reportes/tiempos.ts`, la agrupación de `pages/Admin/mapaCalor.ts` y los umbrales de `privacidad/privacidad.ts`). Los pasos exactos están en `comun/LEEME.md`.

Un cambio visible al adoptarlo: en `comun`, `resuelto` es verde (`#3fbf8f`) y no blanco, porque el blanco casi no se veía sobre el mapa.

Desde octubre, dos cosas que el portal todavía no tiene: su campana no muestra el aviso de veredicto (su `AvisosContext` lee solo el historial), y sigue difuminando en el navegador. Si el portal quisiera usar el servicio de privacidad, basta agregar su URL en **Environment → ORIGENES** en Render.

---

## 10. Instalar la fase 3

La fase 3 viene en `modularizacion-fase3.mbox`: **27 commits a nombre de Rodrigo0000000** encima del último commit de `main-mobile` en GitHub (`e9c5612`, «modularización fase 2»). Un `.mbox` es la lista de commits como parches de texto; `git am` los aplica uno por uno y conserva autor, fecha y mensaje.

En la carpeta del repositorio (`Proyecto_Capstone`), en `cmd`:

```cmd
:: 1. Deja main-mobile igual que en GitHub
git switch main-mobile
git pull origin main-mobile
git status

:: 2. Aplica los commits (pon la ruta donde guardaste el archivo)
git am "C:\ruta\modularizacion-fase3.mbox"
git log --oneline -28

:: 3. Pruebas del paquete compartido (la primera vez, npm install)
cd comun
npm install
npm test
cd ..\ciudad-alerta-app

:: 4. Pruebas y diagnóstico de la app
npm run test:una-vez
npm run diagnostico
ionic serve

:: 5. Sube
git push origin main-mobile
```

`git status` debe decir que no hay cambios antes del paso 2. Si `git am` se detiene a mitad, deja todo como estaba con `git am --abort` y avísame con el mensaje que mostró.

No hay reglas ni índices nuevos que desplegar: los campos de F12 ya los aceptaba el `firestore.rules` del equipo.

### Commits

`git log --oneline origin/main-mobile..main-mobile` los lista:

1–5. `comun`: estados y categorías, confianza, tiempos (del portal), territorio y geografía, privacidad.
6. La app usa `@ciudad-alerta/comun` (alias, `confianza/dominio` sale, diagnóstico).
7–8. Base de pruebas con Firebase sin red; pruebas de coincidencias.
9. `comun`: permiso de gestión y datos de resolución.
10. El cambio de estado pasa al módulo de gestión (ranura `detalle-reporte.gestion`).
11–13. F12: estado de resolución en `comun`, la gestión guarda los datos, el detalle y Mis reportes los muestran.
14. Los servicios de reportes y del mapa pasan a sus módulos.
15–18. Módulo Mi perfil (creado con `npm run modulo`), botón «Cerrar sesión» compartido, pantalla de perfil e inicio liviano.
19. Enlaces entre módulos con `RUTAS_REPORTES` y `requiere: ['reportes']`.
20. Diagnóstico: categorías y transiciones se leen de `comun`.
21. `report.model` se divide.
22. Pruebas del núcleo de módulos.
23. Diagnóstico: entradas de las ranuras.
24. Pruebas de guards, historial, comunas y regiones.
25. Casos del emulador para F12.
26. Plan de pruebas y guía de diagnóstico.
27. «modularización fase 3»: esta guía.

---

## 11. Privacidad en la nube y veredicto (octubre)

### Qué se arregló

- **Teléfonos viejos congelados.** Con una foto grande, la app dejaba de responder: no se podía escribir ni enviar el reporte, ni siquiera después de cerrar sesión. Había tres causas juntas: la cámara entregaba la foto en resolución completa (12 a 48 MP) como texto base64, la app la achicaba después en un canvas, y TensorFlow.js corría los tres modelos (rostros, personas y MobileNet) en el mismo hilo que dibuja la pantalla. Ahora la cámara entrega la foto ya en 1024 px y todo lo de TensorFlow corre en el **servicio de privacidad**. El teléfono solo envía la foto y espera; el formulario sigue disponible.
- **El autor no sabía si su reporte era real.** Las reglas ya aceptaban el veredicto de un gestor, pero la app no tenía cómo darlo. Ahora, en el detalle, bajo «Gestión», quien gestiona el reporte ve **«Es real»** y **«Es falso»** (falso pide el motivo), y el autor recibe el aviso en la campana con los puntos de confianza que ganó o perdió.

### Cómo funciona la protección de la foto

```
Teléfono                                   servicio-privacidad (Render, gratis)
  foto de 1024 px ── POST /v1/proteger ──▶  comprueba el token de sesión de Firebase
  (token de sesión)                         difumina rostros y personas (mismos modelos y umbrales)
                   ◀── foto protegida ────  calcula el vector MobileNet de la foto protegida
                       + privacidad + vector  no guarda nada
```

- La URL está en `modulos/reportes/parametros.ts` (`PARAMETROS_PRIVACIDAD.url`), con el tiempo máximo (90 s) y cuándo avisar que tarda (6 s).
- El plan gratuito **duerme el servicio** tras 15 minutos sin uso; despertar tarda entre 30 y 60 s. Por eso la app lo despierta al abrir «Crear un reporte», avisa «Despertando el servicio de privacidad…» y deja cancelar (la foto se quita y el reporte puede ir sin ella).
- La foto sin proteger **nunca se publica**: si el servicio falla, se ofrece «Reintentar» o «Quitar». Las reglas siguen exigiendo `foto.privacidad.aplicada == true`.
- No hace falta la clave de cuenta de servicio ni ningún secreto en Render: el token se verifica con las claves públicas de Google.
- Los modelos `coco-ssd` y `face-detection` pasaron de `src/assets/models` a `servicio-privacidad/modelos`: el APK quedó ~19 MB más liviano.

Todo el detalle del servicio (cómo probarlo en el computador, errores, variables y límites) está en `servicio-privacidad/LEEME.md`.

### Instalar

En la carpeta del repositorio (`Proyecto_Capstone`), en `cmd`:

```cmd
:: 1. Deja main-mobile igual que en GitHub
git switch main-mobile
git pull origin main-mobile
git status

:: 2. Aplica los commits (pon la ruta donde guardaste el archivo)
git am "C:\ruta\privacidad-nube-veredicto.mbox"
git log --oneline -8

:: 3. Pruebas del servicio (la primera vez tarda: instala TensorFlow y sharp)
cd servicio-privacidad
npm install
npm test
cd ..\comun
npm test
cd ..\ciudad-alerta-app

:: 4. Pruebas y diagnóstico de la app
npm run test:una-vez
npm run diagnostico

:: 5. Sube (Render lee render.yaml de main-mobile)
git push origin main-mobile
```

Si `git am` se detiene a mitad, deja todo como estaba con `git am --abort`.

### Publicar el servicio en Render (una vez)

1. Entra a [render.com](https://render.com) con la cuenta de GitHub que ve el repositorio. No pide tarjeta.
2. **New → Blueprint**, elige `Proyecto_Capstone` y la rama `main-mobile`, y pulsa **Apply**. Render lee `render.yaml` y crea `ciudad-alerta-privacidad` en el plan gratuito.
3. Espera el primer despliegue (5 a 10 minutos) y abre `https://ciudad-alerta-privacidad.onrender.com/salud`. Debe decir `"listo": true`.
4. Si Render le dio otra URL, cámbiala en `ciudad-alerta-app/src/app/modulos/reportes/parametros.ts`, haz commit y push.
5. Genera el APK con `npm run apk:demo`: ahora revisa que la URL responda en vez de revisar los modelos.

Desde ahí, cada push a `main-mobile` que toque `servicio-privacidad/`, `comun/src/` o `render.yaml` lo vuelve a desplegar solo.

**Opcional.** La app ya no usa los paquetes de TensorFlow; siguen en `package.json` para no tocarlo, pero no entran al APK. Para quitarlos:

```cmd
npm uninstall @tensorflow/tfjs-core @tensorflow/tfjs-converter @tensorflow/tfjs-backend-cpu @tensorflow/tfjs-backend-webgl @tensorflow-models/coco-ssd @tensorflow-models/face-detection @tensorflow-models/mobilenet @mediapipe/face_detection
```

No hay reglas ni índices nuevos que desplegar.

### Commits

1. `servicio-privacidad`: el servidor, sus pruebas, el Dockerfile y `render.yaml`.
2. La cámara entrega la foto ya achicada a 1024 px.
3. La foto se protege en la nube; TensorFlow sale del teléfono.
4. Los modelos de privacidad salen del APK.
5. `comun`: efecto de un veredicto en la confianza del autor.
6. Veredicto «Es real / Es falso» en el bloque Gestión (módulo confianza).
7. Aviso al autor cuando su reporte es verificado.
8. Guías y plan de pruebas (CP-PRI y CP-VER).
