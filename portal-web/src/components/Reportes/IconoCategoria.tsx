import styles from './IconoCategoria.module.css'

/** Trazo de cada categoría del piloto; las categorías nuevas del catálogo usan un marcador de mapa. */
const TRAZOS: Record<string, React.ReactNode> = {
  // Bote de basura.
  microbasural: (
    <>
      <path d="M4 7h16M10 3h4M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  // Ampolleta.
  luminaria: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
    </>
  ),
  // Gota.
  fuga_agua: <path d="M12 3s6 6.2 6 10.5A6 6 0 0 1 6 13.5C6 9.2 12 3 12 3z" />,
  // Árbol.
  arbol_peligroso: (
    <>
      <path d="M12 21v-6" />
      <path d="M12 15a5 5 0 0 0 4.6-7A4.5 4.5 0 0 0 12 3a4.5 4.5 0 0 0-4.6 5A5 5 0 0 0 12 15z" />
    </>
  ),
  // Calle en perspectiva.
  calle_deteriorada: (
    <>
      <path d="M8 21 10 3M16 21 14 3" />
      <path d="M12 6v2M12 11v2M12 16v2" />
    </>
  ),
  // Persona en silla de ruedas.
  accesibilidad: (
    <>
      <circle cx="10" cy="4.5" r="1.8" />
      <path d="M10 8v6h5l2 5M10 11h5" />
      <path d="M7.5 12.5a5 5 0 1 0 7 6" />
    </>
  ),
  // Tres puntos.
  otro: (
    <>
      <circle cx="6" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="18" cy="12" r="1.3" />
    </>
  ),
}

const MARCADOR = (
  <>
    <path d="M12 21s-6.5-5.8-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.2-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.3" />
  </>
)

/** Icono de una categoría de reporte, en una pastilla de color. Decorativo: el nombre va escrito al lado. */
export default function IconoCategoria({ categoria }: { categoria: string }) {
  return (
    <span className={styles.icono} data-categoria={TRAZOS[categoria] ? categoria : 'otra'} data-icono-categoria aria-hidden="true">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        {TRAZOS[categoria] ?? MARCADOR}
      </svg>
    </span>
  )
}
