# Diagnóstico de Ciudad Alerta

Tres scripts que revisan el proyecto desde ángulos distintos. Ninguno modifica código ni datos. Cada uno imprime los hallazgos por consola y deja un informe en Markdown en la carpeta `diagnostico/`, útil como evidencia para el informe de avance.

| Script | Qué revisa | Necesita | Tiempo |
|---|---|---|---|
| `codigo.mjs` | El código fuente, las reglas como texto, Android y el build | Nada extra | ~5 s (~1 min con `--build`) |
| `datos.mjs` | Los datos reales en Firestore y Authentication | Clave de cuenta de servicio | ~10 s |
| `reglas.mjs` | Las reglas de seguridad ejecutadas en el emulador | Firebase CLI, Java 21, `@firebase/rules-unit-testing` | ~1 min |

Severidades:

| Ícono | Significa |
|---|---|
| ✖ Error | Rompe el build o una funcionalidad. |
| ⛨ Brecha | Permite algo que no debería estar permitido. |
| ⚠ Advertencia | Bug probable o riesgo a futuro. |
| ℹ Información | Dato útil, sin acción inmediata. |

Los scripts terminan con código 1 si hay errores o brechas, así que sirven también en GitHub Actions.

---

## Instalación (una vez)

Copia la carpeta `scripts/diagnostico/` completa (5 archivos) en `scripts/` del proyecto y registra los atajos:

```
npm pkg set "scripts.diagnostico=node scripts/diagnostico/codigo.mjs"
npm pkg set "scripts.diagnostico:build=node scripts/diagnostico/codigo.mjs --build"
npm pkg set "scripts.diagnostico:datos=node scripts/diagnostico/datos.mjs"
npm pkg set "scripts.diagnostico:reglas=node scripts/diagnostico/reglas.mjs"
```

---

## 1. Código — `npm run diagnostico`

Ejecútalo antes de cada APK y después de pegar código nuevo. Revisa:

- **Dependencias e imports.** Paquetes usados que no están en `package.json` (el error de `supercluster` habría salido aquí), imports a archivos que no existen, imports prohibidos en Ionic 9 (`@ionic/angular/standalone`) o `@angular/fire`. Los alias de `tsconfig.json` (`@ciudad-alerta/comun`) se resuelven contra su archivo y no se confunden con paquetes de npm.
- **Paquete compartido `comun/`.** Que siga siendo TypeScript puro: si un archivo de `comun/src` importa Angular, React, Ionic o Firebase, deja de servirle a la otra aplicación y es un error. También avisa si alguien lo importa con una ruta relativa en vez del alias.
- **Componentes.** Plantillas y hojas de estilo que no existen; etiquetas `<app-*>` o `<ion-*>` usadas sin agregarlas a `imports`; íconos sin registrar con `addIcons`, que la app no muestra y Angular no avisa.
- **Navegación.** `routerLink`, `navigate` y `defaultHref` que apuntan a rutas inexistentes (las de `app.routes.ts` y las de todos los módulos), y rutas cuyo archivo o clase no existe.
- **Firestore.**
  - Colecciones que el código usa sin regla (en producción dan "permiso denegado").
  - Consultas que necesitan índice compuesto y no lo tienen.
  - Valores que deben coincidir entre la app y las reglas: categorías y transiciones de estado (desde la fase 3 se leen de `comun/src/reportes`), organismos genéricos (`models/organismo.model.ts` frente a `organismoId in [...]`), intervalo entre reportes y lista de administradores.
- **Reglas (como texto).** Denegación por defecto, reglas abiertas, creación sin lista blanca de campos, lecturas de documentos cerca del límite de 10 y brechas conocidas de este proyecto.
- **Fugas.** `onSnapshot`, `subscribe`, `setInterval` y `addEventListener` sin cancelar en componentes; `getDocs` sobre colecciones completas.
- **Seguridad del cliente.** `innerHTML`, `bypassSecurityTrust`, `eval`, `console.log` con datos personales, llaves privadas en `src/`, claves de cuenta de servicio o keystores que git subiría.
- **Android y build.** `appId` distinto entre Capacitor y Gradle, `google-services.json` de otro paquete, `allowBackup` y tráfico sin cifrar, `targetSdkVersion`, estilos de componentes cerca del límite de 4 kB, modelos de privacidad y límites comunales incompletos.
- **Pruebas automáticas.** Que cada `*.spec.ts` llame a `usarEntornoDePrueba()` y que `src/test-setup.ts` no configure `TestBed` (en Windows esa configuración no llega a las pruebas).
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

