import { describe, expect, it } from 'vitest';

import { TOLERANCIA_TIEMPO_RESOLUCION_MS, permisoDeGestion, resolucionDelCambio } from '../src';

describe('permisoDeGestion (puedeGestionarReporte de las reglas)', () => {
  it('un admin gestiona cualquier reporte', () => {
    expect(permisoDeGestion({ rol: 'admin' }, { operadorId: null })).toEqual({
      esGestor: true,
      puede: true,
      motivo: null,
    });
  });

  it('un operador solo gestiona los reportes con su operadorId', () => {
    expect(permisoDeGestion({ rol: 'operador', operadorId: 'op1' }, { operadorId: 'op1' }).puede).toBe(true);

    const ajeno = permisoDeGestion({ rol: 'operador', operadorId: 'op1' }, { operadorId: 'op2' });
    expect(ajeno).toMatchObject({ esGestor: true, puede: false });
    expect(ajeno.motivo).toMatch(/otro operador/);

    const sinAsignar = permisoDeGestion({ rol: 'operador', operadorId: 'op1' }, { operadorId: null });
    expect(sinAsignar.motivo).toMatch(/no tiene operador/);
  });

  it('un operador sin operadorId no gestiona aunque el reporte tampoco tenga', () => {
    expect(permisoDeGestion({ rol: 'operador', operadorId: null }, {}).puede).toBe(false);
  });

  it('un ciudadano o una sesión sin perfil no son gestores ni ven motivo', () => {
    expect(permisoDeGestion({ rol: 'ciudadano' }, {})).toEqual({ esGestor: false, puede: false, motivo: null });
    expect(permisoDeGestion(null, {})).toEqual({ esGestor: false, puede: false, motivo: null });
  });
});

describe('resolucionDelCambio (cambioDeEstadoValido de las reglas)', () => {
  const creado = Date.UTC(2026, 9, 1, 12, 0);
  const dosHorasDespues = creado + 2 * 3_600_000;

  it('al resolver envía el tiempo desde la creación', () => {
    expect(resolucionDelCambio('en_proceso', 'resuelto', creado, dosHorasDespues)).toEqual({
      tipo: 'resuelto',
      tiempoResolucionMs: 2 * 3_600_000,
    });
  });

  it('nunca envía un tiempo negativo (reloj del autor adelantado)', () => {
    expect(resolucionDelCambio('en_proceso', 'resuelto', creado + 60_000, creado)).toEqual({
      tipo: 'resuelto',
      tiempoResolucionMs: 0,
    });
  });

  it('sin fecha de creación no envía tiempo de resolución', () => {
    expect(resolucionDelCambio('en_proceso', 'resuelto', null, dosHorasDespues)).toBeNull();
  });

  it('al cerrar sin haber resuelto marca cerrado sin resolver', () => {
    expect(resolucionDelCambio('en_revision', 'cerrado', creado, dosHorasDespues)).toEqual({
      tipo: 'cerrado_sin_resolver',
    });
    expect(resolucionDelCambio('en_proceso', 'cerrado', creado, dosHorasDespues)).toEqual({
      tipo: 'cerrado_sin_resolver',
    });
  });

  it('cerrar un reporte ya resuelto o avanzar entre estados abiertos no agrega nada', () => {
    expect(resolucionDelCambio('resuelto', 'cerrado', creado, dosHorasDespues)).toBeNull();
    expect(resolucionDelCambio('reportado', 'en_revision', creado, dosHorasDespues)).toBeNull();
  });

  it('la tolerancia es la de las reglas (900000 ms)', () => {
    expect(TOLERANCIA_TIEMPO_RESOLUCION_MS).toBe(900_000);
  });
});
