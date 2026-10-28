import { FieldValue, Timestamp } from 'firebase/firestore';

/**
 * Roles de Ciudad Alerta.
 *  - ciudadano: reporta y confirma.
 *  - operador: gestiona los reportes asignados (estados y veredictos).
 *  - admin: todo, más los catálogos.
 *  - organismo (1.2): la municipalidad que recibe los reportes ya validados por
 *    la comunidad. Solo lectura: ve en el mapa los validados de su organismo.
 */
export type UserRole = 'ciudadano' | 'operador' | 'admin' | 'organismo';

/** Cuenta de una institución (operador u organismo): no reporta ni confirma como vecino. */
export function esCuentaInstitucional(rol: UserRole | null | undefined): boolean {
  return rol === 'operador' || rol === 'organismo';
}

/** Cuenta de organismo: solo lectura, y solo los reportes validados de su organismo. */
export function esCuentaDeOrganismo(rol: UserRole | null | undefined): boolean {
  return rol === 'organismo';
}

/**
 * Documento base creado en `users/{uid}` al registrarse (CA-48).
 * `trustLevel` y `validatedReports` quedan sembrados aquí porque el sistema de
 * confianza comunitaria los consumirá en sprints posteriores.
 */
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  trustLevel: number;
  validatedReports: number;
  emailVerified: boolean;
  /** En cuentas de rol `operador`, el operador que representan. */
  operadorId?: string | null;
  /** En cuentas de rol `organismo`, el organismo (`organismos/{id}`) cuyos reportes validados ven. */
  organismoId?: string | null;
  /**
   * Momento del último reporte creado. Sostiene el intervalo mínimo entre
   * envíos (BUG 60). Ausente en los perfiles creados antes de esta versión.
   */
  ultimoReporteAt?: Timestamp | FieldValue | null;
  /**
   * Versión de los términos y la política de privacidad que aceptó
   * (VERSION_TERMINOS en comun/src/legal) y cuándo. Ausente en cuentas
   * creadas antes de la 1.0: la app se los pide al entrar.
   */
  terminosVersion?: string;
  terminosAceptadosAt?: Timestamp | FieldValue;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

/** Intervalo mínimo entre reportes de un mismo usuario, en milisegundos. */
export const INTERVALO_MINIMO_REPORTE_MS = 30_000;

/**
 * Largo máximo del nombre para mostrar. Igual que `displayName.size() <= 60`
 * (al crear el perfil) y `autorNombre.size() <= 60` (al crear un reporte) en
 * firestore.rules: las reglas exigen que el nombre del reporte sea el del
 * perfil, así que un nombre más largo dejaba la cuenta sin poder reportar.
 */
export const NOMBRE_MAXIMO = 60;

/**
 * Recorta un nombre a NOMBRE_MAXIMO unidades de texto (las mismas que cuenta
 * `.length` y, según el emulador, `size()` de las reglas) sin partir un emoji
 * por la mitad.
 */
export function recortarNombre(nombre: string, maximo = NOMBRE_MAXIMO): string {
  if (nombre.length <= maximo) return nombre;
  const corte = nombre.slice(0, maximo);
  const ultimo = corte.charCodeAt(corte.length - 1);
  // Un sustituto alto suelto (primera mitad de un emoji) quedaría inválido.
  return ultimo >= 0xd800 && ultimo <= 0xdbff ? corte.slice(0, -1) : corte;
}
