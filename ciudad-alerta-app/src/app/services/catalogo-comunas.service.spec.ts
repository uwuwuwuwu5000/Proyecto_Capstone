import { TestBed } from '@angular/core/testing';
import { CatalogoComunasService } from './catalogo-comunas.service';

describe('CatalogoComunasService', () => {
  let service: CatalogoComunasService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CatalogoComunasService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