Prueba las reglas de verdad: levanta el emulador de Firestore con un proyecto de prueba (`demo-ciudad-alerta`), carga `firestore.rules`, ejecuta 80 casos y lo apaga. **Nunca toca el proyecto real.**

Requisitos:

```
npm install -g firebase-tools
npm ls firebase
npm install -D @firebase/rules-unit-testing@6
```

La versión de `@firebase/rules-unit-testing` depende de la de `firebase`: 13.x → `@6`, 12.x → `@5`, 11.x → `@4`. Si te equivocas, el script te dice cuál instalar. También necesitas Java 21 o superior (el emulador es un programa Java) y el puerto 8080 libre; si el contenedor de Docker de los emuladores está corriendo, detenlo antes.

Tres tipos de caso:

- **Control (20):** flujos reales de la app que deben funcionar. Por ejemplo, crear un reporte con foto, que un admin cambie un estado, resolver un reporte guardando su tiempo de resolución (F12), abrir un ticket o confirmar con peso. Si alguno falla, una regla está bloqueando a usuarios legítimos.
- **Bloqueo (54):** cosas que deben rechazarse. Por ejemplo, leer el perfil de otro, subirse el nivel de confianza, firmar con otro nombre, que el operador de Maipú gestione un reporte de Pudahuel, inventar un tiempo de resolución o escribir en el ticket de otro. Si alguno pasa, es una brecha.
- **Sistema de confianza** (25 de los anteriores, con el prefijo «Confianza:»): confirmación con peso, voto de peso 0 por correo sin verificar o cuenta nueva, validación al llegar a 100 puntos y 3 votos, contador del día, pausa de 20 s, límite diario, suspensión, puntos inventados, veredictos real y falso, y veredicto de un operador de otra comuna.
- **Brecha (6):** huecos conocidos de las reglas actuales. **Hoy fallan a propósito** y se ponen en verde cuando se corrigen.

Si fallan casos de control, revisa primero si cambió el formato de los documentos. Las funciones `perfil()` y `reporte()` del script imitan lo que escribe la app.

---

## Hallazgos al revisar el código entregado

`codigo.mjs` sobre la copia del código que tengo (sin `node_modules` ni `android/`):

**Brechas en las reglas.** `reglas.mjs` las confirma con casos concretos.

1. **Un operador puede cambiar su propio `operadorId`** y pasar a gestionar los reportes de otra municipalidad. La lista blanca de `users` incluye `operadorId`, pero `camposProtegidosIntactos()` no lo protege.
2. **`esCorreoAdministrador()` no exige correo verificado.** Quien registre primero un correo de la lista se crea como admin. `datos.mjs` dice si algún correo de la lista todavía no tiene cuenta, que es cuando el riesgo es real.

**Advertencias en las reglas:**

- La creación de `reports`, `users`, `confirmations`, `statusHistory`, `reportPhotos`, `supportTickets` y `messages` no limita los campos. Un cliente modificado puede agregar, por ejemplo, `validadoComunidad: true`.
- Un reporte puede crearse con `createdAt` falso.
- Se pueden subir fotos sin reporte (hasta 950 KB cada una) y mensajes en tickets inexistentes. Ambos se corrigen con `existsAfter()` / `getAfter()`, que sí ven el resultado del lote.

**Código de la app:** sin imports rotos, sin etiquetas sin importar, sin íconos sin registrar, sin rutas inexistentes, sin colecciones sin regla, sin consultas sin índice y con los catálogos sincronizados con las reglas.

Las correcciones de las reglas deben hacerse sobre la versión del equipo. Ninguna cambia lo que la app escribe hoy, salvo la lista blanca de campos, que hay que armar con los campos exactos de cada colección.
