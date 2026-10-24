import { FieldValue, Timestamp } from 'firebase/firestore';

/*
 * Tipos de un reporte que comparte toda la app.
 *
 * Estados, categorías, transiciones, etiquetas, colores y límites vienen del
 * paquete compartido `comun/` (también lo puede usar el portal web). Se
 * reexportan aquí con los nombres de siempre para no tocar las pantallas.
 *
 * Lo que usa un solo módulo vive en ese módulo: coincidencias y fotos en
 * `modulos/reportes/modelo`, radios de búsqueda en `modulos/cercanos`. Los
 * organismos y operadores están en `organismo.model.ts`.
 */
import {
  CATEGORIAS,
  COLORES_ESTADO,
  DESCRIPCION_MAX,
  DESCRIPCION_MIN,
  ETIQUETAS_ESTADO,
  TRANSICIONES,
  etiquetaCategoria,
} from '@ciudad-alerta/comun';
import type { CategoriaReporte, EstadoReporte, InfoPrivacidad } from '@ciudad-alerta/comun';

import type { Organismo } from './organismo.model';

export { COLORES_ESTADO, DESCRIPCION_MAX, DESCRIPCION_MIN, ETIQUETAS_ESTADO, TRANSICIONES, etiquetaCategoria };
export type { InfoPrivacidad };

/** Estados del ciclo de vida de una incidencia (ver lámina 8 de la presentación). */
export type ReportStatus = EstadoReporte;

/** Categorías habilitadas en el piloto. */
export type ReportCategory = CategoriaReporte;

/** Para los selectores: `label` es el nombre que usan las plantillas. */
export const REPORT_CATEGORIES: ReadonlyArray<{ id: ReportCategory; label: string }> = CATEGORIAS.map(
  (c) => ({ id: c.id, label: c.etiqueta }),
);

export interface GeoPoint {
  lat: number;
  lng: number;
  /** Precisión en metros informada por el dispositivo. */
  accuracy: number;
}

/**
 * Referencia a la fotografía. `kind` indica qué implementación de
 * PhotoStorageService la guardó, para poder recuperarla o borrarla después.
 */
