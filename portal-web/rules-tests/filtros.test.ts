// Filtros de verificación de los listados (src/components/Reportes/filtros.ts).
import { describe, expect, it } from 'vitest'
import { FILTROS_VACIOS, filtrarReportes, filtrosLocalesActivos, resumenListado } from '../src/components/Reportes/filtros'
import { VALIDACION_VACIA } from '../src/confianza/tipos'
import type { Reporte } from '../src/components/Reportes/reporte'

const reporte = (id: string, validacion: Partial<typeof VALIDACION_VACIA>): Reporte =>
  ({
    id, uid: 'u', categoria: 'otro', descripcion: id, estado: 'reportado', comuna: '', region: '',
    autorNombre: null, fecha: new Date(), foto: null, operadorId: null, organismoId: null, organismoNombre: null,
    lat: null, lng: null, origen: null, validacion: { ...VALIDACION_VACIA, ...validacion },
  }) as Reporte

const lista = [
  reporte('sin_validar', {}),
  reporte('validado', { validado: true, puntos: 105, votos: 4 }),
  reporte('validado_real', { validado: true, veredicto: 'real' }),
  reporte('validado_falso', { validado: true, veredicto: 'falso' }),
  reporte('veredicto_sin_validar', { veredicto: 'real' }),
]
const ids = (f: Partial<typeof FILTROS_VACIOS>) => filtrarReportes(lista, { ...FILTROS_VACIOS, ...f }).map((r) => r.id)

describe('filtro de verificación', () => {
  it('sin filtro, todos', () => expect(ids({})).toHaveLength(5))
  it('validados: los que la comunidad validó, tengan o no veredicto', () => {
    expect(ids({ verificacion: 'validados' })).toEqual(['validado', 'validado_real', 'validado_falso'])
  })
  it('por verificar: validados que aún no tienen veredicto', () => {
    expect(ids({ verificacion: 'por_verificar' })).toEqual(['validado'])
  })
  it('solo «por verificar» actúa sobre la página', () => {
    expect(filtrosLocalesActivos({ ...FILTROS_VACIOS, verificacion: 'por_verificar' })).toBe(true)
    expect(filtrosLocalesActivos({ ...FILTROS_VACIOS, verificacion: 'validados' })).toBe(false)
  })
  it('el resumen explica qué se oculta', () => {
    expect(resumenListado(7, 7, 2, { ...FILTROS_VACIOS, verificacion: 'por_verificar' })).toContain('2 de los 7')
  })
})
