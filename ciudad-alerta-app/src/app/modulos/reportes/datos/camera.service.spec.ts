import { TestBed } from '@angular/core/testing';
import { CameraService, blobDesdeDataUrl } from './camera.service';
import { usarEntornoDePrueba } from '../../../../testing';

usarEntornoDePrueba();

describe('CameraService', () => {
  let service: CameraService;

  beforeEach(() => {
    service = TestBed.inject(CameraService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

/** Bytes de un Blob. jsdom no implementa Blob.arrayBuffer(); FileReader sí. */
function leerBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(new Uint8Array(lector.result as ArrayBuffer));
    lector.onerror = () => rechazar(lector.error);
    lector.readAsArrayBuffer(blob);
  });
}

describe('blobDesdeDataUrl', () => {
  it('convierte el base64 en los mismos bytes, con su tipo', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x7f, 0x80]);
    const base64 = btoa(String.fromCharCode(...bytes));

    const blob = blobDesdeDataUrl(`data:image/jpeg;base64,${base64}`);

    expect(blob.type).toBe('image/jpeg');
    expect(blob.size).toBe(bytes.length);
    expect(await leerBytes(blob)).toEqual(bytes);
  });

  it('sin tipo declarado usa application/octet-stream', () => {
    expect(blobDesdeDataUrl(`data:;base64,${btoa('ab')}`).type).toBe('application/octet-stream');
  });
});
