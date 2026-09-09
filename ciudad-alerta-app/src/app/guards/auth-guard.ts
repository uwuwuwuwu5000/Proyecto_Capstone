import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, map, take } from 'rxjs';

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

/** Impide volver al login cuando ya existe una sesión activa. */
export const guestGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.authState$.pipe(
    take(1),
    map((user) => (user ? router.createUrlTree(['/home']) : true)),
  );
};