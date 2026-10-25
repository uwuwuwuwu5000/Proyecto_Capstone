# Guía de pruebas · Ciudad Alerta

Cómo se prueba la app, cómo correr cada tipo de prueba en Windows y cómo escribir una nueva. Los casos manuales están en `PLAN_DE_PRUEBAS.md`; los scripts de diagnóstico, en `GUIA_DIAGNOSTICO.md`.

| Tipo | Comando (desde `ciudad-alerta-app`) | Cuántas | Tiempo | Qué atrapa |
|---|---|---|---|---|
| Unitarias | `npm run test:una-vez` | 430 en 76 archivos | ~2 min | La lógica de servicios, guards y pantallas: validaciones, errores de red, carreras al pasar rápido de una pantalla a otra, escuchas que quedan abiertas |
| Paquete `comun` | `npm run test:comun` | | segundos | Estados, transiciones, confianza, territorio, comparados con `firestore.rules` |
| Reglas | `npm run diagnostico:reglas` | 100 casos | ~1 min | Lo que Firestore acepta o rechaza, en el emulador |
| Diagnóstico | `npm run diagnostico` | | ~5 s | Imports, rutas, íconos, módulos, catálogos, paletas fijas, pruebas que no prueban nada |
| De punta a punta | `npm run e2e` | 124 | ~7 min | La app compilada en un teléfono simulado: que cada pantalla abra sin errores, se lea bien y que los flujos completos funcionen |
| Servicio de privacidad | `npm test` en `servicio-privacidad` | | ~1 min | El difuminado con los modelos reales |

Ninguna usa el proyecto real de Firebase ni internet.

## Antes de cada entrega

En `cmd`, en este orden. Si algo falla, no se entrega:

```cmd
npm run test:una-vez
npm run test:comun
npm run lint
npm run diagnostico
npm run diagnostico:reglas
npm run e2e
```

`diagnostico:reglas` termina con «exited with code 1» mientras sigan las 3 brechas conocidas: es lo esperado si no falla ningún control ni bloqueo. Después, los casos de la sección 19 del plan de pruebas en un teléfono.

---

## 1. Pruebas unitarias

Vitest, a través de `ng test`. Cada archivo va junto al que prueba, con el mismo nombre y `.spec.ts`.

### El entorno

Si el archivo usa `TestBed`, empieza con `usarEntornoDePrueba()` (de `src/testing`), antes del `describe`. Registra Ionic, el router y un Firebase de prueba: proyecto `demo-*`, Firestore **sin red** (toda lectura falla enseguida con `unavailable`) y una sesión simulada. Una prueba de funciones puras no lo necesita. El diagnóstico avisa si falta.

```ts
import { usarEntornoDePrueba } from '../../testing';

usarEntornoDePrueba({ uid: 'ana' });

describe('MiPantalla', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: ReportQueryService, useValue: { getById: async () => REPORTE } }],
    });
  });
  …
});
```

No se configura en `src/test-setup.ts`: en Windows, lo de ese archivo no llega a las pruebas.

### Reemplazar lo que habla con Firebase

- **Otro servicio:** con `useValue` en `providers`, como arriba.
- **Una llamada dentro del mismo servicio:** el servicio la separa en un método `protected` (una «costura») y la prueba la reemplaza. Así lo hacen `EliminarCuentaService`, `MiReporteService`, `BorradorService` y `RecuperacionDePantallas`:

```ts
type Interno = { reautenticar: (...a: unknown[]) => Promise<unknown> };
const interno = servicio as unknown as Interno;
vi.spyOn(interno, 'reautenticar').mockRejectedValue(new FirebaseError('auth/invalid-credential', 'x'));
```

`vi.mock` no funciona con `ng test`.

### Probar carreras

Muchos errores de esta revisión aparecían solo si la persona pasaba rápido de un reporte a otro o cambiaba dos filtros seguidos. Para probarlos, la simulación devuelve promesas que la prueba resuelve cuando quiere, en desorden:

