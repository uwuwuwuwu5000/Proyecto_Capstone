import { Type } from '@angular/core';
import { Routes } from '@angular/router';

import { UserRole } from '../../models/user-profile.model';
import { AccesoInicio, AporteRanura, EntradaModulo, ModuloApp } from './modulo.model';
import { NOMBRES_RANURAS, NombreRanura } from './ranuras';

/**
 * Funciones puras sobre la lista de módulos. No dependen de Angular para
 * poder probarlas en Node y reutilizarlas desde los scripts.
 */

export function modulosActivos(entradas: readonly EntradaModulo[]): ModuloApp[] {
  return entradas.filter((e) => e.activo).map((e) => e.modulo);
}

/**
 * Problemas de configuración: ids repetidos, dependencias desactivadas o
 * inexistentes, rutas o accesos duplicados. Lista vacía = todo bien.
 */
export function problemasDeConfiguracion(entradas: readonly EntradaModulo[]): string[] {
  const problemas: string[] = [];
  const todos = new Map<string, EntradaModulo>();

  for (const entrada of entradas) {
    if (todos.has(entrada.modulo.id)) {
      problemas.push(`El módulo '${entrada.modulo.id}' aparece dos veces en modulos.config.ts.`);
    }
    todos.set(entrada.modulo.id, entrada);
  }

  const rutas = new Map<string, string>();
  const accesos = new Map<string, string>();

  for (const modulo of modulosActivos(entradas)) {
    for (const dependencia of modulo.requiere ?? []) {
      const otra = todos.get(dependencia);
      if (!otra) {
        problemas.push(`'${modulo.id}' requiere '${dependencia}', que no existe en modulos.config.ts.`);
      } else if (!otra.activo) {
        problemas.push(`'${modulo.id}' requiere '${dependencia}', que está desactivado.`);
      }
    }

    for (const ruta of modulo.rutas ?? []) {
      if (ruta.path === undefined) continue;
      const previa = rutas.get(ruta.path);
      if (previa) problemas.push(`La ruta '/${ruta.path}' está en '${previa}' y en '${modulo.id}'.`);
      rutas.set(ruta.path, modulo.id);
    }

    for (const acceso of modulo.accesos ?? []) {
      const previo = accesos.get(acceso.id);
      if (previo) problemas.push(`El acceso '${acceso.id}' está en '${previo}' y en '${modulo.id}'.`);
      accesos.set(acceso.id, modulo.id);

      if (!modulo.iconos?.[acceso.icono]) {
        problemas.push(`El acceso '${acceso.id}' usa el ícono '${acceso.icono}', que no está en 'iconos' de '${modulo.id}'.`);
      }
    }

    for (const aporte of modulo.ranuras ?? []) {
      if (!NOMBRES_RANURAS.includes(aporte.ranura)) {
        problemas.push(`'${modulo.id}' aporta a la ranura '${aporte.ranura}', que no existe en ranuras.ts.`);
      }
    }
  }

  return problemas;
}

/** Todas las rutas de los módulos activos, en el orden de la configuración. */
export function rutasDeModulos(entradas: readonly EntradaModulo[]): Routes {
  return modulosActivos(entradas).flatMap((m) => m.rutas ?? []);
}

/** Botones del inicio que corresponden a un rol, ordenados. */
export function accesosParaRol(
  entradas: readonly EntradaModulo[],
  rol: UserRole | null,
): AccesoInicio[] {
  return modulosActivos(entradas)
    .flatMap((m) => m.accesos ?? [])
    .filter((a) => !a.roles || (rol !== null && a.roles.includes(rol)))
    .sort((a, b) => a.orden - b.orden);
}

/** Texto de un acceso para el rol actual. */
export function textoDeAcceso(acceso: AccesoInicio, rol: UserRole | null): string {
  return (rol && acceso.textoSegunRol?.[rol]) || acceso.texto;
}

/** Aportes de los módulos activos a una ranura, ordenados. */
export function aportesDeRanura(
  entradas: readonly EntradaModulo[],
  nombre: NombreRanura,
): AporteRanura[] {
  return modulosActivos(entradas)
    .flatMap((m) => m.ranuras ?? [])
    .filter((a) => a.ranura === nombre)
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
}

/** Descarga los componentes de una ranura. */
export function cargarRanura(
  entradas: readonly EntradaModulo[],
  nombre: NombreRanura,
): Promise<Type<unknown>[]> {
  return Promise.all(aportesDeRanura(entradas, nombre).map((a) => a.cargar()));
}

/** Íconos de todos los módulos activos, listos para `addIcons`. */
export function iconosDeModulos(entradas: readonly EntradaModulo[]): Record<string, string> {
  return Object.assign({}, ...modulosActivos(entradas).map((m) => m.iconos ?? {}));
}
