# Plan de implementación · Portal web

Dos bloques de trabajo:

1. **Sección «Por veredicto»** para las cuentas de operador (fases 0 a 5).
2. **Paridad con la app móvil**: términos y privacidad, eliminar cuenta, corregir o retirar reportes propios, aviso de emergencia, contacto al organismo y fotos protegidas en la nube (fases 6 a 10).

Al final (fase 11) va el cierre y, después, las **historias de usuario**.

> **Cómo usar este archivo**
> - Marca una tarea como lista cambiando `- [ ]` por `- [x]`.
> - Escribe tus comentarios en las líneas **Comentarios** de cada fase o tarea (después del `>`).
> - Las decisiones que necesitan tu respuesta están en «Decisiones».
> - Esfuerzo relativo: **S** (menos de medio día), **M** (1 día), **L** (2 días o más).
> - Las tareas de cada fase están en el **orden cronológico** en que se hacen.

**Procedimiento de cada fase**

1. Se hacen las tareas en el orden indicado. No se pasa a la fase siguiente hasta que se indique.
2. Las pruebas nuevas se agregan al plan de pruebas (hoja «Plan de prueba» del Excel unificado) con su resultado y su evidencia en `Evidencia/e2e/<fase>/`.
3. Si aparece un **defecto**: primero se documenta (fila NOK en el plan de pruebas, fila en la hoja «Lista de defectos» y, bajo la fase, «Errores encontrados y cómo corregirlos»); **después** se corrige; al final la prueba pasa a OK y el defecto a «Cerrado».
4. Al terminar la fase se informa qué se hizo y qué se puede probar directamente en el portal.
5. Los `commit` y el `push` los hace el equipo; al final de cada fase están los comandos.

**Estado general**

| Fase | Qué | Esfuerzo | Estado |
|---|---|---|---|
| 0 | Dejar el portal al día con `comun` y las reglas | S | Hecha; falta que el equipo haga los commit y el push (tarea 0.9) |
| 1 | Cálculos y datos de «Por veredicto» | M | Hecha; falta que el equipo haga los commit y el push (tarea 1.7) |
| 1B | Pasar a `comun` la lógica compartida (bloqueo, roles y cálculos de veredicto) | M | Hecha; falta que el equipo haga los commit y el push (tarea 1B.8) |
| 2 | Pantalla «Por veredicto» (indicadores, filtros y lista) | M | [ ] Pendiente |
| 3 | Tiempos de revisión a cierre (desde el historial) | M | [ ] Pendiente |
| 4 | Dar el veredicto desde la sección | S | [ ] Pendiente |
| 5 | Pruebas de «Por veredicto» | M | [ ] Pendiente |
| 6 | Términos y privacidad | M | [ ] Pendiente |
| 7 | Eliminar mi cuenta | M | [ ] Pendiente |
| 8 | Corregir o retirar un reporte propio | M | [ ] Pendiente |
| 9 | Aviso de emergencia y contacto al organismo | M | [ ] Pendiente |
| 10 | Fotos protegidas en la nube | L | [ ] Pendiente |
| 11 | Cierre y despliegue | S | [ ] Pendiente |

**Orden recomendado:** 0 → 1 a 5 → 6 → 7 → 8 → 9 → 10 → 11. La fase 6 va antes que la 7 y la 10 porque el texto de privacidad debe decir lo que el portal hace con las fotos y con los datos de la cuenta.

---

## 1. Qué se pide y qué ya existe

Para las **cuentas de operador**, una sección con:

1. Solo los reportes **confirmados por la comunidad** (`validacion.validado == true`) que **aún no tienen veredicto**, listos para darlo.
2. Cuántos reportes confirmados hay **sin veredicto**.
3. El **tiempo que tardan en ser tomados en cuenta**.
4. El **tiempo que tardan en resolverse** desde que pasan a «En revisión» hasta que quedan «Cerrado».

**Lo que ya existe en el portal** (para reutilizar, no repetir):

| Existe | Dónde | Límite |
|---|---|---|
| Pestaña «Por verificar» (validados sin veredicto) | `pages/Operador/OperadorTabs.tsx`, filtro `por_verificar` de `components/Reportes/filtros.ts` | El filtro se aplica **en el navegador** sobre la página cargada: no da el total real ni tiempos. |
| Dar el veredicto | `confianza/VeredictoReporte.tsx`, `confianza/veredicto.ts` | Ya funciona; solo hay que ofrecerlo desde la sección nueva. |
| Tiempos de primera atención y de resolución | `pages/Operador/OperadorEstadisticas.tsx`, `components/Reportes/tiempos.ts`, `hooks/useHistoriales.ts` | Miden desde que el vecino **creó** el reporte, no desde que la comunidad lo validó ni desde «En revisión». |
| Mediana, promedio y formato de duraciones | `@ciudad-alerta/comun` (`mediana`, `promedio`, `formatearDuracion`) | — |

---

## 2. Definición de los indicadores

> **Comentarios:**
> I1 confirmada por el equipo. D5 confirmada: «tomado en cuenta» es cuando se da el veredicto.

| # | Indicador | Cómo se calcula | Fuente | Supuesto |
|---|---|---|---|---|
| I1 | **Confirmados sin veredicto** | Reportes del operador con `validacion.validado == true`, `validacion.veredicto == null` y estado distinto de «Resuelto» y «Cerrado». | Consulta a `reports` | Un reporte cerrado o retirado por su autor sin veredicto **no** cuenta como pendiente. **(Confirmado.)** |
| I2 | **Espera actual** de los pendientes | `ahora − validacion.validadoAt`, de cada pendiente. Se muestra la **mediana** y el **más antiguo**. | Mismo listado | — |
| I3 | **Tiempo en ser tomado en cuenta** | `validacion.veredictoAt − validacion.validadoAt`, de los reportes ya validados **con** veredicto. Mediana y promedio del periodo. | Campos del propio reporte (sin leer historial) | «Tomado en cuenta» = cuando el operador **da el veredicto**. **(Confirmado.)** |
| I4 | **Tiempo de revisión a cierre** | Desde la entrada del historial `hacia == 'en_revision'` hasta la primera `hacia == 'cerrado'`. Mediana y promedio. Se muestra también el tiempo hasta «Resuelto». | Subcolección `statusHistory` | Solo cuentan los reportes que **pasaron por «En revisión»**. Los que fueron de «Reportado» a «Derivado» o «Cerrado» se excluyen y se informa cuántos son. |

**Límites conocidos**
- Los reportes validados antes de que existiera `validadoAt` no tienen esa fecha: se excluyen de I2 e I3 y se avisa cuántos son.
- No se pueden guardar fechas nuevas en el reporte (por ejemplo `enRevisionAt`): las reglas, compartidas con la app móvil, no las aceptan. Por eso I4 lee el historial.
- Los reportes **retirados por su autor** (`retiradoPorAutor == true`, fase 8) no se cuentan en los tiempos de resolución, igual que en la app.

---

## Fase 0 · Dejar el portal al día

Prerrequisito de todo lo demás. Cambios pequeños; solo la 0.4 agrega un comportamiento visible.

- [x] **0.1** Verificar que las cuentas administradoras tengan el **correo verificado** (desde la 1.1, `esCorreoAdministrador()` lo exige y de eso depende la carga masiva del catálogo de organismos). **Confirmado por el equipo: sí lo tienen.** — **S**
- [x] **0.2** Traer `firestore.indexes.json` de la app móvil al portal y referenciarlo en `firebase.json`. Queda **un solo archivo con 14 índices**: los 11 de la app (incluido `reports(organismo.id, validacion.validado, createdAt)`) más 3 que solo usa el portal (`operadorId`, `validacion.validado` y `validacion.veredicto`, cada uno con `createdAt`). Así un despliegue desde el portal no quita índices de la app ni al revés. Las reglas ya eran idénticas a las de `origin/main-mobile`. — **S**
- [x] **0.3** Corregir el conflicto con las reglas nuevas: **no ofrecer «Confirmar» en reportes «Resuelto» o «Cerrado»** (incluye los retirados por su autor) ni con veredicto. Archivos: `confianza/confirmar.ts` (códigos `finalizado` y `con_veredicto` con mensaje claro) y `confianza/VerificacionReporte.tsx` (mensaje en lugar del botón). Pruebas **WX1** (pantalla) y **WX4** (reglas, 4 casos nuevos). — **S**
- [x] **0.4** **Mensaje de seguridad para el rol `organismo`** (decisión D1: sí). Si una cuenta con `role == 'organismo'` entra al portal, ve «Esta cuenta se usa desde la app móvil» con un botón para cerrar sesión, y **no se ejecuta ninguna consulta de reportes**. Archivos: `components/CuentaOrganismo/`, guarda en `App.tsx`, y la barra (`Navbar.tsx`) oculta «Mapas» e «Historial» y la etiqueta «Organismo». Prueba **WX2**. — **S**
- [x] **0.5** Registrar las pruebas nuevas **WX1 a WX4** en el plan de pruebas (`Plan_de_Pruebas_Ciudad_Alerta_2026_unificado.xlsx`, filas 470 a 473). — **S**
- [x] **0.6** **DEF-006, documentar antes de corregir:** la prueba **WX3** (`e2e/sesion.spec.ts`) falla (NOK, 2 de 2 corridas), se registra en el plan de pruebas y en la «Lista de defectos» con su captura `Evidencia/defectos/DEF-006.png`. — **S**
- [x] **0.7** **DEF-006, corregir y verificar:** `context/AuthContext.tsx` (ver «Errores encontrados»). WX3 pasa a OK y el defecto a «Cerrado». — **S**
- [x] **0.8** Evidencia: `npm run build`, `npm run test:reglas` y E2E completo, guardados en `Evidencia/e2e/fase0/`. — **S**
- [ ] **0.9** *(Equipo)* Hacer los `commit` y el `push`: ver «Commits y push de la Fase 0». — **S**

> **Comentarios:**
>

