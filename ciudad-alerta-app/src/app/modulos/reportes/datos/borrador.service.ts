import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { FirebaseError } from 'firebase/app';
import { Firestore, collection, doc, getDoc } from 'firebase/firestore';
import { ToastController } from '@ionic/angular';

import { FIRESTORE } from '../../../core/firebase.providers';
import { GeoPoint, ReportCategory } from '../../../models/report.model';
import { AuthService } from '../../../services/auth.service';
import { ComunaDetectada } from '../../../services/comuna.service';
import { CapturedPhoto } from './camera.service';
import { PrivacidadError, PrivacidadService } from './privacidad.service';
import { NuevoReporte, ReportError, ReportService } from './report.service';

/**
 * Clave en localStorage. «Borrar datos guardados» de Configuración la
 * conserva (es un reporte sin terminar, no una copia); eliminar la cuenta la
 * borra (PreferenciasService.borrarDatosLocales).
 */
export const CLAVE_BORRADOR = 'ca.reportes.borrador';

/** La foto tal como queda guardada en el teléfono. */
export interface FotoGuardada {
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
  /** null si se tomó sin señal: se protege antes de subirla. */
  privacidad: NonNullable<CapturedPhoto['privacidad']> | null;
  embedding: number[] | null;
}

/** Un reporte que no se pudo enviar por falta de señal. */
export interface BorradorReporte {
  /** Id del reporte, elegido al guardar: si ya llegó a Firestore, no se duplica. */
  id: string;
  uid: string;
  categoria: ReportCategory;
  descripcion: string;
  ubicacion: GeoPoint;
  comuna: ComunaDetectada | null;
  foto: FotoGuardada | null;
  guardadoAt: number;
}

export type ResultadoGuardar = 'ok' | 'ocupado' | 'sin_espacio' | 'sin_sesion';

/**
 * 1.0 · Borrador sin conexión.
 *
 * Si no hay señal al enviar, el reporte se guarda en el teléfono y se envía
 * solo cuando vuelve la conexión (evento `online`), al abrir la app o con
 * «Enviar ahora» en la tarjeta del inicio. Hay un borrador a la vez.
 *
 * - La foto tomada sin señal no pudo protegerse: se guarda así, solo en el
 *   teléfono, y se difumina en el servicio antes de subirla. createReport()
 *   vuelve a exigir la protección.
 * - El id del reporte se elige al guardar. Antes de enviarlo se comprueba si
 *   ya existe (un envío anterior pudo llegar sin que la app se enterara), y
 *   así nunca queda duplicado.
 * - Se envía con el enrutamiento del momento del envío (organismo y
 *   operador), no con el que hubiera habido sin señal.
 */
@Injectable({ providedIn: 'root' })
export class BorradorService {
  private readonly firestore = inject<Firestore>(FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly reportService = inject(ReportService);
  private readonly privacidad = inject(PrivacidadService);
  private readonly toastCtrl = inject(ToastController);

  /** Sigue a navigator.onLine. */
  readonly enLinea = signal(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  /** El borrador de la sesión actual, o null. */
  readonly pendiente = signal<BorradorReporte | null>(null);
  readonly enviando = signal(false);
  /** Por qué falló el último intento, para la tarjeta del inicio. */
  readonly error = signal<string | null>(null);

  constructor() {
    const alCambiarRed = (): void => {
      this.enLinea.set(navigator.onLine !== false);
      if (this.enLinea()) void this.enviar(true);
    };
    window.addEventListener('online', alCambiarRed);
    window.addEventListener('offline', alCambiarRed);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', alCambiarRed);
      window.removeEventListener('offline', alCambiarRed);
    });

    // Al iniciar sesión (o al abrir la app con la sesión guardada) se carga el
    // borrador de esa persona y, si hay señal, se intenta enviar.
    this.authService.authState$.subscribe((usuario) => {
      this.error.set(null);
      this.pendiente.set(usuario ? this.leer(usuario.uid) : null);
      if (usuario) void this.enviar(true);
    });
  }

  /**
   * Guarda el reporte para enviarlo después. `fotoSinProteger` es la foto que
   * no se pudo difuminar por falta de señal; si viene, reemplaza a `datos.foto`.
   */
  guardar(datos: NuevoReporte, fotoSinProteger: CapturedPhoto | null = null): ResultadoGuardar {
    const uid = this.authService.user?.uid;
    if (!uid) return 'sin_sesion';
    if (this.pendiente()) return 'ocupado';

    const foto = fotoSinProteger ?? datos.foto;
    const borrador: BorradorReporte = {
      id: doc(collection(this.firestore, 'reports')).id,
      uid,
      categoria: datos.categoria,
      descripcion: datos.descripcion.trim(),
      ubicacion: { ...datos.ubicacion },
      comuna: datos.comuna ?? null,
      foto: foto
        ? {
            dataUrl: foto.dataUrl,
            mimeType: foto.mimeType,
            width: foto.width,
            height: foto.height,
            privacidad: fotoSinProteger ? null : (foto.privacidad ?? null),
            embedding: fotoSinProteger ? null : (datos.embedding ?? foto.embedding ?? null),
          }
        : null,
      guardadoAt: Date.now(),
    };

    if (!this.escribir(borrador)) return 'sin_espacio';
    this.error.set(null);
    this.pendiente.set(borrador);
    return 'ok';
  }

  descartar(): void {
    this.borrarGuardado();
    this.pendiente.set(null);
    this.error.set(null);
  }

