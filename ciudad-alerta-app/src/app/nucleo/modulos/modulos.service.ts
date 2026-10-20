import {
  EnvironmentProviders,
  Injectable,
  Type,
  isDevMode,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
} from '@angular/core';
import { addIcons } from 'ionicons';

import { CONFIG_MODULOS } from '../../modulos.config';
import { UserRole } from '../../models/user-profile.model';
import { AccesoInicio } from './modulo.model';
import { NombreRanura } from './ranuras';
import {
  accesosParaRol,
  cargarRanura,
  iconosDeModulos,
  modulosActivos,
  problemasDeConfiguracion,
  textoDeAcceso,
} from './registro';

/**
 * Consulta en tiempo de ejecución qué módulos están activos.
 *
 * Un componente que muestra algo de otro módulo opcional pregunta aquí antes:
 *
 *   @if (modulos.activo('confianza')) { <app-verificacion-reporte ... /> }
 */
@Injectable({ providedIn: 'root' })
export class ModulosService {
  private readonly activos = new Set(modulosActivos(CONFIG_MODULOS).map((m) => m.id));
  /** Una descarga por ranura, compartida por todas sus apariciones. */
  private readonly ranuras = new Map<NombreRanura, Promise<Type<unknown>[]>>();

  activo(id: string): boolean {
    return this.activos.has(id);
  }

  accesos(rol: UserRole | null): AccesoInicio[] {
    return accesosParaRol(CONFIG_MODULOS, rol);
  }

  texto(acceso: AccesoInicio, rol: UserRole | null): string {
    return textoDeAcceso(acceso, rol);
  }

  /** Componentes que los módulos activos ponen en una ranura (ver ranuras.ts). */
  componentesDeRanura(nombre: NombreRanura): Promise<Type<unknown>[]> {
    let carga = this.ranuras.get(nombre);

    if (!carga) {
      carga = cargarRanura(CONFIG_MODULOS, nombre).catch((error: unknown) => {
        // Sin red no se descarga el componente: se olvida para reintentar la
        // próxima vez y la ranura muestra su contenido por defecto.
        this.ranuras.delete(nombre);
        throw error;
      });
      this.ranuras.set(nombre, carga);
    }

    return carga;
  }
}

/**
 * Registra los servicios de los módulos activos y sus íconos. Va una sola vez
 * en `main.ts`. Si la configuración tiene problemas (una dependencia
 * desactivada, una ruta repetida), los informa en la consola al arrancar.
 */
export function provideModulos(): EnvironmentProviders {
  const activos = modulosActivos(CONFIG_MODULOS);

  return makeEnvironmentProviders([
    ...activos.flatMap((m) => m.proveedores ?? []),
    provideEnvironmentInitializer(() => {
      addIcons(iconosDeModulos(CONFIG_MODULOS));

      const problemas = problemasDeConfiguracion(CONFIG_MODULOS);
      if (problemas.length) {
        // En desarrollo se ve en la consola de inmediato; el diagnóstico de
        // código (npm run diagnostico) lo detecta también antes de compilar.
        const mensaje = `Configuración de módulos con problemas:\n- ${problemas.join('\n- ')}`;
        if (isDevMode()) console.error(mensaje);
        else console.warn(mensaje);
      }
    }),
  ]);
}
