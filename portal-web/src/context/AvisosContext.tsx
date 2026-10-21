// Avisos del ciudadano: cambios de estado en sus reportes, validación de la
// comunidad, veredicto y cambio de nivel. No se guardan; se derivan de
// `statusHistory`, del propio reporte y de `confianza/actual`, así que no hace
// falta Cloud Functions. Vive en un contexto para tener una sola suscripción aunque
// la barra superior se vuelva a montar en cada página.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Timestamp,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { ETIQUETA_POR_ESTADO } from '../constants/reportes'
import { avisoDeNivel, avisoDeSoporte, avisosDeValidacion, idAvisoNivel, nivelVistoDe } from '../components/Avisos/derivar'
import type { AvisoBase } from '../components/Avisos/derivar'
import { leerConfianza, leerValidacion } from '../confianza/tipos'
import { useAuth } from './AuthContext'
import { useSoporte } from './SoporteContext'

/** Reportes propios que se vigilan (sin orderBy: no depende de un índice compuesto). */
const REPORTES_VIGILADOS = 50
const CAMBIOS_POR_REPORTE = 10
const MAX_VISTOS = 200

export interface Aviso extends AvisoBase {
  visto: boolean
}

interface AvisosContextValue {
  avisos: Aviso[]
  noVistos: number
  cargando: boolean
  error: string | null
  marcarVisto: (id: string) => Promise<void>
  marcarTodos: () => Promise<void>
}

const AvisosContext = createContext<AvisosContextValue>({
  avisos: [],
  noVistos: 0,
  cargando: false,
  error: null,
  marcarVisto: async () => {},
  marcarTodos: async () => {},
})

const ms = (v: unknown): number | null => (v instanceof Timestamp ? v.toMillis() : null)
const resumir = (t: string) => (t.length <= 60 ? t : `${t.slice(0, 57)}…`)
const masReciente = (a: AvisoBase, b: AvisoBase) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0)

