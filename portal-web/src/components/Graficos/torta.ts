// Lógica de los gráficos de torta (sin React, para poder probarla aparte): qué rebanadas se dibujan, con qué color,
// qué porcentaje y qué ángulos, y el trazo SVG de cada una.

export interface FilaTorta {
  clave: string
  etiqueta: string
  valor: number
  /** Color propio de la fila (por ejemplo el de cada estado); si no tiene, se toma de la paleta. */
  colorIdentidad?: string
}

export interface Rebanada {
  clave: string
  etiqueta: string
  valor: number
  /** Entero; todas las rebanadas suman 100. */
  porcentaje: number
  color: string
  /** Grados desde las 12 en punto, hacia la derecha. */
  inicio: number
  fin: number
}

export const CLAVE_OTRAS = '__otras__'
export const COLOR_OTRAS = '#6b7280'

/** Ocho colores que se distinguen entre sí sobre el fondo oscuro del portal y sin depender solo del rojo y el verde. */
export const PALETA_TORTA: readonly string[] = [
  '#1ca9c9',
  '#f59e0b',
  '#a78bfa',
  '#34d399',
  '#f472b6',
  '#3b82f6',
  '#a3e635',
  '#e2e8f0',
]

/** Porcentajes enteros que suman exactamente 100 (método del resto mayor). */
function porcentajesEnteros(valores: readonly number[], denominador: number): number[] {
  const exactos = valores.map((v) => (v / denominador) * 100)
  const base = exactos.map((p) => Math.floor(p))
  let resto = 100 - base.reduce((suma, p) => suma + p, 0)
  const porResto = exactos
    .map((p, i) => ({ i, fraccion: p - Math.floor(p) }))
    .sort((a, b) => b.fraccion - a.fraccion)
  for (const { i } of porResto) {
    if (resto <= 0) break
    base[i] += 1
    resto -= 1
  }
  return base
}

/**
 * Rebanadas de una torta. Se dibujan las filas con valor, hasta `maximo`; lo que quede fuera, y lo que falte del
 * total cuando la lista es parcial (las 10 comunas con más reportes), se junta en una rebanada «Otras».
 */
export function construirRebanadas(filas: readonly FilaTorta[], total: number, maximo = 8): Rebanada[] {
  const conValor = filas.filter((f) => f.valor > 0)
  const visibles = conValor.slice(0, maximo)
  const sumaVisibles = visibles.reduce((suma, f) => suma + f.valor, 0)
  const sumaTodas = conValor.reduce((suma, f) => suma + f.valor, 0)
  const denominador = Math.max(total, sumaTodas)
  if (denominador <= 0 || visibles.length === 0) return []

  const partes = visibles.map((f, i) => ({
    clave: f.clave,
    etiqueta: f.etiqueta,
    valor: f.valor,
    color: f.colorIdentidad ?? PALETA_TORTA[i % PALETA_TORTA.length],
  }))
  const resto = denominador - sumaVisibles
  if (resto > 0) partes.push({ clave: CLAVE_OTRAS, etiqueta: 'Otras', valor: resto, color: COLOR_OTRAS })

  const porcentajes = porcentajesEnteros(
    partes.map((p) => p.valor),
    denominador,
  )
  let acumulado = 0
  return partes.map((p, i) => {
    const inicio = acumulado
    acumulado += (p.valor / denominador) * 360
    return { ...p, porcentaje: porcentajes[i], inicio, fin: i === partes.length - 1 ? 360 : acumulado }
  })
}

const redondear = (n: number) => Number(n.toFixed(3))

/** Trazo SVG de una rebanada: del centro al borde, un arco y de vuelta. Una sola rebanada es el círculo entero. */
export function rutaDeRebanada(cx: number, cy: number, r: number, inicio: number, fin: number): string {
  if (fin - inicio >= 359.999) {
    // Un arco no puede cerrar un círculo completo: se dibuja con dos mitades.
    return `M${cx} ${cy - r}A${r} ${r} 0 1 1 ${cx} ${cy + r}A${r} ${r} 0 1 1 ${cx} ${cy - r}Z`
  }
  const punto = (grados: number) => {
    const a = (grados * Math.PI) / 180
    return `${redondear(cx + r * Math.sin(a))} ${redondear(cy - r * Math.cos(a))}`
  }
  const grande = fin - inicio > 180 ? 1 : 0
  return `M${cx} ${cy}L${punto(inicio)}A${r} ${r} 0 ${grande} 1 ${punto(fin)}Z`
}
