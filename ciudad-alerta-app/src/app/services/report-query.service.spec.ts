import { TestBed } from '@angular/core/testing';
import { ReportQueryService } from './report-query.service';
import { usarEntornoDePrueba } from '../../testing';

usarEntornoDePrueba();

describe('ReportQueryService', () => {
  let service: ReportQueryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ReportQueryService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
