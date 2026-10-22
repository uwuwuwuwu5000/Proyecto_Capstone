import { Injectable } from '@angular/core';

/**
 * Comparación visual de fotografías para la detección de duplicados.
 *
 * El vector de cada foto (MobileNet v2, 1280 valores normalizados) ya no se
 * calcula en el teléfono: lo devuelve el servicio de privacidad junto con la
 * foto protegida (`CapturedPhoto.embedding`). Aquí solo queda la comparación,
 * que es una suma de productos y no necesita TensorFlow.
 */
@Injectable({ providedIn: 'root' })
export class ImageSimilarityService {
  /**
   * Similitud coseno entre dos vectores ya normalizados: equivale al producto
   * punto y queda entre 0 y 1. Devuelve null si falta alguno o no coinciden.
   */
  cosineSimilarity(a: number[] | null | undefined, b: number[] | null | undefined): number | null {
    if (!a || !b || a.length !== b.length || a.length === 0) {
      return null;
    }

    let producto = 0;

    for (let i = 0; i < a.length; i += 1) {
      producto += a[i] * b[i];
    }

    return Math.min(1, Math.max(0, producto));
  }
}
