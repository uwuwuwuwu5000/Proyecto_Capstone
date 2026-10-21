import { TestBed } from '@angular/core/testing';
import { OrganismosService } from './organismos.service';
import { usarEntornoDePrueba } from '../../../../testing';

usarEntornoDePrueba();

describe('OrganismosService', () => {
  let service: OrganismosService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(OrganismosService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
