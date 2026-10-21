// El portal y `comun/` (la lógica que comparte con la app móvil) deben dar lo
// mismo. Mientras el portal conserve su propia copia de algún cálculo, esta
// prueba falla si alguien cambia un lado y no el otro.
import { describe, expect, it } from 'vitest'
import * as C from '@ciudad-alerta/comun'
import { COLOR_POR_ESTADO, ESTADOS_EN_ORDEN, ETIQUETA_POR_ESTADO, TRANSICIONES } from '../src/constants/reportes'
import * as R from '../src/confianza/reglas'
import { calcularTiempos, formatearDuracion, mediana, promedio } from '../src/components/Reportes/tiempos'
import { agruparPorComuna, normalizar, rangosDeTramos, tramoDeIntensidad } from '../src/pages/Admin/mapaCalor'
import { DESCRIPCION_MAX, DESCRIPCION_MIN } from '../src/components/Reportes/crearReporte'

describe('estados', () => {
  it('el portal usa los de comun', () => {
    expect(ESTADOS_EN_ORDEN).toEqual([...C.ESTADOS_EN_ORDEN])
    expect(ETIQUETA_POR_ESTADO).toEqual(C.ETIQUETAS_ESTADO)
    expect(COLOR_POR_ESTADO).toEqual(C.COLORES_ESTADO)
    expect(TRANSICIONES).toEqual(Object.fromEntries(Object.entries(C.TRANSICIONES).map(([k, v]) => [k, [...v]])))
  })
  it('«Resuelto» es verde, como en la app', () => {
    expect(COLOR_POR_ESTADO.resuelto).toBe('#3fbf8f')
  })
  it('largo de la descripción', () => {
    expect([DESCRIPCION_MIN, DESCRIPCION_MAX]).toEqual([C.DESCRIPCION_MIN, C.DESCRIPCION_MAX])
  })
})

describe('sistema de confianza (copia del portal contra comun)', () => {
  const puntos = Array.from({ length: 821 }, (_, i) => i)
  const niveles = Array.from({ length: 11 }, (_, i) => i)

  it('nivel, peso y límite diario', () => {
    expect(puntos.map(R.nivelDePuntos)).toEqual(puntos.map(C.nivelDePuntos))
    expect(niveles.map(R.pesoDeNivel)).toEqual(niveles.map(C.pesoDeNivel))
    expect(niveles.map(R.limiteDiario)).toEqual(niveles.map(C.limiteDiario))
  })
  it('número de día', () => {
    const instantes = [0, 1_000_000_000_000, 1_792_000_000_000, 1_792_000_000_000 + 10_799_999, 1_792_000_000_000 + 10_800_000]
    expect(instantes.map((i) => R.numeroDeDia(i))).toEqual(instantes.map(C.numeroDeDia))
  })
  it('sumar un voto', () => {
    const casos: [number, number, boolean, number][] = [[0, 0, false, 10], [95, 3, false, 10], [90, 1, false, 10], [100, 2, false, 0], [120, 4, true, 10], [50, 2, false, 34]]
    for (const [p, v, val, w] of casos) {
      expect(R.sumarVoto({ puntos: p, votos: v, validado: val }, w)).toEqual(C.sumarConfirmacion({ puntos: p, votos: v, validado: val }, w))
    }
  })
  it('puntos tras el veredicto', () => {
    const casos: [number, 'real' | 'falso'][] = [[0, 'real'], [755, 'real'], [760, 'real'], [5, 'falso'], [0, 'falso'], [20, 'falso']]
    for (const [p, v] of casos) expect(R.aplicarVeredicto(p, v).puntos).toBe(C.puntosTrasVeredicto(p, v))
  })
  it('porcentaje de verificación', () => {
    for (const p of [0, 37, 100, 250]) expect(R.porcentajeVerificacion(p)).toBe(C.porcentajeDeValidacion({ puntos: p }))
  })
})

describe('tiempos', () => {
  it('formato de la duración, mediana y promedio', () => {
    const d = [0, 30_000, 60_000, 90_000, 59 * 60_000, 60 * 60_000, 135 * 60_000, 24 * 3_600_000, 36 * 3_600_000, 3.5 * 86_400_000, 9.96 * 86_400_000, 18 * 86_400_000]
    expect(d.map(formatearDuracion)).toEqual(d.map(C.formatearDuracion))
    expect([mediana([5, 1, 3, 9]), mediana([]), promedio([2, 4]), promedio([])]).toEqual([C.mediana([5, 1, 3, 9]), C.mediana([]), C.promedio([2, 4]), C.promedio([])])
  })
  it('primera atención y resolución con el historial ordenado', () => {
    const creado = new Date('2026-10-01T10:00:00Z')
    const cambios = [
      { fecha: new Date('2026-10-01T12:00:00Z'), hacia: 'en_revision' },
      { fecha: new Date('2026-10-03T10:00:00Z'), hacia: 'resuelto' },
    ]
    expect(calcularTiempos({ fecha: creado } as never, cambios as never)).toEqual(C.calcularTiempos(creado, cambios))
  })
})

describe('mapa de calor', () => {
  it('agrupación por comuna y tramos', () => {
    const catalogo = [
      { codigo: '13101', nombre: 'Santiago', codigoRegion: '13', region: 'RM', organismoId: 'muni_13101' },
      { codigo: '13119', nombre: 'Maipú', codigoRegion: '13', region: 'RM', organismoId: 'muni_13119' },
    ]
    const r = (estado: string, categoria: string, comuna: string, organismoId: string | null) => ({ estado, categoria, comuna, organismoId })
    const reportes = [r('reportado', 'a', 'Santiago', 'muni_13101'), r('resuelto', 'a', 'Maipu', null), r('cerrado', 'b', '', 'muni_13119'), r('reportado', 'b', 'Zzz', null)]
    const resumir = (m: Map<string, { total: number; sinResolver: number; resueltos: number; cerrados: number }>) =>
      [...m.entries()].map(([k, v]) => [k, v.total, v.sinResolver, v.resueltos, v.cerrados]).sort()
    const gp = agruparPorComuna(reportes as never, catalogo)
    const gc = C.agruparPorComuna(reportes, catalogo.map((c) => ({ codigo: c.codigo, nombre: c.nombre })))
    expect(resumir(gp.porComuna)).toEqual(resumir(gc.porComuna))
    expect(gp.sinComuna).toBe(gc.sinComuna)
    expect([0, 1, 5, 10].map((v) => tramoDeIntensidad(v, 10))).toEqual([0, 1, 5, 10].map((v) => C.tramoDeIntensidad(v, 10)))
    expect(rangosDeTramos(20)).toEqual(C.rangosDeTramos(20))
    expect(['Ñuñoa', 'MAIPÚ', ' Providencia '].map(normalizar)).toEqual(['Ñuñoa', 'MAIPÚ', ' Providencia '].map(C.normalizar))
  })
})
