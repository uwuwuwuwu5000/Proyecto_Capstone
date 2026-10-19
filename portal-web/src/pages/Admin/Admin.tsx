import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Timestamp, collection, query, where } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import { useRequiereAdmin } from '../../hooks/useRequiereAdmin'
import { fechaInput } from '../../components/Reportes/rangosRapidos'
import { SIN_OPERADOR } from '../../components/Reportes/filtros'
import { useSoporte } from '../../context/SoporteContext'
import { useOperadores } from './operadores'
import { useConteo, useConteosPorEstado, useResolucion } from './useConteo'
import { formatearDuracion } from '../../components/Reportes/tiempos'
import { AccesosRapidos, ActividadReciente, Alertas, EstadoReportes } from './ResumenBloques'
import type { AlertaResumen } from './ResumenBloques'
import IconoSeccion from '../../components/AdminLayout/IconoSeccion'
import styles from './Resumen.module.css'

function FlechaDiagonal() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  )
}

function formatear(valor: number | null | undefined): string {
  return valor === undefined ? '…' : valor === null ? '—' : valor.toLocaleString('es-CL')
}

function saludo(hora: number): string {
  if (hora < 12) return 'Buenos días'
  if (hora < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

function Indicador({
  iconoRuta,
  valor,
  valorTexto,
  etiqueta,
  pie,
  ruta,
  atencion = false,
}: {
  iconoRuta: string
  valor?: number | null
  /** Para valores que no son un número entero (una duración, por ejemplo). */
  valorTexto?: string
  etiqueta: string
  pie: string
  ruta: string
  /** Hay algo pendiente: el pie se destaca en celeste. */
  atencion?: boolean
}) {
  return (
    <Link to={ruta} className={styles.indicador}>
      <span className={styles.indicadorCabecera}>
        <span className={styles.icono}>
          <IconoSeccion ruta={iconoRuta} />
        </span>
        <span className={styles.flecha}>
          <FlechaDiagonal />
        </span>
      </span>
      <span className={styles.valor}>{valorTexto ?? formatear(valor)}</span>
      <span className={styles.etiqueta}>{etiqueta}</span>
      <span className={`${styles.pie} ${atencion ? styles.pieAtencion : ''}`}>{pie}</span>
    </Link>
  )
}

export default function Admin() {
  const { cargando, autorizado } = useRequiereAdmin()
  const { user, perfil } = useAuth()
  const { operadores, cargando: cargandoOperadores } = useOperadores(autorizado)
  const { abiertos: soporteAbiertos } = useSoporte()
  // Sube al cerrar el detalle de un reporte: los conteos se vuelven a leer.
  const [version, setVersion] = useState(0)

  const hoy = new Date()
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const inicioAyer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1)
  const anteayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 2)

  const nuevosHoy = useConteo(autorizado, () =>
    query(collection(db, 'reports'), where('createdAt', '>=', Timestamp.fromDate(inicioHoy))),
    version,
  )
  const nuevosAyer = useConteo(autorizado, () =>
    query(
      collection(db, 'reports'),
      where('createdAt', '>=', Timestamp.fromDate(inicioAyer)),
      where('createdAt', '<', Timestamp.fromDate(inicioHoy)),
    ),
    version,
  )
  const sinOperador = useConteo(autorizado, () =>
    query(collection(db, 'reports'), where('operadorId', '==', null)),
    version,
  )
  // Alerta: siguen en "Reportado" desde antes de ayer (nadie los ha tomado).
  const sinAtenderAntiguos = useConteo(autorizado, () =>
    query(
      collection(db, 'reports'),
      where('estado', '==', 'reportado'),
      where('createdAt', '<', Timestamp.fromDate(inicioAyer)),
    ),
    version,
  )
  const conteosPorEstado = useConteosPorEstado(autorizado, version)
  const resolucion = useResolucion(autorizado, version)

  // Panel exclusivo para administradores — cualquier otro caso, a la Landing.
  if (!cargando && !autorizado) {
    return <Navigate to="/" replace />
  }

  const activos = operadores.filter((o) => o.activo)
  const organismosConOperador = new Set(activos.map((o) => o.organismoId).filter(Boolean)).size
  const sinCuenta = activos.filter((o) => o.cuentas.length === 0).length

  const fechaHoy = fechaInput(hoy)
  const nombre = perfil?.displayName?.trim() || user?.email?.split('@')[0] || ''
  const fechaLarga = hoy.toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const alertas: AlertaResumen[] = [
    {
      clave: 'antiguos',
      cantidad: sinAtenderAntiguos ?? 0,
      texto: 'reportes siguen en «Reportado» desde antes de ayer',
      ruta: `/admin/reportes?estado=reportado&hasta=${fechaInput(anteayer)}`,
      accion: 'Revisar',
    },
    {
      clave: 'sin-cuenta',
      cantidad: sinCuenta,
      texto: 'operadores activos no tienen cuenta de acceso',
      ruta: '/admin/operadores?sinCuenta=1',
      accion: 'Crear cuentas',
    },
    {
      clave: 'soporte',
      cantidad: soporteAbiertos ?? 0,
      texto: 'conversaciones de soporte esperan respuesta',
      ruta: '/admin/soporte',
      accion: 'Responder',
    },
  ]

  return (
    <main className={styles.main}>
      <header className={styles.encabezado}>
        <div>
          <p className={styles.fecha}>{fechaLarga}</p>
          <h1 className={styles.titulo}>
            {saludo(hoy.getHours())}
            {nombre && `, ${nombre}`}
          </h1>
          <p className={styles.subtitulo}>
            Aquí tienes una vista general de lo que está pasando en la ciudad.
          </p>
        </div>
        <Link to="/admin/reportes/nuevo" className={styles.botonPrincipal}>
          + Crear reporte
        </Link>
      </header>

      <Alertas
        alertas={alertas}
        cargando={sinAtenderAntiguos === undefined || cargandoOperadores}
      />

      <section className={styles.indicadores} aria-label="Indicadores">
        <Indicador
          iconoRuta="/admin/reportes"
          valor={nuevosHoy}
          etiqueta="Reportes nuevos hoy"
          pie={nuevosAyer === undefined ? 'Comparando con ayer…' : `Ayer: ${formatear(nuevosAyer)}`}
          ruta={`/admin/reportes?desde=${fechaHoy}&hasta=${fechaHoy}`}
        />
        <Indicador
          iconoRuta="/admin/reportes/nuevo"
          valor={sinOperador}
          etiqueta="Pendientes de asignar"
          pie={sinOperador ? 'Requieren atención' : 'Todo asignado'}
          ruta={`/admin/reportes?operador=${SIN_OPERADOR}`}
          atencion={!!sinOperador}
        />
        <Indicador
          iconoRuta="/admin/operadores"
          valor={cargandoOperadores ? undefined : activos.length}
          etiqueta="Operadores activos"
          pie={
            cargandoOperadores
              ? 'Cargando…'
              : `En ${organismosConOperador} ${organismosConOperador === 1 ? 'organismo' : 'organismos'}` +
                (sinCuenta ? ` · ${sinCuenta} sin cuenta` : '')
          }
          ruta={sinCuenta ? '/admin/operadores?sinCuenta=1' : '/admin/operadores'}
          atencion={sinCuenta > 0}
        />
        <Indicador
          iconoRuta="/admin/soporte"
          valor={soporteAbiertos}
          etiqueta="Soporte sin atender"
          pie={soporteAbiertos ? 'Vecinos esperando respuesta' : 'Sin conversaciones nuevas'}
          ruta="/admin/soporte"
          atencion={!!soporteAbiertos}
        />
        <Indicador
          iconoRuta="/admin/reportes"
          valor={resolucion === undefined ? undefined : (resolucion?.resueltosMes ?? null)}
          etiqueta="Resueltos este mes"
          pie={
            resolucion
              ? `Cerrados sin resolver: ${resolucion.cerradosSinResolverMes}` +
                (resolucion.desde ? ` · datos desde ${resolucion.desde.toLocaleDateString('es-CL')}` : '')
              : 'Calculando…'
          }
          ruta="/admin/estadisticas"
        />
        <Indicador
          iconoRuta="/admin/estadisticas"
          valorTexto={
            resolucion === undefined
              ? '…'
              : resolucion?.promedioMs != null
                ? formatearDuracion(resolucion.promedioMs)
                : '—'
          }
          etiqueta="Tiempo promedio de resolución"
          pie={
            resolucion
              ? resolucion.resueltosConDato > 0
                ? `En ${resolucion.resueltosConDato} ${resolucion.resueltosConDato === 1 ? 'reporte' : 'reportes'} resueltos`
                : 'Aún sin reportes resueltos con dato'
              : 'Calculando…'
          }
          ruta="/admin/estadisticas"
        />
      </section>

      <div className={styles.paneles}>
        <EstadoReportes conteos={conteosPorEstado} />
        <ActividadReciente
          activo={autorizado}
          nombreOperador={(id) => operadores.find((o) => o.id === id)?.nombre ?? null}
          alCerrarDetalle={() => setVersion((v) => v + 1)}
        />
      </div>

      <AccesosRapidos />
    </main>
  )
}
