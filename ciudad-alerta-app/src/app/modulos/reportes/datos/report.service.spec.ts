import { TestBed } from '@angular/core/testing';
import { ReportService } from './report.service';
import { usarEntornoDePrueba } from '../../../../testing';

usarEntornoDePrueba();

describe('ReportService', () => {
  let service: ReportService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ReportService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
