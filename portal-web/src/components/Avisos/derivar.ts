// Avisos que se derivan de los datos del propio reporte y de la confianza del
// usuario, sin guardar nada: «validado por la comunidad», «veredicto» y
// «subiste de nivel». Funciones puras (se prueban en rules-tests/avisos.test.ts).
//
// Los cambios de estado, en cambio, se derivan de `statusHistory` y los arma
// el contexto (ver context/AvisosContext.tsx).
import { NOMBRE_NIVEL } from '../../confianza/niveles'
import type { Validacion } from '../../confianza/tipos'

export type TipoAviso = 'estado' | 'validado' | 'veredicto' | 'nivel' | 'soporte'

export interface AvisoBase {
  /** Único en todo el sistema: `${reportId}_${cambioId}`, `${reportId}_validado`, `nivel:3`… */
  id: string
  tipo: TipoAviso
  /** null en el aviso de nivel: no pertenece a un reporte. */
  reportId: string | null
  titulo: string
  /** Inicio de la descripción del reporte, para reconocerlo. */
  reporte: string
  comentario: string | null
  /** Quién lo origina, ya listo para mostrar; null si no aplica. */
  autor: string | null
  fecha: Date | null
  /** Pantalla a la que lleva el aviso; si falta, se decide por el tipo. */
  ruta?: string
}

const resumir = (t: string) => (t.length <= 60 ? t : `${t.slice(0, 57)}…`)

/** «+10 puntos» / «−15 puntos»; vacío si no cambió nada. */
function textoPuntos(puntos: number | null): string {
  if (!puntos) return ''
  return ` (${puntos > 0 ? '+' : '−'}${Math.abs(puntos)} puntos)`
}

/** Avisos de validación y veredicto de un reporte propio. */
export function avisosDeValidacion(reportId: string, descripcion: string, v: Validacion): AvisoBase[] {
  const avisos: AvisoBase[] = []
  if (v.validado && v.validadoAt) {
    avisos.push({
      id: `${reportId}_validado`,
      tipo: 'validado',
      reportId,
      titulo: 'Tu reporte fue validado por la comunidad',
      reporte: resumir(descripcion),
      comentario: null,
      autor: 'Comunidad',
      fecha: v.validadoAt,
    })
  }
  if (v.veredicto && v.veredictoAt) {
    avisos.push({
      id: `${reportId}_veredicto`,
      tipo: 'veredicto',
      reportId,
      titulo:
        v.veredicto === 'real'
          ? `Tu reporte fue verificado como real${textoPuntos(v.veredictoPuntos)}`
          : `Tu reporte fue marcado como falso${textoPuntos(v.veredictoPuntos)}`,
      reporte: resumir(descripcion),
      comentario: v.veredictoComentario?.trim() || null,
      autor: 'Revisión del organismo',
      fecha: v.veredictoAt,
    })
  }
  return avisos
}

/**
 * Aviso de una conversación de soporte abierta. El id incluye la hora del
 * último mensaje: al abrirla queda vista, y un mensaje nuevo la vuelve a avisar.
 */
export function avisoDeSoporte(t: {
  id: string
  asunto: string
  lastMessageAt: Date | null
  lastMessagePreview: string
  autorNombre: string
  tipo: 'queja' | 'sugerencia'
}): AvisoBase | null {
  if (!t.lastMessageAt) return null
  return {
    id: `soporte:${t.id}:${t.lastMessageAt.getTime()}`,
    tipo: 'soporte',
    reportId: null,
    titulo: `Soporte: ${t.asunto}`,
    reporte: resumir(t.lastMessagePreview),
    comentario: null,
    autor: `${t.autorNombre} · ${t.tipo === 'queja' ? 'Queja' : 'Sugerencia'}`,
    fecha: t.lastMessageAt,
    ruta: `/admin/soporte/${t.id}`,
  }
}

const PATRON_NIVEL = /^nivel:(\d+)$/

export const idAvisoNivel = (nivel: number) => `nivel:${nivel}`

/**
 * Último nivel que el usuario ya vio, sin contar `excluir` (el nivel actual:
 * su propio marcador no debe borrar el sentido «subiste / bajaste»).
 */
export function nivelVistoDe(vistos: Iterable<string>, excluir: number): number | null {
  let mayor: number | null = null
  for (const id of vistos) {
    const m = PATRON_NIVEL.exec(id)
    if (!m) continue
    const n = Number(m[1])
    if (n !== excluir && (mayor === null || n > mayor)) mayor = n
  }
  return mayor
}

/**
 * Aviso de cambio de nivel. Se guarda como visto con el id `nivel:N` dentro de
 * la lista de vistos del propio usuario (no hace falta otro campo ni otra regla).
 *
 * Sin un nivel anterior conocido, el texto es neutro («Ahora estás en el nivel
 * 3»), porque no se sabe si subió o bajó; y no hay aviso en el nivel 0.
 */
export function avisoDeNivel(nivel: number, nivelAnterior: number | null, fecha: Date | null): AvisoBase | null {
  const nombre = `Nivel ${nivel} · ${NOMBRE_NIVEL[nivel] ?? ''}`.trim()
  let titulo: string
  if (nivelAnterior === null) {
    if (nivel === 0) return null
    titulo = `Ahora estás en el ${nombre}`
  } else if (nivel > nivelAnterior) {
    titulo = `Subiste al ${nombre}`
  } else if (nivel < nivelAnterior) {
    titulo = `Bajaste al ${nombre}`
  } else {
    return null
  }
  return {
    id: idAvisoNivel(nivel),
    tipo: 'nivel',
    reportId: null,
    titulo,
    reporte: 'Tu nivel de confianza cambió. Toca para ver tu nivel.',
    comentario: null,
    autor: null,
    fecha,
  }
}
