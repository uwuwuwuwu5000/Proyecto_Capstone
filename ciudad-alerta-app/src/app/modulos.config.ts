import { EntradaModulo } from './nucleo/modulos/modulo.model';

import { MODULO_AVISOS } from './modulos/avisos/avisos.modulo';
import { MODULO_CERCANOS } from './modulos/cercanos/cercanos.modulo';
import { MODULO_CONFIANZA } from './modulos/confianza/confianza.modulo';
import { MODULO_GESTION_REPORTES } from './modulos/gestion-reportes/gestion-reportes.modulo';
import { MODULO_MAPA_INCIDENCIAS } from './modulos/mapa-incidencias/mapa-incidencias.modulo';
import { MODULO_MUNICIPALIDADES } from './modulos/municipalidades/municipalidades.modulo';
import { MODULO_REPORTES } from './modulos/reportes/reportes.modulo';
import { MODULO_SOPORTE } from './modulos/soporte/soporte.modulo';
import { MODULO_PERFIL } from './modulos/perfil/perfil.modulo';

/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  INTERRUPTOR DE MÓDULOS DE CIUDAD ALERTA                               ║
 * ║                                                                        ║
 * ║  Para quitar una funcionalidad: `activo: false`.                       ║
 * ║  Para volver a ponerla:        `activo: true`.                         ║
 * ║                                                                        ║
 * ║  Desaparecen o vuelven sus pantallas, sus botones del inicio y lo que  ║
 * ║  agrega a otras pantallas. No hay que tocar ningún otro archivo.       ║
 * ║                                                                        ║
 * ║  Módulo nuevo: `npm run modulo -- nuevo <id>` y agregarlo aquí.        ║
 * ║  Guía completa: GUIA_MODULOS.md                                        ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Las pantallas de acceso (login) e inicio (home) no son módulos: son el
 * esqueleto de la app y siempre están.
 *
 * El orden de esta lista no importa para el inicio (lo decide `orden` de
 * cada botón); solo define en qué orden se registran las rutas.
 */
export const CONFIG_MODULOS: readonly EntradaModulo[] = [
  { modulo: MODULO_REPORTES, activo: true },
  { modulo: MODULO_MAPA_INCIDENCIAS, activo: true },
  { modulo: MODULO_CERCANOS, activo: true },
  { modulo: MODULO_CONFIANZA, activo: true },
  { modulo: MODULO_AVISOS, activo: true },
  { modulo: MODULO_SOPORTE, activo: true },
  { modulo: MODULO_GESTION_REPORTES, activo: true },
  { modulo: MODULO_MUNICIPALIDADES, activo: true },
  { modulo: MODULO_PERFIL, activo: true },
];