**Resultado de las pruebas**

| Prueba | Antes | Ahora |
|---|---|---|
| `npm run build` | — | En verde |
| `npm run test:reglas` | 238 de 238 | **242 de 242** (+4 casos de confirmar) |
| E2E completo | 93 pruebas: 90 OK, 3 NOK | **96 pruebas: 93 OK, 3 NOK** (+WX1, WX2 y WX3; los NOK son los ya registrados WB1, WB5 y MS7: DEF-001 y DEF-002) |

**Errores encontrados y cómo corregirlos**

| Defecto | Qué pasaba | Cómo se corrigió | Estado |
|---|---|---|---|
| **DEF-006** · Redirección al inicio al abrir directamente una pantalla de administración | Con la sesión guardada, al cargar una URL del panel (`/admin/operadores`…) el portal a veces redirigía al inicio aunque la cuenta fuera administradora. Era intermitente y hacía fallar WK1 a WK3, WO4, WO5, IN1, WA2 y WA3 según la velocidad. | En `AuthContext.tsx`, `perfilCargando` empezaba en `true`, pero el efecto que corre sin sesión lo ponía en `false`; al llegar la sesión había un render con sesión, perfil `null` y «cargado», y `useRequiereAdmin` lo leía como «no es admin». Ahora `perfilCargando` sigue verdadero mientras el perfil resuelto no sea el de la cuenta de la sesión (`perfilUid`). Detalle: `Evidencia/defectos/DEF-006_solucion_propuesta.md`. | **Cerrado** (WX3 OK) |

**Qué puedes probar tú en el portal** (`npm run dev`, con cuentas reales o del emulador)

1. **Confirmar un reporte cerrado:** inicia sesión como vecino, abre el mapa y el detalle de un reporte *Resuelto* o *Cerrado* (también uno retirado por su autor desde la app). Debe decir «Este reporte ya está resuelto o cerrado: ya no se puede confirmar» y no mostrar el botón. Uno con veredicto dice «Un operador ya revisó este reporte».
2. **Cuenta de organismo:** crea una con `node scripts/crear-cuentas-municipales.mjs --aplicar` (en la app móvil), entra al portal y abre cualquier ruta: ve «Esta cuenta se usa desde la app móvil» y puede cerrar sesión. La barra no muestra «Mapas» ni «Historial».
3. **Sesión del administrador:** inicia sesión como administrador, pega directamente en la barra del navegador `/admin/operadores` o `/admin/categorias` y recarga varias veces: debe quedarse en la pantalla.
4. **Índices:** `firebase deploy --only firestore:indexes` desde `portal-web`. Si la herramienta pregunta si borrar índices que no están en el archivo, **responde que no**.

**Commits y push de la Fase 0**

Desde la raíz del repositorio (`D:\apps python\Ciudad_alerta_web`), en la rama `main-web`:

```cmd
git status

:: 1. Paquete compartido
git add comun/src comun/test
git commit -m "feat(comun): traer cambios de main-mobile (veredicto, contacto al organismo, términos)"

:: 2. Reglas e índices
git add portal-web/firestore.rules portal-web/firestore.indexes.json portal-web/firebase.json
git commit -m "chore(reglas): reglas 1.2 e índices unificados con la app móvil"

:: 3. Código del portal (incluye la Fase 0 y el mapa por región que estaba sin commit)
git add portal-web/src
git commit -m "fix(portal): no confirmar reportes cerrados, mensaje para cuentas de organismo y sesión estable (DEF-006)"

:: 4. Pruebas
git add portal-web/e2e portal-web/rules-tests portal-web/playwright.config.ts portal-web/.env.e2e portal-web/package.json portal-web/package-lock.json portal-web/.gitignore
git commit -m "test(portal): pruebas E2E con Playwright y pruebas de reglas (WX1 a WX4)"

:: 5. Evidencia y plan (todos los archivos .xlsx y los .md de la raíz están en .gitignore: quedan solo en tu equipo)
git add .gitignore Evidencia portal-web/plan.md
git commit -m "docs: plan de implementación del portal y evidencia de la Fase 0"

:: Subir
git fetch origin
git pull --rebase origin main-web
git push origin main-web
```

Notas: `git status` debería quedar limpio salvo `comun/package-lock.json` (solo cambió por `npm install`; no hace falta subirlo). Si `git pull --rebase` informa conflictos, no hagas `push`: avísame.

**Listo cuando:** `npm run build` y `npm run test:reglas` pasan, y el E2E no tiene fallos nuevos (los 3 conocidos por DEF-001 y DEF-002 siguen). **Cumplido.**

**Historias de usuario de esta fase**

**I7 · Mensaje de seguridad para organismo.** Como equipo, quiero que una cuenta de organismo que entre al portal vea un mensaje claro, para que no se encuentre con errores de permiso. 1. Ve «Esta cuenta se usa desde la app móvil» y puede cerrar sesión. 2. No se ejecuta ninguna consulta de reportes.
*Estado: Hecho (prueba WX2).*

---

## Fase 1 · Cálculos y datos de «Por veredicto»

Sin pantalla todavía. Todo lo que luego usa la sección, separado y probado.

- [x] **1.1** Escribir primero las pruebas (`rules-tests/veredictos.test.ts`) y verlas fallar; después crear `pages/Operador/veredictos.ts` con funciones puras:
  - `esPendienteDeVeredicto(reporte)` (I1): `validado`, sin veredicto y no «Resuelto» ni «Cerrado». **No excluye** los reportes creados desde el panel (`origen == 'portal_admin'`): se muestran igual, porque ese comportamiento se corregirá después (decisión D11).
  - `esperaActual(reporte, ahora)` (I2): `ahora − validadoAt`; sin `validadoAt` devuelve `null`.
  - `tiempoHastaVeredicto(reporte)` (I3): `veredictoAt − validadoAt`, nunca negativo.
  - `tiempoRevisionACierre(cambios)` (I4, a partir del historial).
  - `resumenDeTiempos(valores)`: mediana, promedio, cuántos entran y cuántos quedan fuera.
  - `UMBRAL_DEMORADO_HORAS = 48`: una **constante**, no un campo (decisión D3).
  Reutilizan `mediana`, `promedio` y `formatearDuracion` de `comun`. — **M**
- [x] **1.2** Funciones puras de filtro y orden (`filtrarPendientes`, `ordenarPendientes`) y su lectura y escritura en la URL (`?cat=&comuna=&espera=&orden=&q=&foto=`), con sus pruebas. — **S**
- [x] **1.3** Crear el hook `useReportesPorVeredicto(operadorId)` con una escucha en vivo (`onSnapshot`) a `reports` donde `operadorId == X`, `validacion.validado == true` y `validacion.veredicto == null`, con `limit(200)`.
  - Solo igualdades: **no necesita un índice nuevo**.
  - El orden y todos los filtros de la sección se aplican en el navegador (sin campos ni índices nuevos).
  - Si llega a 200, se muestra «200+» y el conteo exacto con `getCountFromServer`. — **M**
- [x] **1.4** Crear el hook `useReportesConVeredicto(operadorId, periodo)` para el tiempo hasta el veredicto: reportes del operador con `veredicto` real o falso, con tope de 500. El periodo se aplica según la **fecha del veredicto** (`veredictoAt`), no la de creación (decisión D13), reutilizando `rangoDePeriodo` de `periodos.ts`. Si llega al tope, se avisa. — **S**
- [x] **1.5** Prueba contra el emulador de Firestore: un operador obtiene solo sus pendientes y no los de otro; las reglas aceptan las dos consultas. Se registra en el plan de pruebas como prueba de «Reglas de Firestore» (adelanta la tarea 5.4). — **S**
- [x] **1.6** Verificación completa y evidencia: `tsc`, `npm run build`, `npm run test:reglas` y E2E completo (sin fallos nuevos) en `Evidencia/e2e/fase1/`. — **S**
- [ ] **1.7** *(Equipo)* Hacer los `commit` y el `push` de la fase. — **S**

> **Comentarios:**
>

**Resultado de las pruebas**

| Prueba | Antes | Ahora |
|---|---|---|
| `tsc` y `npm run build` | En verde | En verde |
| `npm run test:reglas` | 242 de 242 | **300 de 300** (+51 de los cálculos y filtros, +7 de las consultas contra el emulador) |
| E2E completo | 96 pruebas: 93 OK, 3 NOK | **96 pruebas: 93 OK, 3 NOK** (sin cambios: la fase no toca pantallas; los NOK son los ya registrados WB1, WB5 y MS7) |

Se agregó al plan de pruebas la fila **WV11** (reglas: el operador lee solo sus pendientes y sus reportes con veredicto; una cuenta de organismo no puede). Las pruebas de las funciones puras (`veredictos.test.ts`) no van al plan de pruebas, según el criterio acordado (solo pantalla, componente y reglas). Evidencia: `Evidencia/e2e/fase1/`.

**Qué se construyó**

| Archivo | Qué contiene |
|---|---|
| `src/pages/Operador/veredictos.ts` | *(Desde la Fase 1B los cálculos viven en `comun/src/reportes/veredictos.ts` y este archivo los vuelve a exportar; aquí quedan los filtros, el orden y la URL.)* `esPendienteDeVeredicto` (no excluye los reportes del panel ni los sin `validadoAt`: decisiones D11 y D12), `esperaActual`, `estaDemorado` (constante `UMBRAL_DEMORADO_HORAS = 48`), `tiempoHastaVeredicto`, `tiempoRevisionACierre`, `resumenDeTiempos`, `veredictoEnRango` (periodo por fecha del veredicto, D13), `filtrarPendientes`, `ordenarPendientes` y la lectura y escritura de los filtros en la URL. |
| `src/pages/Operador/useReportesPorVeredicto.ts` | `useReportesPorVeredicto(operadorId)`: escucha en vivo con tope de 200 y total exacto si se alcanza. `useReportesConVeredicto(operadorId, rango)`: lee los reportes con veredicto real o falso (tope de 500 por cada uno), aplica el periodo sin volver a leer y permite recargar. Solo igualdades: sin índices nuevos. |
| `rules-tests/veredictos.test.ts` | 51 casos de los cálculos, filtros, orden y URL. |
| `rules-tests/veredictos-consultas.test.ts` | 7 casos de las consultas contra las reglas (un operador solo lee lo suyo; el organismo queda fuera). |

