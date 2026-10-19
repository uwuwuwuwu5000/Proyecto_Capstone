// Listado de reportes paginado en Firestore (por cursor), compartido por
// Administrar reportes y Mis reportes del operador.
//
// Cada página es una consulta con orderBy('createdAt', 'desc'), limit y
// startAfter(último de la página anterior): las lecturas por pantalla son
// siempre las de una página, sin importar cuántos reportes haya.
//
// Índices que usa (Firestore → Índices, colección `reports`, createdAt
// descendente): estado, categoria y operadorId, cada uno + createdAt.
// Firestore los combina cuando se filtra por más de un campo.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Timestamp,
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
} from 'firebase/firestore'
import type { QueryConstraint, QueryDocumentSnapshot, QuerySnapshot } from 'firebase/firestore'
import { FirebaseError } from 'firebase/app'
import { db } from '../../firebase/config'
import { SIN_OPERADOR } from './filtros'
import type { Filtros } from './filtros'
import { mapearReporte } from './reporte'
import type { Reporte } from './reporte'

/** Los filtros que se resuelven en Firestore; texto y foto actúan sobre la página. */
type FiltrosServidor = Pick<Filtros, 'categoria' | 'estado' | 'comuna' | 'operador' | 'desde' | 'hasta'>

export const TAMANOS_PAGINA = [12, 24, 48]

export interface ErrorConsulta {
  mensaje: string
  /** Enlace de la consola de Firebase que crea el índice que falta. */
  enlaceIndice?: string
}

function filtrosServidor(f: Filtros): FiltrosServidor {
  return {
    categoria: f.categoria,
    estado: f.estado,
    comuna: f.comuna,
    operador: f.operador,
    desde: f.desde,
    hasta: f.hasta,
  }
}

function igualdades(f: FiltrosServidor, operadorFijo: string | null): QueryConstraint[] {
  const restricciones: QueryConstraint[] = []
  if (f.categoria) restricciones.push(where('categoria', '==', f.categoria))
  if (f.estado) restricciones.push(where('estado', '==', f.estado))
  if (f.comuna) restricciones.push(where('comuna', '==', f.comuna))
  const operador = operadorFijo ?? f.operador
  // Un reporte "sin operador" tiene operadorId null (así lo escribe la app).
  if (operador === SIN_OPERADOR) restricciones.push(where('operadorId', '==', null))
  else if (operador) restricciones.push(where('operadorId', '==', operador))
  return restricciones
}

function rangoDeFechas(f: FiltrosServidor): QueryConstraint[] {
  const restricciones: QueryConstraint[] = []
  if (f.desde) {
    restricciones.push(where('createdAt', '>=', Timestamp.fromDate(new Date(`${f.desde}T00:00:00`))))
  }
  if (f.hasta) {
    restricciones.push(where('createdAt', '<=', Timestamp.fromDate(new Date(`${f.hasta}T23:59:59.999`))))
  }
  return restricciones
}

function describirError(err: unknown): ErrorConsulta {
  if (err instanceof FirebaseError && err.code === 'failed-precondition') {
    const enlace = /https:\/\/console\.firebase\.google\.com\S+/.exec(err.message)?.[0]
    return {
      mensaje: 'Falta un índice de Firestore para esta combinación de filtros.',
      enlaceIndice: enlace,
    }
  }
  return { mensaje: 'No pudimos cargar los reportes. Inténtalo nuevamente.' }
}

function fechaDe(documento: QueryDocumentSnapshot): Date {
  const creado = documento.data().createdAt
  return typeof creado?.toDate === 'function' ? creado.toDate() : new Date()
}

interface Opciones {
  /** false mientras no se sepa quién es el usuario (no se consulta nada). */
  activo: boolean
  filtros: Filtros
  /** Panel de operador: siempre solo los reportes de este operador. */
  operadorFijo?: string
  tamano: number
}

