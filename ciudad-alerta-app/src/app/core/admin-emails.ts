/**
 * Correos con rol de administrador.
 *
 * Esta lista está duplicada a propósito en `firestore.rules`, en la función
 * `esCorreoAdministrador()`. La copia del cliente decide qué se muestra; la de
 * las reglas es la que manda, porque se evalúa en servidor contra el correo
 * verificado del token de autenticación y no puede falsificarse desde la app.
 *
 * Si se agrega o quita un correo, hay que actualizar AMBOS lugares y volver a
 * desplegar las reglas.
 */
export const CORREOS_ADMINISTRADORES: ReadonlyArray<string> = [
  'es.ibarra@duocuc.cl',
  'cla.torres@duocuc.cl',
  'rodri.hernandezc@duocuc.cl',
  'rodri.hernandezc@admin.cl',
  'rodrigo@admin.cl',
];

export function esCorreoAdministrador(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }

  return CORREOS_ADMINISTRADORES.includes(email.trim().toLowerCase());
}
