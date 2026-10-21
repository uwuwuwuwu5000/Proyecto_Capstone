import { inject, provideEnvironmentInitializer } from '@angular/core';

import { authGuard } from '../../guards/auth-guard';
import { ModuloApp } from '../../nucleo/modulos/modulo.model';
import { RANURAS } from '../../nucleo/modulos/ranuras';
import { AvisosService } from './datos/avisos.service';

/**
 * Campana y lista de avisos de cambios en los reportes propios.
 *
 * El servicio se crea al arrancar la app (antes lo forzaba AppComponent) para
 * que la campana tenga el contador desde la primera pantalla. La campana llega
 * a cada pantalla por la ranura `cabecera.acciones`: si el módulo se
 * desactiva, simplemente no aparece.
 *
 * Contenido: paginas/avisos (la lista), componentes/avisos-campana,
 * datos/avisos.service.ts (escucha los reportes propios) y modelo/.
 */
export const MODULO_AVISOS: ModuloApp = {
  id: 'avisos',
  nombre: 'Avisos',
  descripcion: 'Campana con el número de avisos y lista de cambios de estado en los reportes propios.',
  // Cada aviso abre el detalle del reporte.
  requiere: ['reportes'],
  rutas: [
    {
      path: 'avisos',
      canActivate: [authGuard],
      loadComponent: () => import('./paginas/avisos/avisos.page').then((m) => m.AvisosPage),
    },
  ],
  ranuras: [
    {
      // La campana va en la barra superior de las pantallas que dejan la ranura.
      ranura: RANURAS.cabeceraAcciones,
      cargar: () =>
        import('./componentes/avisos-campana.component').then((m) => m.AvisosCampanaComponent),
    },
  ],
  proveedores: [provideEnvironmentInitializer(() => void inject(AvisosService))],
};
