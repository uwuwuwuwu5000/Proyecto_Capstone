# Ciudad Alerta — Portal Web

Portal web de **Ciudad Alerta**, una plataforma de inteligencia urbana comunitaria: las personas reportan
problemas de la ciudad desde la app móvil (fuga de agua, luminaria dañada, accesibilidad, etc.), la comunidad los
verifica y este portal permite seguirlos y gestionarlos: un mapa en tiempo real para quien tiene cuenta, un panel
para operadores de organismos y un panel de administración.

Comparte el mismo proyecto Firebase que la app móvil (Ionic + Angular, rama `main-mobile` del repositorio):
mismas colecciones de Firestore y mismas reglas de seguridad. En producción: <https://ciudadalerta.web.app/>.

## Stack

- React 19 + TypeScript + Vite, react-router-dom
- Firebase (Authentication + Cloud Firestore), SDK modular
- Leaflet + OpenStreetMap (mapas)
- CSS Modules, sin frameworks de UI
- TensorFlow.js (solo para difuminar fotos en el navegador, se carga al elegir la primera foto)
- Pruebas: Playwright (pantallas, contra los emuladores de Firebase) y Vitest (reglas de Firestore)

## Estructura

```
Ciudad_alerta_web/
 ├── comun/            # Lógica compartida con la app móvil, TypeScript puro (ver comun/LEEME.md)
 └── portal-web/
      ├── src/
      │    ├── pages/        # Landing, Login, Registro, Términos, Mapa, Historial, Mi nivel, Mi perfil,
      │    │                 # Operador/ (panel del operador) y Admin/ (panel de administración)
      │    ├── components/   # Navbar, Reportes (detalle, corregir o retirar), Perfil, Dialogo…
      │    ├── confianza/    # Confirmar con peso, veredicto, moderación, barra de verificación
      │    ├── privacidad/   # Difuminado de fotos (ProtectorDeFotos)
      │    ├── context/      # Sesión, categorías, soporte y avisos
      │    └── firebase/     # Inicialización del SDK
      ├── e2e/               # Pruebas de pantalla (Playwright) y datos de prueba
      ├── rules-tests/       # Pruebas de las reglas de Firestore (Vitest + emulador)
      ├── firestore.rules
      └── firestore.indexes.json
```

`comun/` está en la raíz y la importa el portal como `@ciudad-alerta/comun`. Lo que debe dar lo mismo en el portal
y en la app (estados, tiempos, confianza, veredictos, términos legales, reglas de corregir o retirar un reporte,
geometría del difuminado…) vive ahí.

## Funcionalidad

**Cualquier persona**
- **Landing**, **Términos de uso** y **Política de privacidad**.
- **Registro** y **Login** (correo y contraseña, recuperar contraseña). El registro exige aceptar los términos.

**Ciudadano**
- **Mapa** de reportes por región, con filtros, agrupación de pines, detalle con foto e historial de estados y
  confirmación comunitaria con peso según el nivel de la cuenta.
- **Historial** de sus reportes. Mientras un reporte siga «Reportado» puede **corregir la descripción** (si nadie
  lo ha confirmado con peso) o **retirarlo**.
- **Mi nivel** (puntos y confianza), **Mi perfil** y **Eliminar mi cuenta** (los reportes se conservan como
  «Cuenta eliminada»). Avisos en la campana y soporte (quejas y consultas).
- Quien tenía cuenta antes de los términos los acepta una sola vez al entrar.

**Operador** (cuenta de un organismo)
- Mapa y **Reportes** asignados, con cambio de estado y comentarios.
- **Por veredicto**: reportes validados por la comunidad que esperan su veredicto (real o falso), con
  indicadores, filtros y tiempos de revisión.
- **Estadísticas** de su operador.

**Administrador**
- **Resumen**, **Reportes** (con acciones en lote y exportación), **Crear reporte** (con foto difuminada).
- **Organismos**, **Operadores**, **Cuentas**, **Categorías**, **Mapa de calor**, **Estadísticas** globales y
  **Soporte**.