**Límites que conviene conocer**

- La consulta de pendientes no filtra por estado (para no necesitar un índice): un reporte validado, sin veredicto y ya cerrado se lee y se descarta en el navegador. Si un operador tuviera 200 de ese tipo, podrían quedar fuera pendientes reales. Es improbable; el aviso «200+» y el total lo dejarían a la vista.
- El emulador no valida índices. Las consultas son solo de igualdad, que Firestore resuelve con sus índices automáticos; se confirmará con datos reales en la Fase 2.

**Errores encontrados y cómo corregirlos**

Ninguno todavía. Si aparece un defecto en esta fase se documenta aquí (qué falló, por qué y cómo corregirlo), se registra en la «Lista de defectos» y en el plan de pruebas **antes** de corregirlo.

**Qué puedes probar tú en el portal**

Esta fase **no agrega nada visible**: son los cálculos y las consultas que usará la pantalla de la Fase 2. Para comprobarla:

1. Desde `portal-web`: `npm run test:reglas` debe terminar con **300 de 300**.
2. Para ver solo lo nuevo: `npx firebase emulators:exec --only firestore --project demo-ciudad-alerta "npx vitest run --config vitest.reglas.config.ts rules-tests/veredictos.test.ts rules-tests/veredictos-consultas.test.ts"`. Requiere Java 21 en el `PATH`.
3. En el portal todo se ve igual que antes. La pantalla «Por veredicto» llega en la Fase 2.

**Commits y push de la Fase 1**

Desde la raíz del repositorio, en la rama `main-web`:

```cmd
git status

git add portal-web/src/pages/Operador/veredictos.ts portal-web/src/pages/Operador/useReportesPorVeredicto.ts
git commit -m "feat(portal): cálculos, filtros y consultas de «Por veredicto» (Fase 1)"

git add portal-web/rules-tests/veredictos.test.ts portal-web/rules-tests/veredictos-consultas.test.ts
git commit -m "test(portal): pruebas de los cálculos y las consultas de «Por veredicto»"

git add Evidencia portal-web/plan.md
git commit -m "docs: plan y evidencia de la Fase 1"

git fetch origin
git pull --rebase origin main-web
git push origin main-web
```

**Listo cuando:** las funciones puras cubren los casos límite (sin `validadoAt`, veredicto antes de validar, reloj adelantado → `max(0, …)`, historial sin «En revisión»). **Cumplido.**

**Historias de usuario de esta fase**

Esta fase **no cierra ninguna historia por sí sola**: prepara la lógica y las consultas de **I1** (confirmados sin veredicto), **I2** (filtrar y ordenar) e **I4** (tiempo hasta el veredicto). Sus textos y criterios están al final de la Fase 2, donde se verifican con la pantalla.

---

## Fase 1B · Pasar a `comun` la lógica compartida

Se hizo **solo en la rama `main-web`**: de `main-mobile` solo se leyó. Es un paso previo a la pantalla de la Fase 2.

- [x] **1B.1** Comprobar si Firebase acepta que `firebase.json` apunte a `../comun/firebase/`. **No lo acepta** («is outside of project directory»). Lo probado: un `firebase.json` propio dentro de `comun/firebase/`, usado con `--config`, sí carga las reglas en el emulador. Decisión (D15): **no mover las reglas ni los índices por ahora**; se deja lo creado en `comun/firebase/` fuera del cambio. — **S**
- [x] **1B.2** Revisar qué tiene la app móvil (`origin/main-mobile`, sin cambios desde `bbcfbc5`). **Nada de esto estaba en su `comun`**: el bloqueo de confirmación y los roles existen dentro de su app Angular y los cálculos de «Por veredicto» solo en el portal. — **S**
- [x] **1B.3** Escribir primero las pruebas de `comun` (portadas de la prueba de la app y de la Fase 1) y verlas fallar (48 fallos). — **S**
- [x] **1B.4** Agregar a `comun` (solo archivos nuevos y las líneas de `index.ts`):
  - `confianza/bloqueo.ts`: `motivoDeBloqueo`, `MotivoBloqueo`, `estaCerrado`, portados de `confianza.service.ts` de la app.
  - `usuarios/roles.ts`: `UserRole`, `esCuentaDeOrganismo`, `esCuentaInstitucional`.
  - `reportes/veredictos.ts`: los cálculos de «Por veredicto» (con tipos mínimos, sin depender del portal).
  - Pruebas en `comun/test/` (bloqueo, roles y veredictos) y nota en `comun/LEEME.md`. — **M**
- [x] **1B.5** El portal usa `comun`: `confirmar.ts` y `VerificacionReporte.tsx` deciden con `motivoDeBloqueo` (se agrega el mensaje para una cuenta de organismo), `App.tsx` y `Navbar.tsx` usan `esCuentaDeOrganismo`, y `pages/Operador/veredictos.ts` re-exporta los cálculos. Las pruebas de los cálculos pasaron a `comun`; en el portal quedan las de filtros, orden y URL. — **M**
- [x] **1B.6** Verificación completa y evidencia en `Evidencia/e2e/fase1b/`. — **S**
- [x] **1B.7** Avisar al equipo móvil de lo que pueden adoptar (ver más abajo). — **S**
- [ ] **1B.8** *(Equipo)* Hacer los `commit` y el `push`: ver «Commits y push». — **S**

> **Comentarios:**
>

**Resultado de las pruebas**

| Prueba | Antes | Ahora |
|---|---|---|
| `comun`: `npm test` y `npm run tipos` | 78 pruebas | **126 de 126** (+48) y tipos en verde |
| `tsc` y `npm run build` del portal | En verde | En verde |
| `npm run test:reglas` | 300 de 300 | **266 de 266** (las pruebas de los cálculos se movieron a `comun`) |
| E2E completo | 96 pruebas: 93 OK, 3 NOK | **96 pruebas: 93 OK, 3 NOK** (WB1, WB5 y MS7, los ya registrados; la corrida tardó 15,8 min por la carga del equipo) |

No se agregan filas al plan de pruebas: las pruebas de `comun` son de funciones puras (no van al Excel, por el criterio acordado) y no hay pantallas nuevas. La conducta visible (WX1, WX2 y WX4) sigue pasando con el código nuevo.

**Errores encontrados y cómo corregirlos**

Ningún defecto. Una limitación de la herramienta, no del código: Firebase no acepta rutas fuera de la carpeta del proyecto en `firebase.json`. Si más adelante se quieren compartir las reglas y los índices por `comun`, la salida verificada es un `firebase.json` propio en `comun/firebase/`, usado con `--config` en los comandos del emulador y del despliegue. El despliegue con `--config` no se probó (habría que desplegar de verdad).

**Qué cambió para ti en el portal** (`npm run dev`)

1. **Confirmar con un reporte cerrado:** se ve igual que en la Fase 0 («Este reporte ya está resuelto o cerrado…»; con veredicto: «Un operador ya revisó este reporte»).
2. **Cuenta de operador:** sigue viendo «Las cuentas de operador gestionan reportes; no los confirman».
3. **Cuenta de organismo** que llegara a abrir un reporte: ve «Las cuentas de organismo reciben los reportes validados; no los confirman» (mensaje nuevo).
4. Fuera de eso el portal se ve y se comporta igual.

**Qué puede adoptar el equipo móvil** (cuando quiera; no se tocó su rama)

- Pasar los commits que solo tocan `comun/` a `main-mobile` con `git cherry-pick`.
- En su app, reemplazar sus copias por imports: `motivoDeBloqueo` y `estaCerrado` (en `confianza.service.ts`), `UserRole`, `esCuentaDeOrganismo` y `esCuentaInstitucional` (en `user-profile.model.ts`). Sus pruebas de esas funciones ya están portadas a `comun/test/`.
- Si algún día se quiere compartir `firestore.rules` e índices: ver la limitación de arriba; los índices del portal son la unión de 14 (3 más que los de la app).

**Commits y push (Fase 1 y Fase 1B juntas)**

La Fase 1 aún no se había subido, así que se incluye aquí. Desde la raíz del repositorio, en la rama `main-web`. **Primero lo de `comun/`, en un commit aparte** (para que el equipo móvil pueda pasarlo con `cherry-pick`):

```cmd
git status

:: 1. Solo comun/ (no mezclar con el portal)
git add comun/src comun/test comun/LEEME.md
git commit -m "feat(comun): bloqueo de confirmación, roles y cálculos de «Por veredicto»"

:: 2. Portal
git add portal-web/src
git commit -m "feat(portal): cálculos, filtros y consultas de «Por veredicto» y uso de comun (Fases 1 y 1B)"

:: 3. Pruebas del portal
git add portal-web/rules-tests
git commit -m "test(portal): pruebas de filtros y de las consultas de «Por veredicto»"

:: 4. Plan y evidencia
git add Evidencia portal-web/plan.md
git commit -m "docs: plan y evidencia de las Fases 1 y 1B"

git fetch origin
git pull --rebase origin main-web
git push origin main-web
```

`comun/package-lock.json` sigue modificado solo por `npm install`: no hace falta subirlo.

**Listo cuando:** `comun` pasa sus pruebas y sus tipos, el portal usa `comun` y el E2E no tiene fallos nuevos. **Cumplido.**

---

## Fase 2 · Pantalla «Por veredicto»

Una sección propia, pensada para que el operador entre, vea qué le falta y lo resuelva sin salir de ella.

