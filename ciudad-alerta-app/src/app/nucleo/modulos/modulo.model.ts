import { EnvironmentProviders, Provider, Type } from '@angular/core';
import { Routes } from '@angular/router';

import { UserProfile, UserRole } from '../../models/user-profile.model';
import { NombreRanura } from './ranuras';

/**
 * Contrato de un módulo de Ciudad Alerta.
 *
 * Un módulo es una funcionalidad completa que se puede activar o desactivar
 * desde un solo lugar (`src/app/modulos.config.ts`). Al desactivarlo
 * desaparecen sus pantallas, sus botones del inicio y sus servicios de
 * arranque, sin tocar ningún otro archivo.
 *
 * Todo lo que el resto de la app necesita saber de un módulo está en su
 * manifiesto (`<id>.modulo.ts`). Lo que otros módulos pueden usar de él está
 * en su `index.ts`. Lo demás es interno.
 */
export interface ModuloApp {
  /** Identificador único, en minúsculas y con guiones: 'mapa-incidencias'. */
  readonly id: string;

  /** Nombre visible para el equipo: aparece en el diagnóstico y en `npm run modulos`. */
  readonly nombre: string;

  /** Una o dos frases: qué hace el módulo y para quién. */
  readonly descripcion: string;

  /**
   * Módulos que deben estar activos para que este funcione. Activar este sin
   * ellos es un error que el registro informa al arrancar y que el
   * diagnóstico de código detecta antes de compilar.
   */
  readonly requiere?: readonly string[];

  /**
   * Módulos que este usa si están activos, pero sin los cuales funciona. El
   * código debe preguntar `ModulosService.activo(id)` antes de usarlos.
   */
  readonly opcionales?: readonly string[];

  /** Pantallas del módulo. Las rutas son absolutas desde la raíz ('mapa'). */
  readonly rutas?: Routes;

  /** Botones que el módulo agrega a la pantalla de inicio. */
  readonly accesos?: readonly AccesoInicio[];

  /**
   * Íconos que usan los accesos del módulo, en el formato de `addIcons`:
   * `{ 'map-outline': mapOutline }`. Se registran una vez al arrancar.
   */
  readonly iconos?: Readonly<Record<string, string>>;

  /**
   * Piezas que el módulo agrega a pantallas de otros módulos sin que esas
   * pantallas lo importen. Cada pantalla declara sus ranuras con
   * `<app-ranura nombre="...">`; la lista de ranuras está en `ranuras.ts`.
   */
  readonly ranuras?: readonly AporteRanura[];

  /**
   * Servicios o inicializadores que el módulo necesita a nivel de toda la app.
   * Por ejemplo, `provideEnvironmentInitializer(() => inject(AvisosService))`
   * para que un servicio empiece a escuchar apenas arranca la app.
   */
  readonly proveedores?: ReadonlyArray<Provider | EnvironmentProviders>;

  /**
   * Pantalla que el módulo quiere abrir al entrar al inicio, por ejemplo la
   * bienvenida la primera vez. Recibe el perfil de quien entra (null si no
   * se pudo leer) y devuelve la ruta, o null si no corresponde. Corre en un
   * contexto de inyección (puede usar `inject`). El inicio la consulta
   * después de pedir los términos; gana la primera que devuelva una ruta, en
   * el orden de modulos.config.ts.
   */
  readonly alEntrarAlInicio?: (perfil: UserProfile | null) => string | null;
}

/**
 * Grupos de botones del inicio, en este orden:
 * - 'principal': la acción destacada (Crear un reporte), sin título;
 * - 'explorar': ver lo que pasa en la ciudad (mapa, cerca de mí);
 * - 'cuenta': lo propio (mis reportes, quejas, perfil);
 * - 'gestion': herramientas de operadores y administradores.
 */
export type SeccionInicio = 'principal' | 'explorar' | 'cuenta' | 'gestion';

/** Un botón del inicio que lleva a una pantalla del módulo. */
export interface AccesoInicio {
  /** Único dentro de toda la app; sirve de clave al dibujar la lista. */
  readonly id: string;
  readonly texto: string;
  /** Texto alternativo según el rol (por ejemplo, "Reportes asignados" para el operador). */
  readonly textoSegunRol?: Readonly<Partial<Record<UserRole, string>>>;
  /** Nombre del ícono de Ionicons, registrado en `iconos` del mismo módulo. */
  readonly icono: string;
  /** Ruta absoluta: '/mapa'. */
  readonly ruta: string;
  /**
   * Roles que ven el botón. Sin valor, lo ven todos, salvo las cuentas de
   * organismo: esas solo ven los botones que las nombran en `roles` o que
   * declaran `paraOrganismo`.
   */
  readonly roles?: readonly UserRole[];
  /**
   * 1.2 · Que también lo vea una cuenta de organismo (solo lectura). Por
   * defecto no: un botón nuevo para vecinos no le aparece por descuido.
   */
  readonly paraOrganismo?: boolean;
  /** Posición en el inicio: menor va primero. Convención en GUIA_MODULOS.md. */
  readonly orden: number;
  /** 'principal' = botón destacado; 'gestion' = color de staff. */
  readonly estilo?: 'principal' | 'secundario' | 'gestion';
  /**
   * Grupo del inicio donde aparece. Sin valor se deduce del estilo:
   * 'principal' → principal, 'gestion' → gestión, el resto → «Tu cuenta».
   */
  readonly seccion?: SeccionInicio;
}

/** Un grupo de botones del inicio, ya filtrado por rol. */
export interface GrupoInicio {
  readonly id: SeccionInicio;
  /** Null para el grupo principal, que no lleva título. */
  readonly titulo: string | null;
  readonly accesos: readonly AccesoInicio[];
}

/**
 * Un componente que un módulo coloca en una ranura de otra pantalla. Se
 * descarga solo cuando la ranura aparece en pantalla por primera vez.
 */
export interface AporteRanura {
  readonly ranura: NombreRanura;
  readonly cargar: () => Promise<Type<unknown>>;
  /** Si varios módulos aportan a la misma ranura, menor va primero. */
  readonly orden?: number;
}

/** Una línea de `modulos.config.ts`. */
export interface EntradaModulo {
  readonly modulo: ModuloApp;
  readonly activo: boolean;
}
