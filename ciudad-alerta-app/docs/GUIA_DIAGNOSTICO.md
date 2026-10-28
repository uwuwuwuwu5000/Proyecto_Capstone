# Diagnóstico de Ciudad Alerta

Ocho scripts que revisan el proyecto desde ángulos distintos. Ninguno modifica código ni datos. Cada uno imprime los hallazgos por consola y deja un informe en Markdown en la carpeta `diagnostico/`, útil como evidencia para el informe de avance.

Los tres primeros son los de siempre (código, datos, reglas). Los cinco últimos son de **seguridad ofensiva**: en vez de comprobar que lo normal funcione, intentan *romper* cada parte del sistema para encontrar brechas y bugs que se hayan pasado.

Las pruebas que ejecutan la app (unitarias y de punta a punta con Playwright) están en `GUIA_PRUEBAS.md`.

| Script | Qué revisa | Necesita | Tiempo |
|---|---|---|---|
| `codigo.mjs` | El código fuente, las reglas como texto, Android y el build | Nada extra | ~5 s (~1 min con `--build`) |
| `datos.mjs` | Los datos reales en Firestore y Authentication | Clave de cuenta de servicio | ~10 s |
| `reglas.mjs` | Las reglas de seguridad ejecutadas en el emulador | Firebase CLI, Java 21, `@firebase/rules-unit-testing` | ~1 min |
| `reglas-ataques.mjs` | Ataca las reglas: matriz de acceso, ~50 intentos de brecha, mutaciones | Nada (simulador) o emulador con `--emulador` | ~1 s / ~1 min |
| `contrato.mjs` | Que la app, las reglas y los índices digan lo mismo; límites de formulario | Nada extra | ~1 s |
| `cliente.mjs` | Secretos (árbol e historial git), Android, build, XSS, CSP, dependencias | git; red solo con `--audit` | ~20 s |
| `servicio-ataques.mjs` | Ataca el servicio de privacidad: tokens, límite, pixel bombs, EXIF, CORS | `servicio-privacidad` instalado | ~3 s |
| `logica.mjs` | Invariantes de `comun`: confianza, DST de Chile, Unicode, geo, estados | `servicio-privacidad` (trae esbuild) | ~1 s |

Severidades:

| Ícono | Significa |
|---|---|
| ✖ Error | Rompe el build o una funcionalidad. |
| ⛨ Brecha | Permite algo que no debería estar permitido. |
| ⚠ Advertencia | Bug probable o riesgo a futuro. |
| ℹ Información | Dato útil, sin acción inmediata. |

Los scripts terminan con código 1 si hay errores o brechas, así que sirven también en GitHub Actions. Mientras sigan las 3 brechas conocidas de las reglas, `npm run diagnostico:reglas` termina con código 1 aunque todos los controles y bloqueos estén en verde.

---

## Instalación (una vez)

Copia la carpeta `scripts/diagnostico/` completa (5 archivos) en `scripts/` del proyecto y registra los atajos:

```
npm pkg set "scripts.diagnostico=node scripts/diagnostico/codigo.mjs"
npm pkg set "scripts.diagnostico:build=node scripts/diagnostico/codigo.mjs --build"
npm pkg set "scripts.diagnostico:datos=node scripts/diagnostico/datos.mjs"
npm pkg set "scripts.diagnostico:reglas=node scripts/diagnostico/reglas.mjs"
npm pkg set "scripts.diagnostico:reglas-sim=node scripts/diagnostico/simulador/ejecutar.mjs scripts/diagnostico/reglas.mjs"
npm pkg set "scripts.diagnostico:ataques=node scripts/diagnostico/reglas-ataques.mjs"
npm pkg set "scripts.diagnostico:contrato=node scripts/diagnostico/contrato.mjs"
npm pkg set "scripts.diagnostico:cliente=node scripts/diagnostico/cliente.mjs"
npm pkg set "scripts.diagnostico:servicio=node scripts/diagnostico/servicio-ataques.mjs"
npm pkg set "scripts.diagnostico:logica=node scripts/diagnostico/logica.mjs"
```

