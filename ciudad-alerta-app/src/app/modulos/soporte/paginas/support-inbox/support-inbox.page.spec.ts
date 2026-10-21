import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SupportInboxPage } from './support-inbox.page';
import { usarEntornoDePrueba } from '../../../../../testing';

usarEntornoDePrueba();

describe('SupportInboxPage', () => {
  let component: SupportInboxPage;
  let fixture: ComponentFixture<SupportInboxPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SupportInboxPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
