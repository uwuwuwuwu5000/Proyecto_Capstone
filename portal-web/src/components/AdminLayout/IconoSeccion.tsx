import type { ReactNode } from 'react'

// Íconos de línea (trazo 1.8) de las secciones del panel; se tiñen con currentColor.
const TRAZOS: Record<string, ReactNode> = {
  '/admin': (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  '/admin/reportes': (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" />
    </>
  ),
  '/admin/reportes/nuevo': (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <path d="M12 7.5v5M9.5 10h5" />
    </>
  ),
  '/admin/mapa-calor': (
    <>
      <path d="M3.5 6.5 9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5L3.5 20Z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </>
  ),
  '/admin/estadisticas': <path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6" />,
  '/admin/organismos': (
    <>
      <path d="M3.5 20.5h17M5 20.5V10M19 20.5V10M9.5 20.5V10M14.5 20.5V10" />
      <path d="M3.5 10 12 4l8.5 6Z" />
    </>
  ),
  '/admin/operadores': (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M16 5.5a3 3 0 0 1 0 6M18 14.8c1.8.7 3 2.3 3 5.2" />
    </>
  ),
  '/admin/cuentas': (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8-8M16 7l2.5 2.5M14 9l2 2" />
    </>
  ),
  '/admin/soporte': <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5Z" />,
  '/admin/categorias': (
    <>
      <path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9Z" />
      <circle cx="8" cy="8" r="1.2" />
    </>
  ),
}

/** Ícono de una sección del panel de administración, según su ruta. */
export default function IconoSeccion({ ruta, tamano = 20 }: { ruta: string; tamano?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={tamano}
      height={tamano}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {TRAZOS[ruta]}
    </svg>
  )
}