- [ ] **2.1** Ruta `/operador/veredictos` en `App.tsx`, protegida igual que las demás del panel de operador (`usePanelOperador`). — **S**
- [ ] **2.2** En `OperadorTabs.tsx` se **quita** el enlace «Por verificar» y su lógica asociada (decisión D2) y se agrega «Por veredicto». El filtro `?verificacion=por_verificar` **se conserva** dentro de «Reportes» del operador (`OperadorReportes`) y en el menú del administrador (`AdminLayout`). — **S**
- [ ] **2.3** Cuatro tarjetas de indicadores arriba, con un selector de periodo (por defecto **«Este mes»**, reutilizando `PERIODOS`):
  - Confirmados sin veredicto (I1),
  - Espera mediana y la más antigua (I2),
  - Tiempo mediano en ser tomado en cuenta (I3),
  - Tiempo mediano de revisión a cierre (I4, se completa en la fase 3). — **M**
- [ ] **2.4** Barra de filtros, todos en el navegador y recordados en la URL:
  - **Categoría** y **comuna** (listas con las categorías activas y las comunas del operador).
  - **Tiempo de espera**: todos, más de 24 h, más de 48 h, más de 7 días.
  - **Orden**: más antiguos primero (por defecto), más votos, más recientes.
  - **Búsqueda** de texto en la descripción y filtro **con / sin foto**.
  - Botón «Limpiar filtros» y contador «Mostrando X de Y». — **M**
- [ ] **2.5** Lista de tarjetas: descripción, categoría, comuna, «validado hace X», puntos y votos, marca de **demorado** (más de 48 h) y el botón «Dar veredicto». Estados vacío («No tienes reportes confirmados esperando veredicto»), cargando y error, como el resto del portal. — **M**
- [ ] **2.6** Experiencia: actualización en vivo sin recargar, teclado y lector de pantalla (nombres accesibles), tema claro y oscuro, y uso cómodo en pantalla angosta (393 px) sin desplazamiento horizontal. Estilos con el sistema del panel (`OperadorTabs.module.css`, tarjetas de `OperadorEstadisticas`). — **M**

> **Comentarios:**
>

**Errores encontrados y cómo corregirlos**

Ninguno todavía. Si aparece un defecto en esta fase se documenta aquí (qué falló, por qué y cómo corregirlo), se registra en la «Lista de defectos» y en el plan de pruebas **antes** de corregirlo.

**Listo cuando:** un operador ve solo sus pendientes, filtra y ordena sin esperas, y la lista y el contador se actualizan solos al dar un veredicto.

**Historias de usuario de esta fase**

**I1 · Ver los confirmados sin veredicto.** Como operador, quiero ver solo los reportes de mi operador que la comunidad ya confirmó y que aún no tienen veredicto, para decidir sobre ellos. 1. *Dado* un reporte con `validado` y sin veredicto, no resuelto ni cerrado, *entonces* aparece en la lista. 2. *Dado* un reporte de otro operador, con veredicto o cerrado, *entonces* no aparece. 3. La lista se actualiza sola al dar un veredicto.
*Estado: Pendiente.*

**I2 · Filtrar y ordenar.** Como operador, quiero filtrar por categoría, comuna, tiempo de espera, texto y foto, y ordenar por antigüedad, votos o fecha, para priorizar. 1. Los filtros se combinan y se limpian con un botón. 2. El orden por defecto es el más antiguo primero. 3. Los filtros quedan en la URL y se restauran al recargar.
*Estado: Pendiente.*

**I3 · Cuántos hay y cuánto llevan esperando.** Como operador, quiero ver cuántos pendientes hay, la espera mediana y el más antiguo, para saber cuán atrasado voy. 1. El contador coincide con la lista. 2. Los que pasan 48 horas se marcan como demorados.
*Estado: Pendiente.*

**I4 · Cuánto tardan en tomarse en cuenta.** Como operador, quiero ver el tiempo mediano desde que un reporte se valida hasta que doy el veredicto, para medir mi respuesta. 1. Se calcula como `veredictoAt − validadoAt` en el periodo elegido (por defecto «Este mes»). 2. Se informa cuántos reportes no tienen `validadoAt` y quedan fuera.
*Estado: Pendiente.*

---

## Fase 3 · Tiempos de revisión a cierre

Indicador I4, que necesita leer el historial.

- [ ] **3.1** Calcular, con `useHistoriales` (ya existe, con caché y lecturas por tandas), el tiempo desde «En revisión» hasta «Cerrado» y hasta «Resuelto» de los reportes cerrados del periodo. — **M**
- [ ] **3.2** Mostrar mediana, promedio y cuántos reportes entran en el cálculo, con la nota de los que se excluyen (no pasaron por «En revisión»). — **S**
- [ ] **3.3** Revisar el costo: una lectura por entrada del historial de cada reporte cerrado del periodo. Si el periodo «Todo» resulta pesado, advertir antes de calcular. — **S**

> **Comentarios:**
>

**Errores encontrados y cómo corregirlos**

Ninguno todavía. Si aparece un defecto en esta fase se documenta aquí (qué falló, por qué y cómo corregirlo), se registra en la «Lista de defectos» y en el plan de pruebas **antes** de corregirlo.

**Listo cuando:** con datos de prueba conocidos, los valores coinciden con el cálculo a mano y cambiar de periodo no repite lecturas ya hechas.

**Historias de usuario de esta fase**

**I5 · Cuánto tarda la revisión hasta el cierre.** Como operador, quiero ver cuánto tardan los reportes en pasar de «En revisión» a «Cerrado» (y a «Resuelto»), para ver mi tiempo de resolución. 1. Se calcula con el historial de estados. 2. Se informa cuántos reportes no pasaron por «En revisión» y se excluyen.
*Estado: Pendiente.*

---

## Fase 4 · Dar el veredicto desde la sección

- [ ] **4.1** Abrir el detalle del reporte desde la lista y mostrar `VeredictoReporte` (real / falso con motivo obligatorio), reutilizando `DetalleReporte` como en `OperadorReportes`. — **S**
- [ ] **4.2** Al guardar, la tarjeta sale de la lista con una transición suave y los indicadores se recalculan. — **S**
- [ ] **4.3** *(Opcional)* Reemplazar el cálculo de puntos de `confianza/veredicto.ts` por `efectoDeVeredicto` y `motivoDeVeredicto` de `comun`, y tomar el largo máximo del motivo de `MOTIVO_VEREDICTO_MAXIMO`. Hoy duplican la misma lógica. — **S**

> **Comentarios:**
>

**Errores encontrados y cómo corregirlos**

Ninguno todavía. Si aparece un defecto en esta fase se documenta aquí (qué falló, por qué y cómo corregirlo), se registra en la «Lista de defectos» y en el plan de pruebas **antes** de corregirlo.

**Listo cuando:** el flujo completo (ver pendiente → veredicto → desaparece de la lista) funciona sin salir de la sección.

**Historias de usuario de esta fase**

**I6 · Dar el veredicto sin salir de la sección.** Como operador, quiero marcar «real» o «falso» desde la lista, para resolver rápido. 1. «Falso» exige un motivo. 2. Al guardar, el reporte sale de la lista y los indicadores se recalculan.
*Estado: Pendiente.*

---

## Fase 5 · Pruebas de «Por veredicto»

Solo pruebas y plan de pruebas.

- [ ] **5.1** Ampliar `e2e/datos/semilla.ts`: reportes validados sin veredicto de distinta antigüedad, categoría, comuna y con/sin foto; uno con veredicto; y un reporte con historial «En revisión» → «Cerrado» de duración conocida. — **S**
- [ ] **5.2** Pruebas E2E nuevas (`e2e/veredictos.spec.ts`):
  - WV1: la lista muestra solo los validados sin veredicto del operador.
  - WV2: el contador coincide con la lista.
  - WV3: el orden es del más antiguo al más nuevo y marca los que pasan el umbral.
  - WV4: dar un veredicto saca el reporte y baja el contador.
  - WV5: el tiempo hasta el veredicto coincide con el valor sembrado.
  - WV6: el tiempo de revisión a cierre coincide y se informan los excluidos.
  - WV7: un operador no ve los pendientes de otro.
  - WV8: los filtros (categoría, comuna, espera, texto, foto) se combinan y «Limpiar filtros» los quita.
  - WV9: el orden por votos y por fecha cambia la lista.
  - WV10: los filtros quedan en la URL y se restauran al recargar.
  — **M**
- [ ] **5.3** Actualizar la prueba existente `WG12 · «Por verificar» desde la pestaña del operador` (`e2e/resumen-operador.spec.ts`), que busca la pestaña que se reemplaza: pasa a comprobar «Por veredicto». La del administrador (`e2e/admin-reportes.spec.ts`) y `e2e/flujo-completo.spec.ts` no cambian. — **S**
- [ ] **5.4** Prueba de reglas: la consulta de pendientes la permite el operador y no devuelve reportes de otro operador. — **S**
- [ ] **5.5** Agregar WV1 a WV10 al plan de pruebas (`Plan_de_Pruebas_Ciudad_Alerta_2026_unificado.xlsx`, plataforma «Web») y su resultado. — **S**
- [ ] **5.6** Hacer más estable AV5 (esperar a que se guarde «visto» antes de recargar), que es intermitente. — **S**

> **Comentarios:**
>

**Errores encontrados y cómo corregirlos**

Ninguno todavía. Si aparece un defecto en esta fase se documenta aquí (qué falló, por qué y cómo corregirlo), se registra en la «Lista de defectos» y en el plan de pruebas **antes** de corregirlo.

**Listo cuando:** el E2E completo termina sin fallos nuevos y el plan de pruebas refleja WV1 a WV10.

**Historias de usuario de esta fase**

Esta fase no agrega historias: verifica las de las fases 1 a 4 (I1 a I6).

---

## Fase 6 · Términos y privacidad

Paridad con la app móvil (historia G3). Una sola copia del texto: `@ciudad-alerta/comun` → `legal/terminos.ts` (`TERMINOS_DE_USO`, `POLITICA_DE_PRIVACIDAD`, `ELIMINAR_CUENTA`, `DOCUMENTOS_LEGALES`, `VERSION_TERMINOS = '2026-11'`, `FECHA_TERMINOS`, `terminosAceptados()`).

