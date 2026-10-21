import { TestBed } from '@angular/core/testing';
import { PrivacidadService } from './privacidad.service';
import { usarEntornoDePrueba } from '../../../../testing';

usarEntornoDePrueba();

describe('PrivacidadService', () => {
  let service: PrivacidadService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PrivacidadService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
