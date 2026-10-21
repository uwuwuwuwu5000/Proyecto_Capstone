/**
 * Rutas de las pantallas de reportes, para que los demás módulos naveguen
 * sin escribir la dirección a mano. Si una ruta cambia, se cambia aquí y en
 * el manifiesto (una prueba comprueba que coincidan).
 *
 *   this.router.navigate(RUTAS_REPORTES.detalle(id));
 *   <a [routerLink]="rutas.detalle(id)">…</a>
 */
export const RUTAS_REPORTES = {
  crear: '/report-new',
  mios: '/my-reports',
  /** Detalle de un reporte, como arreglo para `router.navigate` o `[routerLink]`. */
  detalle: (id: string): string[] => ['/report', id],
} as const;