```ts
const pendientes = new Map<string, (r: Report | null) => void>();
// getById: (id) => new Promise((resolver) => pendientes.set(id, resolver))

await abrir('r1');
await abrir('r2');
pendientes.get('r2')!(reporte('r2'));
pendientes.get('r1')!(reporte('r1')); // llega tarde
expect(fixture.componentInstance.reporte()?.id).toBe('r2');
```

En el código, `UltimaCarga` (`nucleo/carga`) resuelve estos casos: la última carga pedida gana. Ejemplos completos en `report-detail.page.spec.ts`, `admin-reports.page.spec.ts` y `support-chat.page.spec.ts`.

### Qué no vale

- «should create» solo: el diagnóstico lista los archivos que solo comprueban que algo se crea.
- Una prueba que pasa con y sin el arreglo. Al corregir un error, la prueba se escribe primero y se comprueba que falla sin el cambio.

```cmd
npm run test:una-vez
npm test
```

`npm test` se queda mirando los cambios.

---

## 2. Pruebas de punta a punta (Playwright)

La app compilada de verdad (rutas, módulos, guards, pantallas, estilos, `index.html`) en un Chromium del tamaño de un teléfono chico: 360×780 px, español de Chile, hora de Santiago y la ubicación en la Plaza de Maipú.

Firebase y la nube se reemplazan por la **maqueta** (`e2e/maqueta`): servicios simulados sobre una base en memoria que se guarda en el navegador (`localStorage`, clave `e2e.base`), así que una prueba puede recargar, cerrar sesión o cortar la señal y encontrar lo mismo. Solo se simula lo que habla con Firebase o con un servicio externo. Todo lo demás es de la app: la comuna por límites oficiales, la ubicación del navegador, las preferencias, el tema y el borrador sin conexión.

### Correrlas

Una vez, para descargar el navegador:

```cmd
npm install
npm run e2e:preparar
```

Después:

```cmd
npm run e2e
npm run e2e -- flujos-reporte
npm run e2e -- -g "sin señal"
npm run e2e -- --ui
npm run e2e:informe
```

- `npm run e2e` revisa los tipos de las pruebas, compila la maqueta (`e2e/.compilado`) y corre todo.
- Para correr un solo archivo, pasa su nombre; para un solo caso, `-g` con parte de su nombre.
- `--ui` abre la interfaz de Playwright para ver cada paso.
- `e2e:informe` muestra el informe con la captura y la traza de lo que falló.

Si se cambió solo una prueba (no la app), basta con `npx playwright test -c e2e/playwright.config.ts`, sin compilar de nuevo.

### Qué hay

| Archivo | Qué prueba |
|---|---|
| `pantallas.spec.ts` | Las 26 pantallas con la cuenta que las usa, en tema oscuro y claro, y con el texto «Muy grande» |
| `flujos-reporte.spec.ts` | Crear un reporte (foto, ubicación, comuna, aviso de emergencia), descripción corta, un reporte parecido cerca, servicio de privacidad caído, sin señal (en el teléfono y en la web), corregir, retirar y contactar al organismo |
| `flujos-cuenta.spec.ts` | Entrar, guards, cerrar sesión, crear cuenta, términos nuevos, introducción, eliminar la cuenta |
| `flujos-equipo.spec.ts` | La operadora cambia un estado y a la vecina le llega el aviso; bandeja; soporte |
| `flujos-ajustes.spec.ts` | Tema, tamaño del texto, pantalla al abrir, introducción, «Borrar datos guardados» |
| `revisor.spec.ts` | Los revisores de abajo, con páginas hechas a mano |
| `humo.spec.ts` | La prueba más corta: si esta falla, falla todo |

En **toda** prueba, cualquier error de JavaScript, `console.error` o aviso de Angular (`NG0…`) la hace fallar, aunque lo demás funcione.