**Cómo varía frente al portal actual:** hoy el registro no pide aceptar nada y no existe ninguna página legal. Las reglas ya aceptan los campos `terminosVersion` (texto de hasta 20 caracteres) y `terminosAceptadosAt` (hora del servidor), así que **no cambian las reglas**.

- [ ] **6.1** Página pública `/terminos` (sin sesión) que muestra los documentos de `DOCUMENTOS_LEGALES` con su fecha de versión, y enlaces desde el pie, «Registro», «Login» y «Mi perfil». — **M**
- [ ] **6.2** Registro (`pages/Registro/Registro.tsx`): casilla obligatoria «Acepto los términos y la política de privacidad» con enlaces; al crear `users/{uid}` se guardan `terminosVersion: VERSION_TERMINOS` y `terminosAceptadosAt: serverTimestamp()`. — **S**
- [ ] **6.3** Cuentas que no aceptaron la versión vigente (`!terminosAceptados(perfil.terminosVersion)`): pantalla de aceptación al entrar, que actualiza `terminosVersion`, `terminosAceptadosAt` y `updatedAt`. Se lee `terminosVersion` en `AuthContext` y la guarda va en `App.tsx`. Aplica a las cuentas que usan el portal (decisión D6). — **M**
- [ ] **6.4** Mensaje sobre el servicio de fotos: el texto legal de `comun` ya describe el difuminado en la nube; verificar que sea coherente con lo que hace el portal hasta la fase 10. — **S**
- [ ] **6.5** Pruebas E2E (WL1 a WL4): casilla obligatoria en el registro, el perfil queda con la versión y la fecha, pantalla de aceptación para una cuenta sin versión, página pública sin sesión. Ajustar la semilla (`e2e/datos/semilla.ts`) para que las cuentas de prueba ya tengan `terminosVersion` y las demás pruebas no pasen por la pantalla de aceptación. — **M**

> **Comentarios:**
>

**Errores encontrados y cómo corregirlos**

Ninguno todavía. Si aparece un defecto en esta fase se documenta aquí (qué falló, por qué y cómo corregirlo), se registra en la «Lista de defectos» y en el plan de pruebas **antes** de corregirlo.

**Listo cuando:** una cuenta nueva no se puede crear sin aceptar, y una cuenta antigua acepta una sola vez al entrar.

**Historias de usuario de esta fase**

**J1 · Términos y privacidad.** Como persona que se registra, quiero leer y aceptar los términos y la política de privacidad, para saber qué se hace con mis datos. 1. *Dado* el registro, *entonces* la casilla es obligatoria y se guardan `terminosVersion` y `terminosAceptadosAt`. 2. *Dado* una cuenta sin la versión vigente, *cuando* entra, *entonces* acepta antes de seguir. 3. `/terminos` se abre sin sesión.
*Estado: Pendiente.*

---

## Fase 7 · Eliminar mi cuenta

Paridad con la app (historia G4). Referencia: `modulos/perfil/datos/eliminar-cuenta.service.ts` de `main-mobile`.

**Cómo varía frente al portal actual:** hoy no hay forma de eliminar la cuenta. Los reportes **no se borran**: quedan como «Cuenta eliminada». Las reglas (`anonimizacionDelAutorValida`, `anonimizacionDeTicketValida`, `nombreYCorreoDePerfilValidos`) ya lo permiten, sin cambios.

- [ ] **7.1** Servicio `components/Perfil/eliminarCuenta.ts`, en este orden y repetible si se corta a mitad:
  1. Pedir la contraseña y reautenticar (`reauthenticateWithCredential`).
  2. Cambiar `autorNombre` a `AUTOR_CUENTA_ELIMINADA` en cada reporte propio, en lotes de 400.
  3. Dejar los tickets de soporte propios con `autorNombre: 'Cuenta eliminada'` y `autorEmail: ''`.
  4. Vaciar el perfil: `displayName: 'Cuenta eliminada'`, `email: ''` (el documento se conserva, sin datos personales, para no saltarse el intervalo entre reportes).
  5. Borrar la cuenta de Authentication (`deleteUser`).
  — **M**
- [ ] **7.2** Interfaz en `pages/MiPerfil/MiPerfil.tsx`: zona «Eliminar mi cuenta», diálogo (`components/Dialogo`) que explica qué pasa (usa el texto de `ELIMINAR_CUENTA`), campo de contraseña, errores claros (contraseña incorrecta, demasiados intentos, sin conexión) y, al terminar, cierre de sesión y vuelta al inicio. — **M**
- [ ] **7.3** Alcance: solo cuentas de **ciudadano** (decisión D7). Las cuentas de operador y de administrador las gestiona un administrador desde el panel, porque quedan ligadas a un operador. — **S**
- [ ] **7.4** Pruebas E2E (WL5 a WL8): contraseña incorrecta no borra nada; los reportes quedan como «Cuenta eliminada»; el perfil queda sin correo ni nombre; ya no se puede iniciar sesión; un operador no ve la opción. — **M**

> **Comentarios:**
>

**Errores encontrados y cómo corregirlos**

Ninguno todavía. Si aparece un defecto en esta fase se documenta aquí (qué falló, por qué y cómo corregirlo), se registra en la «Lista de defectos» y en el plan de pruebas **antes** de corregirlo.

**Listo cuando:** tras eliminar, el historial de reportes se conserva sin datos personales y la cuenta no puede volver a entrar.

**Historias de usuario de esta fase**

**J2 · Eliminar mi cuenta.** Como vecino, quiero eliminar mi cuenta desde el portal, para que no queden mis datos personales. 1. Pide la contraseña. 2. Los reportes quedan como «Cuenta eliminada» y no se borran. 3. La cuenta no puede volver a entrar.
*Estado: Pendiente.*

---

## Fase 8 · Corregir o retirar un reporte propio

Paridad con la app (historia G5). Referencia: `modulos/reportes/datos/mi-reporte.service.ts`.

**Cómo varía frente al portal actual:** hoy el vecino solo ve su reporte en «Historial». Con esta fase puede, **mientras el reporte siga «Reportado»**, corregir la descripción (solo si nadie lo ha confirmado con peso: `votos == 0` y `puntos == 0`) o retirarlo (queda «Cerrado»). Reglas sin cambios (`edicionDelAutorValida`, `retiroDelAutorValido`).

- [ ] **8.1** Servicio `components/Reportes/miReporte.ts` con transacciones que releen el reporte (si ya cambió de estado, se rechaza):
  - Corregir: `descripcion`, `updatedAt`, `editadoAt`, validando con las mismas reglas del largo que la creación (`DESCRIPCION_MIN`/`MAX`).
  - Retirar: entrada en `statusHistory` firmada «Quien lo reportó» (`desde: 'reportado'`, `hacia: 'cerrado'`) y actualización `estado: 'cerrado'`, `cerradoSinResolverAt`, `retiradoPorAutor: true`, en el mismo lote.
  — **M**
- [ ] **8.2** Tarjeta «Tu reporte» con «Corregir» y «Retirar» (con motivo opcional, hasta 300 caracteres) en `DetalleReporte` con `vista="ciudadano"`, visible solo para el autor y solo en «Reportado». Mensajes cuando ya no se puede («El organismo ya empezó a revisar este reporte», «Ya hay vecinos que lo confirmaron»). — **M**
- [ ] **8.3** Leer `retiradoPorAutor` y `editadoAt` en `mapearReporte`: mostrar «Retirado por quien lo reportó» y la marca «Editado» en el detalle, y **excluir los retirados de los tiempos de resolución** (Estadísticas del operador, Estadísticas globales y mapa de calor). — **M**
- [ ] **8.4** Pruebas E2E (WL9 a WL13): corregir, retirar con entrada en el historial, no disponible tras pasar a «En revisión», no disponible con confirmaciones con peso, y otro vecino no ve las acciones. — **M**

> **Comentarios:**
>

**Errores encontrados y cómo corregirlos**

Ninguno todavía. Si aparece un defecto en esta fase se documenta aquí (qué falló, por qué y cómo corregirlo), se registra en la «Lista de defectos» y en el plan de pruebas **antes** de corregirlo.

**Listo cuando:** un vecino corrige o retira su reporte antes de que lo revisen, y los retirados no afectan los tiempos del organismo.

**Historias de usuario de esta fase**

**J3 · Corregir o retirar un reporte propio.** Como vecino, quiero corregir o retirar mi reporte mientras nadie lo revisa. 1. Solo mientras esté «Reportado»; corregir, además, solo sin confirmaciones con peso. 2. Retirar deja el reporte «Cerrado» con una entrada «Quien lo reportó» y no cuenta en los tiempos de resolución.
*Estado: Pendiente.*

---

## Fase 9 · Aviso de emergencia y contacto al organismo

Paridad con la app (historias G1 y G2). Todo sale de `@ciudad-alerta/comun` → `reportes/contacto.ts`: `NUMEROS_DE_EMERGENCIA` (133, 132, 131), `riesgoDeCategoria`, `enlaceTelefono`, `correoValido`, `enlaceCorreo`. Sin cambios en las reglas.

