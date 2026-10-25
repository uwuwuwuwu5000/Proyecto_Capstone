import { UltimaCarga } from './ultima-carga';

describe('UltimaCarga', () => {
  it('solo la última carga nueva sigue vigente', () => {
    const cargas = new UltimaCarga();
    const primera = cargas.nueva();
    const segunda = cargas.nueva();

    expect(primera()).toBe(false);
    expect(segunda()).toBe(true);
  });

  it('«actual» acompaña a la carga en curso sin invalidarla', () => {
    const cargas = new UltimaCarga();
    const lista = cargas.nueva();
    const verMas = cargas.actual();

    expect(lista()).toBe(true);
    expect(verMas()).toBe(true);

    cargas.nueva();
    expect(verMas()).toBe(false);
  });

  it('cancelar invalida lo pendiente', () => {
    const cargas = new UltimaCarga();
    const pendiente = cargas.nueva();
    cargas.cancelar();
    expect(pendiente()).toBe(false);
  });
});
