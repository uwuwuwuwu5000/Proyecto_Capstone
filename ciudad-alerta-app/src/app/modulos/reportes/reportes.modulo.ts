import { addCircleOutline, documentTextOutline } from 'ionicons/icons';

import { authGuard } from '../../guards/auth-guard';
import { ModuloApp } from '../../nucleo/modulos/modulo.model';

/**
 * Crear reportes, ver los propios y el detalle de cualquier reporte.
 *
 * Contenido:
 *  - paginas/report          crear un reporte (foto, ubicación, duplicados)
 *  - paginas/my-reports      historial propio
 *  - paginas/report-detail   detalle, confirmación y gestión de estado
 *  - componentes/similar-reports
 *  - datos/confirmation.service.ts y datos/duplicate-detection.service.ts
 *
 * El detalle deja la ranura `detalle-reporte.verificacion` y las tarjetas
 * `tarjeta-reporte.insignias`; el sistema de confianza las llena si está activo.
 */
export const MODULO_REPORTES: ModuloApp = {
  id: 'reportes',
  nombre: 'Reportes',
  descripcion: 'Crear un reporte con foto y ubicación, ver mis reportes y el detalle de cualquier reporte.',
  opcionales: ['confianza'],
  rutas: [
    {
      path: 'report-new',
      canActivate: [authGuard],
      loadComponent: () => import('./paginas/report/report.page').then((m) => m.ReportPage),
    },
    {
      path: 'my-reports',
      canActivate: [authGuard],
      loadComponent: () => import('./paginas/my-reports/my-reports.page').then((m) => m.MyReportsPage),
    },
    {
      // El parámetro llega al input `id` del componente (withComponentInputBinding).
      path: 'report/:id',
      canActivate: [authGuard],
      loadComponent: () =>
        import('./paginas/report-detail/report-detail.page').then((m) => m.ReportDetailPage),
    },
  ],
  accesos: [
    { id: 'crear-reporte', texto: 'Crear un reporte', icono: 'add-circle-outline', ruta: '/report-new', orden: 10, estilo: 'principal' },
    { id: 'mis-reportes', texto: 'Mis reportes', icono: 'document-text-outline', ruta: '/my-reports', orden: 40 },
  ],
  iconos: { 'add-circle-outline': addCircleOutline, 'document-text-outline': documentTextOutline },
};
