import { describe, expect, it } from 'vitest';

import { esCuentaDeOrganismo, esCuentaInstitucional } from '../src';

describe('roles de cuenta', () => {
  it('solo el rol organismo es una cuenta de organismo (solo lectura)', () => {
    expect(esCuentaDeOrganismo('organismo')).toBe(true);
    for (const rol of ['ciudadano', 'operador', 'admin', '', null, undefined, 'otro']) {
      expect(esCuentaDeOrganismo(rol)).toBe(false);
    }
  });

  it('operador y organismo son cuentas institucionales: no reportan ni confirman como vecino', () => {
    expect(esCuentaInstitucional('operador')).toBe(true);
    expect(esCuentaInstitucional('organismo')).toBe(true);
    for (const rol of ['ciudadano', 'admin', null, undefined]) {
      expect(esCuentaInstitucional(rol)).toBe(false);
    }
  });
});
