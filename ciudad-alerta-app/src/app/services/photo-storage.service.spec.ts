import { TestBed } from '@angular/core/testing';
import { PhotoStorageService } from './photo-storage.service';

describe('PhotoStorageService', () => {
  let service: PhotoStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PhotoStorageService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
