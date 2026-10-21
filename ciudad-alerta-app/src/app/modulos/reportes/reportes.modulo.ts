import { addCircleOutline, documentTextOutline } from 'ionicons/icons';

import { authGuard } from '../../guards/auth-guard';
import { ModuloApp } from '../../nucleo/modulos/modulo.model';
import { providePhotoStorage } from './datos/photo-storage.providers';
import { RUTAS_REPORTES } from './rutas';

/**
 * Crear reportes, ver los propios y el detalle de cualquier reporte.
 *
 * Contenido:
 *  - paginas/report          crear un reporte (foto, ubicación, duplicados)
 *  - paginas/my-reports      historial propio
 *  - paginas/report-detail   detalle, confirmación y seguimiento
 *  - componentes/similar-reports
 *  - datos/                  crear reportes (report.service), cámara, fotos
 *                            (photo-storage + providers), privacidad, similitud
 *                            de imágenes (TensorFlow), confirmaciones y duplicados
 *  - resolucion.ts           textos de tiempo de respuesta y resolución (F12)
 *
 * El detalle deja las ranuras `detalle-reporte.verificacion` (la llena el
 * sistema de confianza) y `detalle-reporte.gestion` (la llena gestión de
 * reportes); las tarjetas, `tarjeta-reporte.insignias`.
 *
 * Registra PHOTO_STORAGE (dónde se guardan las fotos, según environment.ts).
 */
export const MODULO_REPORTES: ModuloApp = {
  id: 'reportes',
  nombre: 'Reportes',
  descripcion: 'Crear un reporte con foto y ubicación, ver mis reportes y el detalle de cualquier reporte.',
  opcionales: ['confianza', 'gestion-reportes'],
  proveedores: [providePhotoStorage()],
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
    {
      id: 'crear-reporte',
      texto: 'Crear un reporte',
      icono: 'add-circle-outline',
      ruta: RUTAS_REPORTES.crear,
      orden: 10,
      estilo: 'principal',
    },
    { id: 'mis-reportes', texto: 'Mis reportes', icono: 'document-text-outline', ruta: RUTAS_REPORTES.mios, orden: 40 },
  ],
  iconos: { 'add-circle-outline': addCircleOutline, 'document-text-outline': documentTextOutline },
};
