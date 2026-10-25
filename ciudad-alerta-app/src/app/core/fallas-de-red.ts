import { FirebaseError } from 'firebase/app';

/** Códigos de Firebase que significan «no hubo conexión», no «no se puede». */
const CODIGOS_DE_RED = new Set([
  'unavailable',
  'deadline-exceeded',
  'storage/retry-limit-exceeded',
  'auth/network-request-failed',
]);

/**
 * Falta de conexión (o una conexión tan mala que no alcanzó), no un rechazo de
 * las reglas ni un dato inválido. Quien la recibe puede reintentar más tarde
 * con la misma información.
 */
export function esFallaDeRed(error: unknown): boolean {
  return error instanceof FirebaseError && CODIGOS_DE_RED.has(error.code);
}
