/**
 * @ciudad-alerta/comun · Lógica compartible entre la app móvil y el portal web.
 *
 * TypeScript puro: sin Angular, React, Ionic ni Firebase, y sin dependencias
 * en tiempo de ejecución. Cada aplicación pone la interfaz y el acceso a
 * datos; aquí van las reglas del negocio que deben dar lo mismo en ambas.
 * Ver LEEME.md.
 */

// Reportes
export * from './reportes/estados';
export * from './reportes/categorias';
export * from './reportes/descripcion';
export * from './reportes/tiempos';
export * from './reportes/gestion';
export * from './reportes/contacto';

// Sistema de confianza
export * from './confianza/parametros';
export * from './confianza/calculos';

// Territorio y geografía
export * from './territorio/texto';
export * from './territorio/codigos';
export * from './territorio/mapa-calor';
export * from './geo/cajas';
export * from './geo/distancia';

// Privacidad de las fotos
export * from './privacidad/parametros';
export * from './privacidad/geometria';

// Términos, privacidad y eliminación de cuenta
export * from './legal/terminos';
