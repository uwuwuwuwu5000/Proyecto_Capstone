# @ciudad-alerta/comun

Lógica de Ciudad Alerta que deben compartir la **app móvil** (Angular + Ionic, `ciudad-alerta-app/`) y el **portal web** (React + Vite, `portal-web/` en la rama `main-web`).

Es **TypeScript puro**: no importa Angular, React, Ionic ni Firebase, y no tiene dependencias en tiempo de ejecución. Cada aplicación pone su interfaz y su acceso a datos; aquí van las reglas del negocio que tienen que dar lo mismo en las dos. Así una corrección se hace una vez y llega a ambas.

## Qué hay

| Carpeta | Contenido | Viene de |
|---|---|---|
| `reportes/` | Estados, transiciones, etiquetas, colores, categorías, largo de la descripción | app (y lo mismo que `constants/reportes.ts` del portal) |
| `reportes/tiempos.ts` | Tiempo de primera atención y de resolución, mediana, promedio, «2 h 15 min» | **portal** (`components/Reportes/tiempos.ts`) |
| `confianza/` | Niveles, pesos, límites diarios, día con desfase UTC−3, validación, veredictos, progreso | app (módulo confianza) |
| `territorio/` | Normalizar nombres de comunas, códigos CUT, nombre corto de región | app y portal |
| `territorio/mapa-calor.ts` | Agrupación de reportes por comuna y tramos de intensidad | **portal** (`pages/Admin/mapaCalor.ts`) |
| `geo/` | Distancia en metros, cajas geográficas, «1,2 km» | app |
| `privacidad/` | Umbrales y geometría del difuminado de rostros y cabezas | app y portal (estaban copiados a mano) |

Todo lo que dependa de las reglas de Firestore (transiciones, límites, fórmulas de confianza) **debe coincidir con `firestore.rules`**. Las pruebas transcriben las fórmulas de las reglas y fallan si alguien cambia un número solo de un lado.

## Pruebas

```cmd
cd comun
npm install
npm test
```

`npm run tipos` revisa los tipos con las opciones más estrictas de las dos aplicaciones juntas: si compila aquí, compila en ambas.

## Usarlo desde la app móvil (ya configurado)

`ciudad-alerta-app/tsconfig.json`:

```json
"paths": { "@ciudad-alerta/comun": ["../comun/src/index.ts"] }
```

```ts
import { ETIQUETAS_ESTADO, formatearDuracion } from '@ciudad-alerta/comun';
```

No hace falta instalar nada en la app: Angular compila estos archivos como si fueran propios.

## Usarlo desde el portal web (cuando el equipo lo decida)

La rama `main-web` no se modificó. Para adoptarlo:

1. Traer la carpeta `comun/` a `main-web` (ver «Mantenerlo igual en las dos ramas»).
2. `portal-web/vite.config.ts`:

   ```ts
   resolve: {
     alias: {
       '@ciudad-alerta/comun': fileURLToPath(new URL('../comun/src/index.ts', import.meta.url)),
     },
   },
   server: { fs: { allow: ['..'] } },
   ```

3. `portal-web/tsconfig.app.json`: agregar `"paths": { "@ciudad-alerta/comun": ["../comun/src/index.ts"] }` y `"../comun/src"` en `include`.
4. Reemplazar de a poco lo duplicado: `constants/reportes.ts`, `components/Reportes/tiempos.ts`, la agrupación de `pages/Admin/mapaCalor.ts` y los umbrales de `privacidad/privacidad.ts`.

Un cambio visible: en `comun`, `resuelto` es verde (`#3fbf8f`) y no blanco, porque el blanco casi no se veía sobre el mapa (corrección v2-B8 de la app).

## Mantenerlo igual en las dos ramas

`comun/` está en la raíz del repositorio, en la misma ruta en `main-mobile` y en `main-web`. Por eso un commit que **solo toca `comun/`** se pasa de una rama a la otra tal cual:

```cmd
git switch main-web
git cherry-pick <commit-de-main-mobile>
```

Regla para que siga siendo así: los commits a `comun/` no mezclan cambios de la app o del portal.

## Qué no va aquí

- Pantallas y componentes: Angular y React no se pueden mezclar.
- Llamadas a Firestore, Storage o Auth: cada aplicación las hace con su SDK. Aquí se calcula *qué* escribir (por ejemplo, el peso de un voto o los puntos tras un veredicto); la aplicación decide *cómo*.
- Nada que necesite `window`, `document` o el lienzo: el difuminado en sí sigue en cada aplicación. Aquí está la geometría (qué zonas difuminar).