- [ ] **9.1** Componente `AvisoEmergencia`: en las categorías de riesgo (árbol peligroso, luminaria, fuga de agua, calle deteriorada) muestra «Si hay peligro ahora, llama» con enlaces `tel:` a los tres números. Va en dos lugares (decisión D8, opción C): en `pages/Admin/AdminCrearReporte.tsx`, donde hoy se crean los reportes desde el portal, y en el detalle que ve el vecino (`DetalleReporte` con `vista="ciudadano"`), junto a «Contactar al organismo». Solo se muestra si `riesgoDeCategoria(categoria)` no es null. — **S**
- [ ] **9.2** Hook `useContactoOperador(operadorId)`: lee `operadores/{id}` (cualquier cuenta con sesión puede), con caché en memoria; sin contacto si no hay operador, no existe o está inactivo. — **S**
- [ ] **9.3** Componente `ContactoOrganismo` en `DetalleReporte` con `vista="ciudadano"`: botones «Llamar» (`tel:`) y «Escribir» (`mailto:` con el asunto y el código del reporte) y la dirección. Sin operador, lo dice. Los datos (`telefonoContacto`, `correoContacto`, `direccionContacto`) los llena el administrador en **Operadores**, que ya tiene esos tres campos. — **M**
- [ ] **9.4** Pruebas E2E (WL14 a WL17): el aviso aparece solo en categorías de riesgo, tanto al crear el reporte como en el detalle del vecino, los enlaces `tel:` son correctos, el contacto aparece con los datos del operador y se explica la ausencia. — **S**

> **Comentarios:**
>

**Errores encontrados y cómo corregirlos**

Ninguno todavía. Si aparece un defecto en esta fase se documenta aquí (qué falló, por qué y cómo corregirlo), se registra en la «Lista de defectos» y en el plan de pruebas **antes** de corregirlo.

**Listo cuando:** un vecino puede llamar o escribir al organismo desde su reporte, y el administrador ve el aviso de emergencia al crear uno de riesgo.

**Historias de usuario de esta fase**

**J4 · Aviso de emergencia.** Como administrador que crea un reporte de riesgo, quiero ver los teléfonos de emergencia, para recordar que Ciudad Alerta no atiende emergencias. 1. Aparece solo en las categorías de riesgo, con 133, 132 y 131 como enlaces `tel:`. 2. *Dado* un reporte propio de una categoría de riesgo, *entonces* el detalle que ve el vecino muestra el mismo aviso.
*Estado: Pendiente.*

**J5 · Contactar al organismo.** Como vecino, quiero llamar o escribir al organismo desde mi reporte. 1. «Llamar» y «Escribir» usan los datos del operador asignado. 2. Sin operador, el detalle lo dice.
*Estado: Pendiente.*

---

## Fase 10 · Fotos protegidas en la nube

Paridad con la app (historia G10). Hoy el portal difumina **en el navegador** con TensorFlow.js (`src/privacidad/privacidad.ts`, modelos de 19 MB en `public/models`) al crear un reporte desde `AdminCrearReporte`. La app lo hace en el **servicio de privacidad** (`servicio-privacidad/`, en Render): `POST /v1/proteger` con el token de sesión, que devuelve la foto difuminada, los datos de `privacidad` y un vector de la foto.

**Cómo varía frente al portal actual**

| | Hoy (navegador) | Con la nube |
|---|---|---|
| Dónde se difumina | En el equipo de quien crea el reporte | En un servidor de Render (EE. UU.) |
| Peso del portal | 19 MB de modelos + TensorFlow.js | Se eliminan |
| Dependencia | Ninguna externa | Servicio gratuito que **se duerme** tras 15 min: la primera foto tarda 30 a 60 s |
| Límites | Ninguno | 30 fotos por usuario cada 10 min, 6 MB por foto |
| Consistencia con la app | Mismos umbrales | Los mismos modelos y umbrales, en un solo lugar |

Las reglas siguen exigiendo `foto.privacidad.aplicada == true`: una foto sin proteger nunca se publica.

- [ ] **10.1** Coordinar con quien administra Render (decisión D9): agregar el origen del portal (la URL de Hosting y `http://localhost:5173` para desarrollo) en **Environment → ORIGENES**, y confirmar la URL del servicio. — **S**
- [ ] **10.2** Cliente `src/privacidad/privacidadNube.ts` (equivalente a `PrivacidadService.anonimizar`): `POST {URL}/v1/proteger` con `Authorization: Bearer <token>` y el tipo MIME de la foto, tiempo máximo de 90 s, aviso de «despertando» a los 6 s, cancelación, y validación de la respuesta (`imagen` en `data:image/` y `privacidad.aplicada === true`). Devuelve la misma forma `FotoProtegida` que hoy, de modo que `crearReporte.ts` no cambia. La URL va en una variable `VITE_PRIVACIDAD_URL`. — **M**
- [ ] **10.3** Despertar el servicio (`GET /salud`) al abrir «Crear reporte» y mostrar en `AdminCrearReporte.tsx`: «Protegiendo la foto…», «Despertando el servicio de privacidad, puede tardar hasta 1 minuto», **Cancelar**, y **Reintentar / Quitar foto** si falla. Achicar la foto a 1024 px antes de enviarla (`privacidad/comprimir.ts`). — **M**
- [ ] **10.4** Pruebas E2E (WL18 a WL21) con el servicio **simulado** (`page.route`): éxito, respuesta lenta con aviso de despertar, fallo con reintentar o quitar, y cancelación. El servicio real no se puede usar en el emulador porque verifica tokens del proyecto real, no del proyecto `demo`. Una prueba manual contra el servicio real queda en la fase 11. — **M**
- [ ] **10.5** Retirar el difuminado del navegador, **solo después de validar la nube en producción**: dependencias `@tensorflow/*` y `@tensorflow-models/*`, `public/models`, el alias `@mediapipe/face_detection` de `vite.config.ts` y `src/privacidad/{privacidad,tensorflow,mediapipe-stub}.ts`. Se conserva `comprimir.ts`. — **S**
- [ ] **10.6** *(Idea)* Guardar en el reporte el vector (`embedding`) que devuelve el servicio, para que la app detecte duplicados de reportes creados desde el portal. Hoy el portal guarda `embedding: null`. Ver decisión D10. — **S**

> **Comentarios:**
>

**Errores encontrados y cómo corregirlos**

Ninguno todavía. Si aparece un defecto en esta fase se documenta aquí (qué falló, por qué y cómo corregirlo), se registra en la «Lista de defectos» y en el plan de pruebas **antes** de corregirlo.

**Listo cuando:** una foto subida en el portal sale difuminada desde el servicio, el portal pesa 19 MB menos y una falla del servicio nunca publica una foto sin proteger.

**Historias de usuario de esta fase**

**J6 · Fotos protegidas en la nube.** Como administrador, quiero que la foto de un reporte se difumine en el servicio de privacidad, para igualar a la app y aliviar el portal. 1. La foto sale con rostros y personas difuminados y `privacidad.aplicada`. 2. Hay avisos de espera, cancelar y reintentar. 3. Nunca se publica una foto sin proteger.
*Estado: Pendiente.*

---

## Fase 11 · Cierre y despliegue

- [ ] **11.1** Actualizar `README.md` del portal con las secciones nuevas. — **S**
- [ ] **11.2** Prueba manual con una cuenta de operador real en el emulador (datos sembrados), con las reglas desplegadas, y una prueba manual de la fase 10 contra el servicio real de Render. — **S**
- [ ] **11.3** Revisar que el plan de pruebas tenga todas las pruebas WV1 a WV10 y WL1 a WL21 con su resultado y que la «Lista de defectos» refleje los defectos de todas las fases (cada fase los agrega al cerrarse). — **S**
- [ ] **11.4** Merge y despliegue (`firebase deploy --only hosting`). — **S**

> **Comentarios:**
>

**Errores encontrados y cómo corregirlos**

Ninguno todavía. Si aparece un defecto en esta fase se documenta aquí (qué falló, por qué y cómo corregirlo), se registra en la «Lista de defectos» y en el plan de pruebas **antes** de corregirlo.

---

## Decisiones

| # | Decisión | Respuesta / propuesta |
|---|---|---|
| D1 | Mensaje de seguridad para el rol `organismo` | **Sí.** Tarea 0.4 (hecha). |
| D2 | La pestaña «Por verificar» del operador | **Se reemplaza** por «Por veredicto». El filtro se conserva en el administrador de reportes del operador. |
| D3 | Umbral de «demorado» | **48 horas, como constante en el código.** No crea ningún campo ni cambia las reglas. Solo haría falta un campo si un administrador debiera poder cambiarlo desde la interfaz. |
| D4 | Vista de administrador de «Por veredicto» | **Fase posterior** (ver «Ideas y pendientes»). |
| D5 | «Tomado en cuenta» | **Cuando se da el veredicto.** |
| D6 | ¿A quién se le pide aceptar los términos en el portal? | *Propuesta:* a todas las cuentas que usan el portal (ciudadano, operador y administrador). |
| D7 | ¿Quién puede eliminar su cuenta desde el portal? | *Propuesta:* solo ciudadanos. |
| D8 | ¿Dónde va el aviso de emergencia? | **Respondida: opción C**, en los dos lugares (crear reporte desde el panel y detalle del vecino). |
| D9 | ¿Quién agrega el origen del portal en Render (`ORIGENES`) y confirma la URL? | *Pendiente:* depende del equipo móvil. |
| D10 | ¿Guardar el vector de la foto (`embedding`) en los reportes del portal? | *Propuesta:* dejarlo para después. |
| D11 | ¿Los reportes creados desde el panel de administración aparecen como pendientes de veredicto? | **Sí, se muestran.** El portal hoy no les da veredicto, pero ese comportamiento se corregirá después. El operador no crea reportes, así que no se ve afectado. |
| D12 | Reportes validados sin `validadoAt` (anteriores a ese campo) | **Se muestran** en la lista, se **excluyen** de las medianas de espera y se informa cuántos son. |
| D13 | Periodo del tiempo hasta el veredicto | **Según la fecha del veredicto** (`veredictoAt`). Lo que se mide es el tiempo de respuesta desde que la comunidad valida un reporte hasta que el organismo encargado lo da como real o falso. |
| D14 | Topes de lectura | **200** pendientes y **500** reportes con veredicto por periodo; si se superan, se avisa. |
| D15 | ¿Mover `firestore.rules` y `firestore.indexes.json` a `comun/firebase/`? | **No por ahora.** Firebase no acepta rutas fuera de la carpeta del proyecto en `firebase.json`. Se podría con un `firebase.json` propio en `comun/` y `--config`, pero requiere acuerdo con el equipo móvil. Mientras tanto, copias idénticas y los índices del portal como unión (14). |

