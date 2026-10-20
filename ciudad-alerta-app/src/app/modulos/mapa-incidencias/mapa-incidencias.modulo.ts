import { mapOutline } from 'ionicons/icons';

import { authGuard } from '../../guards/auth-guard';
import { ModuloApp } from '../../nucleo/modulos/modulo.model';

/**
 * Mapa de incidencias para explorar cualquier sector: parte en la ubicación
 * del usuario y busca en la zona que esté a la vista.
 *
 * El componente de mapa en sí (Leaflet) es compartido y vive en
 * `compartido/mapa`: este módulo es solo la pantalla.
 */
export const MODULO_MAPA_INCIDENCIAS: ModuloApp = {
  id: 'mapa-incidencias',
  nombre: 'Mapa de incidencias',
  descripcion: 'Mapa con los reportes de la zona visible, filtros por categoría y estado, y «Buscar en esta zona».',
  // Con confianza activo, los reportes validados se ven destacados.
  opcionales: ['confianza'],
  rutas: [
    {
      path: 'map',
      canActivate: [authGuard],
      loadComponent: () => import('./paginas/mapa/mapa.page').then((m) => m.MapaPage),
    },
  ],
  accesos: [
    { id: 'mapa-incidencias', texto: 'Mapa de incidencias', icono: 'map-outline', ruta: '/map', orden: 20 },
  ],
  iconos: { 'map-outline': mapOutline },
};
