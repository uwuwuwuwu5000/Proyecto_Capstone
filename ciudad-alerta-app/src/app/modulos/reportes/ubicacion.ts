import { PARAMETROS_UBICACION } from './parametros';

/**
 * Dónde se marca un reporte: la ubicación actual del teléfono (GPS) o un
 * punto que la persona elige en el mapa. Lo segundo sirve cuando el problema
 * no está donde está ella, o cuando reporta desde su casa y no quiere que su
 * casa quede en el mapa.
 */

const DIA_MS = 86_400_000;

/** `diasRestantes` es null cuando no se sabe cuándo se creó la cuenta. */
export interface PermisoElegirEnMapa {
  permitido: boolean;
  diasRestantes: number | null;
}

/**
 * Elegir en el mapa queda para cuentas con al menos 7 días
 * (PARAMETROS_UBICACION). Sin fecha de creación la cuenta se trata como
 * nueva, igual que en el peso de las confirmaciones.
 */
export function permisoElegirEnMapa(cuentaCreadaMs: number | null, ahoraMs: number): PermisoElegirEnMapa {
  if (cuentaCreadaMs === null || !Number.isFinite(cuentaCreadaMs)) {
    return { permitido: false, diasRestantes: null };
  }

  const faltaMs = cuentaCreadaMs + PARAMETROS_UBICACION.diasParaElegirEnMapa * DIA_MS - ahoraMs;

  return faltaMs <= 0
    ? { permitido: true, diasRestantes: 0 }
    : { permitido: false, diasRestantes: Math.ceil(faltaMs / DIA_MS) };
}

/** Por qué todavía no puede elegir en el mapa, o null si ya puede. */
export function textoEsperaElegirEnMapa(permiso: PermisoElegirEnMapa): string | null {
  if (permiso.permitido) {
    return null;
  }

  const dias = PARAMETROS_UBICACION.diasParaElegirEnMapa;
  const motivo = 'Así evitamos reportes falsos de cuentas recién creadas.';

  if (permiso.diasRestantes === null) {
    return `Elegir en el mapa está disponible para cuentas con al menos ${dias} días. ${motivo}`;
  }

  const faltan = permiso.diasRestantes === 1 ? 'te falta 1 día' : `te faltan ${permiso.diasRestantes} días`;
  return `Elegir en el mapa estará disponible cuando tu cuenta cumpla ${dias} días (${faltan}). ${motivo}`;
}

/**
 * Fecha de creación de la cuenta en milisegundos, a partir de
 * `user.metadata.creationTime` de Firebase Authentication (texto en UTC).
 * null si falta o no se entiende.
 *
 * Se usa la de Authentication y no `createdAt` del perfil: llega con la
 * sesión (no hay que leer nada y funciona sin señal) y la tienen todas las
 * cuentas, también las anteriores al perfil.
 */
export function creacionDeCuenta(creationTime: string | null | undefined): number | null {
  if (!creationTime) {
    return null;
  }

  const ms = Date.parse(creationTime);
  return Number.isFinite(ms) ? ms : null;
}