Filtros de «Por veredicto» (respondido): categoría y comuna, tiempo de espera, orden, y búsqueda con foto. Periodo por defecto de los indicadores de tiempo: **Este mes**.

---

## Ideas y pendientes

- **Vista de administrador de «Por veredicto»** con selector de operador (D4).
- Advertencia de costo antes de calcular I4 con el periodo «Todo».
- Umbral de «demorado» editable por un administrador (requiere un documento de ajustes y reglas coordinadas con la app móvil).
- **Cuenta de organismo en el portal:** descartada. Solo lee, y la app móvil ya la atiende; el portal solo muestra el mensaje de la tarea 0.4.
- Guardar el vector de la foto (tarea 10.6).
- **Reglas e índices compartidos por `comun`** (ver D15): `firebase.json` propio en `comun/firebase/` usado con `--config`, a coordinar con el equipo móvil (su Docker, sus scripts de diagnóstico y `firebase.json` leen el archivo desde la raíz de la app).
- **Pasar a `comun` al empezar su fase** (hoy están en la app móvil): `tieneVotosConPeso` y los predicados de corregir o retirar (Fases 7 y 8), `contactoDeOperador` (Fase 9) y `PARAMETROS_PRIVACIDAD` con la validación de la respuesta del servicio (Fase 10).
- **Mensaje claro cuando se rechaza un veredicto (mejora pendiente, no es un defecto).** Las reglas solo permiten dar veredicto, y por tanto confirmar, a reportes cuyo autor es una cuenta de **ciudadano**: un reporte creado con una cuenta de administrador u operador no admite veredicto. El portal no puede saberlo de antemano (no puede leer el perfil de otras cuentas) y hoy responde con el mensaje genérico «No tienes permiso para dar un veredicto a este reporte». La mejora sería un mensaje que lo explique («El autor del reporte no es un ciudadano, o el operador asignado está inactivo») en `confianza/veredicto.ts` (`mensajeDeErrorVeredicto`). Confirmado por el equipo el 2026-10-29; queda anotada solo como mejora.

---

# Historias de usuario

Leyenda: **[W]** web, **[M]** móvil, **[R]** reglas de Firestore, **[T]** técnica. Prioridad MoSCoW: **M** imprescindible, **S** importante, **C** si da tiempo. Estado: **Hecho**, **Pendiente**. Los criterios de aceptación van en formato *Dado / Cuando / Entonces* y se redactaron a partir del comportamiento descrito en las guías (`GUIA_MODULOS.md`, `PLAN_DE_PRUEBAS.md`, `PLAN_V1.md`) y en las pruebas del portal; deben contrastarse con el código antes de darlas por cerradas.

## Parte 1 · Historias del sistema

Fuente: `sistema_confianza.md` §10 y la trazabilidad de la app (`ciudad-alerta-app/docs/PLAN_DE_PRUEBAS.md`, §20). El estado de la columna es el que figura en ese documento, que no se ha actualizado (queda pendiente su revisión: historia E4).

### Historias del sistema de confianza (`sistema_confianza.md`)

| Épica | Historias |
|---|---|
| **A · Sistema de confianza** | A1 Spike y modelo de datos `[R/T]` · A2 Mi nivel de confianza `[M]` · A3 Confirmar con peso y ver la verificación `[M]` · A4 Mensajes de límites `[M]` · A5 Estado de validación en los listados `[W/M]` · A6 Veredicto real o falso `[W]` · A7 Panel «Sistema de confianza» `[W]` · A8 Moderación de confirmaciones `[W/R]` · A9 Migración de datos existentes `[T]` · A10 Pruebas de reglas `[T]` · A11 Explicación en la app `[M]` · A12 Reclamar aciertos de confirmación `[M/R]` (futura) |
| **B · Notificaciones** | B1 Campana con contador · B2 Lista de avisos · B3 Avisos del ciudadano · B4 Avisos del operador · B5 Avisos del administrador · B6 Alinear el esquema con la app móvil · B7 Avisos en la app |
| **C · Difuminado de imágenes** | C1 Alinear con el código del compañero · C2 Difuminar al crear el reporte · C3 Vista protegida de la foto · C4 Misma regla en la app |
| **D · Acceso por organismo** | D1 Modelo de perfil de acceso · D2 Asignar organismos a cuentas · D3 Acceso del operador por organismo · D4 Coexistencia y migración · D5 Impacto en la app |
| **E · Pendientes menores** | E1 Filtro «Este mes» · E2 Volver al mapa tras registrarse · E3 Favicon con el pin del logo · E4 Actualizar documentación · E5 Mapa de calor para el operador (en evaluación) |
| **F · Mapa de calor por comuna** | F1 Ver el mapa de calor · F2 Detalle estadístico de una comuna · F3 Ranking de comunas · F4 Acceso solo administrador · F5 Filtro por comuna y enlace «Ver reportes de esta comuna» · F6 Periodo seleccionable · F7 Totales sin descargar todos los reportes · F8 Usar `resueltoAt` en el mapa de calor · F9 Mapa de calor del operador · F10 Probar con datos reales · F11 Accesibilidad · F12 Calcular el tiempo de resolución |

### Historias originales del producto (trazabilidad de la app móvil)

| Código | Historia | Casos de prueba de la app |
|---|---|---|
| CA-48 | Registro de usuario | CP-REG-01 a 18 |
| CA-49 | Inicio de sesión | CP-LOG-01 a 12 |
| CA-50 / CA-77 | Control de acceso y cierre de sesión | CP-SES-01 a 12 |
| CA-75 | Recuperación de contraseña | CP-REC-01 a 10 |
| CA-51 | Mapa | CP-MAP-01 a 12 |
| CA-52 | Geolocalización | CP-UBI-01 a 13 |
| CA-79 | Reglas de seguridad de Firestore | CP-SEC-01 a 43 |
| HU-20 | Detección de coincidencias | CP-DUP-01 a 18 |
| HU-21 / HU-22 | Confirmación comunitaria | CP-CON-01 a 13 |
| HU-25 | Mapa de incidencias y «Cerca de mí» | CP-INC-01 a 27 |
| HU-26 | Detalle de la incidencia | CP-DET-01 a 13 |
| HU-27 | Historial del usuario | CP-HIS-01 a 11 |
| HU-28 | Enrutamiento y estados | CP-EST-01 a 13 |
| F12 | Tiempo de resolución | CP-EST-14 a 19 |

## Parte 2 · Historias de lo último implementado

Las épicas **G** (app móvil) y **H** (portal ya hecho) quedan aquí. Las épicas **I** y **J** son del trabajo de este plan y sus textos están al final de cada fase.

### Épica G · App móvil 1.0 a 1.2 (ya implementada)

| ID | Historia | Plataforma | Prioridad | Estado |
|---|---|---|---|---|
| G1 | Contactar al organismo | M | M | Hecho |
| G2 | Aviso de emergencia | M | M | Hecho |
| G3 | Términos y privacidad con aceptación | M/R | M | Hecho |
| G4 | Eliminar mi cuenta | M/R | M | Hecho |
| G5 | Corregir o retirar un reporte propio | M/R | S | Hecho |
| G6 | Borrador sin conexión | M | S | Hecho |
| G7 | Bienvenida | M | S | Hecho |
| G8 | Configuración de la app | M | S | Hecho |
| G9 | Elegir en el mapa dónde se marca el reporte | M | S | Hecho |
| G10 | Fotos protegidas en la nube | M/T | M | Hecho |
| G11 | Veredicto y su aviso desde la app | M | M | Hecho |
| G12 | Inicio con «Tus reportes» y «Por atender» | M | C | Hecho |
| G13 | Cuenta de organismo («Reportes validados») | M/R | S | Hecho |
| G14 | Reglas endurecidas (versión 1.1) | R | M | Hecho |

**G1 · Contactar al organismo.** Como vecino, quiero llamar o escribir al organismo que atiende mi reporte, para preguntar por su avance.
1. *Dado* un reporte con operador asignado, *entonces* el detalle muestra «Llamar» (`tel:`) y «Escribir» (`mailto:` con el asunto y el código del reporte) con los datos del operador.
2. *Dado* un reporte sin operador o con el operador inactivo, *entonces* el detalle lo dice y no muestra botones.

**G2 · Aviso de emergencia.** Como vecino, quiero ver un aviso cuando mi reporte puede ser un peligro inmediato, para llamar a quien corresponde.
1. *Cuando* elijo árbol peligroso, luminaria, fuga de agua o calle deteriorada, *entonces* aparece «Si hay peligro ahora, llama» con 133, 132 y 131.
2. *Dado* otra categoría, *entonces* no aparece.

**G3 · Términos y privacidad.** Como vecino, quiero saber qué datos se guardan y aceptarlo, para usar la aplicación con confianza.
1. *Al registrarme*, la casilla de aceptación es obligatoria y se guardan `terminosVersion` y `terminosAceptadosAt` (hora del servidor).
2. *Dado* una cuenta que no aceptó la versión vigente, *cuando* entra, *entonces* debe aceptarla.
3. Los textos se leen de `comun/src/legal/terminos.ts` y existen las páginas públicas `/privacidad` y `/eliminar-cuenta`.

**G4 · Eliminar mi cuenta.** Como vecino, quiero eliminar mi cuenta, para que no queden mis datos personales.
1. *Cuando* confirmo con mi contraseña, *entonces* mis reportes quedan como «Cuenta eliminada», mis tickets sin nombre ni correo, mi perfil sin correo ni nombre, y la cuenta de Authentication se borra.
2. *Dado* un fallo a mitad del proceso, *entonces* se puede reintentar sin repetir lo ya hecho.

