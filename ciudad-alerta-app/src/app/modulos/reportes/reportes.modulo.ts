import { DestroyRef, EnvironmentInjector, inject, provideEnvironmentInitializer } from '@angular/core';
import { addCircleOutline, documentTextOutline } from 'ionicons/icons';

import { authGuard } from '../../guards/auth-guard';
import { ModuloApp } from '../../nucleo/modulos/modulo.model';
import { RANURAS } from '../../nucleo/modulos/ranuras';
import { providePhotoStorage } from './datos/photo-storage.providers';
import { RUTAS_REPORTES } from './rutas';

/**
 * Crear reportes, ver los propios y el detalle de cualquier reporte.
 *
 * Contenido:
 *  - paginas/report          crear un reporte (foto, ubicación, duplicados)
 *  - paginas/my-reports      historial propio
 *  - paginas/report-detail   detalle, confirmación y seguimiento
 *  - componentes/similar-reports, elegir-punto (marcar el reporte en el mapa)
 *  - datos/                  crear reportes (report.service), cámara, fotos
 *                            (photo-storage + providers), privacidad, similitud
 *                            de imágenes (TensorFlow), confirmaciones y duplicados,
 *                            borrador sin conexión y lo que el autor hace con
 *                            su reporte (mi-reporte)
 *  - resolucion.ts           textos de tiempo de respuesta y resolución (F12)
 *  - ubicacion.ts            quién puede elegir en el mapa dónde marcar el reporte
 *
 * El detalle deja las ranuras `detalle-reporte.verificacion` (la llena el
 * sistema de confianza) y `detalle-reporte.gestion` (la llena gestión de
 * reportes); las tarjetas, `tarjeta-reporte.insignias`. Pone «Tus reportes»
 * en la ranura `inicio.resumen` del inicio, y antes «Reporte por enviar» si
 * hay uno guardado sin señal.
 *
 * Registra PHOTO_STORAGE (dónde se guardan las fotos, según environment.ts) y
 * arranca BorradorService con la app, para enviar el borrador apenas vuelva
 * la señal aunque nadie abra el inicio.
 */
export const MODULO_REPORTES: ModuloApp = {
  id: 'reportes',
  nombre: 'Reportes',
  descripcion: 'Crear un reporte con foto y ubicación, ver mis reportes y el detalle de cualquier reporte.',
  opcionales: ['confianza', 'gestion-reportes'],
  proveedores: [
    providePhotoStorage(),
    // Carga diferida: el borrador y lo que usa no entran al paquete inicial.
    provideEnvironmentInitializer(() => {
      const injector = inject(EnvironmentInjector);
      let vivo = true;
      inject(DestroyRef).onDestroy(() => (vivo = false));
      void import('./datos/borrador.service')
        .then((m) => vivo && injector.get(m.BorradorService))
        .catch((error) => console.error('No se pudo iniciar el borrador sin conexión.', error));
    }),
  ],
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
  ranuras: [
    {
      // 1.0 · El reporte guardado sin señal, antes que todo lo demás.
      ranura: RANURAS.inicioResumen,
      orden: -10,
      cargar: () =>
        import('./componentes/borrador-pendiente/borrador-pendiente.component').then(
          (m) => m.BorradorPendienteComponent,
        ),
    },
    {
      // «Tus reportes» en el inicio: conteos y último movimiento.
      ranura: RANURAS.inicioResumen,
      orden: 0,
      cargar: () => import('./componentes/resumen-reportes.component').then((m) => m.ResumenReportesComponent),
    },
  ],
};
