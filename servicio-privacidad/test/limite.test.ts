import { describe, expect, it } from 'vitest';

import { LimitePorUsuario } from '../src/limite';

describe('LimitePorUsuario', () => {
  it('deja pasar hasta el máximo en la ventana y después pide esperar', () => {
    let ahora = 0;
    const limite = new LimitePorUsuario(2, 60_000, () => ahora);

    expect(limite.permitir('ana')).toBe(true);
    ahora = 10_000;
    expect(limite.permitir('ana')).toBe(true);
    expect(limite.permitir('ana')).toBe(false);
    expect(limite.esperaSegundos('ana')).toBe(50);
    // Otro usuario no se ve afectado.
    expect(limite.permitir('luis')).toBe(true);
  });

  it('la ventana se desliza: lo antiguo deja de contar', () => {
    let ahora = 0;
    const limite = new LimitePorUsuario(1, 60_000, () => ahora);
    expect(limite.permitir('ana')).toBe(true);
    ahora = 60_001;
    expect(limite.permitir('ana')).toBe(true);
  });
});
