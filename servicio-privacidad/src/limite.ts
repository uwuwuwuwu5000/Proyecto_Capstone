/**
 * Límite de fotos por usuario en una ventana deslizante, en memoria. Con una
 * sola instancia (plan gratuito) alcanza; evita que una cuenta use el servicio
 * para procesar imágenes sin parar.
 */
export class LimitePorUsuario {
  private readonly usos = new Map<string, number[]>();

  constructor(
    private readonly maximo: number,
    private readonly ventanaMs: number,
    private readonly ahora: () => number = Date.now,
  ) {}

  /** true si el usuario puede procesar otra foto (y la cuenta). */
  permitir(uid: string): boolean {
    const desde = this.ahora() - this.ventanaMs;
    const recientes = (this.usos.get(uid) ?? []).filter((t) => t > desde);

    if (recientes.length >= this.maximo) {
      this.usos.set(uid, recientes);
      return false;
    }

    recientes.push(this.ahora());
    this.usos.set(uid, recientes);

    // Limpieza ocasional para que el mapa no crezca sin límite.
    if (this.usos.size > 5_000) {
      for (const [clave, tiempos] of this.usos) {
        if (!tiempos.some((t) => t > desde)) this.usos.delete(clave);
      }
    }
    return true;
  }

  /** Segundos hasta que el usuario pueda volver a intentar. */
  esperaSegundos(uid: string): number {
    const tiempos = this.usos.get(uid) ?? [];
    if (tiempos.length < this.maximo) return 0;
    const masAntiguo = tiempos[tiempos.length - this.maximo];
    return Math.max(1, Math.ceil((masAntiguo + this.ventanaMs - this.ahora()) / 1000));
  }
}
