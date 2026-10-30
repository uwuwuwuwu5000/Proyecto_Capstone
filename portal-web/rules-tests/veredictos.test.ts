// Fase 1 de «Por veredicto»: filtros, orden y URL de la lista de pendientes
// (src/pages/Operador/veredictos.ts). Son funciones puras de la interfaz del portal.
// Los cálculos (pendiente, espera, tiempo hasta el veredicto…) se prueban en comun/test/veredictos.test.ts.
import { describe, expect, it } from 'vitest'
import {
  FILTROS_PENDIENTES_VACIOS,
  filtrarPendientes,
  filtrosAUrl,
  filtrosDeUrl,
  hayFiltrosActivos,
  ordenarPendientes,
} from '../src/pages/Operador/veredictos'
import { VALIDACION_VACIA } from '../src/confianza/tipos'
import type { Validacion } from '../src/confianza/tipos'
import type { Reporte } from '../src/components/Reportes/reporte'

const HORA = 3_600_000
const AHORA = new Date('2026-10-30T12:00:00Z').getTime()
const hace = (horas: number) => new Date(AHORA - horas * HORA)

const validado = (extra: Partial<Validacion> = {}): Validacion => ({
  ...VALIDACION_VACIA, puntos: 105, votos: 4, validado: true, validadoAt: hace(10), ...extra,
})

const reporte = (extra: Partial<Reporte> = {}): Reporte =>
  ({
    id: 'r1', uid: 'u', categoria: 'luminaria', descripcion: 'Luminaria apagada en la esquina', estado: 'reportado',
    comuna: 'Maipú', region: 'Metropolitana', autorNombre: null, fecha: hace(30), foto: null, operadorId: 'opr_a',
    organismoId: null, organismoNombre: null, lat: null, lng: null, origen: null, validacion: validado(), ...extra,
  }) as Reporte

describe('filtrarPendientes', () => {
  const lista = [
    reporte({ id: 'a', categoria: 'luminaria', comuna: 'Maipú', descripcion: 'Poste con CABLES sueltos', foto: { tipo: 'firestore', path: 'reportPhotos/a' }, validacion: validado({ validadoAt: hace(2) }) }),
    reporte({ id: 'b', categoria: 'microbasural', comuna: 'Cerrillos', descripcion: 'Basura acumulada', validacion: validado({ validadoAt: hace(30) }) }),
    reporte({ id: 'c', categoria: 'luminaria', comuna: 'Cerrillos', descripcion: 'Luminaria rota', validacion: validado({ validadoAt: hace(60) }) }),
    reporte({ id: 'd', categoria: 'otro', comuna: 'Maipú', descripcion: 'Árbol caído', validacion: validado({ validadoAt: hace(200) }) }),
    reporte({ id: 'e', categoria: 'otro', comuna: 'Maipú', descripcion: 'Sin fecha de validación', validacion: validado({ validadoAt: null }) }),
  ]
  const ids = (f: Partial<typeof FILTROS_PENDIENTES_VACIOS>) =>
    filtrarPendientes(lista, { ...FILTROS_PENDIENTES_VACIOS, ...f }, AHORA).map((r) => r.id)

  it('sin filtros devuelve todos', () => expect(ids({})).toEqual(['a', 'b', 'c', 'd', 'e']))
  it('por categoría', () => expect(ids({ categoria: 'luminaria' })).toEqual(['a', 'c']))
  it('por comuna', () => expect(ids({ comuna: 'Cerrillos' })).toEqual(['b', 'c']))
  it('por tiempo de espera, sin contar los que no tienen fecha de validación', () => {
    expect(ids({ espera: '24h' })).toEqual(['b', 'c', 'd'])
    expect(ids({ espera: '48h' })).toEqual(['c', 'd'])
    expect(ids({ espera: '7d' })).toEqual(['d'])
  })
  it('por texto, sin distinguir mayúsculas ni tildes', () => {
    expect(ids({ texto: 'cables' })).toEqual(['a'])
    expect(ids({ texto: 'arbol' })).toEqual(['d'])
    expect(ids({ texto: '  LUMINARIA ' })).toEqual(['c'])
  })
  it('con o sin foto', () => {
    expect(ids({ foto: 'con' })).toEqual(['a'])
    expect(ids({ foto: 'sin' })).toEqual(['b', 'c', 'd', 'e'])
  })
  it('los filtros se combinan', () => {
    expect(ids({ categoria: 'luminaria', comuna: 'Cerrillos', espera: '48h' })).toEqual(['c'])
    expect(ids({ categoria: 'luminaria', comuna: 'Cerrillos', espera: '7d' })).toEqual([])
  })
  it('no modifica la lista original', () => {
    const copia = [...lista]
    ids({ categoria: 'otro' })
    expect(lista).toEqual(copia)
  })
})

