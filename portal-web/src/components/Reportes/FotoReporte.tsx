import { useEffect, useRef, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import type { FotoInfo } from './reporte'
import styles from './Reportes.module.css'

// Fotos ya descargadas, por ruta: el tooltip del mapa se vuelve a montar en
// cada hover y el detalle en cada apertura; sin esto se bajaría otra vez
// (hasta ~1 MB) cada vez. Las fotos de un reporte no cambian.
const cacheFotos = new Map<string, string>()

/**
 * Foto cuadrada de un reporte. Las fotos en Firestore pesan hasta ~1 MB cada
 * una: solo se descargan cuando el elemento se acerca a la pantalla.
 */
export default function FotoReporte({
  foto,
  inmediata = false,
}: {
  foto: FotoInfo | null
  /** Descarga la foto al montar, sin esperar a que entre en pantalla (p. ej. en un modal). */
  inmediata?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const urlDirecta = foto?.tipo === 'cloud-storage' ? foto.url : null
  const pathFirestore = foto?.tipo === 'firestore' ? foto.path : null

  const [visible, setVisible] = useState(inmediata)
  const [dataUrl, setDataUrl] = useState<string | null>(
    () => (pathFirestore ? cacheFotos.get(pathFirestore) : null) ?? null,
  )
  const [error, setError] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || visible) {
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [visible])

  useEffect(() => {
    if (!visible || !pathFirestore || cacheFotos.has(pathFirestore)) {
      return
    }
    let cancelado = false
    getDoc(doc(db, pathFirestore))
      .then((snap) => {
        const valor = snap.data()?.dataUrl
        if (typeof valor === 'string') {
          cacheFotos.set(pathFirestore, valor)
        }
        if (cancelado) return
        if (typeof valor === 'string') {
          setDataUrl(valor)
        } else {
          setError(true)
        }
      })
      .catch((err) => {
        console.error('Error al leer la foto del reporte:', err)
        if (!cancelado) setError(true)
      })
    return () => {
      cancelado = true
    }
  }, [visible, pathFirestore])

  const imagen = urlDirecta ?? dataUrl

  return (
    <div ref={ref} className={styles.foto}>
      {imagen ? (
        <img src={imagen} alt="Foto del reporte" loading="lazy" />
      ) : (
        <span className={styles.fotoVacia}>
          {!foto ? 'Sin foto' : error ? 'No se pudo cargar la foto' : 'Cargando foto…'}
        </span>
      )}
    </div>
  )
}
