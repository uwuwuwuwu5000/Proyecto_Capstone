/**
 * Organismos responsables y sus operadores (colecciones `organismos` y
 * `operadores`). Los usan la asignación de reportes, la gestión, la
 * administración de municipalidades y «Mi perfil».
 */
import type { ReportCategory } from './report.model';

/** Tipos de organismo responsable contemplados en el piloto. */
export type TipoOrganismo = 'municipio' | 'empresa_sanitaria' | 'empresa_electrica';

export interface Organismo {
  id: string;
  nombre: string;
  tipo: TipoOrganismo;
  /** Comuna que atiende, en el caso de las municipalidades. */
  comuna?: string | null;
}

/**
 * Documento de la colección `organismos`.
 *
 * El id de cada municipalidad es `muni_` seguido del código CUT de su comuna:
 * `muni_13101` es la Municipalidad de Santiago. Usar el código oficial como
 * identificador hace que la asignación sea directa —de la comuna detectada al
 * documento— sin consultas por nombre, que fallan con las variantes
 * ortográficas.
 */
export interface OrganismoDoc {
  id: string;
  nombre: string;
  tipo: TipoOrganismo;
  /** Códigos CUT de las comunas que atiende. Casi siempre uno solo. */
  comunasAtendidas: string[];
  comuna: string | null;
  codigoRegion: string | null;
  region: string | null;
  activo: boolean;
}

/**
 * Operador que gestiona los reportes de un organismo, en `operadores/{id}`.
 * Lo administra el portal web; la app solo lo lee para asignar reportes.
 */
export interface OperadorDoc {
  id: string;
  nombre: string;
  /** Organismo al que pertenece. Debe existir en `organismos`. */
  organismoId: string;
  activo: boolean;
  telefonoContacto?: string | null;
  correoContacto?: string | null;
  direccionContacto?: string | null;
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

/**
 * Ids de los organismos genéricos. Deben ser los de la regla de creación de
 * reportes (`organismoId in [...]` en firestore.rules).
 */
export const IDS_ORGANISMOS: ReadonlyArray<string> = [
  'muni_aseo', 'muni_obras', 'muni_oirs', 'elec_dist', 'sanitaria',
];
