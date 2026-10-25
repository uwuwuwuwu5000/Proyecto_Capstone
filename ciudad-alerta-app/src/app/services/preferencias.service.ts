import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

/** «Sistema» sigue la opción de reducir movimiento del teléfono. */
export type PreferenciaAnimaciones = 'sistema' | 'si' | 'no';
export type TamanoTexto = 'normal' | 'grande' | 'muy-grande';

/**
 * Preferencias de esta persona en este teléfono (Configuración). No viajan a
 * Firestore: cada teléfono tiene las suyas y no necesitan reglas.
 */
export interface Preferencias {
  animaciones: PreferenciaAnimaciones;
  texto: TamanoTexto;
  /** Fotos más livianas para gastar menos datos móviles. */
  ahorroDatos: boolean;
  /**
   * Pantalla que se abre al iniciar la app (la ruta de un botón del inicio).
   * null = el inicio.
   */
  abrirEn: string | null;
}

export const PREFERENCIAS_INICIALES: Readonly<Preferencias> = {
  animaciones: 'sistema',
  texto: 'normal',
  ahorroDatos: false,
  abrirEn: null,
};

/** Tamaño y calidad de las fotos antes de enviarlas. */
export interface CalidadDeFoto {
  /** Lado mayor en píxeles. */
  lado: number;
  /** Calidad JPEG, de 0 a 1. */
  calidad: number;
}

export const FOTO_NORMAL: CalidadDeFoto = { lado: 1024, calidad: 0.6 };
export const FOTO_AHORRO: CalidadDeFoto = { lado: 800, calidad: 0.5 };

const CLAVE = 'ciudad-alerta.preferencias';

/**
 * Lo que la app guarda en el teléfono además de la sesión de Firebase. Borrar
 * los datos locales quita estas claves y deja la sesión y el tema.
 */
const PREFIJOS_LOCALES = ['ca.', 'ciudad-alerta.'];
const CLAVES_QUE_SE_CONSERVAN = [CLAVE, 'ciudad-alerta.tema'];

/**
 * Lo que la persona todavía no termina: el reporte guardado sin señal
 * (CLAVE_BORRADOR de modulos/reportes/datos/borrador.service.ts). No es una
 * copia que se pueda volver a bajar; se descarta desde su tarjeta del inicio.
 */
const CLAVES_PENDIENTES = ['ca.reportes.borrador'];

/**
 * Preferencias de Configuración, compartidas por toda la app.
 *
 * Las que cambian cómo se ve (texto y animaciones) se aplican con clases en
 * <html>; index.html las aplica también antes de que arranque Angular para
 * que no se vea un salto. Las demás las lee quien las usa: la cámara
 * (ahorro de datos) y el inicio (pantalla al abrir).
 */
@Injectable({ providedIn: 'root' })
export class PreferenciasService {
  private readonly documento = inject(DOCUMENT);

  readonly valores = signal<Preferencias>(leer());

  readonly foto = computed<CalidadDeFoto>(() => (this.valores().ahorroDatos ? FOTO_AHORRO : FOTO_NORMAL));

  /** Si ya se abrió la pantalla elegida en este arranque (solo una vez). */
  private pantallaInicialUsada = false;

  constructor() {
    this.aplicar(this.valores());
  }

  cambiar<K extends keyof Preferencias>(clave: K, valor: Preferencias[K]): void {
    const nuevas = { ...this.valores(), [clave]: valor };
    this.valores.set(nuevas);
    this.aplicar(nuevas);
    guardar(nuevas);
  }

  /** Vuelve a lo de fábrica. */
  restablecer(): void {
    this.valores.set({ ...PREFERENCIAS_INICIALES });
    this.aplicar(this.valores());
    guardar(this.valores());
  }

  /**
   * La pantalla que se debe abrir ahora, la primera vez que se entra al
   * inicio en este arranque; null las demás veces o si es el inicio.
   */
  tomarPantallaInicial(): string | null {
    if (this.pantallaInicialUsada) return null;
    this.pantallaInicialUsada = true;
    return this.valores().abrirEn;
  }

  /**
   * Borra lo que la app guardó en este teléfono (copia del nivel de
   * confianza, ayudas ya vistas). No cierra la sesión ni cambia la
   * configuración. Devuelve cuántos datos borró.
   *
   * El reporte que espera señal se conserva: antes se perdía sin aviso, con
   * su foto, aunque el diálogo no lo mencionaba. Solo al eliminar la cuenta
   * (`tambienLoPendiente`) se va también, porque ya no hay quién lo envíe.
   */
  borrarDatosLocales(opciones: { tambienLoPendiente?: boolean } = {}): number {
    const conservar = opciones.tambienLoPendiente ? CLAVES_QUE_SE_CONSERVAN : [...CLAVES_QUE_SE_CONSERVAN, ...CLAVES_PENDIENTES];
    try {
      const claves: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const clave = localStorage.key(i);
        if (
          clave &&
          PREFIJOS_LOCALES.some((prefijo) => clave.startsWith(prefijo)) &&
          !conservar.includes(clave)
        ) {
          claves.push(clave);
        }
      }
      claves.forEach((clave) => localStorage.removeItem(clave));
      return claves.length;
    } catch {
      return 0;
    }
  }

  private aplicar(p: Preferencias): void {
    const raiz = this.documento.documentElement.classList;
    raiz.toggle('ca-sin-animaciones', p.animaciones === 'no');
    raiz.toggle('ca-con-animaciones', p.animaciones === 'si');
    raiz.toggle('ca-texto-grande', p.texto === 'grande');
    raiz.toggle('ca-texto-muy-grande', p.texto === 'muy-grande');
  }
}

/** Lee lo guardado; cualquier valor que no se entienda vuelve al de fábrica. */
function leer(): Preferencias {
  let guardado: Partial<Record<keyof Preferencias, unknown>> = {};

  try {
    guardado = JSON.parse(localStorage.getItem(CLAVE) ?? '{}') ?? {};
  } catch {
    // Sin almacenamiento o con un valor dañado: lo de fábrica.
  }

  const elegir = <T>(valor: unknown, validos: readonly T[], porDefecto: T): T =>
    validos.includes(valor as T) ? (valor as T) : porDefecto;

  return {
    animaciones: elegir(guardado.animaciones, ['sistema', 'si', 'no'] as const, PREFERENCIAS_INICIALES.animaciones),
    texto: elegir(guardado.texto, ['normal', 'grande', 'muy-grande'] as const, PREFERENCIAS_INICIALES.texto),
    ahorroDatos: guardado.ahorroDatos === true,
    abrirEn: typeof guardado.abrirEn === 'string' && guardado.abrirEn.startsWith('/') ? guardado.abrirEn : null,
  };
}

function guardar(p: Preferencias): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(p));
  } catch {
    // Modo privado o almacenamiento lleno: vale durante esta sesión.
  }
}
