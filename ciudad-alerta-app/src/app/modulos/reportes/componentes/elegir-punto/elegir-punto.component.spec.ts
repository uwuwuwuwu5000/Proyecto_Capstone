import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { ElegirPuntoComponent, PuntoElegido } from './elegir-punto.component';
import { MapViewComponent } from '../../../../compartido/mapa';
import { usarEntornoDePrueba } from '../../../../../testing';

usarEntornoDePrueba();

describe('ElegirPuntoComponent', () => {
  let fixture: ComponentFixture<ElegirPuntoComponent>;
  let component: ElegirPuntoComponent;
  let elegidos: PuntoElegido[];
  let cancelaciones: number;

  function montar(inicio: PuntoElegido | null): void {
    fixture = TestBed.createComponent(ElegirPuntoComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('inicio', inicio);
    elegidos = [];
    cancelaciones = 0;
    component.elegido.subscribe((punto) => elegidos.push(punto));
    component.cancelado.subscribe(() => cancelaciones++);
    fixture.detectChanges();
  }

  const html = () => fixture.nativeElement as HTMLElement;
  const mapa = () => fixture.debugElement.query(By.directive(MapViewComponent)).componentInstance as MapViewComponent;
  const usarEstePunto = () =>
    [...html().querySelectorAll<HTMLIonButtonElement>('ion-button')].find((b) => b.textContent?.includes('Usar este punto'))!;
  const moverA = (lat: number, lng: number) => {
    component.alMover({ centro: { lat, lng }, radioMetros: 300, zoom: 16 });
    fixture.detectChanges();
  };

  it('el mapa empieza en la ubicación que se le da', () => {
    montar({ lat: -33.5106, lng: -70.7572 });

    expect(mapa().encuadre()).toEqual({ minLat: -33.5106, maxLat: -33.5106, minLng: -70.7572, maxLng: -70.7572 });
    expect(html().textContent).not.toContain('No pudimos usar tu ubicación');
    expect(html().querySelector('.mira')).not.toBeNull();
  });

  it('mientras el mapa no se ubica, no deja usar un punto', () => {
    montar({ lat: -33.5106, lng: -70.7572 });

    expect(html().textContent).toContain('Mueve el mapa para elegir el punto.');
    expect(usarEstePunto().disabled).toBe(true);
  });

  it('al mover el mapa muestra el punto bajo la marca y «Usar este punto» lo entrega redondeado a 6 decimales', () => {
    montar({ lat: -33.5106, lng: -70.7572 });
    moverA(-33.51234567891, -70.75876843219);

    expect(html().textContent).toContain('Punto elegido: -33.51235, -70.75877');
    expect(usarEstePunto().disabled).toBe(false);

    component.usar();
    expect(elegidos).toEqual([{ lat: -33.512346, lng: -70.758768 }]);
  });

  it('sin ubicación para empezar lo dice y espera a que la persona mueva el mapa', () => {
    montar(null);

    expect(mapa().encuadre()).toBeNull();
    expect(html().textContent).toContain('No pudimos usar tu ubicación para empezar');

    component.usar();
    expect(elegidos).toEqual([]);
  });

  it('si el mapa no carga, quita la marca y no deja usar el punto', () => {
    montar({ lat: -33.5106, lng: -70.7572 });
    moverA(-33.5106, -70.7572);

    mapa().error.set('Sin conexión a Internet no podemos cargar el mapa.');
    fixture.detectChanges();

    expect(html().querySelector('.mira')).toBeNull();
    expect(usarEstePunto().disabled).toBe(true);
    component.usar();
    expect(elegidos).toEqual([]);
  });

  it('«Cancelar» avisa a la pantalla', () => {
    montar({ lat: -33.5106, lng: -70.7572 });

    const cancelar = [...html().querySelectorAll<HTMLIonButtonElement>('ion-button')].find((b) => b.textContent?.includes('Cancelar'))!;
    cancelar.click();

    expect(cancelaciones).toBe(1);
    expect(elegidos).toEqual([]);
  });
});
