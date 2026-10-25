import { DOCUMENT, Injectable, inject } from '@angular/core';
import {
  NavigationError,
  NoPreloading,
  withComponentInputBinding,
  withNavigationErrorHandler,
  withPreloading,
  withRouterConfig,
} from '@angular/router';
import { ToastController } from '@ionic/angular';

/**
 * El código de una pantalla no se pudo descargar. Pasa en la versión web
 * cuando se pierde la señal antes de visitar esa pantalla por primera vez
 * (cada pantalla carga su código al abrirse; en el APK está en el teléfono).
 * Cada navegador lo dice distinto.
 */
export function esFallaDeCarga(error: unknown): boolean {
  const mensaje = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk [\w-]+ failed/i.test(
    mensaje,
  );
}

export const AVISO_PANTALLA_SIN_SENAL = 'Sin señal no pudimos abrir esa pantalla. Vuelve a intentarlo cuando tengas conexión.';
export const AVISO_PANTALLA_NO_ABRE = 'No pudimos abrir esa pantalla. Cierra la app y vuelve a abrirla.';

/** Clave en sessionStorage: a qué pantalla se recargó la app y cuándo. */
const CLAVE_RECARGA = 'ca.recarga-por-pantalla';
/** Si la misma pantalla vuelve a fallar dentro de este plazo, no se recarga otra vez. */
const PLAZO_RECARGA_MS = 15_000;

/**
 * Qué hacer cuando no se pudo descargar el código de una pantalla.
 *
 * El navegador recuerda que esa descarga falló: aunque vuelva la señal, la
 * pantalla ya no abre hasta recargar la app. Entonces:
 * - sin conexión, se avisa (y el usuario sigue donde estaba);
 * - con conexión, se recarga la app directo en esa pantalla;
 * - si recién se recargó por lo mismo, no se insiste (evita un bucle).
 */
@Injectable({ providedIn: 'root' })
export class RecuperacionDePantallas {
  private readonly documento = inject(DOCUMENT);
  private readonly toastCtrl = inject(ToastController);

  async alFallarCarga(destino: string): Promise<void> {
    if (!(await this.hayConexion())) {
      await this.avisar(AVISO_PANTALLA_SIN_SENAL);
      return;
    }
    if (this.recienRecargada(destino)) {
      await this.avisar(AVISO_PANTALLA_NO_ABRE);
      return;
    }
    this.anotarRecarga(destino);
    this.recargar(destino);
  }

  /** El navegador dice que hay red y el servidor de la app responde. */
  protected async hayConexion(): Promise<boolean> {
    if (this.documento.defaultView?.navigator.onLine === false) return false;
    try {
      const respuesta = await fetch(this.documento.baseURI, { method: 'HEAD', cache: 'no-store' });
      return respuesta.ok;
    } catch {
      return false;
    }
  }

  /** Carga la app de nuevo, ya en `destino` (una ruta como «/report-new»). */
  protected recargar(destino: string): void {
    this.documento.location.assign(new URL(destino.replace(/^\//, ''), this.documento.baseURI).href);
  }

  private recienRecargada(destino: string): boolean {
    try {
      const anterior = JSON.parse(sessionStorage.getItem(CLAVE_RECARGA) ?? 'null') as { destino: string; en: number } | null;
      return !!anterior && anterior.destino === destino && Date.now() - anterior.en < PLAZO_RECARGA_MS;
    } catch {
      return false;
    }
  }

  private anotarRecarga(destino: string): void {
    try {
      sessionStorage.setItem(CLAVE_RECARGA, JSON.stringify({ destino, en: Date.now() }));
    } catch {
      // Sin almacenamiento: sin protección contra el bucle, pero recarga igual.
    }
  }

  private async avisar(message: string): Promise<void> {
    const aviso = await this.toastCtrl.create({ message, duration: 4000, color: 'warning', position: 'bottom' });
    await aviso.present();
  }
}

/**
 * Qué hacer cuando una navegación falla. Sin esto, el error quedaba sin
 * atender: el botón no hacía nada y la consola mostraba un error. Si faltó el
 * código de la pantalla, RecuperacionDePantallas; cualquier otro error se
 * sigue mostrando en la consola.
 */
export function alFallarNavegacion(evento: NavigationError): void {
  if (esFallaDeCarga(evento.error)) {
    void inject(RecuperacionDePantallas).alFallarCarga(evento.url);
    return;
  }
  console.error(evento.error);
}

/**
 * Opciones del enrutador de la app (src/main.ts y la maqueta de e2e).
 *
 * BUG 69 · NoPreloading en lugar de PreloadAllModules: con la precarga, el
 * arranque descargaba también los paquetes de TensorFlow y Leaflet aunque el
 * usuario solo fuera a iniciar sesión. Cada pantalla carga su código al
 * visitarse por primera vez.
 *
 * withComponentInputBinding permite que `report/:id` llegue al input `id` del
 * componente de detalle sin inyectar ActivatedRoute.
 *
 * Una navegación que falla responde `false` en vez de lanzar el error a quien
 * la pidió (un botón no tiene cómo atenderlo); alFallarNavegacion decide qué
 * mostrar.
 */
export const OPCIONES_DEL_ENRUTADOR = [
  withPreloading(NoPreloading),
  withComponentInputBinding(),
  withRouterConfig({ resolveNavigationPromiseOnError: true }),
  withNavigationErrorHandler(alFallarNavegacion),
] as const;
