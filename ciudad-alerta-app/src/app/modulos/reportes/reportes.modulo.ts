import { addCircleOutline, documentTextOutline } from 'ionicons/icons';

import { authGuard } from '../../guards/auth-guard';
import { ModuloApp } from '../../nucleo/modulos/modulo.model';

/**
 * Crear reportes, ver los propios y el detalle de cualquier reporte.
 *
 * Código: todavía en src/app/pages (report, my-reports, report-detail). Se
 * muda a esta carpeta en la siguiente etapa; el manifiesto ya lo controla.
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
      loadComponent: () => import('../../pages/my-reports/my-reports.page').then((m) => m.MyReportsPage),
    },
    {
      // El parámetro llega al input `id` del componente (withComponentInputBinding).
      path: 'report/:id',
      canActivate: [authGuard],
      loadComponent: () =>
        import('../../pages/report-detail/report-detail.page').then((m) => m.ReportDetailPage),
    },
  ],
  accesos: [
    { id: 'crear-reporte', texto: 'Crear un reporte', icono: 'add-circle-outline', ruta: '/report-new', orden: 10, estilo: 'principal' },
    { id: 'mis-reportes', texto: 'Mis reportes', icono: 'document-text-outline', ruta: '/my-reports', orden: 40 },
  ],
  iconos: { 'add-circle-outline': addCircleOutline, 'document-text-outline': documentTextOutline },
};
