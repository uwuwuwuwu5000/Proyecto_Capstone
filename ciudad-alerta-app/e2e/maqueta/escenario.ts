/**
 * Variantes que una prueba puede pedir antes de abrir la maqueta, en
 * localStorage `e2e.escenario` (JSON). Por ejemplo, que el servicio de
 * privacidad no responda.
 */
export interface Escenario {
  privacidadCaida?: boolean;
}

export function escenario(): Escenario {
  try {
    return JSON.parse(localStorage.getItem('e2e.escenario') ?? '{}') as Escenario;
  } catch {
    return {};
  }
}
