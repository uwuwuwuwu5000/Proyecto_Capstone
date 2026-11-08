import styles from './IconoKpi.module.css'

export type TipoIconoKpi =
  | 'reportes'
  | 'sinOperador'
  | 'sinResolver'
  | 'finalizados'
  | 'pendientes'
  | 'espera'
  | 'veredicto'
  | 'revision'

const TRAZOS: Record<TipoIconoKpi, React.ReactNode> = {
  // Sello con check: reportes confirmados que esperan veredicto.
  pendientes: (
    <>
      <path d="M12 3l2.4 1.7 2.9-.1 1 2.7 2.4 1.7-.9 2.8.9 2.8-2.4 1.7-1 2.7-2.9-.1L12 21l-2.4-1.7-2.9.1-1-2.7-2.4-1.7.9-2.8-.9-2.8 2.4-1.7 1-2.7 2.9.1z" />
      <path d="m8.8 12.3 2.2 2.2 4.2-4.6" />
    </>
  ),
  // Reloj de arena: tiempo de espera.
  espera: (
    <>
      <path d="M6 3h12M6 21h12" />
      <path d="M7 3c0 5 5 5 5 9s-5 4-5 9M17 3c0 5-5 5-5 9s5 4 5 9" />
    </>
  ),
  // Reloj con flecha: tiempo hasta el veredicto.
  veredicto: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2M9 2.5h6" />
    </>
  ),
  // Flechas circulares: de la revisión al cierre.
  revision: (
    <>
      <path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3" />
      <path d="M18 3v4h-4M6 21v-4h4" />
    </>
  ),
  // Documento con líneas.
  reportes: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
  // Persona con una cruz: sin operador asignado.
  sinOperador: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M17 8.5l4 4M21 8.5l-4 4" />
    </>
  ),
  // Triángulo de alerta: pendiente de resolver.
  sinResolver: (
    <>
      <path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.5v4M12 17h.01" />
    </>
  ),
  // Círculo con check: resuelto o cerrado.
  finalizados: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 3 3 5-6" />
    </>
  ),
}

/** Icono de un cuadro de resumen (Estadísticas globales y «Por veredicto»). Decorativo; en un teléfono se oculta por falta de espacio. */
export default function IconoKpi({ tipo }: { tipo: TipoIconoKpi }) {
  return (
    <span className={styles.iconoKpi} data-tipo={tipo} data-icono-kpi aria-hidden="true">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        {TRAZOS[tipo]}
      </svg>
    </span>
  )
}
