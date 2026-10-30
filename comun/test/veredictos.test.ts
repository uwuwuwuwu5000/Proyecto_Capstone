import { describe, expect, it } from 'vitest';

import {
  UMBRAL_DEMORADO_HORAS,
  esPendienteDeVeredicto,
  esperaActual,
  estaDemorado,
  resumenDeTiempos,
  tiempoHastaVeredicto,
  tiempoRevisionACierre,
  veredictoEnRango,
} from '../src';
import type { CambioConFecha, ReporteConValidacion, ValidacionDeReporte } from '../src';

// Cálculos de «Por veredicto»: reportes que la comunidad validó y esperan el veredicto de quien los gestiona.
const HORA = 3_600_000;
const AHORA = new Date('2026-10-30T12:00:00Z').getTime();
const hace = (horas: number) => new Date(AHORA - horas * HORA);

const validacion = (extra: Partial<ValidacionDeReporte> = {}): ValidacionDeReporte => ({
  validado: true,
  veredicto: null,
  validadoAt: hace(10),
  veredictoAt: null,
  ...extra,
});

const reporte = (extra: Partial<ReporteConValidacion> & { validacion?: ValidacionDeReporte } = {}): ReporteConValidacion => ({
  estado: 'reportado',
  validacion: validacion(),
  ...extra,
});

const cambio = (hacia: string, fecha: Date | null): CambioConFecha => ({ hacia, fecha });

describe('esPendienteDeVeredicto', () => {
  it('un reporte validado, sin veredicto y en curso está pendiente', () => {
    expect(esPendienteDeVeredicto(reporte())).toBe(true);
  });
  it('no si la comunidad aún no lo valida', () => {
    expect(esPendienteDeVeredicto(reporte({ validacion: validacion({ validado: false }) }))).toBe(false);
  });
  it('no si ya tiene veredicto, real o falso', () => {
    expect(esPendienteDeVeredicto(reporte({ validacion: validacion({ veredicto: 'real' }) }))).toBe(false);
    expect(esPendienteDeVeredicto(reporte({ validacion: validacion({ veredicto: 'falso' }) }))).toBe(false);
  });
  it.each(['resuelto', 'cerrado'])('no si está «%s» (también un reporte retirado por su autor)', (estado) => {
    expect(esPendienteDeVeredicto(reporte({ estado }))).toBe(false);
  });
  it.each(['reportado', 'en_revision', 'derivado', 'en_proceso'])('sí si está «%s»', (estado) => {
    expect(esPendienteDeVeredicto(reporte({ estado }))).toBe(true);
  });
  it('un reporte validado antes de existir validadoAt también aparece', () => {
    expect(esPendienteDeVeredicto(reporte({ validacion: validacion({ validadoAt: null }) }))).toBe(true);
  });
});

describe('esperaActual y estaDemorado', () => {
  it('es el tiempo desde que se validó', () => {
    expect(esperaActual(reporte({ validacion: validacion({ validadoAt: hace(5) }) }), AHORA)).toBe(5 * HORA);
  });
  it('sin fecha de validación no hay espera que calcular', () => {
    expect(esperaActual(reporte({ validacion: validacion({ validadoAt: null }) }), AHORA)).toBeNull();
  });
  it('un reloj adelantado (validado «en el futuro») no da una espera negativa', () => {
    expect(esperaActual(reporte({ validacion: validacion({ validadoAt: hace(-3) }) }), AHORA)).toBe(0);
  });
  it('se marca demorado desde las 48 horas', () => {
    expect(UMBRAL_DEMORADO_HORAS).toBe(48);
    expect(estaDemorado(reporte({ validacion: validacion({ validadoAt: hace(47.9) }) }), AHORA)).toBe(false);
    expect(estaDemorado(reporte({ validacion: validacion({ validadoAt: hace(48) }) }), AHORA)).toBe(true);
  });
  it('sin fecha de validación no se puede marcar demorado', () => {
    expect(estaDemorado(reporte({ validacion: validacion({ validadoAt: null }) }), AHORA)).toBe(false);
  });
});

