// Acciones sobre uno o varios reportes a la vez (selección múltiple).
//
// Cada reporte se procesa por separado: las reglas validan cada escritura
// contra el estado de ESE reporte (transición, permisos), y un rechazo no
// debe deshacer lo que sí se pudo hacer con los demás. Al final se informa
// cuántos se hicieron y cuántos fallaron.
import { collection, doc, getDocs, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { TRANSICIONES } from '../../constants/reportes'
import { cambiarEstadoReporte } from './reporte'
import type { AutorCambio, Reporte } from './reporte'

export interface ResultadoLote {
  hechos: number
  fallidos: number
}

type Progreso = (hechos: number, total: number) => void

/** Aplica `accion` a cada reporte, uno tras otro, contando aciertos y fallas. */
async function porCada(
  reportes: Reporte[],
  accion: (reporte: Reporte) => Promise<void>,
  onProgreso?: Progreso,
): Promise<ResultadoLote> {
  let hechos = 0
  let fallidos = 0
  for (const [i, reporte] of reportes.entries()) {
    try {
      await accion(reporte)
      hechos += 1
    } catch (err) {
      console.error(`Error al procesar el reporte ${reporte.id}:`, err)
      fallidos += 1
    }
    onProgreso?.(i + 1, reportes.length)
  }
  return { hechos, fallidos }
}

/**
 * Elimina el reporte junto con su foto, confirmaciones e historial, en un
 * mismo lote: o se borra todo, o nada.
 */
export async function eliminarReporte(reporte: Reporte): Promise<void> {
  const reporteRef = doc(db, 'reports', reporte.id)
  const [confirmaciones, historial] = await Promise.all([
    getDocs(collection(reporteRef, 'confirmations')),
    getDocs(collection(reporteRef, 'statusHistory')),
  ])
  const lote = writeBatch(db)
  confirmaciones.forEach((d) => lote.delete(d.ref))
  historial.forEach((d) => lote.delete(d.ref))
  if (reporte.foto?.tipo === 'firestore') {
    lote.delete(doc(db, reporte.foto.path))
  }
  lote.delete(reporteRef)
  await lote.commit()
}

export function eliminarReportes(reportes: Reporte[], onProgreso?: Progreso) {
  return porCada(reportes, eliminarReporte, onProgreso)
}

/** Reportes que pueden pasar a `hacia` desde su estado actual. */
export function puedenPasarA(reportes: Reporte[], hacia: string): Reporte[] {
  return reportes.filter((r) => (TRANSICIONES[r.estado] ?? []).includes(hacia))
}

/** Estados a los que puede pasar al menos uno de los reportes. */
export function estadosAlcanzables(reportes: Reporte[]): Set<string> {
  return new Set(reportes.flatMap((r) => TRANSICIONES[r.estado] ?? []))
}

/** Cambia el estado de los reportes que admiten esa transición (el resto se omite). */
export function cambiarEstadoEnLote(
  reportes: Reporte[],
  hacia: string,
  comentario: string,
  autor: AutorCambio,
  onProgreso?: Progreso,
) {
  return porCada(
    puedenPasarA(reportes, hacia),
    (r) => cambiarEstadoReporte(r, hacia, comentario, autor),
    onProgreso,
  )
}

/**
 * Asigna (o quita, con null) el operador. Igual que la edición individual,
 * solo cambia operadorId: es lo que permite la regla de reasignación del admin.
 */
export function asignarOperadorEnLote(
  reportes: Reporte[],
  operadorId: string | null,
  onProgreso?: Progreso,
) {
  return porCada(
    reportes.filter((r) => (r.operadorId ?? null) !== operadorId),
    (r) => updateDoc(doc(db, 'reports', r.id), { operadorId, updatedAt: serverTimestamp() }),
    onProgreso,
  )
}

/** "3 reportes", "1 reporte". */
export function contarReportes(n: number): string {
  return `${n.toLocaleString('es-CL')} ${n === 1 ? 'reporte' : 'reportes'}`
}
