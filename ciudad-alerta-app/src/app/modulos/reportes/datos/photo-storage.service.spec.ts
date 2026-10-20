import { TestBed } from '@angular/core/testing';

import { CapturedPhoto } from './camera.service';
import { FirestorePhotoService, PHOTO_STORAGE } from './photo-storage.service';

function foto(bytes: number): CapturedPhoto {
  return {
    dataUrl: `data:image/jpeg;base64,${'A'.repeat(bytes)}`,
    mimeType: 'image/jpeg',
    sizeBytes: bytes,
  } as CapturedPhoto;
}

describe('FirestorePhotoService', () => {
  let servicio: FirestorePhotoService;

  beforeEach(() => {
    servicio = TestBed.inject(FirestorePhotoService);
  });

  it('es la implementación que usan las pruebas para PHOTO_STORAGE', () => {
    expect(TestBed.inject(PHOTO_STORAGE)).toBe(servicio);
  });

  it('rechaza una foto que no cabe en un documento de Firestore', async () => {
    await expect(servicio.upload('r1', 'u1', foto(950_000))).rejects.toThrow(/demasiado pesada/);
  });

  it('rechaza también la foto pesada al sumarla a un lote', () => {
    const lote = { set: vi.fn() } as never;
    expect(() => servicio.stageInBatch(lote, 'r1', 'u1', foto(950_000))).toThrow(/demasiado pesada/);
  });

  it('agrega la foto al lote con la ruta reportPhotos/{id} y conserva la privacidad', () => {
    const set = vi.fn();
    const conPrivacidad = {
      ...foto(1_000),
      privacidad: { aplicada: true, rostros: 1, personas: 0, version: 'coco-ssd-lite-v2' },
    } as CapturedPhoto;

    const referencia = servicio.stageInBatch({ set } as never, 'r1', 'u1', conPrivacidad);

    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0].path).toBe('reportPhotos/r1');
    expect(set.mock.calls[0][1]).toMatchObject({ reportId: 'r1', ownerUid: 'u1', mimeType: 'image/jpeg' });
    expect(referencia).toEqual({
      kind: 'firestore',
      path: 'reportPhotos/r1',
      url: null,
      mimeType: 'image/jpeg',
      sizeBytes: 1_000,
      privacidad: conPrivacidad.privacidad,
    });
  });
});
