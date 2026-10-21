// Lógica de las correcciones: filtro de veredicto, bloqueo del cambio de estado
// sin veredicto y avisos de soporte.
import { describe, expect, it } from 'vitest'
import { FILTROS_VACIOS, filtrarReportes, filtrosLocalesActivos, resumenListado, verificacionDeUrl } from '../src/components/Reportes/filtros'
import { avisoDeSoporte } from '../src/components/Avisos/derivar'
import { MENSAJE_SIN_VEREDICTO, motivoSinVeredicto, siguientesEstados } from '../src/confianza/exigirVeredicto'
import { puedenPasarA, estadosAlcanzables } from '../src/components/Reportes/accionesLote'
import { VALIDACION_VACIA } from '../src/confianza/tipos'
import type { Reporte } from '../src/components/Reportes/reporte'

const reporte = (id: string, extra: Partial<Reporte> = {}, validacion: Partial<typeof VALIDACION_VACIA> = {}): Reporte =>
  ({
    id, uid: 'autor', categoria: 'otro', descripcion: id, estado: 'reportado', comuna: '', region: '',
    autorNombre: null, fecha: new Date(), foto: null, operadorId: null, organismoId: null, organismoNombre: null,
    lat: null, lng: null, origen: null, validacion: { ...VALIDACION_VACIA, ...validacion }, ...extra,
  }) as Reporte

describe('filtro de veredicto', () => {
  const lista = [
    reporte('nada'),
    reporte('validado', {}, { validado: true }),
    reporte('real', {}, { validado: true, veredicto: 'real' }),
    reporte('falso', {}, { veredicto: 'falso' }),
  ]
  const ids = (verificacion: typeof FILTROS_VACIOS.verificacion) =>
    filtrarReportes(lista, { ...FILTROS_VACIOS, verificacion }).map((r) => r.id)

  it('real', () => expect(ids('real')).toEqual(['real']))
  it('falso', () => expect(ids('falso')).toEqual(['falso']))
  it('sin veredicto: cualquier reporte que aún no tiene veredicto', () => {
    expect(ids('sin_veredicto')).toEqual(['nada', 'validado'])
  })
  it('por verificar sigue siendo validado y sin veredicto', () => expect(ids('por_verificar')).toEqual(['validado']))
  it('real y falso se resuelven en el servidor; sin veredicto lo termina la página', () => {
    expect(filtrosLocalesActivos({ ...FILTROS_VACIOS, verificacion: 'real' })).toBe(false)
    expect(filtrosLocalesActivos({ ...FILTROS_VACIOS, verificacion: 'sin_veredicto' })).toBe(true)
    expect(resumenListado(10, 10, 4, { ...FILTROS_VACIOS, verificacion: 'sin_veredicto' })).toContain('«Sin veredicto»')
  })
  it('la URL solo admite valores conocidos', () => {
    expect(verificacionDeUrl('falso')).toBe('falso')
    expect(verificacionDeUrl('sin_veredicto')).toBe('sin_veredicto')
    expect(verificacionDeUrl('otra cosa')).toBe('')
    expect(verificacionDeUrl(null)).toBe('')
  })
})

describe('el estado no cambia sin veredicto', () => {
  it('sin veredicto: bloqueado, y no hay estados siguientes', () => {
    const r = reporte('r1')
    expect(motivoSinVeredicto(r, 'gestor')).toBe(MENSAJE_SIN_VEREDICTO)
    expect(siguientesEstados(r, 'gestor')).toEqual([])
  })
  it('con veredicto: se permiten las transiciones normales', () => {
    const r = reporte('r1', {}, { veredicto: 'real' })
    expect(motivoSinVeredicto(r, 'gestor')).toBeNull()
    expect(siguientesEstados(r, 'gestor')).toEqual(['en_revision', 'derivado', 'cerrado'])
  })
  it('un reporte creado desde el portal por un administrador queda exento', () => {
    expect(motivoSinVeredicto(reporte('r1', { origen: 'portal_admin' }), 'gestor')).toBeNull()
  })
  it('el reporte propio de quien gestiona queda exento (nadie se da veredicto a sí mismo)', () => {
    expect(motivoSinVeredicto(reporte('r1', { uid: 'gestor' }), 'gestor')).toBeNull()
  })
  it('en lote: solo cuentan los reportes con veredicto', () => {
    const con = reporte('con', {}, { veredicto: 'falso' })
    const sin = reporte('sin')
    expect(puedenPasarA([con, sin], 'cerrado', 'gestor').map((r) => r.id)).toEqual(['con'])
    expect([...estadosAlcanzables([sin], 'gestor')]).toEqual([])
    expect(estadosAlcanzables([con, sin], 'gestor').has('derivado')).toBe(true)
  })
})

describe('avisos de soporte', () => {
  const ticket = {
    id: 't1', asunto: 'No puedo entrar', lastMessageAt: new Date('2026-10-20T15:00:00Z'),
    lastMessagePreview: 'Hola, necesito ayuda con mi cuenta', autorNombre: 'Ana', tipo: 'queja' as const,
  }
  it('un aviso por conversación, que lleva a ella', () => {
    expect(avisoDeSoporte(ticket)).toMatchObject({
      tipo: 'soporte', titulo: 'Soporte: No puedo entrar', ruta: '/admin/soporte/t1', autor: 'Ana · Queja',
    })
  })
  it('un mensaje nuevo cambia el id: vuelve a avisar aunque se hubiera visto', () => {
    const antes = avisoDeSoporte(ticket)
    const despues = avisoDeSoporte({ ...ticket, lastMessageAt: new Date('2026-10-20T16:00:00Z') })
    expect(antes?.id).not.toBe(despues?.id)
  })
  it('sin fecha del último mensaje no hay aviso', () => {
    expect(avisoDeSoporte({ ...ticket, lastMessageAt: null })).toBeNull()
  })
})
