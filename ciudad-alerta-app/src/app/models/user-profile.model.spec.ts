import { NOMBRE_MAXIMO, recortarNombre } from './user-profile.model';

describe('recortarNombre', () => {
  it('deja igual un nombre dentro del tope', () => {
    expect(recortarNombre('Ana Pérez')).toBe('Ana Pérez');
    expect(recortarNombre('a'.repeat(NOMBRE_MAXIMO))).toHaveLength(NOMBRE_MAXIMO);
  });

  it('recorta un nombre largo al tope de las reglas (60)', () => {
    expect(NOMBRE_MAXIMO).toBe(60);
    expect(recortarNombre('a'.repeat(75))).toBe('a'.repeat(60));
  });

  it('no parte un emoji por la mitad', () => {
    const nombre = 'a'.repeat(59) + '😀b';
    const recortado = recortarNombre(nombre);
    expect(recortado).toBe('a'.repeat(59));
    expect(recortado.length).toBeLessThanOrEqual(NOMBRE_MAXIMO);
  });

  it('acepta otro tope', () => {
    expect(recortarNombre('Municipalidad', 4)).toBe('Muni');
  });
});
