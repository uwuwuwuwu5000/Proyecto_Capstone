import { settingsOutline } from 'ionicons/icons';

import { authGuard } from '../../guards/auth-guard';
import { ModuloApp } from '../../nucleo/modulos/modulo.model';
import { RANURAS } from '../../nucleo/modulos/ranuras';

/**
 * Configuración de la app en este teléfono, para todos los roles: tema,
 * tamaño del texto, animaciones, pantalla al abrir, ahorro de datos en las
 * fotos y el estado del servicio que las protege. Para el equipo (operador y
 * administrador), además, la versión, el proyecto y los módulos activos.
 *
 * Contenido: paginas/configuracion y componentes/boton-configuracion (el
 * engranaje de la barra superior, ranura `cabecera.acciones`). Las
 * preferencias viven en services/preferencias.service.ts porque las leen
 * otras partes de la app (la cámara, el inicio).
 *
 * No escribe en Firestore: todo queda en el teléfono.
 */
export const MODULO_CONFIGURACION: ModuloApp = {
  id: 'configuracion',
  nombre: 'Configuración',
  descripcion: 'Tema, texto, animaciones, pantalla al abrir, ahorro de datos y estado del servicio de fotos; datos técnicos para el equipo.',
  // Estado del servicio de fotos (reportes), enlace a Mi perfil y a la bienvenida, si están activos.
  opcionales: ['reportes', 'perfil', 'bienvenida'],
  rutas: [
    {
      path: 'configuracion',
      canActivate: [authGuard],
      loadComponent: () => import('./paginas/configuracion/configuracion.page').then((m) => m.ConfiguracionPage),
    },
  ],
  accesos: [
    {
      id: 'configuracion',
      texto: 'Configuración',
      icono: 'settings-outline',
      ruta: '/configuracion',
      // Junto a «Mi perfil», en «Tu cuenta».
      orden: 95,
    },
  ],
  iconos: { 'settings-outline': settingsOutline },
  ranuras: [
    {
      // Después de la campana de avisos.
      ranura: RANURAS.cabeceraAcciones,
      orden: 10,
      cargar: () =>
        import('./componentes/boton-configuracion.component').then((m) => m.BotonConfiguracionComponent),
    },
  ],
};
