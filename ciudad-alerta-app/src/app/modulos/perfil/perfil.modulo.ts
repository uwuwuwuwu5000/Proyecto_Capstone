import { personCircleOutline } from 'ionicons/icons';

import { authGuard } from '../../guards/auth-guard';
import { ModuloApp } from '../../nucleo/modulos/modulo.model';
import { RANURAS } from '../../nucleo/modulos/ranuras';

/**
 * Mi perfil: datos de la cuenta, verificación del correo y cierre de sesión
 * (feedback Sprint 5), y eliminar la cuenta (1.0, datos/eliminar-cuenta.service.ts).
 * Para todos los roles.
 *
 * Contenido: paginas/mi-perfil, componentes/verificacion-correo,
 * componentes/aviso-verificacion (recordatorio en el inicio, ranura
 * `inicio.resumen`), datos/perfil.service.ts (organismo del operador) y
 * modelo.ts (nombres de los roles).
 *
 * Deja la ranura `perfil.resumen` (el sistema de confianza pone ahí el nivel).
 * Si se desactiva, el inicio sigue mostrando el correo y «Cerrar sesión»,
 * pero no hay dónde verificar el correo.
 */
export const MODULO_PERFIL: ModuloApp = {
  id: 'perfil',
  nombre: 'Mi perfil',
  descripcion: 'Datos de la cuenta, verificación del correo, cierre de sesión y eliminar la cuenta.',
  rutas: [
    {
      path: 'perfil',
      canActivate: [authGuard],
      loadComponent: () => import('./paginas/mi-perfil/mi-perfil.page').then((m) => m.MiPerfilPage),
    },
  ],
  accesos: [
    {
      id: 'perfil',
      texto: 'Mi perfil',
      icono: 'person-circle-outline',
      ruta: '/perfil',
      orden: 90,
      paraOrganismo: true,
    },
  ],
  iconos: { 'person-circle-outline': personCircleOutline },
  ranuras: [
    {
      // Antes que la tarjeta de nivel: verificar el correo es más urgente.
      ranura: RANURAS.inicioResumen,
      orden: -10,
      cargar: () => import('./componentes/aviso-verificacion.component').then((m) => m.AvisoVerificacionComponent),
    },
  ],
};