**G5 · Corregir o retirar un reporte propio.** Como vecino, quiero corregir o retirar mi reporte mientras nadie lo revisa, para arreglar un error o un duplicado.
1. *Dado* un reporte propio «Reportado», *entonces* puedo retirarlo (queda «Cerrado», con `retiradoPorAutor` y una entrada «Quien lo reportó» en el historial).
2. *Dado* que además nadie lo confirmó con peso, *entonces* puedo corregir la descripción.
3. *Dado* un reporte que ya salió de «Reportado», *entonces* no se puede corregir ni retirar.

**G6 · Borrador sin conexión.** Como vecino, quiero guardar mi reporte cuando no hay señal, para que se envíe solo al volver la conexión. 1. *Dado* sin señal, *entonces* se guarda un borrador y se envía al volver la conexión, sin duplicados. 2. La foto sin proteger queda solo en el teléfono y se difumina antes de subirla.

**G7 · Bienvenida.** Como persona nueva, quiero tres pantallas de introducción la primera vez, para entender la aplicación y la confianza. 1. Se muestran una sola vez (las cuentas de operador no las ven). 2. «Ver la introducción» está en Configuración.

**G8 · Configuración.** Como usuario, quiero ajustar la aplicación (tamaño de texto, tema, teléfono propio, datos guardados), para usarla a mi manera. 1. Los cambios se aplican y se conservan. 2. «Borrar datos guardados» no pierde el reporte que espera señal.

**G9 · Elegir en el mapa dónde se marca el reporte.** Como vecino con cuenta de 7 días o más, quiero marcar el punto en el mapa, para reportar un problema que está en otra calle. 1. *Dado* una cuenta con 7 días o más, *entonces* «Elegir en el mapa» está habilitado; *si no*, aparece deshabilitado con los días que faltan. 2. El reporte guarda `ubicacion.fuente` (`gps` o `mapa`) y la comuna, el organismo y el operador se calculan con el punto elegido.

**G10 · Fotos protegidas en la nube.** Como vecino, quiero que la foto se proteja sin congelar mi teléfono, para poder enviar el reporte. 1. La foto se envía achicada a 1024 px al servicio de privacidad y vuelve con rostros y personas difuminados. 2. *Dado* un fallo del servicio, *entonces* se ofrece reintentar o quitar la foto, y nunca se publica una sin proteger.

**G11 · Veredicto y su aviso desde la app.** Como operador, quiero marcar un reporte como real o falso desde la app, para que su autor gane o pierda confianza. 1. *Cuando* marco falso, el motivo es obligatorio. 2. El autor recibe el aviso en la campana con los puntos ganados o perdidos.

**G12 · Inicio con resumen.** Como vecino, quiero ver el resumen de «Tus reportes» y, como gestor, lo «Por atender», para saber qué requiere mi atención al abrir la aplicación.

**G13 · Cuenta de organismo.** Como municipalidad, quiero ver los reportes de mi comuna que la comunidad ya validó, para enterarme de lo que llegó a mi organismo. 1. Una cuenta con `role: 'organismo'` ve «Reportes validados» (mapa y lista, hasta 500) y el detalle en modo lectura. 2. Las reglas le niegan crear, confirmar, gestionar y leer reportes sin validar o de otro organismo.

**G14 · Reglas endurecidas (1.1).** Como equipo, queremos que las reglas rechacen datos falsos, para proteger las métricas y a las personas. 1. Listas blancas de campos en perfil, reporte, foto, historial, tickets y mensajes. 2. Fechas puestas por el servidor, nombre del organismo igual al del catálogo, foto del propio reporte, y no se confirman reportes resueltos, cerrados o con veredicto.

### Épica H · Portal web (ya implementada)

| ID | Historia | Plataforma | Prioridad | Estado |
|---|---|---|---|---|
| H1 | Crear un reporte desde el panel | W | M | Hecho |
| H2 | Resumen y estadísticas globales del administrador | W | S | Hecho |
| H3 | Acciones en lote y exportación | W | S | Hecho |
| H4 | Catálogos: organismos con límite comunal, operadores y categorías | W | M | Hecho |
| H5 | Mapa por región con agrupación | W | M | Hecho |
| H6 | Mi perfil | W | S | Hecho |
| H7 | Soporte para administradores | W | S | Hecho |
| H8 | Panel del operador | W | M | Hecho |
| H9 | Suite de pruebas de punta a punta | T | M | Hecho (93 pruebas: 90 OK, 3 NOK) |

**H1 · Crear un reporte desde el panel.** Como administrador, quiero crear un reporte con su comuna, organismo y operador asignados, para registrar casos que llegan por otros canales. Pruebas: WC1, WC2, WC3, RI7.
1. *Dado* un punto válido, *entonces* se asignan comuna, organismo y operador, y el reporte queda marcado con `origen: 'portal_admin'`.
2. *Dado* coordenadas inválidas o un punto sin comuna, *entonces* no se envía.
3. *Dado* una comuna sin municipalidad activa, *entonces* el organismo es genérico y no hay operador.
4. Solo se ofrecen las categorías activas, y la foto sale difuminada (`privacidad.aplicada`).

**H2 · Resumen y estadísticas globales.** Como administrador, quiero indicadores del día, alertas y estadísticas por periodo, para ver cómo va la atención. Pruebas: WR1 a WR5, WE1. 1. El Resumen muestra los indicadores del día, las alertas con enlace a la lista ya filtrada, el porcentaje de cerrados, la actividad reciente y los resueltos del mes con su tiempo promedio. 2. Las estadísticas globales se calculan por periodo.

**H3 · Acciones en lote y exportación.** Como gestor, quiero cambiar el estado, reasignar o eliminar varios reportes y exportarlos, para trabajar más rápido. Pruebas: WG1 a WG8. 1. El cambio de estado en lote omite los reportes sin veredicto. 2. Reasignar o quitar el operador funciona en lote. 3. El CSV incluye todos los reportes filtrados. 4. Eliminar un reporte borra también su historial, sus confirmaciones y su foto.

**H4 · Catálogos.** Como administrador, quiero administrar organismos (con límite comunal), operadores con sus cuentas y categorías, para mantener la asignación al día. Pruebas: WO1, WO2, WO4, WO5, WK1 a WK3. 1. Desactivar un organismo o una categoría no pierde la historia de sus reportes. 2. El alta de un operador y de su cuenta no cierra la sesión del administrador. 3. Las categorías se reordenan con el teclado.

**H5 · Mapa por región con agrupación.** Como persona con sesión, quiero ver los reportes de una región en el mapa, para conocer lo que pasa en mi zona. Pruebas: WB1 a WB8, MS1, MS2. 1. Los filtros de región, categoría y estado funcionan. 2. La lectura se limita a 500 por región y lo avisa. 3. Los reportes cercanos se agrupan en un círculo con el total y se separan al acercar. 4. «Mi región» usa la ubicación y, sin permiso, deja elegir una región. *(WB1, WB5 y MS7 están en NOK: defectos DEF-001 y DEF-002.)*

**H6 · Mi perfil.** Como usuario, quiero ver los datos de mi cuenta y verificar mi correo, para que mi confirmación pese. Pruebas: WF1 a WF3. 1. Se muestran los datos de la cuenta de un vecino y de un operador. 2. El recordatorio «Verificar correo» aparece solo si no está verificado.

**H7 · Soporte para administradores.** Como administrador, quiero atender las quejas y sugerencias en tiempo real, para responder a los vecinos. Pruebas: WS1 a WS4, AV6. 1. La bandeja se actualiza en tiempo real y se filtra. 2. Responder deja el caso «En atención»; se puede cerrar y reabrir. 3. La campana cuenta las conversaciones abiertas y los mensajes nuevos.

**H8 · Panel del operador.** Como operador, quiero ver y gestionar solo los reportes asignados a mi operador, para atender mi zona. Pruebas: WP1 a WP3. 1. Solo ve los reportes de su `operadorId`. 2. Cambia el estado solo de los que tienen veredicto. 3. Sus estadísticas y su mapa muestran solo los suyos.

**H9 · Suite de pruebas de punta a punta.** Como equipo, queremos pruebas automáticas del portal, para detectar fallos antes de entregar. 1. 93 pruebas con Playwright contra los emuladores de Auth y Firestore, con evidencia en `Evidencia/e2e`. 2. Los fallos reales quedan registrados como defectos (DEF-001 y DEF-002) sin corregir el código hasta indicarlo.

### Épica I · Sección «Por veredicto»

El texto y los criterios de cada historia están **al final de la fase** indicada en la columna «Fase».

| ID | Historia | Plataforma | Prioridad | Fase | Estado |
|---|---|---|---|---|---|
| I1 | Ver los confirmados sin veredicto | W | M | 1–2 | Pendiente |
| I2 | Filtrar y ordenar los pendientes | W | M | 1–2 | Pendiente |
| I3 | Saber cuántos hay y cuánto llevan esperando | W | M | 2 | Pendiente |
| I4 | Saber cuánto tardan en tomarse en cuenta | W | S | 1–2 | Pendiente |
| I5 | Saber cuánto tarda la revisión hasta el cierre | W | S | 3 | Pendiente |
| I6 | Dar el veredicto sin salir de la sección | W | M | 4 | Pendiente |
| I7 | Mensaje de seguridad para cuentas de organismo | W | S | 0 | Hecho (WX2) |

### Épica J · Paridad con la app (fases 6 a 10)

El texto y los criterios de cada historia están **al final de la fase** indicada en la columna «Fase».

| ID | Historia | Plataforma | Prioridad | Fase | Estado |
|---|---|---|---|---|---|
| J1 | Términos y privacidad en el portal | W | M | 6 | Pendiente |
| J2 | Eliminar mi cuenta desde el portal | W | M | 7 | Pendiente |
| J3 | Corregir o retirar un reporte propio | W | S | 8 | Pendiente |
| J4 | Aviso de emergencia | W | S | 9 | Pendiente |
| J5 | Contactar al organismo desde mi reporte | W | S | 9 | Pendiente |
| J6 | Fotos protegidas en la nube | W | S | 10 | Pendiente |