  /**
   * Envía el borrador si hay uno, hay señal y nada se está enviando ya.
   * Devuelve true si quedó enviado. `automatico` avisa con un mensaje al
   * terminar, porque la persona puede estar en otra pantalla.
   */
  async enviar(automatico = false): Promise<boolean> {
    const borrador = this.pendiente();
    if (!borrador || this.enviando() || !this.enLinea()) return false;
    if (this.authService.user?.uid !== borrador.uid) return false;

    this.enviando.set(true);
    this.error.set(null);

    try {
      if (!(await this.yaExiste(borrador.id))) {
        const foto = await this.fotoProtegida(borrador);
        await this.reportService.createReport({
          id: borrador.id,
          descripcion: borrador.descripcion,
          categoria: borrador.categoria,
          ubicacion: borrador.ubicacion,
          // Si sin señal no se supo la comuna, se vuelve a detectar ahora.
          comuna: borrador.comuna?.fuente === 'no_disponible' ? null : borrador.comuna,
          foto,
          embedding: foto?.embedding ?? null,
        });
      }

      // Solo si sigue siendo el mismo (no se descartó mientras tanto).
      if (this.pendiente()?.id === borrador.id) this.descartar();
      if (automatico) await this.avisar('Enviamos el reporte que guardaste sin señal.');
      return true;
    } catch (error) {
      this.error.set(motivoDeFallo(error));
      return false;
    } finally {
      this.enviando.set(false);
    }
  }

  /** Protege la foto si se tomó sin señal y guarda el resultado, para no repetirlo. */
  private async fotoProtegida(borrador: BorradorReporte): Promise<CapturedPhoto | null> {
    if (!borrador.foto) return null;

    const guardada = borrador.foto;
    const foto = fotoDesdeGuardada(guardada);
    if (guardada.privacidad) return foto;

    const protegida = await this.privacidad.anonimizar(foto);
    const actualizado: BorradorReporte = {
      ...borrador,
      foto: {
        dataUrl: protegida.dataUrl,
        mimeType: protegida.mimeType,
        width: protegida.width,
        height: protegida.height,
        privacidad: protegida.privacidad ?? null,
        embedding: protegida.embedding ?? null,
      },
    };
    if (this.pendiente()?.id === borrador.id) {
      this.escribir(actualizado);
      this.pendiente.set(actualizado);
    }
    return protegida;
  }

  /** Si un envío anterior llegó a Firestore sin que la app recibiera la respuesta. */
  protected async yaExiste(id: string): Promise<boolean> {
    return (await getDoc(doc(this.firestore, 'reports', id))).exists();
  }

  private leer(uid: string): BorradorReporte | null {
    try {
      const texto = localStorage.getItem(CLAVE_BORRADOR);
      if (!texto) return null;
      const borrador = JSON.parse(texto) as BorradorReporte;
      return esBorrador(borrador) && borrador.uid === uid ? borrador : null;
    } catch {
      return null;
    }
  }

  private escribir(borrador: BorradorReporte): boolean {
    try {
      localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(borrador));
      return true;
    } catch {
      // Lleno (fotos grandes) o bloqueado.
      return false;
    }
  }

  private borrarGuardado(): void {
    try {
      localStorage.removeItem(CLAVE_BORRADOR);
    } catch {
      // Sin almacenamiento no había nada guardado.
    }
  }

  private async avisar(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 3500, color: 'success', position: 'bottom' });
    await toast.present();
  }
}

/**
 * Lo que se le dice a la persona en la tarjeta. Los mensajes de Firebase
 * vienen en inglés («client is offline»): una falla de red se dice en
 * palabras simples, y lo demás con el mensaje propio de la app.
 */
function motivoDeFallo(error: unknown): string {
  const deRed =
    (error instanceof FirebaseError && ['unavailable', 'deadline-exceeded'].includes(error.code)) ||
    (error instanceof ReportError && error.code === 'red') ||
    (error instanceof PrivacidadError && error.code === 'red');
  if (deRed) return 'La conexión no alcanzó. Se reintentará cuando la señal mejore, o pulsa «Enviar ahora».';
  if (error instanceof ReportError || error instanceof PrivacidadError) return error.message;
  console.error('Borrador sin conexión:', error);
  return 'No se pudo enviar. Reintenta en un momento.';
}

function esBorrador(valor: unknown): valor is BorradorReporte {
  const b = valor as Partial<BorradorReporte> | null;
  return (
    !!b &&
    typeof b.id === 'string' &&
    typeof b.uid === 'string' &&
    typeof b.descripcion === 'string' &&
    typeof b.categoria === 'string' &&
    typeof b.ubicacion?.lat === 'number' &&
    typeof b.ubicacion?.lng === 'number'
  );
}

/** Vuelve a armar la foto (con su binario) a partir de lo guardado. */
export function fotoDesdeGuardada(guardada: FotoGuardada): CapturedPhoto {
  const blob = blobDeDataUrl(guardada.dataUrl, guardada.mimeType);
  return {
    dataUrl: guardada.dataUrl,
    blob,
    mimeType: guardada.mimeType,
    sizeBytes: blob.size,
    width: guardada.width,
    height: guardada.height,
    ...(guardada.privacidad ? { privacidad: guardada.privacidad, embedding: guardada.embedding } : {}),
  };
}

function blobDeDataUrl(dataUrl: string, mimeType: string): Blob {
  const coma = dataUrl.indexOf(',');
  const binario = atob(dataUrl.slice(coma + 1));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}
