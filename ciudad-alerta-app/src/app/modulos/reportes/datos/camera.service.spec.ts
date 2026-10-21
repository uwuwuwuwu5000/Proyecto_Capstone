import { TestBed } from '@angular/core/testing';
import { CameraService } from './camera.service';
import { usarEntornoDePrueba } from '../../../../testing';

usarEntornoDePrueba();

describe('CameraService', () => {
  let service: CameraService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CameraService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
