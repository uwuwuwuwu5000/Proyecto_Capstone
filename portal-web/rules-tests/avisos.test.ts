// Avisos derivados (src/components/Avisos/derivar.ts).
import { describe, expect, it } from 'vitest'
import { avisoDeNivel, avisosDeValidacion, idAvisoNivel, nivelVistoDe } from '../src/components/Avisos/derivar'
import { VALIDACION_VACIA } from '../src/confianza/tipos'

const fecha = new Date('2026-10-20T15:00:00Z')

describe('validación y veredicto', () => {
  it('sin nada que avisar, lista vacía', () => {
    expect(avisosDeValidacion('r1', 'Basura', VALIDACION_VACIA)).toEqual([])
  })

  it('validado por la comunidad', () => {
    const a = avisosDeValidacion('r1', 'Basura', { ...VALIDACION_VACIA, validado: true, validadoAt: fecha })
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ id: 'r1_validado', tipo: 'validado', reportId: 'r1', fecha })
  })

  it('validado sin fecha no genera aviso (no se puede ordenar ni dar por visto)', () => {
    expect(avisosDeValidacion('r1', 'Basura', { ...VALIDACION_VACIA, validado: true })).toEqual([])
  })

  it('veredicto real muestra los puntos', () => {
    const [a] = avisosDeValidacion('r1', 'Basura', {
      ...VALIDACION_VACIA, veredicto: 'real', veredictoAt: fecha, veredictoPuntos: 10,
    })
    expect(a.titulo).toBe('Tu reporte fue verificado como real (+10 puntos)')
  })

  it('veredicto falso muestra el motivo y los puntos restados', () => {
    const [a] = avisosDeValidacion('r1', 'Basura', {
      ...VALIDACION_VACIA, veredicto: 'falso', veredictoAt: fecha, veredictoPuntos: -15, veredictoComentario: ' La foto es ajena ',
    })
    expect(a.titulo).toBe('Tu reporte fue marcado como falso (−15 puntos)')
    expect(a.comentario).toBe('La foto es ajena')
  })

  it('sin cambio de puntos (piso o tope), no se menciona', () => {
    const [a] = avisosDeValidacion('r1', 'Basura', {
      ...VALIDACION_VACIA, veredicto: 'falso', veredictoAt: fecha, veredictoPuntos: 0, veredictoComentario: 'x',
    })
    expect(a.titulo).toBe('Tu reporte fue marcado como falso')
  })

  it('validado y con veredicto: dos avisos', () => {
    const a = avisosDeValidacion('r1', 'Basura', {
      ...VALIDACION_VACIA, validado: true, validadoAt: fecha, veredicto: 'real', veredictoAt: fecha, veredictoPuntos: 10,
    })
    expect(a.map((x) => x.id)).toEqual(['r1_validado', 'r1_veredicto'])
  })

  it('la descripción larga se acorta', () => {
    const [a] = avisosDeValidacion('r1', 'x'.repeat(200), { ...VALIDACION_VACIA, validado: true, validadoAt: fecha })
    expect(a.reporte.length).toBeLessThanOrEqual(60)
  })
})

describe('nivel', () => {
  it('sin nivel anterior conocido, el texto es neutro', () => {
    expect(avisoDeNivel(3, null, fecha)?.titulo).toBe('Ahora estás en el Nivel 3 · Colaborador activo')
  })
  it('sin nivel anterior y en el nivel 0, no hay aviso', () => {
    expect(avisoDeNivel(0, null, fecha)).toBeNull()
  })
  it('subió', () => {
    expect(avisoDeNivel(2, 1, fecha)).toMatchObject({ id: 'nivel:2', tipo: 'nivel', reportId: null })
    expect(avisoDeNivel(2, 1, fecha)?.titulo).toBe('Subiste al Nivel 2 · Colaborador')
  })
  it('bajó', () => {
    expect(avisoDeNivel(0, 1, fecha)?.titulo).toBe('Bajaste al Nivel 0 · Vecino nuevo')
  })
  it('igual al anterior, sin aviso', () => {
    expect(avisoDeNivel(2, 2, fecha)).toBeNull()
  })
  it('el nivel visto sale de los marcadores, sin contar el actual', () => {
    const vistos = ['r1_abc', idAvisoNivel(1), idAvisoNivel(3), idAvisoNivel(2)]
    expect(nivelVistoDe(vistos, 3)).toBe(2)
    expect(nivelVistoDe(vistos, 99)).toBe(3)
    expect(nivelVistoDe(['r1_abc'], 1)).toBeNull()
  })
})
