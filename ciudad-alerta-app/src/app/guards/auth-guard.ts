import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, from, map, switchMap, take } from 'rxjs';

import { AuthService } from '../services/auth.service';

/**
 * CA-50 · Control de acceso a la app.
 * `authState$` emite recién después de que Firebase restauró la sesión
 * persistida, por lo que `take(1)` no expulsa al usuario en un arranque en frío.
 */
export const authGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.authState$.pipe(
    take(1),
    map((user) => (user ? true : router.createUrlTree(['/login']))),
  );
};

/**
 * Restringe una ruta al equipo de soporte: roles `operador` y `admin`.
 *
 * El rol se lee del perfil en Firestore, no de un dato del cliente, y las reglas
 * impiden que un usuario modifique su propio `role`. Esta comprobación mejora la
 * experiencia —evita mostrar una pantalla que fallaría—, pero la garantía real
 * está en las reglas de seguridad.
 */
export const staffGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.authState$.pipe(
    take(1),
    switchMap((user) => {
      if (!user) {
        return from([router.createUrlTree(['/login'])]);
      }

      return from(authService.getUserProfile(user.uid)).pipe(
        map((perfil) =>
          perfil?.role === 'operador' || perfil?.role === 'admin'
            ? true
            : router.createUrlTree(['/home']),
        ),
      );
    }),
  );
};

/** Impide volver al login cuando ya existe una sesión activa. */
export const guestGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.authState$.pipe(
    take(1),
    map((user) => (user ? router.createUrlTree(['/home']) : true)),
  );
};
