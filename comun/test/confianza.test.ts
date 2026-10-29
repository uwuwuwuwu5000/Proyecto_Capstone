import { describe, expect, it } from 'vitest';

import {
  MOTIVO_VEREDICTO_MAXIMO,
  NIVELES,
  PARAMETROS_CONFIANZA,
  cuentaEsAntigua,
  efectoDeVeredicto,
  inicioDeDia,
  limiteDiario,
  motivoDeVeredicto,
  nivelDePuntos,
  numeroDeDia,
  pesoDeNivel,
  pesoDeVoto,
  porcentajeDeValidacion,
  progresoDeNivel,
  puntosTrasVeredicto,
  sumarConfirmacion,
} from '../src';

/**
 * Las funciones de firestore.rules, transcritas tal cual. Si alguien cambia
 * un número en parametros.ts sin cambiarlo en las reglas, estas pruebas fallan.
 */
const reglas = {
  nivelDePuntos: (pc: number) =>
    pc >= 760 ? 10 : pc >= 640 ? 9 : pc >= 530 ? 8 : pc >= 430 ? 7 : pc >= 340 ? 6 : pc >= 260 ? 5 : pc >= 190 ? 4 : pc >= 130 ? 3 : pc >= 80 ? 2 : pc >= 40 ? 1 : 0,
  pesoDeNivel: (nivel: number) => (nivel >= 10 ? 34 : 10 + 2.5 * nivel),
  limiteDiario: (nivel: number) => (nivel == 0 ? 5 : nivel == 1 ? 8 : nivel <= 3 ? 12 : nivel <= 6 ? 20 : 30),
  numeroDeDia: (ms: number) => Math.trunc((ms - 10800000) / 86400000),
};

describe('confianza: igual que firestore.rules', () => {
  it('nivel para 0 a 800 PC', () => {
    for (let pc = 0; pc <= 800; pc++) expect(nivelDePuntos(pc)).toBe(reglas.nivelDePuntos(pc));
  });

  it('peso y límite diario para los niveles 0 a 10', () => {
    for (let nivel = 0; nivel <= 10; nivel++) {
      expect(pesoDeNivel(nivel)).toBe(reglas.pesoDeNivel(nivel));
      expect(limiteDiario(nivel)).toBe(reglas.limiteDiario(nivel));
    }
  });

  it('número de día con desfase UTC−3', () => {
    const mediodia = Date.UTC(2026, 9, 20, 12);
    expect(numeroDeDia(mediodia)).toBe(reglas.numeroDeDia(mediodia));
    expect(numeroDeDia(mediodia)).toBe(20746);
    expect(new Date(inicioDeDia(20747)).toISOString()).toBe('2026-10-21T03:00:00.000Z');
    // Un segundo antes del cambio de día sigue siendo el día anterior.
    expect(numeroDeDia(inicioDeDia(20747) - 1000)).toBe(20746);
  });

  it('11 niveles con umbrales crecientes y tope en el último', () => {
    expect(NIVELES).toHaveLength(11);
    expect(NIVELES.at(-1)!.puntosMinimos).toBe(PARAMETROS_CONFIANZA.puntosMaximos);
    for (let i = 1; i < NIVELES.length; i++) expect(NIVELES[i].puntosMinimos).toBeGreaterThan(NIVELES[i - 1].puntosMinimos);
  });
});

describe('confianza: voto y validación', () => {
  it('sin correo verificado o con cuenta nueva el voto pesa 0', () => {
    expect(pesoDeVoto({ nivel: 5, correoVerificado: false, cuentaAntigua: true })).toEqual({ peso: 0, motivoSinPeso: 'correo' });
    expect(pesoDeVoto({ nivel: 5, correoVerificado: true, cuentaAntigua: false })).toEqual({ peso: 0, motivoSinPeso: 'cuenta_nueva' });
    expect(pesoDeVoto({ nivel: 5, correoVerificado: true, cuentaAntigua: true })).toEqual({ peso: 22.5, motivoSinPeso: null });
  });

  it('la cuenta es antigua desde las 24 h exactas', () => {
    const ahora = Date.UTC(2026, 9, 20, 12);
    expect(cuentaEsAntigua(ahora - 86_400_000, ahora)).toBe(true);
    expect(cuentaEsAntigua(ahora - 86_399_999, ahora)).toBe(false);
    expect(cuentaEsAntigua(null, ahora)).toBe(false);
  });

  it('diez votos de nivel 0 validan en el décimo', () => {
    let v = {};
    for (let i = 1; i <= 10; i++) {
      const suma = sumarConfirmacion(v, 10);
      expect(suma.recienValidado).toBe(i === 10);
      v = suma;
    }
  });

  it('nunca valida una sola persona: tres votos de nivel 10', () => {
    let v = {};
    for (let i = 1; i <= 3; i++) {
      const suma = sumarConfirmacion(v, 34);
      expect(suma.validado).toBe(i === 3);
      v = suma;
    }
  });

  it('un voto de peso 0 no cuenta como persona', () => {
    expect(sumarConfirmacion({ puntos: 95, votos: 2 }, 0)).toMatchObject({ puntos: 95, votos: 2, validado: false });
  });

  it('una vez validado, sigue validado', () => {
    expect(sumarConfirmacion({ puntos: 120, votos: 4, validado: true }, 0).validado).toBe(true);
    expect(sumarConfirmacion({ puntos: 120, votos: 4, validado: true }, 10).recienValidado).toBe(false);
  });

  it('porcentaje para la barra, con tope en 100', () => {
    expect(porcentajeDeValidacion(undefined)).toBe(0);
    expect(porcentajeDeValidacion({ puntos: 62.5 })).toBe(63);
    expect(porcentajeDeValidacion({ puntos: 117.5 })).toBe(100);
  });
});

