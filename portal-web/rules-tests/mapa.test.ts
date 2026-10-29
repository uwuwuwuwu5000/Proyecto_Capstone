// Mapa público: regiones, lectura por región y agrupación de reportes cercanos.
import { describe, expect, it } from 'vitest'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { regionDePunto } from '../src/components/Map/regiones'
import type { Region } from '../src/components/Map/regiones'
import { partir, unirReportesDeRegion } from '../src/components/Map/useReportesRegion'
import { ZOOM_MAXIMO, crearIndice, diametroDeGrupo, textoDeGrupo } from '../src/components/Map/agrupacion'

const doc = (id: string, region?: string | null): QueryDocumentSnapshot =>
  ({ id, data: () => ({ ...(region === undefined ? {} : { region }) }) }) as unknown as QueryDocumentSnapshot

describe('regiones', () => {
  const metropolitana: Region = {
    codigo: '13', nombre: 'Región Metropolitana de Santiago', nombreCorto: 'Metropolitana de Santiago', comunas: [],
    caja: { minLng: -71.7, minLat: -34.3, maxLng: -69.8, maxLat: -32.9 },
  }
  const ohiggins: Region = {
    codigo: '06', nombre: 'Región del Libertador General Bernardo O’Higgins', nombreCorto: 'O’Higgins', comunas: [],
    caja: { minLng: -72.1, minLat: -35.0, maxLng: -70.0, maxLat: -33.85 },
  }
  const sinCaja: Region = { codigo: '99', nombre: 'X', nombreCorto: 'X', comunas: [], caja: null }

  it('un punto dentro de la caja da su región', () => {
    expect(regionDePunto({ lat: -33.45, lng: -70.65 }, [ohiggins, metropolitana, sinCaja])?.codigo).toBe('13')
  })
  it('con cajas que se traslapan, gana la más chica', () => {
    // -33.9 está en las dos cajas; la de O'Higgins es más chica.
    expect(regionDePunto({ lat: -33.9, lng: -70.7 }, [metropolitana, ohiggins])?.codigo).toBe('06')
  })
  it('fuera de todas, null', () => {
    expect(regionDePunto({ lat: 40, lng: -3 }, [metropolitana, ohiggins])).toBeNull()
  })
})

describe('lectura por región', () => {
  it('parte una lista en tandas (las consultas «in» admiten 30)', () => {
    const lista = Array.from({ length: 52 }, (_, i) => i)
    expect(partir(lista, 30).map((p) => p.length)).toEqual([30, 22])
    expect(partir([], 30)).toEqual([])
  })

  it('une la consulta de la región con los antiguos sin región, sin repetidos', () => {
    const principales = [doc('a', 'Región X'), doc('b', 'Región X')]
    const porComuna = [doc('b', 'Región X'), doc('c'), doc('d', null), doc('e', ''), doc('f', 'Región X')]
    expect(unirReportesDeRegion(principales, porComuna, 'Región X').map((d) => d.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('descarta los que dicen pertenecer a otra región', () => {
    const r = unirReportesDeRegion([doc('a', 'Región X')], [doc('z', 'Región Y'), doc('w')], 'Región X')
    expect(r.map((d) => d.id)).toEqual(['a', 'w'])
  })
})

describe('agrupación de reportes cercanos', () => {
  const cerca = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, lat: -33.45 + i * 0.0003, lng: -70.65 + i * 0.0003 }))
  const mundo: [number, number, number, number] = [-180, -85, 180, 85]

  it('con el mapa alejado, los reportes juntos forman un solo círculo con el total', () => {
    const indice = crearIndice(cerca)
    const grupos = indice.getClusters(mundo, 12)
    expect(grupos).toHaveLength(1)
    expect((grupos[0].properties as { point_count: number }).point_count).toBe(12)
  })

  it('al acercarse lo suficiente, se separan en pines sueltos', () => {
    const indice = crearIndice(cerca)
    const sueltos = indice.getClusters(mundo, ZOOM_MAXIMO)
    expect(sueltos.length).toBe(12)
    expect(sueltos.every((e) => !(e.properties as { cluster?: boolean }).cluster)).toBe(true)
  })

  it('un reporte solo nunca se agrupa', () => {
    const grupos = crearIndice([cerca[0]]).getClusters(mundo, 8)
    expect(grupos).toHaveLength(1)
    expect((grupos[0].properties as { cluster?: boolean }).cluster).toBeUndefined()
  })

  it('reportes lejanos no se mezclan', () => {
    const indice = crearIndice([cerca[0], { id: 'lejos', lat: -36.8, lng: -73.05 }])
    expect(indice.getClusters(mundo, 12)).toHaveLength(2)
  })

  it('dos reportes en el mismo punto no se separan ni con el acercamiento máximo', () => {
    const indice = crearIndice([{ id: 'a', lat: -33.45, lng: -70.65 }, { id: 'b', lat: -33.45, lng: -70.65 }])
    const [grupo] = indice.getClusters(mundo, ZOOM_MAXIMO)
    expect((grupo.properties as { cluster?: boolean }).cluster).toBe(true)
    expect(indice.getClusterExpansionZoom((grupo.properties as { cluster_id: number }).cluster_id)).toBeGreaterThan(ZOOM_MAXIMO)
  })

  it('el número de un grupo no sirve en el índice nuevo (por eso el mapa no lo conserva al elegir un reporte)', () => {
    const mismo = [{ id: 'a', lat: -33.45, lng: -70.65 }, { id: 'b', lat: -33.45, lng: -70.65 }]
    const [grupo] = crearIndice(mismo).getClusters(mundo, ZOOM_MAXIMO)
    const idViejo = (grupo.properties as { cluster_id: number }).cluster_id
    // Al elegir 'a' se rearma el índice sin él: 'b' queda solo y el grupo deja de existir.
    const nuevo = crearIndice(mismo.filter((p) => p.id !== 'a'))
    expect(() => nuevo.getLeaves(idViejo, 10)).toThrow()
  })

  it('tamaño y texto del círculo', () => {
    expect([2, 9, 10, 49, 50, 500].map(diametroDeGrupo)).toEqual([40, 40, 48, 48, 56, 56])
    expect([3, 999, 1000].map(textoDeGrupo)).toEqual(['3', '999', '999+'])
  })
})
