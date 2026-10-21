import { TestBed } from '@angular/core/testing';
import { SupportService } from './support.service';
import { usarEntornoDePrueba } from '../../../../testing';

usarEntornoDePrueba();

describe('SupportService', () => {
  let service: SupportService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SupportService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
