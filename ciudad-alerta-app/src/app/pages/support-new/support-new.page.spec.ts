import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SupportNewPage } from './support-new.page';

describe('SupportNewPage', () => {
  let component: SupportNewPage;
  let fixture: ComponentFixture<SupportNewPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SupportNewPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
