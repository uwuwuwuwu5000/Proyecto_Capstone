import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminReportsPage } from './admin-reports.page';
import { usarEntornoDePrueba } from '../../../../../testing';

usarEntornoDePrueba();

describe('AdminReportsPage', () => {
  let component: AdminReportsPage;
  let fixture: ComponentFixture<AdminReportsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AdminReportsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
