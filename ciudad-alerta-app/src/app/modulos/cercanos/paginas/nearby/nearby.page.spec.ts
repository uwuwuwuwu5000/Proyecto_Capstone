import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NearbyPage } from './nearby.page';

describe('NearbyPage', () => {
  let component: NearbyPage;
  let fixture: ComponentFixture<NearbyPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(NearbyPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
