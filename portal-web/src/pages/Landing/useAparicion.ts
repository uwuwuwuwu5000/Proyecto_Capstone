import { useEffect, useRef, useState } from 'react'

/**
 * `visible` pasa a true la primera vez que el elemento entra en pantalla.
 * Sin IntersectionObserver (navegadores muy antiguos) se muestra de inmediato.
 */
export function useAparicion<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setVisible(true)
          observador.disconnect()
        }
      },
      { threshold: 0.2 },
    )
    observador.observe(el)
    return () => observador.disconnect()
  }, [])

  return { ref, visible }
}