Las cuentas de **organismo** (rol de la app móvil) no tienen vista en el portal: ven un mensaje que las dirige a la app.

Un reporte retirado por su autor queda «Cerrado» y no cuenta en los tiempos de atención ni de resolución.

## Desarrollo

Requiere Node 20.19+ o 22.12+. Para las pruebas, además, Java 21 (lo usan los emuladores de Firebase).

```bash
npm install
npm run dev      # servidor de desarrollo (contra el proyecto Firebase real)
npm run build    # typecheck + build de producción
npm run lint     # oxlint
```

**Probarlo a mano con datos de prueba, sin tocar el proyecto real:**

```bash
npm run manual   # emuladores + datos sembrados + portal; abre un navegador y lista las cuentas de prueba
```

Termina al cerrar la ventana del navegador. El portal corre en modo `e2e` (`VITE_USAR_EMULADOR=1`): se conecta a
los emuladores y nunca al proyecto real.

## Pruebas

```bash
npm run test:reglas   # reglas de Firestore contra el emulador (Vitest)
npm run test:e2e      # pruebas de pantalla (Playwright) con los emuladores de Auth y Firestore
(cd ../comun && npm test && npm run tipos)   # lógica compartida
```

Detalle y evidencia en [`e2e/LEEME.md`](./e2e/LEEME.md). La evidencia oficial se guarda con
`EVIDENCIA_DIR=../Evidencia/e2e/<fase> npm run test:e2e`.

## Firestore: reglas e índices

- [`firestore.rules`](./firestore.rules) es la copia versionada de las reglas del proyecto compartido con la app
  móvil, que no las versiona. Cualquier cambio debe coordinarse con quien la mantiene, porque afecta a ambos
  clientes. Antes de publicarlas, compararlas con las publicadas.
- [`firestore.indexes.json`](./firestore.indexes.json) tiene los **18 índices** del proyecto: los de la app más
  los que usa el portal. Si al desplegar `firebase deploy --only firestore:indexes` la herramienta pregunta si
  borrar índices que no están en el archivo, responder **que no**.

## Despliegue

```bash
npm run build
firebase deploy --only hosting --project ciudadalerta
```

Si algo sale mal, en Firebase → Hosting → historial de versiones se puede volver a la versión anterior
(«Rollback»).

## Fotos del landing

El inicio, la sección del mapa y la de municipios usan fotos en formato **WebP** guardadas en
`src/assets/landing/` (`barrio.webp`, `mapa.webp`, `municipio.webp`, de 120 a 190 KB cada una). Las demás secciones
siguen con sus ilustraciones SVG (`src/pages/Landing/ilustraciones.tsx`). La captura del mapa muestra la atribución
de OpenStreetMap, que su licencia exige.

Para cambiar una foto: dejar el original en `src/assets/landing/originales/` (esa carpeta no se sube a Git),
convertirlo a WebP (por ejemplo con Squoosh, calidad 75 a 85, 1200 px de ancho o menos y menos de 200 KB) y
reemplazar el archivo de `src/assets/landing/` conservando el nombre. La prueba `WA9` comprueba que las fotos
cargan, tienen descripción y no desbordan el ancho de un teléfono.

## Fotos de los reportes

Al crear un reporte desde el panel, la foto se difumina **en el navegador** (rostros y personas) antes de
guardarse; las reglas exigen `foto.privacidad.aplicada`, así que una foto sin proteger no se publica. Usa la
interfaz `ProtectorDeFotos` (`src/privacidad/`), pensada para poder cambiar más adelante al servicio de
privacidad de la nube (Render) sin tocar las pantallas.

## Limitaciones conocidas

No hay defectos conocidos del portal abiertos. Lo que sigue son funciones aplazadas:

- El aviso de emergencia y el contacto al organismo desde el reporte (historias J4 y J5), y el uso
  del servicio de fotos en la nube. Los reportes creados desde el portal no guardan el vector de la foto, así que
  la app no detecta sus duplicados.