export function AvisosProvider({ children }: { children: ReactNode }) {
  const { user, perfil } = useAuth()
  const { tickets } = useSoporte()
  // Avisos de los reportes propios: los ciudadanos y los administradores (que
  // también reportan). El operador no crea reportes; el suyo será otro aviso.
  const uid = user && (perfil?.role === 'ciudadano' || perfil?.role === 'admin') ? user.uid : null

  const [base, setBase] = useState<AvisoBase[]>([])
  const [vistos, setVistos] = useState<Set<string>>(new Set())
  const [vistosHasta, setVistosHasta] = useState<Date | null>(null)
  // Nivel de confianza actual: solo los vecinos lo ganan.
  const esCiudadano = perfil?.role === 'ciudadano'
  const [nivel, setNivel] = useState<{ nivel: number; fecha: Date | null } | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const uidRef = useRef<string | null>(null)
  const vistosRef = useRef(vistos)
  vistosRef.current = vistos
  const nivelRef = useRef<number | null>(null)
  nivelRef.current = nivel ? nivel.nivel : null

  useEffect(() => {
    uidRef.current = uid
    setBase([])
    setVistos(new Set())
    setVistosHasta(null)
    setError(null)
    if (!uid) {
      setCargando(false)
      return
    }

    let activo = true
    let desuscribir: (() => void) | null = null
    // Cambios de estado (cuestan una lectura del historial) y avisos de validación
    // y veredicto (salen del propio documento, sin lecturas extra).
    const cache = new Map<string, { marca: string; avisos: AvisoBase[] }>()
    const deValidacion = new Map<string, AvisoBase[]>()
    setCargando(true)

    async function leerAvisos(reportId: string, descripcion: string): Promise<AvisoBase[]> {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'reports', reportId, 'statusHistory'),
            orderBy('createdAt', 'desc'),
            limit(CAMBIOS_POR_REPORTE),
          ),
        )
        return snap.docs
          .filter((d) => d.data().autorUid !== uid)
          .map((d) => {
            const c = d.data()
            const hacia = typeof c.hacia === 'string' ? c.hacia : ''
            const autorNombre =
              typeof c.autorNombre === 'string' && c.autorNombre.trim() ? c.autorNombre : null
            return {
              id: `${reportId}_${d.id}`,
              tipo: 'estado' as const,
              reportId,
              titulo: `Tu reporte pasó a «${ETIQUETA_POR_ESTADO[hacia] ?? hacia}»`,
              reporte: resumir(descripcion),
              // Los cambios de un administrador se muestran sin su nombre.
              autor: c.autorRol === 'admin' ? 'Administración Ciudad Alerta' : (autorNombre ?? 'El organismo'),
              comentario:
                typeof c.comentario === 'string' && c.comentario.trim() ? c.comentario.trim() : null,
              fecha: typeof c.createdAt?.toDate === 'function' ? c.createdAt.toDate() : null,
            }
          })
      } catch (err) {
        console.error(`Avisos: no se pudo leer el historial de ${reportId}`, err)
        return []
      }
    }

    async function iniciar() {
      try {
        const snap = await getDoc(doc(db, 'users', uid!, 'avisos', 'estado'))
        const d = snap.data()
        if (activo) {
          setVistos(new Set(Array.isArray(d?.vistos) ? d.vistos : []))
          setVistosHasta(d?.vistosHasta instanceof Timestamp ? d.vistosHasta.toDate() : null)
        }
      } catch {
        // Sin estado guardado: todo se considera no visto.
      }
      if (!activo) return

      desuscribir = onSnapshot(
        query(collection(db, 'reports'), where('uid', '==', uid), limit(REPORTES_VIGILADOS)),
        async (snapshot) => {
          setError(null)
          // Un reporte que ya no existe (o salió de los vigilados) deja de avisar.
          const vigentes = new Set(snapshot.docs.map((d) => d.id))
          for (const id of [...cache.keys()]) if (!vigentes.has(id)) cache.delete(id)
          deValidacion.clear()
          await Promise.all(
            snapshot.docs.map(async (d) => {
              const r = d.data()
              const descripcion = typeof r.descripcion === 'string' ? r.descripcion : ''
              deValidacion.set(d.id, avisosDeValidacion(d.id, descripcion, leerValidacion(r.validacion)))
              const marca = `${r.estado}|${ms(r.updatedAt) ?? ''}`
              if (cache.get(d.id)?.marca === marca) return
              const intacto = r.estado === 'reportado' && ms(r.updatedAt) === ms(r.createdAt)
              const avisos = intacto ? [] : await leerAvisos(d.id, descripcion)
              cache.set(d.id, { marca, avisos })
            }),
          )
          if (!activo) return
          setBase(
            [...cache.values(), ...[...deValidacion.values()].map((avisos) => ({ avisos }))]
              .flatMap((e) => e.avisos)
              .sort(masReciente),
          )
          setCargando(false)
        },
        (err) => {
          console.error('Avisos: no se pudo escuchar los reportes propios.', err)
          if (!activo) return
          setError('No se pudieron cargar tus avisos. Revisa tu conexión.')
          setCargando(false)
        },
      )
    }
    void iniciar()

    return () => {
      activo = false
      desuscribir?.()
    }
  }, [uid])

  // Nivel de confianza actual (solo vecinos). Sin documento, es el nivel 0.
  useEffect(() => {
    if (!uid || !esCiudadano) {
      setNivel(null)
      return
    }
    return onSnapshot(
      doc(db, 'users', uid, 'confianza', 'actual'),
      (snap) => {
        const d = snap.data()
        setNivel({
          nivel: leerConfianza(d).trustLevel,
          fecha: typeof d?.updatedAt?.toDate === 'function' ? d.updatedAt.toDate() : null,
        })
      },
      () => setNivel(null),
    )
  }, [uid, esCiudadano])

  const avisos = useMemo<Aviso[]>(() => {
    // El aviso de nivel se compara con el último nivel que el usuario ya vio.
    const deNivel = nivel ? avisoDeNivel(nivel.nivel, nivelVistoDe(vistos, nivel.nivel), nivel.fecha) : null
    // Administrador: una conversación de soporte abierta por aviso (vacío para los demás roles).
    const deSoporte = tickets.map(avisoDeSoporte).filter((a): a is AvisoBase => a !== null)
    return [...base, ...(deNivel ? [deNivel] : []), ...deSoporte].sort(masReciente).map((a) => ({
      ...a,
      visto: vistos.has(a.id) || (vistosHasta !== null && a.fecha !== null && a.fecha <= vistosHasta),
    }))
  }, [base, nivel, tickets, vistos, vistosHasta])

  const marcarTodos = useCallback(async () => {
    const u = uidRef.current
    if (!u) return
    setVistosHasta(new Date())
    // Se conserva el marcador del nivel actual: de él depende saber, después,
    // si el nivel subió o bajó.
    const conservados = nivelRef.current !== null ? [idAvisoNivel(nivelRef.current)] : []
    setVistos(new Set(conservados))
    try {
      await setDoc(
        doc(db, 'users', u, 'avisos', 'estado'),
        { vistos: conservados, vistosHasta: serverTimestamp(), updatedAt: serverTimestamp() },
        { merge: true },
      )
    } catch {
      // Queda aplicado en esta sesión aunque no se haya guardado.
    }
  }, [])

  const marcarVisto = useCallback(
    async (id: string) => {
      const u = uidRef.current
      if (!u || vistosRef.current.has(id)) return
      const nuevos = new Set(vistosRef.current).add(id)
      setVistos(nuevos)
      if (nuevos.size > MAX_VISTOS) {
        await marcarTodos()
        return
      }
      try {
        await setDoc(
          doc(db, 'users', u, 'avisos', 'estado'),
          { vistos: arrayUnion(id), updatedAt: serverTimestamp() },
          { merge: true },
        )
      } catch {
        // Queda marcado en esta sesión aunque no se haya guardado.
      }
    },
    [marcarTodos],
  )

  const valor = useMemo(
    () => ({
      avisos,
      noVistos: avisos.filter((a) => !a.visto).length,
      cargando,
      error,
      marcarVisto,
      marcarTodos,
    }),
    [avisos, cargando, error, marcarVisto, marcarTodos],
  )
  return <AvisosContext.Provider value={valor}>{children}</AvisosContext.Provider>
}

export function useAvisos(): AvisosContextValue {
  return useContext(AvisosContext)
}
