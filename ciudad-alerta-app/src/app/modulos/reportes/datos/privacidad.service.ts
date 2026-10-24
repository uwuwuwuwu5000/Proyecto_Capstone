import { Injectable, inject, signal } from '@angular/core';
import { InfoPrivacidad } from '@ciudad-alerta/comun';

import { AuthService } from '../../../services/auth.service';
import { PARAMETROS_PRIVACIDAD } from '../parametros';
import { CapturedPhoto, blobDesdeDataUrl } from './camera.service';

export type MotivoPrivacidad = 'cancelado' | 'sesion' | 'red' | 'servicio' | 'imagen' | 'limite';

export class PrivacidadError extends Error {
  constructor(
    override readonly message: string,
    readonly code: MotivoPrivacidad = 'servicio',
  ) {
    super(message);
    this.name = 'PrivacidadError';
  }
}

/** Lo que dice GET /salud del servicio de privacidad (Configuración). */
export interface EstadoServicioPrivacidad {
  /** Respondió a tiempo. */
  responde: boolean;
  /** Tiene los modelos cargados y puede proteger fotos. */
  listo: boolean;
  /** Compara fotos para los duplicados (MobileNet). */
  similitud: boolean;
  backend: string | null;
  version: string | null;
  /** Lo que tardó en responder, incluido despertar. */
  ms: number;
  error: string | null;
}

/** Lo que devuelve POST /v1/proteger del servicio de privacidad. */
interface RespuestaServicio {
  imagen: string;
  sizeBytes: number;
  ancho: number;
  alto: number;
  privacidad: InfoPrivacidad;
  embedding: number[] | null;
}

/**
 * Difumina rostros y personas en las fotos antes de publicarlas, **en la nube**
 * (servicio-privacidad/ del repositorio, publicado en Render).
 *
 * Antes lo hacía el teléfono con TensorFlow.js. En teléfonos viejos, con una
 * foto grande, ocupaba toda la memoria y el procesador del mismo hilo que
 * dibuja la pantalla: la app quedaba congelada y no se podía escribir, ni
 * siquiera después de cerrar sesión. Ahora el teléfono solo envía la foto ya
 * achicada (1024 px) y espera; la pantalla sigue respondiendo.
 *
 * El servicio usa los mismos modelos y los mismos umbrales (comun/), y además
 * devuelve el vector de la foto para la detección de duplicados.
 *
 * La foto sin proteger nunca se publica: si el servicio no responde, la
 * interfaz ofrece reintentar o quitar la foto.
 */
@Injectable({ providedIn: 'root' })
export class PrivacidadService {
  private readonly authService = inject(AuthService);

  /**
   * 'enviando': esperando la respuesta; 'despertando': tarda más de lo normal
   * (el plan gratuito duerme el servicio tras 15 min sin uso).
   */
  readonly estado = signal<'inactivo' | 'enviando' | 'despertando'>('inactivo');

  /** Detalle técnico del último fallo, para mostrarlo en pantalla. */
  readonly ultimoErrorTecnico = signal<string | null>(null);

  private controlador: AbortController | null = null;
  private cancelado = false;

  /**
   * Despierta el servicio sin esperar la respuesta. Se llama al abrir «Crear
   * un reporte», para que esté listo cuando el usuario tome la foto.
   */
  despertar(): void {
    void fetch(`${PARAMETROS_PRIVACIDAD.url}/salud`, { cache: 'no-store' }).catch(() => undefined);
  }

  /**
   * Pregunta al servicio cómo está, esperando hasta el tiempo máximo (si
   * estaba dormido, esto lo despierta). No lanza errores.
   */
  async consultarEstado(): Promise<EstadoServicioPrivacidad> {
    const inicio = Date.now();
    const controlador = new AbortController();
    const limite = setTimeout(() => controlador.abort(), PARAMETROS_PRIVACIDAD.tiempoMaximoMs);

    try {
      const respuesta = await fetch(`${PARAMETROS_PRIVACIDAD.url}/salud`, {
        cache: 'no-store',
        signal: controlador.signal,
      });
      const salud = (await respuesta.json().catch(() => ({}))) as Partial<{
        listo: boolean;
        similitud: boolean;
        backend: string;
        version: string;
        error: string | null;
      }>;

      return {
        responde: respuesta.ok,
        listo: salud.listo === true,
        similitud: salud.similitud === true,
        backend: salud.backend ?? null,
        version: salud.version ?? null,
        ms: Date.now() - inicio,
        error: respuesta.ok ? (salud.error ?? null) : `HTTP ${respuesta.status}`,
      };
    } catch (error) {
      return {
        responde: false,
        listo: false,
        similitud: false,
        backend: null,
        version: null,
        ms: Date.now() - inicio,
        error: controlador.signal.aborted ? 'Sin respuesta en 90 s' : describir(error),
      };
    } finally {
      clearTimeout(limite);
    }
  }

