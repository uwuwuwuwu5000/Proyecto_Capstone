/**
 * Roles de Ciudad Alerta.
 *  - ciudadano: reporta y confirma.
 *  - operador: gestiona los reportes asignados (estados y veredictos).
 *  - admin: todo, más los catálogos.
 *  - organismo: la municipalidad que recibe los reportes ya validados por la comunidad. Solo lectura.
 *
 * Los textos con que se muestra cada rol los pone cada aplicación (su interfaz es distinta).
 * Los parámetros aceptan `string` porque el rol llega de un documento de Firestore sin tipar.
 */
export type UserRole = 'ciudadano' | 'operador' | 'admin' | 'organismo';

/** Cuenta de una institución (operador u organismo): no reporta ni confirma como vecino. */
export function esCuentaInstitucional(rol: string | null | undefined): boolean {
  return rol === 'operador' || rol === 'organismo';
}

/** Cuenta de organismo: solo lectura, y solo los reportes validados de su organismo. */
export function esCuentaDeOrganismo(rol: string | null | undefined): boolean {
  return rol === 'organismo';
}