En cada pantalla, además:

- **Contraste** (WCAG AA): 4,5:1 para texto normal y 3:1 para texto grande. El fondo se calcula capa por capa, atravesando el shadow DOM de Ionic; en un degradado se toma su color más desfavorable. Así se habría detectado el login con letras claras sobre el degradado del tema claro.
- **Desborde:** nada se sale por el costado ni obliga a desplazarse de lado. Un título recortado con «…» o una franja que se desplaza a propósito no cuentan.
- **Nombres accesibles:** cada botón, enlace o campo tiene un nombre que TalkBack o VoiceOver pueda decir.

### Cuentas de la maqueta

Todas con la contraseña `secreta1`:

| Cuenta | Correo | Para qué |
|---|---|---|
| `ana` | ana@prueba.cl | Vecina con dos reportes (uno nuevo y uno en proceso) y una conversación de soporte |
| `luis` | luis@prueba.cl | Vecino con una fuga de agua cerca de la plaza y un reporte resuelto |
| `op` | operadora@maipu.cl | Operadora de la Municipalidad de Maipú (con teléfono, correo y dirección) |
| `admin` | admin@prueba.cl | Administración |
| `antigua` | antigua@prueba.cl | Cuenta que no aceptó los términos vigentes |

### Escribir una prueba

```ts
import { abrir, aviso, datos, expect, responderDialogo, test, vista } from './ayudas';

test('la autora retira su reporte', async ({ page }) => {
  await abrir(page, '/report/r_ana_nuevo', { como: 'ana' });

  await vista(page).getByRole('button', { name: 'Retirar reporte' }).click();
  await responderDialogo(page, 'Retirar', 'Ya la arreglaron');

  await expect(aviso(page, 'Reporte retirado.')).toBeVisible();
  expect((await datos(page)).reportes['r_ana_nuevo'].estado).toBe('cerrado');
});
```

Usa siempre `test` y `expect` de `./ayudas`: traen la vigilancia de la consola.

| Ayuda | Para qué |
|---|---|
| `abrir(page, ruta, { como, tema, texto, bienvenidaVista, escenario })` | Abre la app con esa sesión y preferencias, y espera a que termine de cargar |
| `vista(page)` | La pantalla visible. Ionic deja las anteriores ocultas en la página; sin esto, un texto puede encontrarse en la pantalla de atrás |
| `aviso(page, texto)` | Un aviso flotante (toast) |
| `responderDialogo(page, boton, escribir?)` | Escribe en un diálogo de Ionic y pulsa el botón |
| `elegir(page, selector, opcion)` | Elige en un `ion-select` con hoja de acciones |
| `entrar(page, correo)` / `salir(page)` | Iniciar y cerrar sesión desde la pantalla |
| `datos(page)` | Lo que la maqueta tiene guardado, para comprobar qué se escribió |
| `sinSenal(page)` / `conSenal(page)` | Cortar y devolver la señal como en el teléfono: el código de la app sigue a mano (viene en el APK) |
| `context.setOffline(true)` | Cortar la señal como en la versión web: tampoco llega el código de las pantallas que no se han abierto |
| `escenario: { privacidadCaida: true }` | El servicio de privacidad no responde |

Para revisar una pantalla nueva, agrégala a `PANTALLAS` en `pantallas.spec.ts`, con la cuenta que la usa y un texto que debe mostrar.

### Si un servicio nuevo habla con Firebase

La maqueta no compilará o la pantalla no tendrá datos. Agrega su simulación en `e2e/maqueta/servicios.ts`, sobre la base de `base.ts`, y regístrala en `e2e/maqueta/main.ts`. Termina con la declaración de qué imita:

```ts
type _MiServicio = Imita<MiServicioFalso, Pick<MiServicio, 'leer' | 'guardar'>>;
```

