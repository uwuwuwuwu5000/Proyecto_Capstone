# Servicio de privacidad · Ciudad Alerta

Difumina rostros y personas en las fotos de los reportes **en la nube**, en vez de en el teléfono. Usa los mismos modelos y los mismos umbrales que antes corrían en la app:

- **MediaPipe Face Detection «full»** para rostros cercanos;
- **COCO-SSD lite_mobilenet_v2** para personas completas, también lejanas (se difumina su cabeza);
- **MobileNet v2** para el vector de la foto que usa la detección de reportes duplicados.

La geometría (cuánto se amplía un rostro, qué parte de una persona es la cabeza, cuántos bloques tiene el pixelado) sale de `comun/src/privacidad`, la misma que usan la app y el portal.

**Por qué:** en teléfonos viejos, TensorFlow en la WebView ocupaba toda la memoria y el procesador. Con una foto grande la app quedaba congelada: no se podía escribir ni enviar el reporte, y ni siquiera después de cerrar sesión.

## Cómo funciona

```
App (foto achicada a 1024 px)
  │  POST /v1/proteger
  │  Authorization: Bearer <token de sesión de Firebase>
  │  Content-Type: image/jpeg
  ▼
Servicio (Render)
  1. Comprueba el token: firma de Google, proyecto ciudadalerta, vigente.
  2. Endereza la foto según la cámara y la deja en 1024 px como máximo.
  3. Detecta rostros y personas y difumina (pixelado irreversible; rostros en elipse).
  4. Calcula el vector MobileNet de la foto ya protegida.
  ▼
{ imagen: "data:image/jpeg;base64,…", privacidad: { aplicada, rostros, personas, version }, embedding, ancho, alto, ms }
```

- **No guarda nada.** La foto se procesa en memoria y se devuelve. Los registros nunca incluyen la imagen.
- **No necesita la clave de cuenta de servicio.** El token de sesión se verifica con las claves públicas de Google. No hay ningún secreto que guardar en Render.
- **Límites:** 30 fotos por usuario cada 10 minutos, una foto a la vez, 6 MB por foto y 8 en cola como máximo.
- **CORS:** acepta la app de Android (`https://localhost`), `ionic serve` (`http://localhost:8100`) y los orígenes que agregues en `ORIGENES`, como la URL del portal.

`GET /salud` responde sin sesión. La app lo llama al abrir «Crear un reporte» para despertar el servicio mientras el usuario toma la foto.

## Probar en tu computador

Requiere Node 20 o superior y la carpeta `comun/` al lado (como en el repositorio).

```cmd
cd servicio-privacidad
npm install
npm test
npm run build
npm start
```

Queda en `http://localhost:8080`. Abre `http://localhost:8080/salud`: debe decir `"listo": true`.

`npm test` usa los modelos reales con una foto de dominio público (Eileen Collins, NASA) y comprueba que el rostro quede difuminado.

## Publicarlo en Render (gratis)

1. Crea una cuenta en [render.com](https://render.com) con GitHub. No pide tarjeta.
2. **New → Blueprint** y elige el repositorio `Proyecto_Capstone`, rama `main-mobile`. Render lee `render.yaml` de la raíz y crea el servicio `ciudad-alerta-privacidad` con Docker, en el plan gratuito.
3. Espera el primer despliegue (5 a 10 minutos). Al final, abre `https://<tu-servicio>.onrender.com/salud`.
4. Si la URL no es `https://ciudad-alerta-privacidad.onrender.com`, cámbiala en la app: `ciudad-alerta-app/src/app/modulos/reportes/parametros.ts`, constante `URL_SERVICIO_PRIVACIDAD`.
5. Opcional: si el portal web también lo va a usar, agrega su URL en **Environment → ORIGENES**.

Cada push a `main-mobile` que toque `servicio-privacidad/`, `comun/src/` o `render.yaml` lo vuelve a desplegar.

### Qué esperar del plan gratuito

- **Se duerme** tras 15 minutos sin uso. La primera foto después de eso tarda entre 30 y 60 segundos mientras despierta. La app lo despierta al abrir «Crear un reporte» y avisa al usuario si está tardando.
- **512 MB de memoria.** Con los tres modelos usa entre 300 y 400 MB. Si Render lo reinicia por memoria, pon `MOBILENET=no`: se pierde la comparación visual de duplicados, pero la protección de rostros sigue igual.
- **750 horas al mes** por cuenta: alcanzan para un servicio encendido todo el mes.

## Variables de entorno

| Variable | Por defecto | Para qué |
|---|---|---|
| `PORT` | 8080 | Puerto HTTP (Render lo pone solo). |
| `FIREBASE_PROJECT_ID` | ciudadalerta | Proyecto cuyos tokens se aceptan. |
| `ORIGENES` | (vacío) | Orígenes extra para CORS, separados por coma. |
| `MOBILENET` | remoto | `remoto` lo descarga de TF Hub al arrancar (reintenta si falla), `no` lo desactiva, o una carpeta con `model.json`. |
| `CARPETA_MODELOS` | (la del repositorio) | Carpeta con `coco-ssd/` y `face-detection/`. |
| `BYTES_MAXIMOS` | 6291456 | Tamaño máximo de la foto recibida. |
| `FOTOS_POR_VENTANA` / `VENTANA_MS` | 30 / 600000 | Límite por usuario. |

## Respuestas de error

| Estado | `error` | Cuándo |
|---|---|---|
| 401 | `sin_sesion` | Sin token, token de otro proyecto o vencido |
| 413 | `foto_muy_grande` | Más de `BYTES_MAXIMOS` |
| 415 | `formato` | No es JPEG, PNG ni WebP |
| 422 | `imagen_invalida` | El archivo no se puede leer como imagen |
| 429 | `demasiadas_fotos` | Superó el límite por usuario (`Retry-After` dice cuánto esperar) |
| 503 | `ocupado` | Cola llena; reintentar en unos segundos |
| 500 | `error_interno` | Error inesperado (sin detalles hacia afuera) |

## Archivos

| Archivo | Qué hace |
|---|---|
| `src/principal.ts` | Arranca el servidor y carga los modelos |
| `src/servidor.ts` | Rutas, CORS, límites, cola de una foto a la vez |
| `src/autenticacion.ts` | Verificación del token de Firebase (sin secretos) |
| `src/modelos.ts` | TensorFlow.js con WASM y los tres modelos |
| `src/difuminar.ts` | Decodificación, pixelado con `sharp` y vector |
| `Dockerfile` | Imagen para Render; se construye desde la raíz del repositorio |
| `../render.yaml` | Blueprint de Render |
