import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MyReportsPage } from './my-reports.page';
import { usarEntornoDePrueba } from '../../../../../testing';

usarEntornoDePrueba();

describe('MyReportsPage', () => {
  let component: MyReportsPage;
  let fixture: ComponentFixture<MyReportsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(MyReportsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