Si el servicio de la app cambia la firma de esos métodos, la maqueta deja de compilar y te avisa. Si el servicio ya tiene costuras (`protected`), extiéndelo y reemplaza solo esas, como `MiReporteE2E` o `EliminarCuentaE2E`: así se prueba su lógica real.

### Trampas conocidas

- **Pantallas anteriores:** busca dentro de `vista(page)`, no en toda la página.
- **Opciones de un `ion-select` cerrado:** también tienen texto. Usa `.filter({ visible: true })`.
- **El campo de texto contiene lo que se escribe:** un `ion-textarea` guarda el texto dentro de su `<textarea>`, así que `getByText` puede encontrarlo ahí antes de que se envíe. Busca el mensaje en la lista (`.mensaje__texto`).
- **Después de `entrar`:** espera la URL del inicio antes de `page.goto`; si no, la recarga corta el inicio de sesión a medias.
- **La maqueta se compila aparte:** si cambiaste la app o la maqueta, `npm run e2e` la compila de nuevo; `npx playwright test` solo no.

### Qué no cubren

- Lo que Firestore acepta: eso son las pruebas de reglas.
- La cámara, el GPS y los permisos de Android, el botón atrás del sistema y el teclado: casos manuales (sección 17 del plan).
- El difuminado real: las pruebas del servicio de privacidad.

---

## 3. Reglas, diagnóstico y `comun`

Ver `GUIA_DIAGNOSTICO.md`. Las reglas se prueban en el emulador con 100 casos: 27 controles (lo que debe funcionar), 70 bloqueos (lo que debe rechazarse) y 3 brechas conocidas que fallan a propósito hasta que se corrijan.

---

## 4. Lo que encontraron estas pruebas (octubre)

Cada arreglo trae la prueba que falla sin él.

| Problema | Arreglo | Prueba |
|---|---|---|
| Con mala señal, un reporte quedaba asignado a la OIRS genérica y sin operador, aunque la comuna tuviera municipalidad | Una falla de red al buscar el organismo guarda el reporte como borrador | `routing.service.spec`, `report.service.spec` |
| Al cambiar de cuenta, la campana seguía escuchando los reportes de la anterior | La escucha se abre solo si la sesión sigue siendo la misma | `avisos.service.spec` |
| El chat de soporte dejaba escuchas abiertas al salir y podía mostrar los mensajes de otro ticket | Cada carga se descarta si ya no corresponde | `support-chat.page.spec` |
| Se podía confirmar un reporte cerrado o retirado | «Este reporte ya está cerrado» | `confianza.service.spec`, `verificacion-reporte.component.spec` |
| El detalle mezclaba datos al pasar rápido de un reporte a otro | `UltimaCarga` | `report-detail.page.spec` |
| Con dos filtros cambiados seguidos, la bandeja mezclaba y repetía reportes | `UltimaCarga` en la bandeja, Cerca de mí, el mapa, soporte y Mis reportes | `admin-reports.page.spec`, `nearby.page.spec` |
| En el navegador, un permiso de ubicación denegado se decía como un error genérico | Se lee el código del error del navegador | `geolocation.service.spec` |
| Al eliminar la cuenta, los tickets de soporte conservaban el nombre y el correo | Quedan anónimos (**hay que desplegar las reglas**) | `eliminar-cuenta.service.spec`, `reglas.mjs` |
| Tema claro: grises y cianes con contraste insuficiente; «Leerlos» fuera de la pantalla; pie de versión y «Obligatorio» poco legibles; NG0956 en el mapa | Colores del tema y estilos | `pantallas.spec` |
| Versión web sin señal: una pantalla que no se había abierto no abría nunca más, aunque volviera la señal | Aviso sin señal; con señal, la app se recarga en esa pantalla | `enrutador.spec`, `flujos-reporte` |
| «Borrar datos guardados» borraba sin aviso el reporte que esperaba señal | Se conserva; solo se borra al eliminar la cuenta | `preferencias.service.spec`, `flujos-ajustes` |
