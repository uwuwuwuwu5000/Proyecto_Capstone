/**
 * Ranuras: lugares de una pantalla donde otro módulo puede poner algo.
 *
 * La pantalla dueña escribe `<app-ranura nombre="..." [entradas]="{...}">` y
 * no sabe qué módulo la llena. Si ningún módulo activo aporta a la ranura, se
 * muestra el contenido que la pantalla puso dentro de la etiqueta (o nada).
 *
 * Para crear una ranura nueva: agrégala aquí con su contrato de entradas, y
 * ponla en la pantalla. El componente que la llene debe declarar un `input()`
 * por cada entrada, con el mismo nombre.
 */
export const RANURAS = {
  /**
   * Detalle de un reporte, bloque de confirmación comunitaria.
   * Entradas: `reporte: Report`, `esAutor: boolean`,
   * `alConfirmar: (reporte: Report) => void`: la pieza la llama tras una
   * confirmación con el reporte actualizado, para que el detalle lo muestre.
   */
  detalleReporteVerificacion: 'detalle-reporte.verificacion',

  /**
   * Detalle de un reporte, al final: bloque de gestión (cambio de estado).
   * Entradas: `reporte: Report`, `alCambiar: (reporte: Report) => void`: la
   * pieza la llama tras cambiar el estado con el reporte actualizado, para que
   * el detalle lo muestre y recargue el seguimiento.
   */
  detalleReporteGestion: 'detalle-reporte.gestion',

  /**
   * Tarjeta de un reporte en cualquier listado (Mis reportes, Cerca de mí,
   * gestión). Entradas: `reporte: Report`. Debe ser una línea corta.
   */
  tarjetaReporteInsignias: 'tarjeta-reporte.insignias',

  /**
   * Pantalla de inicio, bajo los datos de la sesión.
   * Entradas: `perfil: UserProfile | null`.
   */
  inicioResumen: 'inicio.resumen',

  /**
   * «Mi perfil», bajo el nombre y el correo.
   * Entradas: `perfil: UserProfile | null`.
   */
  perfilResumen: 'perfil.resumen',

  /**
   * Botones de la barra superior, a la derecha del título (la campana de
   * avisos, por ejemplo). Sin entradas. Debe ser un `ion-button` pequeño.
   */
  cabeceraAcciones: 'cabecera.acciones',
} as const;

export type NombreRanura = (typeof RANURAS)[keyof typeof RANURAS];

export const NOMBRES_RANURAS: readonly NombreRanura[] = Object.values(RANURAS);
