# Guía de módulos · App móvil Ciudad Alerta

> **Fase 3.** La lógica que debe dar lo mismo en la app y en el portal está en un paquete compartido, `comun/`. El cambio de estado pasa al módulo de gestión, hay un módulo «Mi perfil», los servicios de un solo módulo viven en ese módulo y la app tiene pruebas automáticas (`npm run test:una-vez`). La rama `main-web` no se tocó.

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
            │                      datos/ (report, camera, photo-storage, privacidad, image-similarity,
            │                      tensorflow, confirmation, duplicate-detection) · modelo/ · rutas.ts · resolucion.ts
            ├── mapa-incidencias/  paginas/mapa · datos/regiones.service.ts · parametros.ts
            ├── cercanos/          paginas/nearby · parametros.ts
            ├── confianza/         datos/ · componentes/ · paginas/mi-nivel (los números, en comun)
            ├── avisos/            paginas/avisos · componentes/avisos-campana · datos/ · modelo/
            ├── soporte/           paginas/{support, support-new, support-chat, support-inbox} · datos/ · modelo/
            ├── gestion-reportes/  paginas/admin-reports · componentes/gestion-reporte · datos/cambio-estado.service.ts
            ├── municipalidades/   paginas/admin-organismos · datos/organismos.service.ts
            └── perfil/            paginas/mi-perfil · componentes/{verificacion-correo, aviso-verificacion}
                                   datos/perfil.service.ts · modelo.ts
```

**Dentro de un módulo** siempre las mismas carpetas, solo las que necesite: `paginas/` (pantallas con ruta), `componentes/` (piezas sin ruta), `datos/` (servicios que leen o escriben Firestore, o que usan la cámara o TensorFlow), `modelo/` (tipos propios), `parametros.ts` (números ajustables), el manifiesto `<id>.modulo.ts` y su `index.ts`. Las reglas puras que también necesita el portal ya no van en `dominio/`: van en `comun/`.

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
| `accesos` | Botones del inicio: `roles` (quién los ve), `orden`, `estilo` (`principal`, `gestion`), `textoSegunRol`. |
| `ranuras` | Lo que pone en pantallas de otros módulos (ver 3.3), con `orden` si hay varios. |
| `proveedores` | Lo que debe existir en toda la app: los avisos arrancan con ella; reportes registra `PHOTO_STORAGE`. |

**Orden de los botones:** 10–50 ciudadano, 60–90 nuevos para ciudadano (Mi perfil es 90), 100–199 staff.

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
| `detalle-reporte.gestion` | Detalle del reporte, al final | `reporte`, `alCambiar` | gestión: botones de estado, motivo para otro operador, «Reportado por» |
| `tarjeta-reporte.insignias` | Mis reportes, Cerca de mí, Gestión | `reporte` | confianza: «Validado», «Verificación 45 %» |
| `inicio.resumen` | Inicio | `perfil` | perfil: «Verifica tu correo» (primero) · confianza: tarjeta de nivel |
| `perfil.resumen` | Mi perfil | `perfil` | confianza: tarjeta de nivel |
| `cabecera.acciones` | Barra superior | (ninguna) | avisos: la campana |

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

Junto al archivo, con el mismo nombre y `.spec.ts`. Firebase, Ionic y el router ya están registrados para todas las pruebas (`src/test-setup.ts`), sin red. Lo que lea datos se simula reemplazando el servicio:

```ts
TestBed.configureTestingModule({
  providers: [{ provide: AuthService, useValue: { user: { uid: 'u1' }, getUserProfile: vi.fn() } }],
});
```

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
- El **inicio** quedó con el saludo, la ranura `inicio.resumen`, los botones y «Cerrar sesión». Se quitaron el identificador y el texto del «próximo sprint». Mientras el correo no esté verificado, perfil pone ahí un recordatorio.
- Si se desactiva `perfil`, el inicio sigue funcionando (incluido cerrar sesión), pero no hay dónde verificar el correo.

### Cada cosa en su módulo

- `report`, `camera`, `photo-storage`, `privacidad`, `image-similarity` y `tensorflow` pasaron a `modulos/reportes/datos`. `PHOTO_STORAGE` lo registra el manifiesto de reportes, no `main.ts`.
- `regiones.service` pasó a `modulos/mapa-incidencias/datos`.
- `report.model.ts` se dividió: organismos en `models/organismo.model.ts`; coincidencias, fotos y confirmaciones en `modulos/reportes/modelo`; radios de búsqueda en `modulos/cercanos/parametros.ts`.
- Los enlaces al detalle desde otros módulos usan `RUTAS_REPORTES` de la API pública de reportes.

### Pruebas

`npm run test:una-vez` corre las pruebas de la app (Vitest, sin red) y `npm run test:comun` las del paquete compartido. El diagnóstico de reglas suma seis casos de F12 (80 en total). El detalle está en `PLAN_DE_PRUEBAS.md`, sección 21.

---

## 9. El portal web

`main-web` **no se modificó**. Cuando el equipo lo decida, el portal puede usar `comun/` igual que la app: se trae la carpeta a esa rama, se agrega el alias en `vite.config.ts` y `tsconfig.app.json`, y se reemplazan de a poco sus copias (`constants/reportes.ts`, `components/Reportes/tiempos.ts`, la agrupación de `pages/Admin/mapaCalor.ts` y los umbrales de `privacidad/privacidad.ts`). Los pasos exactos están en `comun/LEEME.md`.

Un cambio visible al adoptarlo: en `comun`, `resuelto` es verde (`#3fbf8f`) y no blanco, porque el blanco casi no se veía sobre el mapa.

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
