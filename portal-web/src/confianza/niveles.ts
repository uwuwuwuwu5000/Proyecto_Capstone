// Nombres y reconocimiento de cada nivel (sistema_confianza.md, secciones 4.1 y 4.6).
import { NIVELES } from '@ciudad-alerta/comun'
import { UMBRALES_NIVEL, limiteDiario, pesoDeNivel } from './reglas'

/** Nombre de cada nivel (índice = nivel), tomado de `comun`. */
export const NOMBRE_NIVEL: readonly string[] = NIVELES.map((n) => n.nombre)

/** Qué se reconoce al llegar a cada nivel (solo los que tienen algo nuevo). */
export const RECONOCIMIENTO_NIVEL: Record<number, string> = {
  0: 'Reportar y confirmar (peso bajo)',
  1: 'Insignia «Vecino» en el perfil',
  3: 'Aviso «Reportes por verificar cerca de ti» en el mapa',
  5: 'Insignia «Vigía confiable»; tus reportes se muestran con «Autor confiable»',
  8: 'Insignia «Referente»; tus reportes llegan al operador marcados con prioridad',
  10: 'Insignia «Guardián de la ciudad» (nivel máximo)',
}

export interface FilaNivel {
  nivel: number
  nombre: string
  puntos: number
  peso: number
  limite: number
  reconocimiento: string | null
}

/** Una fila por nivel, para la tabla de la pantalla «Mi nivel». */
export const TABLA_NIVELES: FilaNivel[] = NOMBRE_NIVEL.map((nombre, nivel) => ({
  nivel,
  nombre,
  puntos: UMBRALES_NIVEL[nivel],
  peso: pesoDeNivel(nivel),
  limite: limiteDiario(nivel),
  reconocimiento: RECONOCIMIENTO_NIVEL[nivel] ?? null,
}))
