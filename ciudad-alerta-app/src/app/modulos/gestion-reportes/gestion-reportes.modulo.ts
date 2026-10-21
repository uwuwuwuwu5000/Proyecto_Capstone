import { albumsOutline } from 'ionicons/icons';

import { staffGuard } from '../../guards/auth-guard';
import { ModuloApp } from '../../nucleo/modulos/modulo.model';
import { RANURAS } from '../../nucleo/modulos/ranuras';

/**
 * Gestión de reportes para operadores y administradores.
 *
 * - paginas/admin-reports: bandeja; el admin ve todas las incidencias y el
 *   operador las asignadas a su organismo. Sus tarjetas dejan la ranura
 *   `tarjeta-reporte.insignias` (el sistema de confianza pone ahí su estado).
 * - componentes/gestion-reporte: bloque «Gestión» del detalle de un reporte
 *   (ranura `detalle-reporte.gestion`), con el cambio de estado.
 * - datos/cambio-estado.service: el cambio de estado con su historial.
 *
 * Al desactivarlo, nadie puede cambiar estados desde la app.
 */
export const MODULO_GESTION_REPORTES: ModuloApp = {
  id: 'gestion-reportes',
  nombre: 'Gestión de reportes',
  descripcion: 'Listado para operadores y administradores, con filtros y cambio de estado.',
  // La bandeja abre el detalle, donde está la ranura de gestión.
  requiere: ['reportes'],
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
  ranuras: [
    {
      ranura: RANURAS.detalleReporteGestion,
      cargar: () =>
        import('./componentes/gestion-reporte/gestion-reporte.component').then((m) => m.GestionReporteComponent),
    },
  ],
};
