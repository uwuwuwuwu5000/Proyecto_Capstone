import { inject } from '@angular/core';

import { authGuard } from '../../guards/auth-guard';
import { esCuentaInstitucional } from '../../models/user-profile.model';
import { ModuloApp } from '../../nucleo/modulos/modulo.model';
import { BienvenidaService } from './datos/bienvenida.service';

/**
 * Bienvenida (1.0): tres pantallas la primera vez que se entra al inicio en
 * un teléfono: cómo reportar, cómo seguir el reporte y cómo funciona la
 * confianza. Se puede saltar, y volver a verla desde Configuración.
 *
 * Se abre con `alEntrarAlInicio`: el inicio la pide después de los términos.
 * Las cuentas operador no la ven (no reportan). Si se desactiva, el inicio
 * abre directo.
 */
export const MODULO_BIENVENIDA: ModuloApp = {
  id: 'bienvenida',
  nombre: 'Bienvenida',
  descripcion: 'Tres pantallas la primera vez: cómo reportar, cómo seguir el reporte y cómo funciona la confianza.',
  // La tercera pantalla habla del sistema de confianza si está activo.
  opcionales: ['confianza'],
  rutas: [
    {
      path: 'bienvenida',
      canActivate: [authGuard],
      loadComponent: () => import('./paginas/bienvenida/bienvenida.page').then((m) => m.BienvenidaPage),
    },
  ],
  // La bienvenida explica cómo reportar y confirmar: no es para las cuentas
  // de operador ni de organismo.
  alEntrarAlInicio: (perfil) =>
    esCuentaInstitucional(perfil?.role) || inject(BienvenidaService).vista() ? null : '/bienvenida',
};