export function useReportesPaginados({ activo, filtros, operadorFijo, tamano }: Opciones) {
  // Todo lo que cambia la consulta, en una sola clave: al variar, se vuelve a la página 1.
  const clave = JSON.stringify([filtrosServidor(filtros), operadorFijo ?? null, tamano])
  const { servidor, fijo, tam } = useMemo(() => {
    const [s, f, t] = JSON.parse(clave) as [FiltrosServidor, string | null, number]
    return { servidor: s, fijo: f, tam: t }
  }, [clave])

  const [navegacion, setNavegacion] = useState({ clave, pagina: 0 })
  const pagina = navegacion.clave === clave ? navegacion.pagina : 0
  // Al cambiar de consulta se descarta la página guardada: si después se vuelve a
  // una consulta anterior (p. ej. "Limpiar filtros"), se empieza otra vez en la 1.
  useEffect(() => {
    setNavegacion((actual) => (actual.clave === clave ? actual : { clave, pagina: 0 }))
  }, [clave])
  const [recarga, setRecarga] = useState(0)

  // cursores[n] = documento tras el cual empieza la página n (la 0 no tiene).
  const cursores = useRef<{ clave: string; lista: (QueryDocumentSnapshot | null)[] }>({
    clave: '',
    lista: [null],
  })

  const [datos, setDatos] = useState<{
    clave: string
    pagina: number
    reportes: Reporte[]
    hayMas: boolean
  } | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<ErrorConsulta | null>(null)
  const [total, setTotal] = useState<{ clave: string; valor: number } | null>(null)
  // Fecha del reporte más reciente de la primera página: lo posterior es "nuevo".
  const [marca, setMarca] = useState<Date | null>(null)
  const [nuevos, setNuevos] = useState(0)

  // ---- Página actual ----
  useEffect(() => {
    if (!activo) {
      return
    }
    let vigente = true
    if (cursores.current.clave !== clave) {
      cursores.current = { clave, lista: [null] }
    }
    const cursor = cursores.current.lista[pagina] ?? null

    setCargando(true)
    // Se pide uno de más: así se sabe si existe una página siguiente sin contarla.
    getDocs(
      query(
        collection(db, 'reports'),
        ...igualdades(servidor, fijo),
        ...rangoDeFechas(servidor),
        orderBy('createdAt', 'desc'),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(tam + 1),
      ),
    )
      .then((snapshot) => {
        if (!vigente) return
        const hayMas = snapshot.docs.length > tam
        const visibles = snapshot.docs.slice(0, tam)
        // Se vació la última página (p. ej. se eliminaron sus reportes): retrocede.
        if (visibles.length === 0 && pagina > 0) {
          setNavegacion({ clave, pagina: pagina - 1 })
          return
        }
        if (hayMas) cursores.current.lista[pagina + 1] = visibles[tam - 1]
        setDatos({ clave, pagina, reportes: visibles.map(mapearReporte), hayMas })
        if (pagina === 0) setMarca(visibles[0] ? fechaDe(visibles[0]) : new Date())
        setError(null)
        setCargando(false)
      })
      .catch((err) => {
        if (!vigente) return
        console.error('Error al leer reportes:', err)
        setError(describirError(err))
        setCargando(false)
      })
    return () => {
      vigente = false
    }
  }, [activo, clave, servidor, fijo, tam, pagina, recarga])

  // ---- Total de reportes que cumplen los filtros (una lectura por cada 1.000) ----
  useEffect(() => {
    if (!activo) {
      return
    }
    let vigente = true
    getCountFromServer(
      query(collection(db, 'reports'), ...igualdades(servidor, fijo), ...rangoDeFechas(servidor)),
    )
      .then((resultado) => {
        if (vigente) setTotal({ clave, valor: resultado.data().count })
      })
      .catch((err) => console.error('Error al contar reportes:', err))
    return () => {
      vigente = false
    }
  }, [activo, clave, servidor, fijo, recarga])

  // ---- Aviso de reportes nuevos: solo escucha lo posterior al más reciente cargado ----
  // (si hay un "hasta" en el pasado, los nuevos no caben en el rango: no se escucha)
  useEffect(() => {
    if (!activo || !marca || servidor.hasta) {
      setNuevos(0)
      return
    }
    return onSnapshot(
      query(
        collection(db, 'reports'),
        ...igualdades(servidor, fijo),
        where('createdAt', '>', Timestamp.fromDate(marca)),
        orderBy('createdAt', 'desc'),
        limit(50),
      ),
      // Sin createdAt = escritura local todavía sin confirmar.
      (snapshot) => setNuevos(snapshot.docs.filter((d) => d.data().createdAt != null).length),
      () => setNuevos(0),
    )
  }, [activo, clave, servidor, fijo, marca])

  const actual = datos && datos.clave === clave ? datos : null
  const totalActual = total && total.clave === clave ? total.valor : null

  const irSiguiente = useCallback(() => setNavegacion({ clave, pagina: pagina + 1 }), [clave, pagina])
  const irAnterior = useCallback(
    () => setNavegacion({ clave, pagina: Math.max(0, pagina - 1) }),
    [clave, pagina],
  )
  const irPrimera = useCallback(() => setNavegacion({ clave, pagina: 0 }), [clave])
  const recargar = useCallback(() => setRecarga((n) => n + 1), [])
  /** "N reportes nuevos · Actualizar": vuelve a la primera página y la recarga. */
  const verNuevos = useCallback(() => {
    setNavegacion({ clave, pagina: 0 })
    setRecarga((n) => n + 1)
  }, [clave])

  return {
    reportes: actual?.reportes ?? [],
    cargando,
    error,
    /** Cambia con cada consulta distinta (filtros o tamaño): sirve para limpiar la selección. */
    claveConsulta: clave,
    pagina,
    tamano: tam,
    total: totalActual,
    totalPaginas: totalActual === null ? null : Math.max(1, Math.ceil(totalActual / tam)),
    hayAnterior: pagina > 0,
    haySiguiente: actual?.pagina === pagina ? actual.hayMas : false,
    nuevos,
    irSiguiente,
    irAnterior,
    irPrimera,
    recargar,
    verNuevos,
  }
}