export interface PhotoReference {
  kind: 'firestore' | 'cloud-storage';
  /** Ruta del documento o del objeto en el bucket. */
  path: string;
  /** URL de descarga. Solo la entrega Cloud Storage. */
  url: string | null;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Mapa `validacion` de un reporte (sistema de confianza). Lo escriben la app
 * al confirmar y el gestor al dar un veredicto; las reglas comprueban cada
 * número. Un campo que falta vale 0, falso o null: los reportes anteriores al
 * sistema no lo tienen.
 */
export interface ValidacionReporte {
  /** Suma de los pesos de las confirmaciones, de 0 en adelante (100 = validado). */
  puntos?: number;
  /** Personas que confirmaron con peso mayor que 0. */
  votos?: number;
  /** Puntos ≥ 100 y votos ≥ 3. Una vez verdadero, no vuelve a falso. */
  validado?: boolean;
  validadoAt?: Timestamp | FieldValue | null;
  /** Decisión del operador o administrador. */
  veredicto?: 'real' | 'falso' | null;
  veredictoPor?: string;
  veredictoAt?: Timestamp | FieldValue;
  /** Obligatorio cuando el veredicto es falso. */
  veredictoComentario?: string | null;
  /** Puntos de confianza que el veredicto sumó o restó al autor. */
  veredictoPuntos?: number;
}

export interface Report {
  id: string;
  uid: string;
  descripcion: string;
  categoria: ReportCategory;
  ubicacion: GeoPoint;
  foto: PhotoReference | null;
  estado: ReportStatus;
  /**
   * Contador denormalizado. Hoy permanece siempre en 0: las reglas impiden que
   * el cliente lo modifique, y permitirlo dejaría que cualquiera inflara el
   * contador de cualquier reporte. La interfaz muestra el conteo real de la
   * subcolección `confirmations`. Mantenerlo en el modelo deja el campo listo
   * para cuando un trigger de Cloud Functions pueda actualizarlo en servidor.
   */
  confirmaciones: number;
  /**
   * Comuna donde ocurre la incidencia, detectada a partir de la ubicación.
   * Null si no pudo determinarse (fuera de los límites cargados, o reportes
   * creados antes de esta funcionalidad).
   */
  comuna?: string | null;
  /** Región correspondiente a la comuna, cuando la fuente la informa. */
  region?: string | null;
  /** Cómo se obtuvo la comuna: permite auditar la calidad del dato. */
  comunaFuente?: 'limites_oficiales' | 'nominatim' | 'no_disponible';
  /**
   * Nombre para mostrar del autor al momento de reportar. Es una copia: si el
   * usuario cambia su nombre después, el reporte conserva el original, igual
   * que ocurre con el organismo asignado.
   */
  autorNombre?: string;
  /**
   * Operador que gestiona el reporte, asignado automáticamente según el
   * organismo. Null si ese organismo todavía no tiene un operador activo.
   */
  operadorId?: string | null;
  /**
   * Organismo responsable asignado automáticamente según la categoría.
   * Opcional porque los reportes creados antes de HU-28 no lo tienen.
   */
  organismo?: Organismo;
  /**
   * Geohash de la ubicación. Firestore no tiene consultas geoespaciales, así
   * que se consulta por rangos de geohash y luego se filtra por distancia real.
   */
  geohash: string;
  /**
   * Vector de características de la fotografía (MobileNet, 1280 dimensiones,
   * normalizado). Permite comparar imágenes sin descargarlas. Null si el
   * reporte no trae foto o si el modelo no pudo cargarse.
   */
  embedding: number[] | null;
  /** Sistema de confianza. Ausente en los reportes anteriores. */
  validacion?: ValidacionReporte;
  /**
   * F12 · Hora del servidor en que pasó a «resuelto» y milisegundos desde la
   * creación. Los escribe quien resuelve (app o portal), siempre juntos. Las
   * reglas los aceptan pero todavía no los exigen: los reportes anteriores no
   * los traen y su tiempo se deduce del historial.
   */
  resueltoAt?: Timestamp | FieldValue | null;
  tiempoResolucionMs?: number | null;
  /** F12 · Hora del servidor en que se cerró sin haber pasado por «resuelto». */
  cerradoSinResolverAt?: Timestamp | FieldValue | null;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
  /**
   * 1.0 · Cuándo el autor corrigió la descripción (solo mientras el reporte
   * seguía en «reportado»). Ausente si nunca la corrigió.
   */
  editadoAt?: Timestamp | FieldValue;
  /** 1.0 · El autor lo retiró antes de que alguien lo revisara (quedó «cerrado»). */
  retiradoPorAutor?: boolean;
}

/** Registro de un cambio de estado, en `reports/{id}/statusHistory`. */
export interface StatusChange {
  reportId: string;
  desde: ReportStatus;
  hacia: ReportStatus;
  /** uid de quien realizó el cambio. */
  autorUid: string;
  /**
   * Nombre público de quien hizo el cambio: el organismo del operador, o
   * "Administración Ciudad Alerta" si fue un administrador. Opcional porque
   * los cambios anteriores a esta versión, y los que haga un cliente que no
   * lo escriba, no lo traen; se muestran como "Autor no registrado".
   */
  autorNombre?: string;
  /** Rol con el que se hizo el cambio. Lo validan las reglas. */
  autorRol?: 'admin' | 'operador';
  comentario: string;
  createdAt: Timestamp | FieldValue;
}

/** Nombre público con el que se firman los cambios de un administrador. */
export const NOMBRE_ADMINISTRACION = 'Administración Ciudad Alerta';

/** Un hito de la línea de tiempo pública de un reporte. */
export interface EventoHistorial {
  fecha: Date | null;
  /** Null en el primer evento, la creación. */
  desde: ReportStatus | null;
  hacia: ReportStatus;
  /** Texto de quién lo hizo, ya resuelto para mostrar. */
  autor: string;
  comentario: string | null;
}

/** Reporte con la distancia calculada al punto de referencia del usuario. */
export interface NearbyReport {
  report: Report;
  distanciaMetros: number;
}
