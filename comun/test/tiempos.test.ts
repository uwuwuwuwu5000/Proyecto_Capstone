import { describe, expect, it } from 'vitest';

import { calcularTiempos, formatearDuracion, mediana, promedio } from '../src';

const creado = new Date('2026-10-01T12:00:00Z');
const horas = (h: number) => new Date(creado.getTime() + h * 3_600_000);

describe('tiempos de atención y resolución', () => {
  it('primera atención y resolución desde la creación', () => {
    const tiempos = calcularTiempos(creado, [
      { fecha: horas(2), hacia: 'en_revision' },
      { fecha: horas(30), hacia: 'en_proceso' },
      { fecha: horas(50), hacia: 'resuelto' },
    ]);
    expect(tiempos).toEqual({ primeraAtencionMs: 2 * 3_600_000, resolucionMs: 50 * 3_600_000 });
  });

  it('acepta el historial desordenado', () => {
    const tiempos = calcularTiempos(creado, [
      { fecha: horas(50), hacia: 'cerrado' },
      { fecha: horas(2), hacia: 'en_revision' },
    ]);
    expect(tiempos.primeraAtencionMs).toBe(2 * 3_600_000);
    expect(tiempos.resolucionMs).toBe(50 * 3_600_000);
  });

  it('abierto: sin tiempo de resolución; nunca atendido: sin primera atención', () => {
    expect(calcularTiempos(creado, [{ fecha: horas(1), hacia: 'derivado' }]).resolucionMs).toBeNull();
    expect(calcularTiempos(creado, [])).toEqual({ primeraAtencionMs: null, resolucionMs: null });
  });

  it('usa el tiempoResolucionMs guardado si existe', () => {
    expect(calcularTiempos(creado, [{ fecha: horas(5), hacia: 'resuelto' }], 4 * 3_600_000).resolucionMs).toBe(4 * 3_600_000);
  });

  it('un reloj adelantado no da tiempos negativos', () => {
    expect(calcularTiempos(creado, [{ fecha: horas(-1), hacia: 'en_revision' }]).primeraAtencionMs).toBe(0);
  });

  it('ignora cambios sin fecha y reportes sin fecha de creación', () => {
    expect(calcularTiempos(creado, [{ fecha: null, hacia: 'resuelto' }]).resolucionMs).toBeNull();
    expect(calcularTiempos(null, [{ fecha: horas(1), hacia: 'resuelto' }])).toEqual({ primeraAtencionMs: null, resolucionMs: null });
  });
});

describe('estadísticas y formato', () => {
  it('mediana y promedio', () => {
    expect(mediana([])).toBeNull();
    expect(mediana([5, 1, 3])).toBe(3);
    expect(mediana([4, 1, 3, 2])).toBe(2.5);
    expect(promedio([])).toBeNull();
    expect(promedio([1, 2, 6])).toBe(3);
  });

  it('duraciones legibles', () => {
    expect(formatearDuracion(20_000)).toBe('menos de 1 min');
    expect(formatearDuracion(12 * 60_000)).toBe('12 min');
    expect(formatearDuracion(2 * 3_600_000)).toBe('2 h');
    expect(formatearDuracion(135 * 60_000)).toBe('2 h 15 min');
    expect(formatearDuracion(24 * 3_600_000)).toBe('1 día');
    expect(formatearDuracion(3.5 * 24 * 3_600_000)).toBe('3,5 días');
    expect(formatearDuracion(18 * 24 * 3_600_000)).toBe('18 días');
  });
});
