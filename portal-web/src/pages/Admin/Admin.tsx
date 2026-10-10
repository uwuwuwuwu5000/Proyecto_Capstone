import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Timestamp, collection, getCountFromServer, query, where } from 'firebase/firestore'
import { db } from '../../firebase/config'
import Navbar from '../../components/Navbar/Navbar'
import { useRequiereAdmin } from '../../hooks/useRequiereAdmin'
import { GRUPOS_ADMIN } from '../../constants/adminSecciones'
import { fechaInput } from '../../components/Reportes/rangosRapidos'
import { SIN_OPERADOR } from '../../components/Reportes/filtros'
import { useOperadores } from './operadores'
import styles from './Admin.module.css'

/** Conteo en el servidor (no descarga los reportes); null si falla. */
function useConteo(activo: boolean, crearConsulta: () => ReturnType<typeof query>) {
  const [valor, setValor] = useState<number | null | undefined>(undefined)
  useEffect(() => {
    if (!activo) return
    let vigente = true
    getCountFromServer(crearConsulta())
      .then((r) => vigente && setValor(r.data().count))
      .catch((err) => {
        console.error('Error al contar reportes:', err)
        if (vigente) setValor(null)
      })
    return () => {
      vigente = false
    }
    // La consulta se arma una sola vez, al entrar al panel.
  }, [activo])
  return valor
}

function Indicador({
  valor,
  etiqueta,
  ruta,
  accion,
}: {
  valor: number | null | undefined
  etiqueta: string
  ruta: string
  accion: string
}) {
  return (
    <Link to={ruta} className={styles.indicador}>
      <span className={styles.indicadorValor}>
        {valor === undefined ? '…' : valor === null ? '—' : valor.toLocaleString('es-CL')}
      </span>
      <span className={styles.indicadorEtiqueta}>{etiqueta}</span>
      <span className={styles.indicadorAccion}>{accion} →</span>
    </Link>
  )
}

export default function Admin() {
  const { cargando, autorizado } = useRequiereAdmin()
  const { operadores, cargando: cargandoOperadores } = useOperadores(autorizado)

  const hoy = new Date()
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())

  const nuevosHoy = useConteo(autorizado, () =>
    query(collection(db, 'reports'), where('createdAt', '>=', Timestamp.fromDate(inicioHoy))),
  )
  const sinOperador = useConteo(autorizado, () =>
    query(collection(db, 'reports'), where('operadorId', '==', null)),
  )
  const operadoresSinCuenta = cargandoOperadores
    ? undefined
    : operadores.filter((o) => o.activo && o.cuentas.length === 0).length

  // Panel exclusivo para administradores — cualquier otro caso, a la Landing.
  if (!cargando && !autorizado) {
    return <Navigate to="/" replace />
  }

  const fechaHoy = fechaInput(hoy)

  return (
    <div className={styles.page}>
      <Navbar />

      <main className={styles.main}>
        <div>
          <h1 className={styles.title}>Panel de administración</h1>
          <p className={styles.subtitle}>Elige qué quieres gestionar.</p>
        </div>

        <section className={styles.indicadores} aria-label="Pendientes">
          <Indicador
            valor={nuevosHoy}
            etiqueta="Reportes nuevos hoy"
            ruta={`/admin/reportes?desde=${fechaHoy}&hasta=${fechaHoy}`}
            accion="Ver"
          />
          <Indicador
            valor={sinOperador}
            etiqueta="Reportes sin operador"
            ruta={`/admin/reportes?operador=${SIN_OPERADOR}`}
            accion="Asignar"
          />
          <Indicador
            valor={operadoresSinCuenta}
            etiqueta="Operadores sin cuenta"
            ruta="/admin/operadores?sinCuenta=1"
            accion="Crear cuentas"
          />
        </section>

        {GRUPOS_ADMIN.map((grupo) => (
          <section
            key={grupo.titulo}
            className={styles.grupo}
            aria-labelledby={`grupo-${grupo.titulo}`}
          >
            <div>
              <h2 id={`grupo-${grupo.titulo}`} className={styles.grupoTitulo}>
                {grupo.titulo}
              </h2>
              {grupo.descripcion && <p className={styles.grupoDescripcion}>{grupo.descripcion}</p>}
            </div>

            <div className={styles.opciones}>
              {grupo.secciones.map((seccion) => (
                <Link key={seccion.ruta} to={seccion.ruta} className={styles.opcion}>
                  <span className={styles.opcionIcono} aria-hidden="true">
                    {seccion.icono}
                  </span>
                  <span className={styles.opcionTitulo}>{seccion.titulo}</span>
                  <span className={styles.opcionTexto}>{seccion.texto}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  )
}
