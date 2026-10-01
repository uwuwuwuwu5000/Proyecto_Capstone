import { collection, getCountFromServer } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { ETIQUETA_POR_ESTADO } from '../../constants/reportes'
import { cargarHistorial } from './historial'
import type { CambioEstado } from './historial'
import type { Reporte } from './reporte'
import { calcularTiempos } from './tiempos'

// Consultas en paralelo por tanda (conteo de confirmaciones + historial de
// cada reporte), igual que useHistoriales.
const TAMANO_TANDA = 10

const ENCABEZADOS = [
  'Id',
  'Fecha',
  'Hora',
  'Categoría',
  'Estado',
  'Descripción',
  'Comuna',
  'Región',
  'Autor',
  'Latitud',
  'Longitud',
  'Confirmaciones',
  'Operador',
  'Organismo ID',
  'Primera atención (horas)',
  'Hasta resolver o cerrar (horas)',
  'Tiene foto',
]

/** Texto o número ya redondeado; null queda como celda vacía. */
type Celda = string | number | null

export interface OpcionesExportacion {
  etiquetaCategoria: (id: string) => string
  nombreOperador: (operadorId: string | null) => string
  /** Historiales ya leídos (p. ej. por Estadísticas), para no volver a pedirlos. */
  historiales?: Map<string, CambioEstado[]>
  onProgreso?: (hechos: number, total: number) => void
}

function dosDigitos(n: number): string {
  return String(n).padStart(2, '0')
}

function horas(ms: number | null): number | null {
  return ms === null ? null : Math.round((ms / 3_600_000) * 100) / 100
}

/**
 * Una celda de texto que empieza con = + - @ (o tab / retorno de carro) Excel
 * la interpreta como fórmula: un reporte con descripción "=HYPERLINK(...)"
 * podría ejecutar algo al abrir el archivo. Se antepone ' para que quede como
 * texto. Los números no pasan por aquí (una latitud negativa no es fórmula).
 */
function protegerTexto(texto: string): string {
  return /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto
}

function celdaCsv(valor: Celda): string {
  if (valor === null) return ''
  // Excel en español usa coma decimal.
  if (typeof valor === 'number') return String(valor).replace('.', ',')
  return `"${protegerTexto(valor).replace(/"/g, '""')}"`
}

/**
 * CSV que Excel en español abre bien con doble clic: UTF-8 con BOM (sin él,
 * las tildes salen mal), separador ";" y saltos de línea CRLF.
 */
function generarCsv(encabezados: string[], filas: Celda[][]): string {
  const lineas = [encabezados, ...filas].map((fila) => fila.map(celdaCsv).join(';'))
  return `﻿${lineas.join('\r\n')}\r\n`
}

function filaDeReporte(
  reporte: Reporte,
  confirmaciones: number,
  cambios: CambioEstado[],
  opciones: OpcionesExportacion,
): Celda[] {
  const { primeraAtencionMs, resolucionMs } = calcularTiempos(reporte, cambios)
  const fecha = reporte.fecha
  return [
    reporte.id,
    fecha
      ? `${dosDigitos(fecha.getDate())}-${dosDigitos(fecha.getMonth() + 1)}-${fecha.getFullYear()}`
      : null,
    fecha ? `${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}` : null,
    opciones.etiquetaCategoria(reporte.categoria),
    ETIQUETA_POR_ESTADO[reporte.estado] ?? reporte.estado,
    reporte.descripcion,
    reporte.comuna || null,
    reporte.region || null,
    reporte.autorNombre,
    reporte.lat !== null ? Math.round(reporte.lat * 1e6) / 1e6 : null,
    reporte.lng !== null ? Math.round(reporte.lng * 1e6) / 1e6 : null,
    confirmaciones,
    opciones.nombreOperador(reporte.operadorId),
    reporte.organismoId,
    horas(primeraAtencionMs),
    horas(resolucionMs),
    reporte.foto ? 'Sí' : 'No',
  ]
}

/**
 * Arma el CSV de un listado de reportes, sin imágenes. Por cada reporte lee
 * el conteo de confirmaciones y, si no viene ya leído, su historial (para los
 * tiempos de atención).
 */
export async function construirCsvReportes(
  reportes: Reporte[],
  opciones: OpcionesExportacion,
): Promise<string> {
  const filas: Celda[][] = []
  opciones.onProgreso?.(0, reportes.length)
  for (let i = 0; i < reportes.length; i += TAMANO_TANDA) {
    const tanda = reportes.slice(i, i + TAMANO_TANDA)
    const resultados = await Promise.all(
      tanda.map(async (reporte) => {
        const [conteo, cambios] = await Promise.all([
          getCountFromServer(collection(db, 'reports', reporte.id, 'confirmations')),
          opciones.historiales?.get(reporte.id) ?? cargarHistorial(reporte.id),
        ])
        return filaDeReporte(reporte, conteo.data().count, cambios, opciones)
      }),
    )
    filas.push(...resultados)
    opciones.onProgreso?.(Math.min(i + TAMANO_TANDA, reportes.length), reportes.length)
  }
  return generarCsv(ENCABEZADOS, filas)
}

export function descargarCsv(contenido: string, nombreArchivo: string): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombreArchivo
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  URL.revokeObjectURL(url)
}

/** Parte segura de un nombre de archivo: minúsculas, números, "-" y "_". */
export function paraNombreArchivo(texto: string): string {
  return (
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'reportes'
  )
}
