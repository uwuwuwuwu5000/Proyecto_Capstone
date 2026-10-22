import { TestBed } from '@angular/core/testing';
import { ImageSimilarityService } from './image-similarity.service';
import { usarEntornoDePrueba } from '../../../../testing';

usarEntornoDePrueba();

describe('ImageSimilarityService', () => {
  let service: ImageSimilarityService;

  beforeEach(() => {
    service = TestBed.inject(ImageSimilarityService);
  });

  it('da 1 para la misma foto', () => {
    expect(service.cosineSimilarity([0.6, 0.8], [0.6, 0.8])).toBeCloseTo(1, 6);
  });

  it('da 0 para fotos sin nada en común', () => {
    expect(service.cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it('queda entre 0 y 1 aunque el producto salga de rango', () => {
    expect(service.cosineSimilarity([1, 0], [-1, 0])).toBe(0);
    expect(service.cosineSimilarity([1, 1], [1, 1])).toBe(1);
  });

  it('devuelve null si falta un vector o no tienen el mismo largo', () => {
    expect(service.cosineSimilarity(null, [1, 0])).toBeNull();
    expect(service.cosineSimilarity([1, 0], undefined)).toBeNull();
    expect(service.cosineSimilarity([1, 0], [1, 0, 0])).toBeNull();
    expect(service.cosineSimilarity([], [])).toBeNull();
  });
});
