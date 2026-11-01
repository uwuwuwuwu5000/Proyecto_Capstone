// Datos de «Por veredicto»: los reportes del operador confirmados por la comunidad que esperan
// veredicto, y los que ya lo tienen (para medir cuánto tardó). Solo consultas con igualdades: se apoyan
// en los índices de un solo campo que Firestore crea solo, así que no necesitan índices nuevos. El orden
// y los filtros se aplican en el navegador (ver veredictos.ts).
//
// La app móvil nunca escribe `validacion.veredicto` (solo lo escribe el veredicto del operador), y en
// Firestore `== null` no encuentra los documentos donde el campo no existe. Por eso los pendientes se
// piden como «validados» y se separan aquí con `esPendienteDeVeredicto` (DEF-010).
import { useCallback, useEffect, useState } from 'react'
import { collection, getCountFromServer, getDocs, limit, onSnapshot, query, where } from 'firebase/firestore'
import type { Firestore, Query } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { mapearReporte } from '../../components/Reportes/reporte'
import type { Reporte } from '../../components/Reportes/reporte'
import { esPendienteDeVeredicto, veredictoEnRango } from './veredictos'
import type { RangoDeFechas } from './veredictos'

/** Tope de reportes validados que se leen (incluye los que ya tienen veredicto). Si se alcanza, se avisa y se muestra el total. */
export const MAXIMO_VALIDADOS = 1000
/** Tope de reportes con veredicto que se leen (por cada resultado, real y falso). */
export const MAXIMO_CON_VEREDICTO = 500

/** Reportes del operador que la comunidad validó, con o sin veredicto (sin límite). */
function validadosSinLimite(firestore: Firestore, operadorId: string): Query {
  return query(
    collection(firestore, 'reports'),
    where('operadorId', '==', operadorId),
    where('validacion.validado', '==', true),
  )
}

/** Los validados del operador, entre los que están los pendientes de veredicto (los separa `esPendienteDeVeredicto`). */
export function consultaPendientes(firestore: Firestore, operadorId: string): Query {
  return query(validadosSinLimite(firestore, operadorId), limit(MAXIMO_VALIDADOS))
}

/**
 * Tres conteos para el total de pendientes cuando se alcanza el tope: validados, con veredicto «real» y con
 * veredicto «falso». Pendientes = validados − reales − falsos.
 */
export function conteosDePendientes(firestore: Firestore, operadorId: string): Query[] {
  return [
    validadosSinLimite(firestore, operadorId),
    ...(['real', 'falso'] as const).map((veredicto) =>
      query(
        validadosSinLimite(firestore, operadorId),
        where('validacion.veredicto', '==', veredicto),
      ),
    ),
  ]
}

/** Los reportes del operador con veredicto `real` o `falso`: dos consultas, cada una de una sola igualdad. */
export function consultasConVeredicto(firestore: Firestore, operadorId: string): Query[] {
  return (['real', 'falso'] as const).map((veredicto) =>
    query(
      collection(firestore, 'reports'),
      where('operadorId', '==', operadorId),
      where('validacion.veredicto', '==', veredicto),
      limit(MAXIMO_CON_VEREDICTO),
    ),
  )
}

export interface PendientesDeVeredicto {
  /** Los pendientes (sin los ya resueltos o cerrados), en el orden en que llegan de Firestore. */
  reportes: Reporte[]
  cargando: boolean
  error: string
  /** Se alcanzó el tope de lectura: puede haber más. */
  hayMas: boolean
  /** Con el tope alcanzado, el total que calcula Firestore (incluye reportes ya cerrados sin veredicto); si no, null. */
  total: number | null
}

/**
 * Escucha en vivo los reportes pendientes de veredicto del operador. Cuando alguien da un veredicto, el
 * reporte sale solo de la lista. Con `operadorId` en null (aún se decide quién es) no consulta nada.
 */
