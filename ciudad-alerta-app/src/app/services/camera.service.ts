import { Injectable } from '@angular/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

/** Imagen ya validada y comprimida, lista para subir. */
export interface CapturedPhoto {
  /** Data URL para la vista previa y para la variante Firestore. */
  dataUrl: string;
  /** Binario para la variante Cloud Storage. */
  blob: Blob;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
}

export class PhotoError extends Error {
  constructor(
    override readonly message: string,
    readonly code: 'cancelado' | 'permiso' | 'formato' | 'procesamiento',
  ) {
    super(message);
    this.name = 'PhotoError';
  }
}

/** Formatos aceptados. Cualquier otro se rechaza antes de subir. */
const FORMATOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Lado mayor tras la compresión, en píxeles. */
const LADO_MAXIMO = 1024;

/** Calidad JPEG de salida. 0.6 deja fotos de ~100-150 KB, suficientes para verificar. */
const CALIDAD_SALIDA = 0.6;

@Injectable({ providedIn: 'root' })
export class CameraService {
  /** Toma una fotografía con la cámara del dispositivo. */
  takePhoto(): Promise<CapturedPhoto> {
    return this.obtener(CameraSource.Camera);
  }

  /** Selecciona una imagen existente desde la galería. */
  pickFromGallery(): Promise<CapturedPhoto> {
    return this.obtener(CameraSource.Photos);
  }

  private async obtener(source: CameraSource): Promise<CapturedPhoto> {
    let dataUrl: string;

    try {
      const foto = await Camera.getPhoto({
        source,
        resultType: CameraResultType.DataUrl,
        quality: 80,
        allowEditing: false,
        correctOrientation: true,
        promptLabelHeader: 'Evidencia del reporte',
        promptLabelPhoto: 'Elegir de la galería',
        promptLabelPicture: 'Tomar fotografía',
        promptLabelCancel: 'Cancelar',
      });

      if (!foto.dataUrl) {
        throw new PhotoError('No se pudo leer la imagen seleccionada.', 'procesamiento');
      }

      dataUrl = foto.dataUrl;
    } catch (error) {
      throw this.traducirError(error);
    }

    this.validarFormato(dataUrl);
    return this.comprimir(dataUrl);
  }

  /** Verifica que el data URL corresponda a un formato de imagen permitido. */
  private validarFormato(dataUrl: string): void {
    const coincidencia = /^data:([^;,]+)[;,]/.exec(dataUrl);
    const mimeType = coincidencia?.[1]?.toLowerCase() ?? '';

    if (!FORMATOS_PERMITIDOS.includes(mimeType as (typeof FORMATOS_PERMITIDOS)[number])) {
      throw new PhotoError(
        'El archivo debe ser una imagen JPG, PNG o WEBP.',
        'formato',
      );
    }
  }

  /**
   * Redimensiona a un máximo de 1024 px por lado y reencodifica como JPEG.
   * Sin esto una foto de celular pesa varios MB y no cabe en un documento de
   * Firestore ni conviene subirla por datos móviles.
   */
  private comprimir(dataUrl: string): Promise<CapturedPhoto> {
    return new Promise((resolve, reject) => {
      const imagen = new Image();

      imagen.onload = () => {
        try {
          const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
          const width = Math.round(imagen.width * escala);
          const height = Math.round(imagen.height * escala);

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const contexto = canvas.getContext('2d');
          if (!contexto) {
            reject(new PhotoError('El dispositivo no pudo procesar la imagen.', 'procesamiento'));
            return;
          }

          contexto.drawImage(imagen, 0, 0, width, height);
          const comprimido = canvas.toDataURL('image/jpeg', CALIDAD_SALIDA);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(
                  new PhotoError('El dispositivo no pudo procesar la imagen.', 'procesamiento'),
                );
                return;
              }

              resolve({
                dataUrl: comprimido,
                blob,
                mimeType: 'image/jpeg',
                sizeBytes: blob.size,
                width,
                height,
              });
            },
            'image/jpeg',
            CALIDAD_SALIDA,
          );
        } catch {
          reject(new PhotoError('No se pudo procesar la imagen.', 'procesamiento'));
        }
      };

      imagen.onerror = () =>
        reject(new PhotoError('El archivo no es una imagen válida.', 'formato'));

      imagen.src = dataUrl;
    });
  }

  private traducirError(error: unknown): PhotoError {
    if (error instanceof PhotoError) {
      return error;
    }

    const mensaje = error instanceof Error ? error.message.toLowerCase() : '';

    if (mensaje.includes('cancel')) {
      return new PhotoError('Cancelaste la captura de la fotografía.', 'cancelado');
    }

    if (mensaje.includes('denied') || mensaje.includes('permission')) {
      return new PhotoError(
        'Ciudad Alerta necesita permiso para usar la cámara. Actívalo en los ajustes del teléfono.',
        'permiso',
      );
    }

    return new PhotoError('No se pudo obtener la fotografía. Intenta nuevamente.', 'procesamiento');
  }
}
