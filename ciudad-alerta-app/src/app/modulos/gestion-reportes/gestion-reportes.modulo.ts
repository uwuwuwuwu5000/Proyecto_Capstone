import { albumsOutline } from 'ionicons/icons';

import { staffGuard } from '../../guards/auth-guard';
import { ModuloApp } from '../../nucleo/modulos/modulo.model';

/**
 * Bandeja de gestión: el admin ve todas las incidencias; el operador, las
 * asignadas a su organismo. Desde aquí se cambian estados.
 *
 * Contenido: paginas/admin-reports. Las tarjetas dejan la ranura
 * `tarjeta-reporte.insignias` (el sistema de confianza pone ahí su estado).
 */
export const MODULO_GESTION_REPORTES: ModuloApp = {
  id: 'gestion-reportes',
  nombre: 'Gestión de reportes',
  descripcion: 'Listado para operadores y administradores, con filtros y cambio de estado.',
  opcionales: ['confianza'],
  rutas: [
    {
      path: 'admin-reports',
      canActivate: [staffGuard],
      loadComponent: () => import('./paginas/admin-reports/admin-reports.page').then((m) => m.AdminReportsPage),
    },
  ],
  accesos: [
    {
      id: 'gestion-reportes',
      texto: 'Todas las incidencias',
      textoSegunRol: { operador: 'Reportes asignados' },
      icono: 'albums-outline',
      ruta: '/admin-reports',
      roles: ['operador', 'admin'],
      orden: 100,
      estilo: 'gestion',
    },
  ],
  iconos: { 'albums-outline': albumsOutline },
};
