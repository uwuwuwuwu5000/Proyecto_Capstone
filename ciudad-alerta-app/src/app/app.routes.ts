import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './guards/auth-guard';

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
    loadComponent: () =>
      import('./pages/login/login.page').then((m) => m.LoginPage),
  },
  {
    // CA-50 · Ruta privada protegida por el guard de autenticación.
    path: 'home',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage),
  },
  {
    path: '**',
    redirectTo: 'home',
  },
];