  /** Cancela la foto que se está protegiendo. */
  cancelar(): void {
    this.cancelado = true;
    this.controlador?.abort();
  }

  /**
   * Devuelve una copia de la foto con rostros y personas difuminados, con sus
   * datos de privacidad y su vector. Lanza `PrivacidadError` si no se pudo.
   */
  async anonimizar(foto: CapturedPhoto): Promise<CapturedPhoto> {
    const token = await this.authService.user?.getIdToken().catch(() => null);

    if (!token) {
      throw new PrivacidadError('Tu sesión venció. Vuelve a iniciar sesión para adjuntar la foto.', 'sesion');
    }

    this.controlador?.abort();
    const controlador = new AbortController();
    this.controlador = controlador;
    this.cancelado = false;
    this.ultimoErrorTecnico.set(null);
    this.estado.set('enviando');

    const avisoLento = setTimeout(() => this.estado.set('despertando'), PARAMETROS_PRIVACIDAD.avisoLentoMs);
    const tiempoMaximo = setTimeout(() => controlador.abort(), PARAMETROS_PRIVACIDAD.tiempoMaximoMs);

    try {
      let respuesta: Response;

      try {
        respuesta = await fetch(`${PARAMETROS_PRIVACIDAD.url}/v1/proteger`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': foto.mimeType },
          body: foto.blob,
          signal: controlador.signal,
        });
      } catch (error) {
        if (this.cancelado) {
          throw new PrivacidadError('Cancelaste la protección de la foto.', 'cancelado');
        }
        const agotado = controlador.signal.aborted;
        this.ultimoErrorTecnico.set(agotado ? 'Sin respuesta en 90 s' : describir(error));
        throw new PrivacidadError(
          agotado
            ? 'El servicio de privacidad no respondió a tiempo. Reintenta en un momento.'
            : 'No pudimos conectar con el servicio de privacidad. Revisa tu conexión y reintenta.',
          'red',
        );
      }

      if (!respuesta.ok) {
        throw await this.errorDeRespuesta(respuesta);
      }

      const datos = (await respuesta.json().catch(() => null)) as RespuestaServicio | null;

      if (!datos?.imagen?.startsWith('data:image/') || datos.privacidad?.aplicada !== true) {
        this.ultimoErrorTecnico.set('Respuesta del servicio incompleta');
        throw new PrivacidadError('El servicio de privacidad respondió algo inesperado. Reintenta.', 'servicio');
      }

      const blob = blobDesdeDataUrl(datos.imagen);
      return {
        dataUrl: datos.imagen,
        blob,
        mimeType: blob.type || 'image/jpeg',
        sizeBytes: blob.size,
        width: datos.ancho,
        height: datos.alto,
        privacidad: datos.privacidad,
        embedding: Array.isArray(datos.embedding) ? datos.embedding : null,
      };
    } finally {
      clearTimeout(avisoLento);
      clearTimeout(tiempoMaximo);
      if (this.controlador === controlador) this.controlador = null;
      this.estado.set('inactivo');
    }
  }

  private async errorDeRespuesta(respuesta: Response): Promise<PrivacidadError> {
    const cuerpo = (await respuesta.json().catch(() => null)) as { error?: string; mensaje?: string } | null;
    this.ultimoErrorTecnico.set(`HTTP ${respuesta.status}${cuerpo?.error ? ` · ${cuerpo.error}` : ''}`);

    switch (respuesta.status) {
      case 401:
        return new PrivacidadError('Tu sesión venció. Vuelve a iniciar sesión para adjuntar la foto.', 'sesion');
      case 429:
        return new PrivacidadError(cuerpo?.mensaje ?? 'Enviaste muchas fotos seguidas. Espera un momento.', 'limite');
      case 413:
      case 415:
      case 422:
        return new PrivacidadError(cuerpo?.mensaje ?? 'No pudimos leer esta foto. Prueba con otra.', 'imagen');
      default:
        return new PrivacidadError(
          'El servicio de privacidad no está disponible en este momento. Reintenta en unos segundos.',
          'servicio',
        );
    }
  }
}

function describir(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
