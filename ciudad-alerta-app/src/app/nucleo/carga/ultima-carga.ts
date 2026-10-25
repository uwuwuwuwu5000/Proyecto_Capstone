/**
 * La última carga pedida gana.
 *
 * Cuando una pantalla vuelve a consultar al cambiar un filtro, la respuesta
 * de una consulta anterior puede llegar después que la nueva y dejar en
 * pantalla resultados que ya no corresponden (o, si se agregan a una lista,
 * mezclarse con los nuevos). Cada carga pide un número y, al recibir la
 * respuesta, pregunta si sigue siendo la última antes de aplicarla:
 *
 *   private readonly cargas = new UltimaCarga();
 *
 *   async cargar() {
 *     const vigente = this.cargas.nueva();
 *     const datos = await consultar();
 *     if (!vigente()) return;
 *     this.datos.set(datos);
 *   }
 *
 * «Ver más» sigue la carga en curso sin invalidarla: `this.cargas.actual()`.
 */
export class UltimaCarga {
  private numero = 0;

  /** Empieza una carga nueva: las anteriores dejan de estar vigentes. */
  nueva(): () => boolean {
    const propia = ++this.numero;
    return () => propia === this.numero;
  }

  /** Continúa la carga en curso (por ejemplo, la página siguiente). */
  actual(): () => boolean {
    const propia = this.numero;
    return () => propia === this.numero;
  }

  /** Invalida todo lo pendiente (al salir de la pantalla, por ejemplo). */
  cancelar(): void {
    this.numero++;
  }
}