export function useReportesPorVeredicto(operadorId: string | null): PendientesDeVeredicto {
  const [estado, setEstado] = useState<PendientesDeVeredicto>({
    reportes: [], cargando: !!operadorId, error: '', hayMas: false, total: null,
  })

  useEffect(() => {
    if (!operadorId) {
      setEstado({ reportes: [], cargando: false, error: '', hayMas: false, total: null })
      return
    }
    let vigente = true
    setEstado((previo) => ({ ...previo, cargando: true, error: '' }))

    const baja = onSnapshot(
      consultaPendientes(db, operadorId),
      (snap) => {
        if (!vigente) return
        const alTope = snap.size >= MAXIMO_VALIDADOS
        setEstado((previo) => ({
          reportes: snap.docs.map(mapearReporte).filter(esPendienteDeVeredicto),
          cargando: false,
          error: '',
          hayMas: alTope,
          total: alTope ? previo.total : null,
        }))
        if (alTope) {
          Promise.all(conteosDePendientes(db, operadorId).map((c) => getCountFromServer(c)))
            .then(([validados, reales, falsos]) => {
              const total = validados.data().count - reales.data().count - falsos.data().count
              if (vigente) setEstado((previo) => ({ ...previo, total }))
            })
            .catch((err) => console.error('Error al contar los reportes pendientes de veredicto:', err))
        }
      },
      (err) => {
        console.error('Error al leer los reportes pendientes de veredicto:', err)
        if (vigente) {
          setEstado({
            reportes: [], cargando: false, hayMas: false, total: null,
            error: 'No pudimos cargar los reportes que esperan veredicto. Inténtalo nuevamente.',
          })
        }
      },
    )
    return () => {
      vigente = false
      baja()
    }
  }, [operadorId])

  return estado
}

export interface ReportesConVeredicto {
  /** Los reportes cuyo veredicto se dio dentro del periodo. */
  reportes: Reporte[]
  cargando: boolean
  error: string
  /** Alguna de las dos consultas llegó al tope de lectura: faltan reportes antiguos. */
  hayMas: boolean
  /** Vuelve a leer (por ejemplo, después de dar un veredicto). */
  recargar: () => void
}

/**
 * Reportes del operador con veredicto dado dentro del periodo (por la fecha del veredicto), para medir
 * el tiempo que pasó desde que la comunidad los validó hasta que se dio el veredicto.
 */
export function useReportesConVeredicto(operadorId: string | null, rango: RangoDeFechas): ReportesConVeredicto {
  const [todos, setTodos] = useState<Reporte[]>([])
  const [cargando, setCargando] = useState(!!operadorId)
  const [error, setError] = useState('')
  const [hayMas, setHayMas] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!operadorId) {
      setTodos([])
      setCargando(false)
      return
    }
    let vigente = true
    setCargando(true)
    setError('')
    Promise.all(consultasConVeredicto(db, operadorId).map((consulta) => getDocs(consulta)))
      .then((resultados) => {
        if (!vigente) return
        setTodos(resultados.flatMap((snap) => snap.docs.map(mapearReporte)))
        setHayMas(resultados.some((snap) => snap.size >= MAXIMO_CON_VEREDICTO))
        setCargando(false)
      })
      .catch((err) => {
        console.error('Error al leer los reportes con veredicto:', err)
        if (!vigente) return
        setTodos([])
        setError('No pudimos calcular el tiempo hasta el veredicto. Inténtalo nuevamente.')
        setCargando(false)
      })
    return () => {
      vigente = false
    }
  }, [operadorId, version])

  // El periodo se aplica aquí, sin volver a leer: cambiar de periodo no repite lecturas.
  const inicioMs = rango.inicio?.getTime() ?? null
  const finMs = rango.fin?.getTime() ?? null
  const reportes = todos.filter((r) =>
    veredictoEnRango(r, {
      inicio: inicioMs === null ? null : new Date(inicioMs),
      fin: finMs === null ? null : new Date(finMs),
    }),
  )
  const recargar = useCallback(() => setVersion((v) => v + 1), [])

  return { reportes, cargando, error, hayMas, recargar }
}
