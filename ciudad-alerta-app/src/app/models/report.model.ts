import { FieldValue, Timestamp } from 'firebase/firestore';

/** Estados del ciclo de vida de una incidencia (ver lámina 8 de la presentación). */
export type ReportStatus =
  | 'reportado'
  | 'en_revision'
  | 'derivado'
  | 'en_proceso'
  | 'resuelto'
  | 'cerrado';

/** Categorías habilitadas en el piloto. */
export type ReportCategory =
  | 'microbasural'
  | 'luminaria'
  | 'fuga_agua'
  | 'arbol_peligroso'
  | 'calle_deteriorada'
  | 'accesibilidad'
  | 'otro';

export const REPORT_CATEGORIES: ReadonlyArray<{ id: ReportCategory; label: string }> = [
  { id: 'microbasural', label: 'Microbasural' },
  { id: 'luminaria', label: 'Luminaria dañada' },
  { id: 'fuga_agua', label: 'Fuga de agua' },
  { id: 'arbol_peligroso', label: 'Árbol peligroso' },
  { id: 'calle_deteriorada', label: 'Calle deteriorada' },
  { id: 'accesibilidad', label: 'Problema de accesibilidad' },
  { id: 'otro', label: 'Otro' },
];

/** Límites de la descripción, validados en el formulario y en las reglas de Firestore. */
export const DESCRIPCION_MIN = 10;
export const DESCRIPCION_MAX = 500;

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

/** Ventana temporal, en horas, dentro de la cual dos reportes pueden ser el mismo incidente. */
export const VENTANA_COINCIDENCIA_HORAS = 72;

/** Radio de búsqueda de reportes cercanos, en metros. */
export const RADIO_COINCIDENCIA_METROS = 150;

/** Estados que descartan una coincidencia: el incidente ya se cerró. */
export const ESTADOS_INACTIVOS: ReadonlyArray<ReportStatus> = ['resuelto', 'cerrado'];

/** Tipos de organismo responsable contemplados en el piloto. */
export type TipoOrganismo = 'municipio' | 'empresa_sanitaria' | 'empresa_electrica';

export interface Organismo {
  id: string;
  nombre: string;
  tipo: TipoOrganismo;
}

/**
 * Catálogo simulado de organismos. En el MVP la asignación se resuelve por
 * categoría; la integración productiva con municipios y empresas queda fuera
 * del alcance declarado en Fase 1.
 */
export const ORGANISMOS: Readonly<Record<ReportCategory, Organismo>> = {
  microbasural: { id: 'muni_aseo', nombre: 'Dirección de Aseo y Ornato', tipo: 'municipio' },
  luminaria: { id: 'elec_dist', nombre: 'Empresa distribuidora eléctrica', tipo: 'empresa_electrica' },
  fuga_agua: { id: 'sanitaria', nombre: 'Empresa sanitaria', tipo: 'empresa_sanitaria' },
  arbol_peligroso: { id: 'muni_aseo', nombre: 'Dirección de Aseo y Ornato', tipo: 'municipio' },
  calle_deteriorada: { id: 'muni_obras', nombre: 'Dirección de Obras Municipales', tipo: 'municipio' },
  accesibilidad: { id: 'muni_obras', nombre: 'Dirección de Obras Municipales', tipo: 'municipio' },
  otro: { id: 'muni_oirs', nombre: 'OIRS Municipal', tipo: 'municipio' },
};

export const IDS_ORGANISMOS: ReadonlyArray<string> = [
  'muni_aseo', 'muni_obras', 'muni_oirs', 'elec_dist', 'sanitaria',
];

/** Transiciones permitidas entre estados. Se valida en cliente y en reglas. */
export const TRANSICIONES: Readonly<Record<ReportStatus, ReadonlyArray<ReportStatus>>> = {
  reportado: ['en_revision', 'derivado', 'cerrado'],
  en_revision: ['derivado', 'cerrado'],
  derivado: ['en_proceso', 'cerrado'],
  en_proceso: ['resuelto', 'cerrado'],
  resuelto: ['cerrado'],
  cerrado: [],
};

export const ETIQUETAS_ESTADO: Readonly<Record<ReportStatus, string>> = {
  reportado: 'Reportado',
  en_revision: 'En revisión',
  derivado: 'Derivado',
  en_proceso: 'En proceso',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
};

/** Color del marcador según estado, usado en el mapa de incidencias. */
export const COLORES_ESTADO: Readonly<Record<ReportStatus, string>> = {
  reportado: '#1ca9c9',
  en_revision: '#7fd3e4',
  derivado: '#a5b4c3',
  en_proceso: '#4a90a4',
  resuelto: '#f8fafc',
  cerrado: '#5c677d',
};

/** Radios disponibles en la página de reportes cercanos, en metros. */
export const RADIOS_BUSQUEDA: ReadonlyArray<number> = [500, 1000, 2000, 5000];

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
   * Vector de características de la fotografía (MobileNet, 1024 dimensiones,
   * normalizado). Permite comparar imágenes sin descargarlas. Null si el
   * reporte no trae foto o si el modelo no pudo cargarse.
   */
  embedding: number[] | null;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

/** Registro de un cambio de estado, en `reports/{id}/statusHistory`. */
export interface StatusChange {
  reportId: string;
  desde: ReportStatus;
  hacia: ReportStatus;
  /** uid de quien realizó el cambio. */
  autorUid: string;
  comentario: string;
  createdAt: Timestamp | FieldValue;
}

/** Reporte con la distancia calculada al punto de referencia del usuario. */
export interface NearbyReport {
  report: Report;
  distanciaMetros: number;
}

/** Confirmación comunitaria. El id del documento es el uid, lo que impide duplicados. */
export interface Confirmation {
  uid: string;
  reportId: string;
  createdAt: Timestamp | FieldValue;
}

/** Reporte cercano detectado, con el detalle de por qué se considera coincidente. */
export interface MatchCandidate {
  report: Report;
  /** Distancia en metros al nuevo reporte. */
  distanciaMetros: number;
  /** Horas transcurridas desde que se creó el reporte existente. */
  horasTranscurridas: number;
  /** Similitud visual entre 0 y 1. Null si no se pudo calcular. */
  similitudImagen: number | null;
  /** Puntaje combinado entre 0 y 1. */
  puntaje: number;
  /** Explicación legible de la coincidencia, para mostrar al usuario. */
  motivos: string[];
}

/** Documento de la colección `reportPhotos`, usado solo por la variante Firestore. */
export interface ReportPhotoDoc {
  reportId: string;
  ownerUid: string;
  dataUrl: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Timestamp | FieldValue;
}
