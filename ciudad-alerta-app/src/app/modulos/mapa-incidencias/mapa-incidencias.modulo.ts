import { mapOutline } from 'ionicons/icons';

import { authGuard } from '../../guards/auth-guard';
import { ModuloApp } from '../../nucleo/modulos/modulo.model';

/**
 * Mapa de incidencias de una región completa: parte en la región donde está
 * el usuario y permite elegir cualquier otra. Cada reporte se dibuja en sus
 * coordenadas; los que coinciden se agrupan (casos MS8 y MS9).
 *
 * El componente de mapa en sí (Leaflet) es compartido y vive en
 * `compartido/mapa`: este módulo es solo la pantalla.
 */
export const MODULO_MAPA_INCIDENCIAS: ModuloApp = {
  id: 'mapa-incidencias',
  nombre: 'Mapa de incidencias',
  descripcion: 'Mapa con todas las incidencias de tu región o de la región que elijas, con filtros por categoría y estado.',
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
