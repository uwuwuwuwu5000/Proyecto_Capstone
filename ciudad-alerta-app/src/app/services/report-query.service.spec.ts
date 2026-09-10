import { TestBed } from '@angular/core/testing';
import { ReportQueryService } from './report-query.service';

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