describe('tiempoHastaVeredicto (tiempo en ser tomado en cuenta)', () => {
  const conVeredicto = (validadoAt: Date | null, veredictoAt: Date | null) =>
    reporte({ validacion: validacion({ validadoAt, veredicto: 'real', veredictoAt }) });

  it('es la diferencia entre el veredicto y la validación', () => {
    expect(tiempoHastaVeredicto(conVeredicto(hace(10), hace(4)))).toBe(6 * HORA);
  });
  it('sin veredicto no hay tiempo', () => {
    expect(tiempoHastaVeredicto(reporte())).toBeNull();
  });
  it('sin fecha de validación o de veredicto queda fuera', () => {
    expect(tiempoHastaVeredicto(conVeredicto(null, hace(4)))).toBeNull();
    expect(tiempoHastaVeredicto(conVeredicto(hace(10), null))).toBeNull();
  });
  it('un veredicto «anterior» a la validación (reloj desfasado) da 0, no un valor negativo', () => {
    expect(tiempoHastaVeredicto(conVeredicto(hace(4), hace(10)))).toBe(0);
  });
});

describe('tiempoRevisionACierre', () => {
  const t0 = new Date('2026-10-20T10:00:00Z');
  const en = (horas: number) => new Date(t0.getTime() + horas * HORA);

  it('mide desde «En revisión» hasta «Cerrado» y hasta «Resuelto»', () => {
    const r = tiempoRevisionACierre([cambio('en_revision', t0), cambio('resuelto', en(48)), cambio('cerrado', en(72))]);
    expect(r).toEqual({ pasoPorRevision: true, aResueltoMs: 48 * HORA, aCierreMs: 72 * HORA });
  });
  it('funciona con el historial en desorden', () => {
    const r = tiempoRevisionACierre([cambio('cerrado', en(72)), cambio('en_revision', t0), cambio('derivado', en(5))]);
    expect(r).toEqual({ pasoPorRevision: true, aResueltoMs: null, aCierreMs: 72 * HORA });
  });
  it('un reporte que no pasó por «En revisión» queda fuera', () => {
    const r = tiempoRevisionACierre([cambio('derivado', t0), cambio('cerrado', en(10))]);
    expect(r).toEqual({ pasoPorRevision: false, aResueltoMs: null, aCierreMs: null });
  });
  it('si aún no se cierra, no hay tiempo de cierre', () => {
    const r = tiempoRevisionACierre([cambio('en_revision', t0), cambio('derivado', en(5))]);
    expect(r).toEqual({ pasoPorRevision: true, aResueltoMs: null, aCierreMs: null });
  });
  it('un cierre anterior a la revisión no cuenta', () => {
    expect(tiempoRevisionACierre([cambio('cerrado', en(-5)), cambio('en_revision', t0)]).aCierreMs).toBeNull();
  });
  it('ignora los cambios sin fecha', () => {
    expect(tiempoRevisionACierre([cambio('en_revision', null), cambio('cerrado', en(10))]).pasoPorRevision).toBe(false);
  });
  it('sin historial no hay nada que medir', () => {
    expect(tiempoRevisionACierre([])).toEqual({ pasoPorRevision: false, aResueltoMs: null, aCierreMs: null });
  });
});

describe('resumenDeTiempos', () => {
  it('sin valores no hay mediana ni promedio', () => {
    expect(resumenDeTiempos([])).toEqual({ cantidad: 0, excluidos: 0, mediana: null, promedio: null });
  });
  it('calcula con los valores y cuenta los que quedan fuera', () => {
    expect(resumenDeTiempos([2 * HORA, null, 4 * HORA, 12 * HORA, null])).toEqual({
      cantidad: 3,
      excluidos: 2,
      mediana: 4 * HORA,
      promedio: 6 * HORA,
    });
  });
  it('con todos los valores nulos, todos quedan fuera', () => {
    expect(resumenDeTiempos([null, null])).toEqual({ cantidad: 0, excluidos: 2, mediana: null, promedio: null });
  });
});

describe('veredictoEnRango (el periodo se mide por la fecha del veredicto)', () => {
  const conVeredicto = (veredictoAt: Date | null) =>
    reporte({ validacion: validacion({ veredicto: 'real', veredictoAt }) });
  const rango = { inicio: hace(48), fin: hace(24) };

  it('entra si el veredicto cae dentro del periodo', () => {
    expect(veredictoEnRango(conVeredicto(hace(30)), rango)).toBe(true);
  });
  it('no entra si el veredicto cae antes o después del periodo', () => {
    expect(veredictoEnRango(conVeredicto(hace(60)), rango)).toBe(false);
    expect(veredictoEnRango(conVeredicto(hace(2)), rango)).toBe(false);
  });
  it('sin límites (periodo «Todo») entran todos', () => {
    expect(veredictoEnRango(conVeredicto(hace(5000)), { inicio: null, fin: null })).toBe(true);
  });
  it('sin fecha de veredicto no entra a un periodo con límites', () => {
    expect(veredictoEnRango(conVeredicto(null), rango)).toBe(false);
  });
});
