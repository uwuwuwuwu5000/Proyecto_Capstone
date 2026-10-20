import { chatbubblesOutline, fileTrayFullOutline } from 'ionicons/icons';

import { authGuard, staffGuard } from '../../guards/auth-guard';
import { ModuloApp } from '../../nucleo/modulos/modulo.model';

/**
 * Quejas y sugerencias: el ciudadano abre tickets y conversa con el equipo;
 * el equipo los atiende desde su bandeja.
 *
 * Código: todavía en src/app/pages (support, support-new, support-chat, support-inbox).
 */
export const MODULO_SOPORTE: ModuloApp = {
  id: 'soporte',
  nombre: 'Quejas y sugerencias',
  descripcion: 'Tickets de soporte con chat entre el ciudadano y el equipo, y bandeja de atención para el staff.',
  rutas: [
    {
      path: 'support',
      canActivate: [authGuard],
      loadComponent: () => import('../../pages/support/support.page').then((m) => m.SupportPage),
    },
    {
      path: 'support-new',
      canActivate: [authGuard],
      loadComponent: () => import('../../pages/support-new/support-new.page').then((m) => m.SupportNewPage),
    },
    {
      // Chat compartido: lo abren tanto el ciudadano como el equipo de soporte.
      path: 'support/:id',
      canActivate: [authGuard],
      loadComponent: () => import('../../pages/support-chat/support-chat.page').then((m) => m.SupportChatPage),
    },
    {
      path: 'support-inbox',
      canActivate: [staffGuard],
      loadComponent: () => import('../../pages/support-inbox/support-inbox.page').then((m) => m.SupportInboxPage),
    },
  ],
  accesos: [
    { id: 'soporte', texto: 'Quejas y sugerencias', icono: 'chatbubbles-outline', ruta: '/support', orden: 50 },
    {
      id: 'bandeja-soporte',
      texto: 'Bandeja de soporte',
      icono: 'file-tray-full-outline',
      ruta: '/support-inbox',
      roles: ['operador', 'admin'],
      orden: 120,
      estilo: 'gestion',
    },
  ],
  iconos: { 'chatbubbles-outline': chatbubblesOutline, 'file-tray-full-outline': fileTrayFullOutline },
};
