/**
 * API pública del módulo de reportes. Un módulo que la use debe declarar
 * `requiere: ['reportes']` (o `opcionales`) en su manifiesto.
 */
export { MODULO_REPORTES } from './reportes.modulo';
export { RUTAS_REPORTES } from './rutas';
// Configuración muestra el estado del servicio que difumina las fotos.
export { PrivacidadService } from './datos/privacidad.service';
export type { EstadoServicioPrivacidad } from './datos/privacidad.service';
export { PARAMETROS_PRIVACIDAD } from './parametros';
