import { Routes } from '@angular/router';
import { authGuard, guestGuard, staffGuard } from './guards/auth-guard';

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
    // Formulario de creación de reportes.
    path: 'report-new',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/report/report.page').then((m) => m.ReportPage),
  },
  {
    // HU-25 · Mapa de incidencias del sector.
    path: 'map',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/map/map.page').then((m) => m.MapPage),
  },
  {
    // Reportes cercanos con radio seleccionable.
    path: 'nearby',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/nearby/nearby.page').then((m) => m.NearbyPage),
  },
  {
    // HU-27 · Historial del usuario.
    path: 'my-reports',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/my-reports/my-reports.page').then((m) => m.MyReportsPage),
  },
  {
    // HU-26 · Detalle. El parámetro llega al input `id` del componente.
    path: 'report/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/report-detail/report-detail.page').then((m) => m.ReportDetailPage),
  },
  {
    // Quejas y sugerencias del ciudadano.
    path: 'support',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/support/support.page').then((m) => m.SupportPage),
  },
  {
    path: 'support-new',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/support-new/support-new.page').then((m) => m.SupportNewPage),
  },
  {
    // Bandeja del equipo de soporte. Solo roles operador y admin.
    path: 'support-inbox',
    canActivate: [staffGuard],
    loadComponent: () =>
      import('./pages/support-inbox/support-inbox.page').then((m) => m.SupportInboxPage),
  },
  {
    // Chat compartido: lo abren tanto el ciudadano como el equipo de soporte.
    path: 'support/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/support-chat/support-chat.page').then((m) => m.SupportChatPage),
  },
  {
    path: '**',
    redirectTo: 'home',
  },
];
