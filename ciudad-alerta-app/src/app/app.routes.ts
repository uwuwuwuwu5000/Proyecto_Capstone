import { Routes } from '@angular/router';

import { CONFIG_MODULOS } from './modulos.config';
import { authGuard, guestGuard } from './guards/auth-guard';
import { rutasDeModulos } from './nucleo/modulos/registro';

/**
 * Rutas de la app. Solo las del esqueleto (login, inicio y términos) viven aquí; las de cada
 * funcionalidad las declara su módulo (`modulos/<id>/<id>.modulo.ts`) y se
 * suman solas si el módulo está activo en `modulos.config.ts`.
 *
 * Una ruta de un módulo desactivado cae en '**' y lleva al inicio, así que un
 * enlace viejo nunca deja una pantalla en blanco.
 */
export const routes: Routes = [
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
  {
    // CA-49 · Pantalla pública de acceso. guestGuard evita que un usuario
    // con sesión activa vuelva al login usando el botón atrás.
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
  },
  {
    // Términos de uso y privacidad: sin guard, se leen antes de registrarse.
    path: 'terminos',
    loadComponent: () => import('./pages/terminos/terminos.page').then((m) => m.TerminosPage),
  },
  {
    // CA-50 · Ruta privada protegida por el guard de autenticación.
    path: 'home',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage),
  },

  ...rutasDeModulos(CONFIG_MODULOS),

  {
    path: '**',
    redirectTo: 'home',
  },
];
