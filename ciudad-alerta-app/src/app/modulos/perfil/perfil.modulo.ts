import { appsOutline } from 'ionicons/icons';

import { authGuard } from '../../guards/auth-guard';
import { ModuloApp } from '../../nucleo/modulos/modulo.model';

/**
 * Mi perfil.
 *
 * Qué hace y para quién: (escríbelo aquí; aparece en `npm run modulos`).
 */
export const MODULO_PERFIL: ModuloApp = {
  id: 'perfil',
  nombre: 'Mi perfil',
  descripcion: 'Describe en una frase qué hace este módulo.',
  // requiere: ['otro-modulo'],   // módulos sin los que este no funciona
  // opcionales: ['confianza'],   // módulos que usa si están activos
  rutas: [
    {
      path: 'perfil',
      canActivate: [authGuard],
      loadComponent: () => import('./paginas/perfil/perfil.page').then((m) => m.PerfilPage),
    },
  ],
  accesos: [
    {
      id: 'perfil',
      texto: 'Mi perfil',
      icono: 'apps-outline',
      ruta: '/perfil',
      orden: 60,
    },
  ],
  iconos: { 'apps-outline': appsOutline },
};