La carpeta `scripts/diagnostico/simulador/` (6 archivos) acompaña a los scripts: es un intérprete de las reglas de Firestore que permite correr `reglas-ataques.mjs` (y, con `diagnostico:reglas-sim`, los 100 casos de `reglas.mjs`) sin Java ni el emulador. Es una aproximación: lo que encuentre conviene confirmarlo con `--emulador`.

---

## 1. Código — `npm run diagnostico`

Ejecútalo antes de cada APK y después de pegar código nuevo. Revisa:

- **Dependencias e imports.** Paquetes usados que no están en `package.json` (el error de `supercluster` habría salido aquí), imports a archivos que no existen, imports prohibidos en Ionic 9 (`@ionic/angular/standalone`) o `@angular/fire`. Los alias de `tsconfig.json` (`@ciudad-alerta/comun`) se resuelven contra su archivo y no se confunden con paquetes de npm.
- **Paquete compartido `comun/`.** Que siga siendo TypeScript puro: si un archivo de `comun/src` importa Angular, React, Ionic o Firebase, deja de servirle a la otra aplicación y es un error. También avisa si alguien lo importa con una ruta relativa en vez del alias.
- **Componentes.** Plantillas y hojas de estilo que no existen; etiquetas `<app-*>` o `<ion-*>` usadas sin agregarlas a `imports`; íconos sin registrar con `addIcons`, que la app no muestra y Angular no avisa. **Error** si un componente redefine un color del tema (`--ca-*`) en sus estilos: queda con una paleta fija y deja de seguir el tema claro u oscuro (así el login mostró letras claras sobre fondo claro). Los colores se definen solo en `src/theme/variables.scss`.
- **Navegación.** `routerLink`, `navigate` y `defaultHref` que apuntan a rutas inexistentes (las de `app.routes.ts` y las de todos los módulos), y rutas cuyo archivo o clase no existe.
- **Firestore.**
  - Colecciones que el código usa sin regla (en producción dan "permiso denegado").
  - Consultas que necesitan índice compuesto y no lo tienen.
  - Valores que deben coincidir entre la app y las reglas: categorías y transiciones de estado (desde la fase 3 se leen de `comun/src/reportes`), organismos genéricos (`models/organismo.model.ts` frente a `organismoId in [...]`), intervalo entre reportes y lista de administradores.
- **Reglas (como texto).** Denegación por defecto, reglas abiertas, creación sin lista blanca de campos, lecturas de documentos cerca del límite de 10 y brechas conocidas de este proyecto.
- **Fugas.** `onSnapshot`, `subscribe`, `setInterval` y `addEventListener` sin cancelar en componentes; `getDocs` sobre colecciones completas.
- **Seguridad del cliente.** `innerHTML`, `bypassSecurityTrust`, `eval`, `console.log` con datos personales, llaves privadas en `src/`, claves de cuenta de servicio o keystores que git subiría.
- **Android y build.** `appId` distinto entre Capacitor y Gradle, `google-services.json` de otro paquete, `allowBackup` y tráfico sin cifrar, `targetSdkVersion`, estilos de componentes cerca del límite de 4 kB, límites comunales incompletos y modelos de privacidad incompletos (desde octubre están en `servicio-privacidad/modelos`; si `src/assets/models` sigue en la app, avisa que engorda el APK).
- **Pruebas automáticas.** Que cada `*.spec.ts` que usa `TestBed` llame a `usarEntornoDePrueba()` (las de funciones puras no lo necesitan) y que `src/test-setup.ts` no configure `TestBed` (en Windows esa configuración no llega a las pruebas). Como información, la lista de archivos que solo comprueban que algo se crea («should create»): es lo que conviene probar de verdad (`GUIA_PRUEBAS.md`).
- **Módulos** (`scripts/diagnostico/modulos.mjs`). Manifiestos, `modulos.config.ts`, dependencias entre módulos, rutas y botones repetidos, íconos sin registrar, ranuras inexistentes, **piezas de ranura que no declaran un input que la pantalla les pasa** (Angular fallaría con NG0303 al abrirla), imports que cruzan la frontera de un módulo, pantallas que quedaron fuera de un módulo y los **parámetros del sistema de confianza (`comun/src/confianza/parametros.ts`) comparados con `firestore.rules`**. Las ayudas de pruebas (`src/testing/`) pueden mirar dentro de los módulos. El detalle está en `GUIA_MODULOS.md`, sección 5.

