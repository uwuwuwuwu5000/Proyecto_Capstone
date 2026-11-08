// Fase 14: la lógica de los gráficos de torta de las estadísticas globales (src/components/Graficos/torta.ts) y la
// escala de colores del mapa de calor (src/pages/Admin/mapaCalor.ts).
import { describe, expect, it } from 'vitest'
import { COLOR_OTRAS, PALETA_TORTA, construirRebanadas, rutaDeRebanada } from '../src/components/Graficos/torta'
import { colorDeTramo } from '../src/pages/Admin/mapaCalor'

const fila = (clave: string, valor: number, colorIdentidad?: string) => ({ clave, etiqueta: clave.toUpperCase(), valor, colorIdentidad })

describe('construirRebanadas', () => {
  it('una rebanada por fila con valor, con su porcentaje, y los porcentajes suman 100', () => {
    const r = construirRebanadas([fila('a', 1), fila('b', 1), fila('c', 1)], 3)
    expect(r.map((x) => x.clave)).toEqual(['a', 'b', 'c'])
    expect(r.reduce((s, x) => s + x.porcentaje, 0)).toBe(100)
  })

  it('las filas en cero no dibujan rebanada', () => {
    const r = construirRebanadas([fila('a', 4), fila('b', 0), fila('c', 1)], 5)
    expect(r.map((x) => x.clave)).toEqual(['a', 'c'])
  })

  it('con más rebanadas que el máximo, el resto se junta en «Otras» y nunca pasan de máximo + 1', () => {
    const filas = Array.from({ length: 12 }, (_, i) => fila(`k${i}`, 12 - i))
    const total = filas.reduce((s, f) => s + f.valor, 0)
    const r = construirRebanadas(filas, total, 8)
    expect(r).toHaveLength(9)
    const otras = r[8]
    expect(otras).toMatchObject({ clave: '__otras__', etiqueta: 'Otras', color: COLOR_OTRAS })
    // 4 + 3 + 2 + 1 de las cuatro filas que quedaron fuera.
    expect(otras.valor).toBe(10)
    expect(r.reduce((s, x) => s + x.porcentaje, 0)).toBe(100)
  })

  it('si la lista es parcial (las 10 comunas con más reportes), «Otras» recoge lo que falta del total', () => {
    const r = construirRebanadas([fila('maipu', 10), fila('pudahuel', 5)], 20)
    expect(r.map((x) => [x.clave, x.valor])).toEqual([
      ['maipu', 10],
      ['pudahuel', 5],
      ['__otras__', 5],
    ])
  })

  it('el color de identidad (el de cada estado) se respeta; el resto usa la paleta, sin repetir los 8 primeros', () => {
    const r = construirRebanadas([fila('x', 3, '#123456'), fila('y', 2), fila('z', 1)], 6)
    expect(r[0].color).toBe('#123456')
    const sinIdentidad = construirRebanadas(Array.from({ length: 8 }, (_, i) => fila(`k${i}`, 1)), 8)
    expect(new Set(sinIdentidad.map((x) => x.color)).size).toBe(8)
    expect(PALETA_TORTA).toHaveLength(8)
  })

  it('con un solo valor ocupa el círculo entero; sin reportes no hay rebanadas', () => {
    const una = construirRebanadas([fila('a', 7), fila('b', 0)], 7)
    expect(una).toHaveLength(1)
    expect(una[0]).toMatchObject({ porcentaje: 100, inicio: 0, fin: 360 })
    expect(construirRebanadas([fila('a', 0)], 0)).toEqual([])
  })

  it('los ángulos son consecutivos y cierran el círculo', () => {
    const r = construirRebanadas([fila('a', 1), fila('b', 2), fila('c', 1)], 4)
    expect(r[0].inicio).toBe(0)
    for (let i = 1; i < r.length; i++) expect(r[i].inicio).toBeCloseTo(r[i - 1].fin, 6)
    expect(r[r.length - 1].fin).toBeCloseTo(360, 6)
  })
})

describe('rutaDeRebanada', () => {
  it('una rebanada normal es un sector: va al centro, al borde, un arco y vuelve', () => {
    const d = rutaDeRebanada(100, 100, 80, 0, 90)
    expect(d.startsWith('M100 100')).toBe(true)
    expect(d).toContain('A80 80 0 0 1')
    expect(d.endsWith('Z')).toBe(true)
  })

  it('el círculo entero se dibuja con dos arcos (uno solo no se puede dibujar)', () => {
    const d = rutaDeRebanada(100, 100, 80, 0, 360)
    expect((d.match(/A/g) ?? []).length).toBe(2)
  })

  it('un arco de más de media vuelta usa la bandera de arco grande', () => {
    expect(rutaDeRebanada(100, 100, 80, 0, 200)).toContain('A80 80 0 1 1')
  })
})

describe('colorDeTramo (escala del mapa de calor)', () => {
  const rgba = (s: string) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s)!
    return [Number(m[1]), Number(m[2]), Number(m[3])] as const
  }
  /** Matiz en grados: azul ≈ 217, celeste ≈ 187, amarillo ≈ 48, naranja ≈ 27, rojo ≈ 0. */
  const matiz = ([r, g, b]: readonly [number, number, number]) => {
    const [rn, gn, bn] = [r / 255, g / 255, b / 255]
    const max = Math.max(rn, gn, bn)
    const d = max - Math.min(rn, gn, bn)
    if (d === 0) return 0
    const h = max === rn ? ((gn - bn) / d) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4
    return (h * 60 + 360) % 360
  }

  it('las comunas sin reportes sin resolver (tramo 0) siguen sin color', () => {
    const { relleno } = colorDeTramo(0)
    expect(relleno).toBe('rgba(17, 24, 39, 0.08)')
  })

  it('va del azul (pocos sin resolver) al rojo (muchos), cada tramo con un color distinto', () => {
    const colores = [1, 2, 3, 4, 5].map((t) => rgba(colorDeTramo(t).borde))
    const matices = colores.map(matiz)
    // El primero es azul y el último, rojo.
    expect(matices[0]).toBeGreaterThan(190)
    expect(matices[0]).toBeLessThan(250)
    expect(matices[4]).toBeLessThan(15)
    // El matiz baja de tramo en tramo: azul → celeste → amarillo → naranja → rojo.
    for (let i = 1; i < matices.length; i++) expect(matices[i]).toBeLessThan(matices[i - 1])
    expect(new Set(colores.map((c) => c.join())).size).toBe(5)
  })

  it('el relleno de los tramos con reportes es lo bastante opaco para verse sobre el mapa', () => {
    for (const t of [1, 2, 3, 4, 5]) {
      const alfa = Number(/,\s*([\d.]+)\)$/.exec(colorDeTramo(t).relleno)![1])
      expect(alfa).toBeGreaterThanOrEqual(0.4)
    }
  })
})
