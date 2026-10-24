import { Injectable, OnDestroy, computed, signal, untracked } from '@angular/core';

/** Lo más que una pantalla espera antes de mostrarse con lo que tenga. */
export const ESPERA_MAXIMA_MS = 2500;

/** Una parte de la pantalla que avisa cuando ya tiene sus datos. */
export interface TareaDeCarga {
  /** Vuelve a quedar pendiente (por ejemplo, al recargar con otra cuenta). */
  pendiente(): void;
  /** Ya tiene sus datos, o no los tendrá. Se puede llamar más de una vez. */
  listo(): void;
}

/**
 * Espera a que las partes de una pantalla tengan sus datos para mostrarla
 * entera, en vez de que cada tarjeta aparezca cuando le llegan los suyos.
 *
 * La pantalla la declara en sus `providers` y, mientras `lista()` sea falso,
 * muestra un aviso de carga. Cada parte —la pantalla misma, cada ranura
 * mientras descarga sus piezas y cada pieza mientras lee Firestore— se
 * registra con `registrar()` y llama `listo()` al terminar:
 *
 *   private readonly carga = inject(EsperaDePantalla, { optional: true })?.registrar('Tus reportes');
 *   …
 *   this.carga?.listo();
 *
 * Con `optional: true` la pieza funciona igual en pantallas que no esperan.
 *
 * Una vez lista, queda lista: si una pieza vuelve a cargar al regresar a la
 * pantalla, se actualiza en su lugar sin ocultar nada. Si algo tarda más de
 * ESPERA_MAXIMA_MS (sin red, por ejemplo), la pantalla se muestra igual y lo
 * que falte aparece cuando llegue.
 */
@Injectable()
export class EsperaDePantalla implements OnDestroy {
  private readonly pendientes = signal<ReadonlySet<symbol>>(new Set());
  private readonly agotada = signal(false);
  private readonly mostrada = signal(false);
  private temporizador: ReturnType<typeof setTimeout> | null = null;

  /**
   * Verdadero cuando la última parte pendiente avisó que terminó, o se acabó
   * el tiempo. La pantalla debe registrarse a sí misma al crearse: sin
   * ninguna parte registrada, solo se muestra al agotarse el tiempo.
   */
  readonly lista = computed(() => this.mostrada() || this.agotada());

  constructor() {
    this.armarTemporizador();
  }

  /** Registra una parte que todavía no tiene sus datos. */
  registrar(nombre: string): TareaDeCarga {
    const clave = Symbol(nombre);
    untracked(() => this.agregar(clave));

    // untracked: las piezas avisan desde sus effect(), y leer estas señales
    // ahí haría que el effect se repitiera cada vez que otra pieza termina.
    return {
      pendiente: () =>
        untracked(() => {
          if (!this.lista()) this.agregar(clave);
        }),
      listo: () =>
        untracked(() => {
          if (!this.pendientes().has(clave)) return;
          const resto = new Set(this.pendientes());
          resto.delete(clave);
          this.pendientes.set(resto);
          if (resto.size === 0) this.fijar();
        }),
    };
  }

  /**
   * Vuelve a esperar desde cero (otra cuenta en la misma pantalla). Después,
   * cada parte que vuelva a cargar llama `pendiente()`.
   */
  reiniciar(): void {
    untracked(() => {
      this.pendientes.set(new Set());
      this.mostrada.set(false);
      this.agotada.set(false);
    });
    this.armarTemporizador();
  }

  /** Nombres de lo que falta, para depurar. */
  faltan(): string[] {
    return [...this.pendientes()].map((clave) => clave.description ?? '?');
  }

  ngOnDestroy(): void {
    if (this.temporizador) clearTimeout(this.temporizador);
  }

  private agregar(clave: symbol): void {
    if (this.pendientes().has(clave)) return;
    this.pendientes.set(new Set([...this.pendientes(), clave]));
  }

  private fijar(): void {
    this.mostrada.set(true);
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
  }

  private armarTemporizador(): void {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => {
      this.temporizador = null;
      if (!this.lista() && this.pendientes().size > 0) {
        console.warn('La pantalla se mostró sin esperar a:', this.faltan().join(', '));
      }
      this.agotada.set(true);
      this.mostrada.set(true);
    }, ESPERA_MAXIMA_MS);
  }
}