describe('confianza: veredictos y progreso', () => {
  it('real suma 10 con tope 760; falso resta 15 sin bajar de 0', () => {
    expect(puntosTrasVeredicto(0, 'real')).toBe(10);
    expect(puntosTrasVeredicto(755, 'real')).toBe(760);
    expect(puntosTrasVeredicto(760, 'real')).toBe(760);
    expect(puntosTrasVeredicto(40, 'falso')).toBe(25);
    expect(puntosTrasVeredicto(5, 'falso')).toBe(0);
  });

  it('efecto de un veredicto real en un autor sin documento de confianza', () => {
    expect(efectoDeVeredicto(undefined, 'real')).toEqual({
      puntosAntes: 0,
      puntosConfianza: 10,
      trustLevel: 0,
      validatedReports: 1,
      reportesFalsos: 0,
      confirmacionesSuspendidas: false,
      veredictoPuntos: 10,
    });
  });

  it('efecto de un veredicto falso: −15, un falso más y conserva la suspensión', () => {
    const previo = { puntosConfianza: 40, validatedReports: 4, reportesFalsos: 1, confirmacionesSuspendidas: true };
    expect(efectoDeVeredicto(previo, 'falso')).toEqual({
      puntosAntes: 40,
      puntosConfianza: 25,
      trustLevel: 0,
      validatedReports: 4,
      reportesFalsos: 2,
      confirmacionesSuspendidas: true,
      veredictoPuntos: -15,
    });
  });

  it('veredictoPuntos dice lo que de verdad cambió en el tope y en 0', () => {
    expect(efectoDeVeredicto({ puntosConfianza: 755 }, 'real')).toMatchObject({ puntosConfianza: 760, trustLevel: 10, veredictoPuntos: 5 });
    expect(efectoDeVeredicto({ puntosConfianza: 760 }, 'real').veredictoPuntos).toBe(0);
    expect(efectoDeVeredicto({ puntosConfianza: 0 }, 'falso').veredictoPuntos).toBe(0);
  });

  it('el nivel tras el veredicto es el de las reglas', () => {
    for (const pc of [0, 25, 30, 35, 70, 120, 250, 750]) {
      for (const veredicto of ['real', 'falso'] as const) {
        const efecto = efectoDeVeredicto({ puntosConfianza: pc }, veredicto);
        // Regla: real → min(pc + 10, 760); falso → max(pc − 15, 0).
        const esperado = veredicto === 'real' ? (pc + 10 > 760 ? 760 : pc + 10) : pc - 15 < 0 ? 0 : pc - 15;
        expect(efecto.puntosConfianza).toBe(esperado);
        expect(efecto.trustLevel).toBe(reglas.nivelDePuntos(esperado));
      }
    }
  });

  it('motivo: obligatorio si es falso, opcional si es real, con tope de largo', () => {
    expect(motivoDeVeredicto('falso', '   ').error).toContain('motivo');
    expect(motivoDeVeredicto('falso', '  No había ningún bache ')).toEqual({ motivo: 'No había ningún bache', error: null });
    expect(motivoDeVeredicto('real', '')).toEqual({ motivo: null, error: null });
    expect(motivoDeVeredicto('real', undefined)).toEqual({ motivo: null, error: null });
    expect(motivoDeVeredicto('falso', 'x'.repeat(MOTIVO_VEREDICTO_MAXIMO)).error).toBeNull();
    expect(motivoDeVeredicto('falso', 'x'.repeat(MOTIVO_VEREDICTO_MAXIMO + 1)).error).toContain('512');
  });

  it('progreso hacia el siguiente nivel', () => {
    expect(progresoDeNivel(85)).toMatchObject({ nivel: 2, desde: 80, hasta: 130, faltan: 45, reportesQueFaltan: 5 });
    expect(progresoDeNivel(0)).toMatchObject({ nivel: 0, nombre: 'Vecino nuevo', fraccion: 0 });
    expect(progresoDeNivel(760)).toMatchObject({ nivel: 10, hasta: null, fraccion: 1, faltan: 0 });
  });
});
