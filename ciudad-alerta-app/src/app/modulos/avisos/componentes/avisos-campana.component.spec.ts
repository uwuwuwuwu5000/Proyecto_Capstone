import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AvisosCampanaComponent } from './avisos-campana.component';
import { usarEntornoDePrueba } from '../../../../testing';

usarEntornoDePrueba();

describe('AvisosCampanaComponent', () => {
  let component: AvisosCampanaComponent;
  let fixture: ComponentFixture<AvisosCampanaComponent>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AvisosCampanaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
