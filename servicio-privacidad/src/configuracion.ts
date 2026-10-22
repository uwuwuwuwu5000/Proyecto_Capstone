import { fileURLToPath } from 'node:url';

/**
 * Configuración del servicio, leída de variables de entorno. Todas tienen un
 * valor por defecto pensado para Render; en local basta con `npm start`.
 */
export interface Configuracion {
  /** Puerto HTTP. Render lo entrega en PORT. */
  puerto: number;
  /** Proyecto de Firebase cuyos tokens de sesión se aceptan. */
  proyectoFirebase: string;
  /**
   * Orígenes que pueden llamar al servicio desde un navegador o WebView. La app
   * de Android con Capacitor usa https://localhost; `ionic serve`, el puerto 8100.
   */
  origenes: readonly string[];
  /** Tamaño máximo de la foto recibida, en bytes. */
  bytesMaximos: number;
  /** Fotos por usuario en la ventana de tiempo (protección contra abuso). */
  fotosPorVentana: number;
  ventanaMs: number;
  /** Carpeta con los modelos de rostros y personas (model.json + pesos). */
  carpetaModelos: string;
  /**
   * MobileNet para comparar fotos (detección de duplicados):
   * 'remoto' lo descarga de TF Hub al arrancar; 'no' lo desactiva; cualquier
   * otro valor es una carpeta local con model.json.
   */
  mobilenet: string;
}

const ORIGENES_POR_DEFECTO = [
  'https://localhost',
  'capacitor://localhost',
  'http://localhost',
  'http://localhost:8100',
  'http://localhost:4200',
  'http://localhost:5173',
];

export function leerConfiguracion(entorno: NodeJS.ProcessEnv = process.env): Configuracion {
  const numero = (valor: string | undefined, porDefecto: number) => {
    const n = Number(valor);
    return Number.isFinite(n) && n > 0 ? n : porDefecto;
  };
  const extra = (entorno['ORIGENES'] ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);

  return {
    puerto: numero(entorno['PORT'], 8080),
    proyectoFirebase: entorno['FIREBASE_PROJECT_ID'] || 'ciudadalerta',
    origenes: [...new Set([...ORIGENES_POR_DEFECTO, ...extra])],
    bytesMaximos: numero(entorno['BYTES_MAXIMOS'], 6 * 1024 * 1024),
    fotosPorVentana: numero(entorno['FOTOS_POR_VENTANA'], 30),
    ventanaMs: numero(entorno['VENTANA_MS'], 10 * 60_000),
    carpetaModelos: entorno['CARPETA_MODELOS'] || fileURLToPath(new URL('../modelos', import.meta.url)),
    mobilenet: entorno['MOBILENET'] || 'remoto',
  };
}
