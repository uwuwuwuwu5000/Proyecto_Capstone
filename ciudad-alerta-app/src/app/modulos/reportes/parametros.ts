/**
 * Números y direcciones ajustables del módulo de reportes.
 */
export const PARAMETROS_PRIVACIDAD = {
  /**
   * Servicio que difumina rostros y personas (carpeta servicio-privacidad/ del
   * repositorio, publicado en Render). Sin barra al final. Si Render le dio
   * otra dirección al servicio, se cambia aquí.
   */
  url: 'https://ciudad-alerta-privacidad.onrender.com',

  /**
   * Espera máxima por foto. El plan gratuito de Render duerme el servicio tras
   * 15 minutos sin uso y despertarlo toma entre 30 y 60 segundos.
   */
  tiempoMaximoMs: 90_000,

  /** Desde cuándo se avisa que el servicio está despertando. */
  avisoLentoMs: 6_000,
} as const;
