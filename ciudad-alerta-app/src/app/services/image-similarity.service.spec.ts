import { TestBed } from '@angular/core/testing';
import { ImageSimilarityService } from './image-similarity.service';

describe('ImageSimilarityService', () => {
  let service: ImageSimilarityService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ImageSimilarityService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
