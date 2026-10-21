// Tiempos y resolución en el portal (src/components/Reportes/tiempos.ts), que
// ahora salen de `comun/` igual que en la app móvil.
import { describe, expect, it } from 'vitest'
import { calcularTiempos, textoResolucion } from '../src/components/Reportes/tiempos'
import { VALIDACION_VACIA } from '../src/confianza/tipos'
import type { Reporte } from '../src/components/Reportes/reporte'
import type { CambioEstado } from '../src/components/Reportes/historial'

const creado = new Date('2026-10-01T10:00:00Z')
const cambio = (hacia: string, iso: string | null): CambioEstado =>
  ({ id: hacia, desde: '', hacia, comentario: '', fecha: iso ? new Date(iso) : null, autorNombre: null, autorRol: null })

const enRevision = cambio('en_revision', '2026-10-01T12:00:00Z')
const resuelto = cambio('resuelto', '2026-10-03T10:00:00Z')

const reporte = (extra: Partial<Reporte> = {}): Reporte =>
  ({
    id: 'r1', uid: 'u', categoria: 'otro', descripcion: '', estado: 'reportado', comuna: '', region: '', autorNombre: null,
    fecha: creado, foto: null, operadorId: null, organismoId: null, organismoNombre: null, lat: null, lng: null, origen: null,
    validacion: VALIDACION_VACIA, ...extra,
  }) as Reporte

const HORA = 3_600_000

describe('calcularTiempos', () => {
  it('con el historial ordenado', () => {
    expect(calcularTiempos(reporte(), [enRevision, resuelto])).toEqual({ primeraAtencionMs: 2 * HORA, resolucionMs: 48 * HORA })
  })

  it('con el historial en desorden, la primera atención sigue siendo el primer cambio', () => {
    expect(calcularTiempos(reporte(), [resuelto, enRevision])).toEqual({ primeraAtencionMs: 2 * HORA, resolucionMs: 48 * HORA })
  })

  it('si el reporte guarda tiempoResolucionMs, ese es el dato oficial (igual que la app)', () => {
    expect(calcularTiempos(reporte({ tiempoResolucionMs: 5_000_000 }), [enRevision, resuelto])).toEqual({
      primeraAtencionMs: 2 * HORA,
      resolucionMs: 5_000_000,
    })
  })

  it('un reporte sin atender no tiene tiempos', () => {
    expect(calcularTiempos(reporte(), [])).toEqual({ primeraAtencionMs: null, resolucionMs: null })
  })

  it('sin fecha de creación solo vale el tiempo guardado', () => {
    expect(calcularTiempos(reporte({ fecha: null, tiempoResolucionMs: 7 * HORA }), [enRevision])).toEqual({
      primeraAtencionMs: null,
      resolucionMs: 7 * HORA,
    })
  })

  it('un cambio anterior a la creación (reloj adelantado) no da un tiempo negativo', () => {
    expect(calcularTiempos(reporte(), [cambio('en_revision', '2026-10-01T09:00:00Z')]).primeraAtencionMs).toBe(0)
  })
})

describe('textoResolucion (fila «Resolución» del detalle)', () => {
  it('un reporte abierto no muestra nada', () => {
    expect(textoResolucion(reporte({ estado: 'en_proceso' }), [enRevision])).toBeNull()
  })

  it('resuelto con los datos guardados: fecha y tiempo', () => {
    const t = textoResolucion(reporte({ estado: 'resuelto', resueltoAt: new Date('2026-10-03T10:00:00Z'), tiempoResolucionMs: 48 * HORA }), null)
    expect(t).toContain('Resuelto el ')
    expect(t).toContain('en 2 días')
    expect(t).not.toContain('historial')
  })

  it('resuelto antes de existir esos datos: se deduce del historial y se dice', () => {
    const t = textoResolucion(reporte({ estado: 'resuelto' }), [enRevision, resuelto])
    expect(t).toBe('Resuelto · en 2 días (según el historial)')
  })

  it('un reporte antiguo terminado espera a tener su historial antes de decir algo', () => {
    expect(textoResolucion(reporte({ estado: 'resuelto' }), null)).toBeNull()
  })

  it('cerrado sin pasar por resuelto', () => {
    expect(textoResolucion(reporte({ estado: 'cerrado', cerradoSinResolverAt: new Date('2026-10-02T10:00:00Z') }), null)).toContain('Cerrado sin resolver el ')
    expect(textoResolucion(reporte({ estado: 'cerrado' }), [enRevision, cambio('cerrado', '2026-10-02T10:00:00Z')])).toBe('Cerrado sin resolver')
  })

  it('cerrado y sin historial: no se sabe si antes se resolvió', () => {
    expect(textoResolucion(reporte({ estado: 'cerrado' }), [])).toBe('Cerrado (no hay datos para saber si antes se resolvió)')
  })
})
