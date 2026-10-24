import { TestBed } from '@angular/core/testing';

import { FOTO_AHORRO, FOTO_NORMAL, PREFERENCIAS_INICIALES, PreferenciasService } from './preferencias.service';
import { usarEntornoDePrueba } from '../../testing';

usarEntornoDePrueba();

const CLAVE = 'ciudad-alerta.preferencias';
const clases = () => document.documentElement.classList;

describe('PreferenciasService', () => {
  beforeEach(() => {
    localStorage.clear();
    clases().remove('ca-sin-animaciones', 'ca-con-animaciones', 'ca-texto-grande', 'ca-texto-muy-grande');
  });

  it('sin nada guardado, usa lo de fábrica', () => {
    expect(TestBed.inject(PreferenciasService).valores()).toEqual(PREFERENCIAS_INICIALES);
  });

  it('ignora valores guardados que no entiende', () => {
    localStorage.setItem(CLAVE, JSON.stringify({ texto: 'gigante', animaciones: 'no', ahorroDatos: 'si', abrirEn: 'mapa' }));
    expect(TestBed.inject(PreferenciasService).valores()).toEqual({
      ...PREFERENCIAS_INICIALES,
      animaciones: 'no',
    });
  });

  it('un valor dañado no rompe la app', () => {
    localStorage.setItem(CLAVE, '{no es json');
    expect(TestBed.inject(PreferenciasService).valores()).toEqual(PREFERENCIAS_INICIALES);
  });

  it('cambiar guarda y aplica el texto y las animaciones en <html>', () => {
    const servicio = TestBed.inject(PreferenciasService);

    servicio.cambiar('texto', 'muy-grande');
    servicio.cambiar('animaciones', 'no');

    expect(clases()).toContain('ca-texto-muy-grande');
    expect(clases()).toContain('ca-sin-animaciones');
    expect(JSON.parse(localStorage.getItem(CLAVE)!)).toMatchObject({ texto: 'muy-grande', animaciones: 'no' });

    servicio.cambiar('animaciones', 'si');
    expect(clases()).not.toContain('ca-sin-animaciones');
    expect(clases()).toContain('ca-con-animaciones');
  });

  it('el ahorro de datos achica las fotos', () => {
    const servicio = TestBed.inject(PreferenciasService);
    expect(servicio.foto()).toEqual(FOTO_NORMAL);
    servicio.cambiar('ahorroDatos', true);
    expect(servicio.foto()).toEqual(FOTO_AHORRO);
  });

  it('la pantalla al abrir se entrega una sola vez por arranque', () => {
    const servicio = TestBed.inject(PreferenciasService);
    servicio.cambiar('abrirEn', '/report');

    expect(servicio.tomarPantallaInicial()).toBe('/report');
    expect(servicio.tomarPantallaInicial()).toBeNull();
  });

  it('restablecer vuelve a lo de fábrica', () => {
    const servicio = TestBed.inject(PreferenciasService);
    servicio.cambiar('texto', 'grande');
    servicio.restablecer();
    expect(servicio.valores()).toEqual(PREFERENCIAS_INICIALES);
    expect(clases()).not.toContain('ca-texto-grande');
  });

  it('borrar los datos locales deja la sesión, el tema y la configuración', () => {
    localStorage.setItem('ca.confianza.copia.u1', '{}');
    localStorage.setItem('ca.confianza.explicacionVista', '1');
    localStorage.setItem('ciudad-alerta.tema', 'claro');
    localStorage.setItem('firebase:authUser:clave', 'sesion');
    const servicio = TestBed.inject(PreferenciasService);
    servicio.cambiar('texto', 'grande');

    expect(servicio.borrarDatosLocales()).toBe(2);
    expect(localStorage.getItem('ca.confianza.copia.u1')).toBeNull();
    expect(localStorage.getItem('ciudad-alerta.tema')).toBe('claro');
    expect(localStorage.getItem('firebase:authUser:clave')).toBe('sesion');
    expect(localStorage.getItem(CLAVE)).not.toBeNull();
  });
});