// ---------------------------------------------------------------------------
// Consultas puntuales, fuera del listado
// ---------------------------------------------------------------------------

const TANDA = 500
/** Tope de seguridad de una exportación: más allá, conviene acotar con filtros. */
export const MAXIMO_EXPORTACION = 20_000

/**
 * Todos los reportes que cumplen los filtros del servidor, por tandas de
 * 500 (para exportar). Se detiene en MAXIMO_EXPORTACION.
 */
export async function descargarTodosLosReportes(
  filtros: Filtros,
  operadorFijo: string | undefined,
  onProgreso?: (descargados: number) => void,
): Promise<{ reportes: Reporte[]; truncado: boolean }> {
  const servidor = filtrosServidor(filtros)
  const reportes: Reporte[] = []
  let cursor: QueryDocumentSnapshot | null = null
  for (;;) {
    const snapshot: QuerySnapshot = await getDocs(
      query(
        collection(db, 'reports'),
        ...igualdades(servidor, operadorFijo ?? null),
        ...rangoDeFechas(servidor),
        orderBy('createdAt', 'desc'),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(TANDA),
      ),
    )
    reportes.push(...snapshot.docs.map(mapearReporte))
    onProgreso?.(reportes.length)
    if (snapshot.docs.length < TANDA) return { reportes, truncado: false }
    if (reportes.length >= MAXIMO_EXPORTACION) return { reportes, truncado: true }
    cursor = snapshot.docs[snapshot.docs.length - 1]
  }
}

/** Un reporte por id (p. ej. el de ?reporte=<id> cuando no está en la página cargada). */
export async function cargarReporte(id: string): Promise<Reporte | null> {
  const snapshot = await getDoc(doc(db, 'reports', id))
  return snapshot.exists() ? mapearReporte(snapshot as QueryDocumentSnapshot) : null
}

/** Hasta `maximo` reportes sin operador (para la herramienta de vinculación). */
export async function cargarReportesSinOperador(maximo = 500): Promise<Reporte[]> {
  const snapshot = await getDocs(
    query(collection(db, 'reports'), where('operadorId', '==', null), limit(maximo)),
  )
  return snapshot.docs.map(mapearReporte)
}
