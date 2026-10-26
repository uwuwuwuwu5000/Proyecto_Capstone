import { creacionDeCuenta, permisoElegirEnMapa, textoEsperaElegirEnMapa } from './ubicacion';
import { PARAMETROS_UBICACION } from './parametros';
import { usarEntornoDePrueba } from '../../../testing';

usarEntornoDePrueba();

const AHORA = Date.UTC(2026, 9, 26, 15, 0);
const DIA = 86_400_000;

describe('elegir la ubicación del reporte en el mapa', () => {
  it('se exige una semana de antigüedad', () => {
    expect(PARAMETROS_UBICACION.diasParaElegirEnMapa).toBe(7);
  });

  it('una cuenta con 7 días o más puede elegir en el mapa', () => {
    expect(permisoElegirEnMapa(AHORA - 7 * DIA, AHORA)).toEqual({ permitido: true, diasRestantes: 0 });
    expect(permisoElegirEnMapa(AHORA - 400 * DIA, AHORA)).toEqual({ permitido: true, diasRestantes: 0 });
  });

  it('una cuenta más nueva no puede, y se dice cuántos días faltan redondeando hacia arriba', () => {
    expect(permisoElegirEnMapa(AHORA, AHORA)).toEqual({ permitido: false, diasRestantes: 7 });
    expect(permisoElegirEnMapa(AHORA - 2 * DIA, AHORA)).toEqual({ permitido: false, diasRestantes: 5 });
    // A una hora de cumplir la semana todavía falta «1 día», no «0».
    expect(permisoElegirEnMapa(AHORA - 7 * DIA + 3_600_000, AHORA)).toEqual({ permitido: false, diasRestantes: 1 });
  });

  it('sin fecha de creación la cuenta se trata como nueva', () => {
    expect(permisoElegirEnMapa(null, AHORA)).toEqual({ permitido: false, diasRestantes: null });
    expect(permisoElegirEnMapa(Number.NaN, AHORA)).toEqual({ permitido: false, diasRestantes: null });
  });

  it('el aviso dice cuánto falta y por qué', () => {
    expect(textoEsperaElegirEnMapa({ permitido: false, diasRestantes: 5 })).toBe(
      'Elegir en el mapa estará disponible cuando tu cuenta cumpla 7 días (te faltan 5 días). Así evitamos reportes falsos de cuentas recién creadas.',
    );
    expect(textoEsperaElegirEnMapa({ permitido: false, diasRestantes: 1 })).toContain('(te falta 1 día)');
    expect(textoEsperaElegirEnMapa({ permitido: false, diasRestantes: null })).toBe(
      'Elegir en el mapa está disponible para cuentas con al menos 7 días. Así evitamos reportes falsos de cuentas recién creadas.',
    );
    expect(textoEsperaElegirEnMapa({ permitido: true, diasRestantes: 0 })).toBeNull();
  });

  it('lee la fecha de creación que entrega Firebase Authentication', () => {
    expect(creacionDeCuenta('Mon, 19 Oct 2026 15:00:00 GMT')).toBe(Date.UTC(2026, 9, 19, 15, 0));
    expect(creacionDeCuenta(undefined)).toBeNull();
    expect(creacionDeCuenta('')).toBeNull();
    expect(creacionDeCuenta('no es una fecha')).toBeNull();
  });
});
