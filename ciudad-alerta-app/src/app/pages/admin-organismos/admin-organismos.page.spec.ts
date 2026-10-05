import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminOrganismosPage } from './admin-organismos.page';

describe('AdminOrganismosPage', () => {
  let component: AdminOrganismosPage;
  let fixture: ComponentFixture<AdminOrganismosPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AdminOrganismosPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
