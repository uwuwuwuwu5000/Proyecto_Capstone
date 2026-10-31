// Fase 1 de «Por veredicto»: filtros, orden y URL de la lista de pendientes
// (src/pages/Operador/veredictos.ts). Son funciones puras de la interfaz del portal.
// Los cálculos (pendiente, espera, tiempo hasta el veredicto…) se prueban en comun/test/veredictos.test.ts.
import { describe, expect, it } from 'vitest'
import {
  FILTROS_PENDIENTES_VACIOS,
  filtrarPendientes,
  filtrosAUrl,
  filtrosDeUrl,
  MAXIMO_HISTORIALES_REVISION,
  candidatosDeRevision,
  hayFiltrosActivos,
  ordenarPendientes,
  revisionACierreDelPeriodo,
} from '../src/pages/Operador/veredictos'
import { VALIDACION_VACIA } from '../src/confianza/tipos'
import type { Validacion } from '../src/confianza/tipos'
import type { Reporte } from '../src/components/Reportes/reporte'
import type { CambioEstado } from '../src/components/Reportes/historial'

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


// ---- Revisión a cierre (cuarta tarjeta) ----

const cambioDe = (hacia: string, fecha: Date | null): CambioEstado =>
  ({ id: `${hacia}-${fecha?.getTime()}`, desde: '', hacia, comentario: '', fecha, autorNombre: null, autorRol: null })

const cerrado = (id: string, actualizadoHace: number | null): Reporte =>
  reporte({ id, estado: 'cerrado', actualizadoAt: actualizadoHace === null ? null : hace(actualizadoHace) })

describe('candidatosDeRevision (qué cerrados se leen para medir la revisión a cierre)', () => {
  const sinLimite = { inicio: null, fin: null }

  it('deja fuera los cerrados que se actualizaron antes del periodo', () => {
    const lista = [cerrado('viejo', 500), cerrado('reciente', 5), cerrado('medio', 100)]
    const r = candidatosDeRevision(lista, { inicio: hace(200), fin: null })
    expect(r.candidatos.map((x) => x.id)).toEqual(['reciente', 'medio'])
    expect(r.hayMas).toBe(false)
  })
  it('sin periodo (Todo) entran todos, de los más recientes a los más antiguos', () => {
    const lista = [cerrado('a', 300), cerrado('b', 10), cerrado('c', 100)]
    expect(candidatosDeRevision(lista, sinLimite).candidatos.map((x) => x.id)).toEqual(['b', 'c', 'a'])
  })
  it('un cerrado sin fecha de actualización no se descarta, queda al final', () => {
    const lista = [cerrado('sin', null), cerrado('con', 10)]
    expect(candidatosDeRevision(lista, { inicio: hace(200), fin: null }).candidatos.map((x) => x.id)).toEqual(['con', 'sin'])
  })
  it('lee como máximo los más recientes y avisa que hay más', () => {
    const lista = Array.from({ length: MAXIMO_HISTORIALES_REVISION + 20 }, (_, i) => cerrado(`r${i}`, i + 1))
    const r = candidatosDeRevision(lista, sinLimite)
    expect(r.candidatos).toHaveLength(MAXIMO_HISTORIALES_REVISION)
    expect(r.candidatos[0].id).toBe('r0')
    expect(r.hayMas).toBe(true)
  })
  it('un tope más pequeño se puede pedir', () => {
    const r = candidatosDeRevision([cerrado('a', 1), cerrado('b', 2), cerrado('c', 3)], sinLimite, 2)
    expect(r.candidatos.map((x) => x.id)).toEqual(['a', 'b'])
    expect(r.hayMas).toBe(true)
  })
})

describe('revisionACierreDelPeriodo', () => {
  const t0 = new Date('2026-10-20T10:00:00Z')
  const en = (horas: number) => new Date(t0.getTime() + horas * HORA)
  const reportes = ['r1', 'r2', 'r3', 'r4'].map((id) => cerrado(id, 1))
  // r1: revisión → cerrado en 12 h. r2: revisión → resuelto 18 h → cerrado 24 h. r3: sin revisión. r4: cerrado fuera del periodo.
  const historiales = new Map<string, CambioEstado[]>([
    ['r1', [cambioDe('en_revision', t0), cambioDe('cerrado', en(12))]],
    ['r2', [cambioDe('en_revision', en(1)), cambioDe('resuelto', en(19)), cambioDe('cerrado', en(25))]],
    ['r3', [cambioDe('derivado', t0), cambioDe('cerrado', en(3))]],
    ['r4', [cambioDe('en_revision', new Date('2026-01-01T00:00:00Z')), cambioDe('cerrado', new Date('2026-01-04T00:00:00Z'))]],
  ])

  it('con todo el periodo: mediana y promedio, los que no pasaron por revisión se informan aparte', () => {
    const r = revisionACierreDelPeriodo(historiales, reportes, { inicio: null, fin: null })
    expect(r.enPeriodo).toBe(4)
    expect(r.sinRevision).toBe(1)
    expect(r.cierre).toEqual({ cantidad: 3, excluidos: 0, mediana: 24 * HORA, promedio: 36 * HORA })
    expect(r.resuelto).toEqual({ cantidad: 1, excluidos: 0, mediana: 18 * HORA, promedio: 18 * HORA })
  })
  it('el periodo se mide por la fecha del cierre, no por la de creación', () => {
    const r = revisionACierreDelPeriodo(historiales, reportes, { inicio: new Date('2026-10-01T00:00:00Z'), fin: null })
    expect(r.enPeriodo).toBe(3)
    expect(r.cierre).toEqual({ cantidad: 2, excluidos: 0, mediana: 18 * HORA, promedio: 18 * HORA })
  })
  it('un reporte cuyo historial aún no se leyó no cuenta', () => {
    const r = revisionACierreDelPeriodo(new Map([['r1', historiales.get('r1')!]]), reportes, { inicio: null, fin: null })
    expect(r.enPeriodo).toBe(1)
    expect(r.cierre.cantidad).toBe(1)
  })
  it('un cerrado sin entrada de cierre en el historial se excluye', () => {
    const r = revisionACierreDelPeriodo(new Map([['r1', [cambioDe('en_revision', t0)]]]), [reportes[0]], { inicio: null, fin: null })
    expect(r.enPeriodo).toBe(0)
    expect(r.sinRevision).toBe(0)
    expect(r.cierre.cantidad).toBe(0)
  })
  it('sin reportes no hay nada que medir', () => {
    const r = revisionACierreDelPeriodo(new Map(), [], { inicio: null, fin: null })
    expect(r).toMatchObject({ enPeriodo: 0, sinRevision: 0, cierre: { cantidad: 0, mediana: null } })
  })
})