Con `npm run diagnostico:build` además compila en producción y agrega los errores de `ng build` al informe.

Límites: analiza el texto del código, no lo ejecuta. Las consultas que se arman con arreglos dinámicos (`...restricciones`) y los nombres de íconos calculados en tiempo de ejecución no se pueden revisar así.

## 2. Datos — `npm run diagnostico:datos`

Usa la misma clave que `corregir-maipu.mjs`:

```
set GOOGLE_APPLICATION_CREDENTIALS=C:\claves\ciudad-alerta-admin.json
npm run diagnostico:datos
```

Revisa:

- **Administradores.** Correos de la lista sin cuenta en Authentication. Es la brecha más urgente, porque cualquiera que registre ese correo se vuelve admin. También detecta correos sin verificar y perfiles de la lista que no tienen rol `admin`.
- **Perfiles.** Cuentas sin perfil, perfiles huérfanos, roles inválidos, cuentas operador sin `operadorId` o con un operador inexistente o inactivo.
- **Catálogo.** Organismos genéricos distintos de los de la app, organismos con id fuera del formato `muni_<CUT>` (como `muni_maipu`), varios organismos para una misma comuna, operadores que apuntan a organismos inexistentes y operadores activos sin ninguna cuenta.
- **Reportes.**
  - Estados o categorías inválidos.
  - Organismo u operador que no existe, o un operador de otra municipalidad.
  - Reportes abiertos sin operador aunque su organismo ya tiene uno.
  - Fotos faltantes, fotos sin desenfoque registrado y fotos subidas por otra persona.
  - Fechas en el futuro y coordenadas inválidas.
- **Relaciones.** Fotos sin reporte, autoconfirmaciones, confirmaciones de operadores, cambios de estado sin firma o con transición inválida, reportes cuyo estado no coincide con su historial y mensajes de soporte en tickets inexistentes.

Lee cada colección una vez; con los datos del piloto son pocos miles de lecturas.

## 3. Reglas — `npm run diagnostico:reglas`

Prueba las reglas de verdad: levanta el emulador de Firestore con un proyecto de prueba (`demo-ciudad-alerta`), carga `firestore.rules`, ejecuta 100 casos y lo apaga. **Nunca toca el proyecto real.**

Requisitos:

```
npm install -g firebase-tools
npm ls firebase
npm install -D @firebase/rules-unit-testing@6
```

La versión de `@firebase/rules-unit-testing` depende de la de `firebase`: 13.x → `@6`, 12.x → `@5`, 11.x → `@4`. Si te equivocas, el script te dice cuál instalar. También necesitas Java 21 o superior (el emulador es un programa Java) y el puerto 8080 libre; si el contenedor de Docker de los emuladores está corriendo, detenlo antes.

Tres tipos de caso:

- **Control (27):** flujos reales de la app que deben funcionar. Por ejemplo, crear un reporte con foto, que un admin cambie un estado, resolver un reporte guardando su tiempo de resolución (F12), abrir un ticket o confirmar con peso. Desde la 1.0 también aceptar los términos, dejar anónimos los reportes y los tickets de soporte al eliminar la cuenta, y que el autor corrija o retire su reporte sin revisar. Si alguno falla, una regla está bloqueando a usuarios legítimos.
- **Bloqueo (70):** cosas que deben rechazarse. Por ejemplo, leer el perfil de otro, subirse el nivel de confianza, firmar con otro nombre, que el operador de Maipú gestione un reporte de Pudahuel, inventar un tiempo de resolución o escribir en el ticket de otro. Desde la 1.0, además: cambiarse el `operadorId`, ser admin con el correo sin verificar, fechar un reporte en el pasado, anonimizar o retirar el reporte de otro, corregir uno que ya está en revisión y anotar un retiro en el historial sin cerrar el reporte. Y para los tickets: borrar los datos de contacto del ticket de otro, cambiar algo más al anonimizarlo o firmarlo con otro nombre. Si alguno pasa, es una brecha.
- **Sistema de confianza** (25 de los anteriores, con el prefijo «Confianza:»): confirmación con peso, voto de peso 0 por correo sin verificar o cuenta nueva, validación al llegar a 100 puntos y 3 votos, contador del día, pausa de 20 s, límite diario, suspensión, puntos inventados, veredictos real y falso, y veredicto de un operador de otra comuna.
- **Brecha (3):** huecos conocidos de las reglas actuales: campos extra al crear un reporte, fotos sin reporte y mensajes en tickets inexistentes. **Hoy fallan a propósito** y se ponen en verde cuando se corrigen. Las otras tres (el `operadorId`, el correo sin verificar y la fecha falsa) se cerraron en la 1.0 y ahora son bloqueos.

