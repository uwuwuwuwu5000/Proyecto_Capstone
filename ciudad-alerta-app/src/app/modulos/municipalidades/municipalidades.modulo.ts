import { businessOutline } from 'ionicons/icons';

import { staffGuard } from '../../guards/auth-guard';
import { ModuloApp } from '../../nucleo/modulos/modulo.model';

/**
 * Catálogo de municipalidades: consulta y recarga del catálogo oficial.
 *
 * El feedback del Sprint 5 propone quitarlo de la app (el catálogo ya está
 * cargado) y reemplazarlo por un mapa de calor. Para quitarlo basta con
 * `activo: false` en modulos.config.ts.
 *
 * Código: todavía en src/app/pages/admin-organismos.
 */
export const MODULO_MUNICIPALIDADES: ModuloApp = {
  id: 'municipalidades',
  nombre: 'Municipalidades',
  descripcion: 'Consulta y carga del catálogo de las 345 municipalidades para el personal de gestión.',
  rutas: [
    {
      path: 'admin-organismos',
      canActivate: [staffGuard],
      loadComponent: () =>
        import('../../pages/admin-organismos/admin-organismos.page').then((m) => m.AdminOrganismosPage),
    },
  ],
  accesos: [
    {
      id: 'municipalidades',
      texto: 'Municipalidades',
      icono: 'business-outline',
      ruta: '/admin-organismos',
      roles: ['operador', 'admin'],
      orden: 110,
      estilo: 'gestion',
    },
  ],
  iconos: { 'business-outline': businessOutline },
};
