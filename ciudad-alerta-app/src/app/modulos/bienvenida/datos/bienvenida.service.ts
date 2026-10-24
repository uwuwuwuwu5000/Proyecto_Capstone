import { Injectable } from '@angular/core';

const CLAVE = 'ca.bienvenida.vista';

/**
 * Si esta persona ya vio la bienvenida en este teléfono. Se guarda en el
 * teléfono con el prefijo `ca.`, así que «Borrar datos guardados» en
 * Configuración la vuelve a mostrar, como las demás ayudas.
 */
@Injectable({ providedIn: 'root' })
export class BienvenidaService {
  vista(): boolean {
    try {
      return localStorage.getItem(CLAVE) === '1';
    } catch {
      // Sin almacenamiento no se insiste: mejor no mostrarla en cada entrada.
      return true;
    }
  }

  marcarVista(): void {
    try {
      localStorage.setItem(CLAVE, '1');
    } catch {
      // Vale para esta sesión.
    }
  }
}