Si fallan casos de control, revisa primero si cambió el formato de los documentos. Las funciones `perfil()` y `reporte()` del script imitan lo que escribe la app.

---

## Scripts de seguridad ofensiva (4–8)

Estos cinco no comprueban que lo normal funcione, sino que intentan *romper* el sistema. Reutilizan el registro y los informes de los anteriores, así que los hallazgos salen con las mismas severidades.

### 4. Ataques a las reglas — `npm run diagnostico:ataques`

La contraparte agresiva de `reglas.mjs`. Corre sobre un **simulador de las reglas** escrito en `scripts/diagnostico/simulador/` (no necesita Java), y con `--emulador` sobre el emulador real. Secciones:

- **A · Matriz de acceso.** Cada combinación de rol (anónimo, ciudadano, operador, admin) × colección × operación (get/list/create/update/delete) contra lo que *debería* poder. Marca tanto lo que permite de más (brecha) como lo que bloquea de menos (error).
- **B · Ataques dirigidos.** Alrededor de 50 intentos concretos de brecha con su impacto y su arreglo: subirse el nivel, declararse admin, suplantar nombres, reusar la foto de otro reporte, confirmar reportes cerrados, fabricar bitácoras, firmar mensajes de soporte como staff, subir fotos sin reporte, etc.
- **C · Mutaciones generadas.** Toma una escritura válida y le aplica variaciones automáticas (campo extra, cambio de tipo, texto gigante, fecha falsa). Cada una debe seguir rechazándose.
- **D · Lecturas por operación.** Cuántos documentos lee cada regla, contra el límite de 10 por operación de Firestore (solo en el simulador).
- **E · Revisión estática.** Funciones de las reglas sin usar, creaciones sin lista blanca, lecturas que exponen datos.

El simulador se calibra con los 100 casos de `reglas.mjs` (todos dan el mismo resultado). Aun así es una aproximación: confirma los hallazgos con `--emulador`.

### 5. Contrato app ↔ reglas ↔ índices — `npm run diagnostico:contrato`

Lee el código y lo compara, sin ejecutar nada. Busca desajustes que no rompen el build pero explotan en producción:

- **Acoplamientos declarados.** Los valores que las reglas dicen mantener en sincronía con la app: correos de administrador, transiciones de estado, categorías de respaldo, intervalo entre reportes y largo de la descripción.
- **Consultas vs índices.** Cada consulta compuesta (con `orderBy` sobre otro campo, o un operador de rango) necesita su índice en `firestore.indexes.json`; las de varias igualdades sin `orderBy` no lo necesitan.
- **Límites de formulario vs reglas.** Que el formulario nunca deje enviar algo más largo de lo que la regla acepta. Aquí sale el bug del nombre de más de 60 caracteres.
- **Rutas sensibles** con su guard, y **`onSnapshot`** sin cancelar.

### 6. Higiene del cliente — `npm run diagnostico:cliente`

Lo que se filtra o se endurece fuera de las reglas:

