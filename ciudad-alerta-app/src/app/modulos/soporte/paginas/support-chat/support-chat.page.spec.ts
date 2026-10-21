import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SupportChatPage } from './support-chat.page';
import { usarEntornoDePrueba } from '../../../../../testing';

usarEntornoDePrueba();

describe('SupportChatPage', () => {
  let component: SupportChatPage;
  let fixture: ComponentFixture<SupportChatPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SupportChatPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
