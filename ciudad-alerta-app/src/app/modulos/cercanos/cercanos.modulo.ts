import { navigateOutline } from 'ionicons/icons';

import { authGuard } from '../../guards/auth-guard';
import { ModuloApp } from '../../nucleo/modulos/modulo.model';

/**
 * Lista de reportes ordenada por distancia, con radio seleccionable.
 *
 * Código: todavía en src/app/pages/nearby.
 */
export const MODULO_CERCANOS: ModuloApp = {
  id: 'cercanos',
  nombre: 'Cerca de mí',
  descripcion: 'Reportes alrededor del usuario, ordenados por distancia, con radio de 500 m a 5 km.',
  opcionales: ['confianza'],
  rutas: [
    {
      path: 'nearby',
      canActivate: [authGuard],
      loadComponent: () => import('../../pages/nearby/nearby.page').then((m) => m.NearbyPage),
    },
  ],
  accesos: [{ id: 'cercanos', texto: 'Cerca de mí', icono: 'navigate-outline', ruta: '/nearby', orden: 30 }],
  iconos: { 'navigate-outline': navigateOutline },
};