- **Secretos** en los archivos rastreados y en **todo el historial de git** (claves privadas, service accounts, `.env`). La API key web de Firebase no cuenta: es pública por diseño.
- **Cobertura de `.gitignore`** para claves y keystores.
- **Artefactos de build** (`dist`, `www`, `*.map`) que no deberían estar en git.
- **Sinks de XSS** (`innerHTML`, `bypassSecurityTrust`, `eval`), **Android/Capacitor** (cleartext, debuggable, allowBackup), **CSP** y **PII en logs**.
- Con `--audit`, corre `npm audit` en la app, `comun` y el servicio (necesita red).

### 7. Ataques al servicio de privacidad — `npm run diagnostico:servicio`

Ataca `servicio-privacidad` sin levantarlo: empaqueta sus módulos con esbuild y les inyecta claves y relojes de prueba.

- **A · Token de sesión.** Once ataques: `alg:none`, firma con otra clave, confusión RS256→HS256, emisor/audiencia equivocados, vencido, `nbf` futuro, sin `sub`, sin `Bearer`. El válido se acepta.
- **B · Límite por usuario.** Llenar, bloquear, aislamiento por uid, ventana deslizante. (El límite es por uid del token, así que falsear `X-Forwarded-For` no lo evade.)
- **C · Procesamiento de imagen.** Pixel bombs (imagen de 100 MP), archivos que no son imagen, SVG gigante, y que la foto protegida **no conserve el EXIF/GPS** de la cámara.
- **D · CORS/tipo/tamaño.** Orígenes exactos sin comodín, allowlist de tipos, tope de 6 MB.
- **E · Sondas HTTP en vivo** (opcional): con `--url http://localhost:8080` prueba `/salud`, el 401 sin token, el preflight de un origen no permitido y que el error no filtre trazas.

### 8. Lógica y casos borde — `npm run diagnostico:logica`

Empaqueta `comun` y ejercita sus funciones puras contra las reglas y contra invariantes:

- **Confianza.** `nivelDePuntos`, `pesoDeNivel` y `limiteDiario` comparados con las reglas en todo el rango, más monotonía y bordes exactos.
- **Veredicto.** +10 / −15 y topes [0, 760].
- **DST de Chile.** El `numeroDeDia` usa un desfase fijo UTC−3; en invierno Chile es UTC−4, así que el contador de confirmaciones se reinicia a las 23:00 locales (ver hallazgos).
- **Unicode.** `.length` (lo que mide el formulario) vs puntos de código (lo que cuenta `size()` de las reglas): una descripción de emojis puede pasar el formulario y rechazarse en el servidor.
- **Geografía** (distancia, geohash contra la regla, límites de coordenadas) y **transiciones** (invariantes del ciclo de vida).

---

## Hallazgos al revisar el código entregado

`codigo.mjs` sobre la copia del código que tengo (sin `node_modules` ni `android/`):

**Brechas en las reglas.** `reglas.mjs` las confirma con casos concretos. **Las dos, y la fecha falsa, quedaron cerradas en la versión 1.0** (GUIA_MODULOS, sección 13); se dejan aquí como registro.

1. **Un operador puede cambiar su propio `operadorId`** y pasar a gestionar los reportes de otra municipalidad. La lista blanca de `users` incluye `operadorId`, pero `camposProtegidosIntactos()` no lo protege.
2. **`esCorreoAdministrador()` no exige correo verificado.** Quien registre primero un correo de la lista se crea como admin. `datos.mjs` dice si algún correo de la lista todavía no tiene cuenta, que es cuando el riesgo es real.

**Advertencias en las reglas:**

- La creación de `reports`, `users`, `confirmations`, `statusHistory`, `reportPhotos`, `supportTickets` y `messages` no limita los campos. Un cliente modificado puede agregar, por ejemplo, `validadoComunidad: true`.
- Un reporte podía crearse con `createdAt` falso (cerrado en la 1.0: `createdAt == request.time`).
- Se pueden subir fotos sin reporte (hasta 950 KB cada una) y mensajes en tickets inexistentes. Ambos se corrigen con `existsAfter()` / `getAfter()`, que sí ven el resultado del lote.

**Código de la app:** sin imports rotos, sin etiquetas sin importar, sin íconos sin registrar, sin rutas inexistentes, sin colecciones sin regla, sin consultas sin índice y con los catálogos sincronizados con las reglas.

