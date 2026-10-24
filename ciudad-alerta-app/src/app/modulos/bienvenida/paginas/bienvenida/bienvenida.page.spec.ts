import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, vi } from 'vitest';

import { CONFIGURACION_MODULOS } from '../../../../nucleo/modulos';
import { MODULO_BIENVENIDA } from '../../bienvenida.modulo';
import { BienvenidaService } from '../../datos/bienvenida.service';
import { BienvenidaPage } from './bienvenida.page';
import { usarEntornoDePrueba } from '../../../../../testing';

usarEntornoDePrueba();

describe('BienvenidaPage', () => {
  let fixture: ComponentFixture<BienvenidaPage>;
  let navegar: ReturnType<typeof vi.spyOn>;

  function abrir(): void {
    fixture = TestBed.createComponent(BienvenidaPage);
    fixture.detectChanges();
    navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  }

  const texto = (): string => {
    fixture.detectChanges();
    return (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');
  };

  afterEach(() => localStorage.removeItem('ca.bienvenida.vista'));

  it('recorre los tres pasos y al final marca la bienvenida como vista', async () => {
    abrir();
    const pagina = fixture.componentInstance;

    expect(texto()).toContain('Reporta lo que ves en tu barrio');
    expect(texto()).toContain('difuminamos las caras');
    expect(texto()).not.toContain('Atrás');

    pagina.siguiente();
    expect(texto()).toContain('Sigue tu reporte');
    expect(texto()).toContain('Atrás');

    pagina.siguiente();
    expect(texto()).toContain('Tu confianza suma');
    expect(texto()).toContain('Empezar');

    pagina.siguiente();
    await vi.waitFor(() => expect(navegar).toHaveBeenCalledWith('/home', { replaceUrl: true }));
    expect(TestBed.inject(BienvenidaService).vista()).toBe(true);
  });

  it('«Atrás» vuelve al paso anterior', () => {
    abrir();
    fixture.componentInstance.siguiente();
    fixture.componentInstance.atras();
    expect(texto()).toContain('Reporta lo que ves en tu barrio');
  });

  it('«Saltar» también la marca como vista', async () => {
    abrir();
    await fixture.componentInstance.terminar();
    expect(navegar).toHaveBeenCalledWith('/home', { replaceUrl: true });
    expect(TestBed.inject(BienvenidaService).vista()).toBe(true);
  });

  it('sin el sistema de confianza, el tercer paso no habla de puntos', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: CONFIGURACION_MODULOS, useValue: [{ modulo: MODULO_BIENVENIDA, activo: true }] },
      ],
    });
    abrir();
    fixture.componentInstance.siguiente();
    fixture.componentInstance.siguiente();
    expect(texto()).toContain('Entre vecinos');
    expect(texto()).not.toContain('puntos');
  });
});
