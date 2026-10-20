import { personCircleOutline } from 'ionicons/icons';

import { authGuard } from '../../guards/auth-guard';
import { ModuloApp } from '../../nucleo/modulos/modulo.model';

/**
 * Mi perfil: datos de la cuenta, verificación del correo y cierre de sesión
 * (feedback Sprint 5). Para todos los roles.
 *
 * Contenido: paginas/mi-perfil, componentes/verificacion-correo (también lo
 * usa el recordatorio del inicio), datos/perfil.service.ts (organismo del
 * operador) y modelo.ts (nombres de los roles).
 *
 * Deja la ranura `perfil.resumen` (el sistema de confianza pone ahí el nivel).
 * Si se desactiva, el inicio sigue mostrando el correo y «Cerrar sesión».
 */
export const MODULO_PERFIL: ModuloApp = {
  id: 'perfil',
  nombre: 'Mi perfil',
  descripcion: 'Datos de la cuenta, verificación del correo y cierre de sesión.',
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
    },
  ],
  iconos: { 'person-circle-outline': personCircleOutline },
};
