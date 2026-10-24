import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

/** Lo que dura el fundido de salida (igual que en index.html). */
const FUNDIDO_MS = 350;

/**
 * Pantalla de arranque: el logo y la barra de `#arranque` en index.html, que
 * se ven desde que se abre la app hasta que la primera pantalla está lista.
 *
 * Sin ella, mientras Angular arranca, Firebase confirma la sesión y el
 * inicio descarga sus piezas, se veía una pantalla vacía y luego cada parte
 * aparecía por su cuenta. El inicio llama `terminar()` cuando tiene todo
 * (EsperaDePantalla); las demás pantallas, AppComponent apenas se dibujan.
 *
 * index.html la quita sola a los 8 s por si algo falla antes.
 */
@Injectable({ providedIn: 'root' })
export class ArranqueService {
  private readonly documento = inject(DOCUMENT);
  private terminado = false;

  /** Quita la pantalla de arranque con un fundido. Solo la primera vez hace algo. */
  terminar(): void {
    if (this.terminado) return;
    this.terminado = true;

    const arranque = this.documento.getElementById('arranque');
    if (!arranque) return;

    arranque.classList.add('arranque--fuera');
    setTimeout(() => arranque.remove(), FUNDIDO_MS);
  }
}