describe('ordenarPendientes', () => {
  const a = reporte({ id: 'a', fecha: hace(100), validacion: validado({ validadoAt: hace(5), puntos: 120, votos: 5 }) })
  const b = reporte({ id: 'b', fecha: hace(90), validacion: validado({ validadoAt: hace(50), puntos: 100, votos: 3 }) })
  const c = reporte({ id: 'c', fecha: hace(80), validacion: validado({ validadoAt: hace(20), puntos: 100, votos: 4 }) })
  const sinFecha = reporte({ id: 'd', fecha: hace(70), validacion: validado({ validadoAt: null, puntos: 400, votos: 9 }) })
  const lista = [a, sinFecha, b, c]
  const orden = (o: 'antiguos' | 'votos' | 'recientes') => ordenarPendientes(lista, o).map((r) => r.id)

  it('más antiguos primero (los que esperan hace más), y al final los sin fecha', () => {
    expect(orden('antiguos')).toEqual(['b', 'c', 'a', 'd'])
  })
  it('más votos primero: por puntos y, si empatan, por votos', () => {
    expect(orden('votos')).toEqual(['d', 'a', 'c', 'b'])
  })
  it('más recientes primero, y al final los sin fecha', () => {
    expect(orden('recientes')).toEqual(['a', 'c', 'b', 'd'])
  })
  it('no modifica la lista original', () => {
    orden('votos')
    expect(lista.map((r) => r.id)).toEqual(['a', 'd', 'b', 'c'])
  })
})

describe('filtros en la URL', () => {
  it('sin parámetros da los filtros vacíos', () => {
    expect(filtrosDeUrl(new URLSearchParams(''))).toEqual(FILTROS_PENDIENTES_VACIOS)
  })
  it('ida y vuelta', () => {
    const f = { categoria: 'luminaria', comuna: 'Maipú', espera: '48h', texto: 'poste caído', foto: 'con', orden: 'votos' } as const
    expect(filtrosDeUrl(filtrosAUrl(f))).toEqual(f)
  })
  it('no escribe los valores por defecto', () => {
    expect(filtrosAUrl(FILTROS_PENDIENTES_VACIOS).toString()).toBe('')
    expect(filtrosAUrl({ ...FILTROS_PENDIENTES_VACIOS, categoria: 'otro' }).toString()).toBe('cat=otro')
  })
  it('ignora valores que no existen', () => {
    const f = filtrosDeUrl(new URLSearchParams('espera=99h&orden=raro&foto=quizas&cat=otro'))
    expect(f).toEqual({ ...FILTROS_PENDIENTES_VACIOS, categoria: 'otro' })
  })
  it('hayFiltrosActivos ignora el orden', () => {
    expect(hayFiltrosActivos(FILTROS_PENDIENTES_VACIOS)).toBe(false)
    expect(hayFiltrosActivos({ ...FILTROS_PENDIENTES_VACIOS, orden: 'votos' })).toBe(false)
    expect(hayFiltrosActivos({ ...FILTROS_PENDIENTES_VACIOS, texto: 'x' })).toBe(true)
  })
})