Las correcciones de las reglas deben hacerse sobre la versión del equipo. Ninguna cambia lo que la app escribe hoy, salvo la lista blanca de campos, que hay que armar con los campos exactos de cada colección.

### Hallazgos de los scripts de seguridad ofensiva

Resultado al correrlos sobre el código actual.

**Bug que impedía usar la app (nuevo, `contrato.mjs` y `logica.mjs`):**

- **Un nombre de más de 60 caracteres impide crear reportes.** El registro acepta cualquier largo de nombre (solo `minLength(3)`, sin `maxLength`). El perfil guarda el nombre completo, pero `report.service.ts` lo recorta a 60 (`slice(0, 60)`), y la regla `autorNombreValido()` exige `displayName == autorNombre`. Si el nombre pasa de 60, la creación del reporte queda denegada para siempre, sin mensaje claro. Arreglo: `Validators.maxLength(60)` en el registro (y `maxlength` en el input), o validar el largo antes de guardar el perfil en vez de recortar.
- **Emojis en la descripción.** El formulario mide con `.length` (UTF-16) y las reglas con `size()` (puntos de código). Una descripción de 6 emojis pasa el formulario (largo 12) pero la regla la ve como 6 y la rechaza. Arreglo: medir con `[...texto].length` en el formulario.

**Brechas de las reglas que confirma `reglas-ataques.mjs`** (ninguna da escalada de privilegios: rol, nivel y puntos están bien protegidos; son campos sin validar y faltas de coherencia):

- **La creación de `reports` no tiene lista blanca (`hasOnly`).** Permite campos extra y, sobre todo, prefijar `resueltoAt`/`tiempoResolucionMs`/`retiradoPorAutor` (falsear métricas), reusar en `foto.path` la foto de otro reporte, y poner un `organismo.nombre` arbitrario (solo se valida `organismo.id`).
- **`users`** no acota el tamaño ni el contenido de `displayName` ni `email` (ni al crear ni al actualizar): permite suplantar el nombre de otra persona y nombres enormes.
- **Confirmaciones** sobre reportes ya cerrados o con veredicto: las reglas no miran el estado del reporte al confirmar.
- **`statusHistory`**: la rama del gestor no exige que el reporte cambie de estado en el mismo lote (se puede fabricar bitácora/notificaciones sin mover el reporte).
- **Soporte**: `autorEmail` y las fechas del ticket no se validan al crear; `lastMessagePreview` no se acota al actualizar; un gestor puede firmar un mensaje como `ciudadano`.
- **`reportPhotos`**: se pueden subir fotos sin reporte, y el autor puede borrar la foto después de publicar (deja `foto.path` colgando).
- **Edición del autor**: puede cambiar la descripción aunque ya tenga confirmaciones (el reporte sigue en «reportado»): cambio de carnada.

La raíz de casi todas es la misma: **listas blancas (`hasOnly`) al crear** y validar **coherencia entre documentos** (no solo el formato de cada campo).

**Avisos de higiene (`cliente.mjs`):** `.gitignore` no cubre `.env` ni una carpeta de claves; no hay Content-Security-Policy en `index.html`; un `console.error` registra el `uid`. **Sin secretos en el árbol ni en los 257 commits del historial.**

**Lo que está bien:** el servicio de privacidad pasa los 11 ataques de token, rechaza pixel bombs y SVG gigantes, elimina el EXIF/GPS de las fotos y tiene un CORS exacto sin comodín. Los cálculos de confianza de `comun` coinciden con las reglas en todo el rango. Rol, nivel de confianza y puntos no se pueden escalar.

**Limitación conocida (no bug): DST de Chile.** `numeroDeDia()` usa un desfase fijo UTC−3; en invierno (UTC−4) el contador de confirmaciones se reinicia a las 23:00 locales, no a medianoche. 155 días al año. De bajo impacto; se puede documentar y dejar así, o calcular el día con la zona `America/Santiago`.

Los informes completos (uno por script) quedan en `diagnostico/*.md` al correrlos.
