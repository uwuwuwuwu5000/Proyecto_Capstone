import { useState } from 'react'
import { ESTADOS_EN_ORDEN, ETIQUETA_POR_ESTADO } from '../../constants/reportes'
import { useConfirmacion } from '../Dialogo/useConfirmacion'
import {
  asignarOperadorEnLote,
  cambiarEstadoEnLote,
  contarReportes,
  eliminarReportes,
  estadosAlcanzables,
  puedenPasarA,
} from './accionesLote'
import type { ResultadoLote } from './accionesLote'
import type { AutorCambio, OperadorResumen, Reporte } from './reporte'
import styles from './Reportes.module.css'

export interface MensajeLote {
  tipo: 'aviso' | 'error'
  texto: string
}

interface BarraSeleccionProps {
  seleccionados: Reporte[]
  /** Quién firma los cambios de estado (las reglas exigen nombre y rol). */
  autor: AutorCambio | null
  onLimpiar: () => void
  /** Al terminar una acción: el mensaje con el resultado. */
  onResultado: (mensaje: MensajeLote) => void
  /** Solo el admin: si se entrega, se ofrece "Cambiar operador". */
  operadores?: OperadorResumen[]
  /** Solo el admin: las reglas no dejan borrar a un operador. */
  permitirEliminar?: boolean
}

type Accion = 'estado' | 'operador' | null

/**
 * "Se actualizaron 3 reportes." + los que quedaron igual y las fallas, si hubo.
 * `verbo`: [singular, plural], p. ej. ['actualizó', 'actualizaron'].
 */
function describir(
  resultado: ResultadoLote,
  verbo: [string, string],
  omitidos = 0,
  motivoOmitidos: [string, string] = ['no admitía el cambio', 'no admitían el cambio'],
): MensajeLote {
  const uno = (n: number) => n === 1
  const partes = [
    `Se ${resultado.hechos === 1 ? verbo[0] : verbo[1]} ${contarReportes(resultado.hechos)}.`,
  ]
  if (omitidos > 0) {
    partes.push(
      `${contarReportes(omitidos)} ${uno(omitidos) ? motivoOmitidos[0] : motivoOmitidos[1]} y ${uno(omitidos) ? 'quedó' : 'quedaron'} igual.`,
    )
  }
  if (resultado.fallidos > 0) {
    partes.push(
      `${contarReportes(resultado.fallidos)} no se ${uno(resultado.fallidos) ? 'pudo' : 'pudieron'} procesar (sin permiso o sin conexión).`,
    )
  }
  return { tipo: resultado.fallidos > 0 ? 'error' : 'aviso', texto: partes.join(' ') }
}

/**
 * Barra que aparece abajo, fija, mientras haya reportes seleccionados:
 * cambiar estado, cambiar operador y eliminar, para todos a la vez.
 */
export default function BarraSeleccion({
  seleccionados,
  autor,
  onLimpiar,
  onResultado,
  operadores,
  permitirEliminar = false,
}: BarraSeleccionProps) {
  const { confirmar, dialogo } = useConfirmacion()
  const [accion, setAccion] = useState<Accion>(null)
  const [estadoNuevo, setEstadoNuevo] = useState('')
  const [comentario, setComentario] = useState('')
  const [operadorNuevo, setOperadorNuevo] = useState('')
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null)

  if (seleccionados.length === 0) {
    return dialogo
  }

  const alcanzables = estadosAlcanzables(seleccionados)
  const opcionesEstado = ESTADOS_EN_ORDEN.filter((e) => alcanzables.has(e))
  const aplicables = estadoNuevo ? puedenPasarA(seleccionados, estadoNuevo) : []
  const ocupado = progreso !== null

  function abrir(nueva: Accion) {
    setAccion((actual) => (actual === nueva ? null : nueva))
    setEstadoNuevo('')
    setComentario('')
    setOperadorNuevo('')
  }

  async function ejecutar(tarea: () => Promise<MensajeLote>) {
    setProgreso({ hechos: 0, total: seleccionados.length })
    try {
      onResultado(await tarea())
      setAccion(null)
      onLimpiar()
    } finally {
      setProgreso(null)
    }
  }

  async function aplicarEstado() {
    if (!autor || aplicables.length === 0) return
    const omitidos = seleccionados.length - aplicables.length
    const etiqueta = ETIQUETA_POR_ESTADO[estadoNuevo] ?? estadoNuevo
    const aceptado = await confirmar({
      titulo: `Pasar a "${etiqueta}"`,
      mensaje: (
        <>
          <p>
            Se cambiará el estado de <strong>{contarReportes(aplicables.length)}</strong> y quedará
            registrado en su historial{comentario.trim() ? ' con el comentario indicado' : ''}.
          </p>
          {omitidos > 0 && (
            <p>
              {contarReportes(omitidos)} no pueden pasar a ese estado desde el suyo y quedarán
              igual.
            </p>
          )}
        </>
      ),
      confirmar: `Cambiar ${contarReportes(aplicables.length)}`,
    })
    if (!aceptado) return
    await ejecutar(async () =>
      describir(
        await cambiarEstadoEnLote(seleccionados, estadoNuevo, comentario, autor, (hechos, total) =>
          setProgreso({ hechos, total }),
        ),
        ['actualizó', 'actualizaron'],
        omitidos,
      ),
    )
  }

  async function aplicarOperador() {
    const destino = operadorNuevo === '__ninguno__' ? null : operadorNuevo
    if (operadorNuevo === '') return
    const yaAsignados = seleccionados.filter((r) => (r.operadorId ?? null) === destino).length
    const nombre = destino ? operadores?.find((o) => o.id === destino)?.nombre ?? destino : null
    const aceptado = await confirmar({
      titulo: destino ? `Asignar a ${nombre}` : 'Quitar operador',
      mensaje: (
        <p>
          {destino ? (
            <>
              <strong>{contarReportes(seleccionados.length)}</strong> pasarán a ser gestionados por{' '}
              <strong>{nombre}</strong>. El operador anterior dejará de verlos en su panel.
            </>
          ) : (
            <>
              <strong>{contarReportes(seleccionados.length)}</strong> quedarán sin operador: solo un
              administrador podrá gestionarlos.
            </>
          )}
        </p>
      ),
      confirmar: destino ? 'Asignar' : 'Quitar operador',
    })
    if (!aceptado) return
    await ejecutar(async () =>
      describir(
        await asignarOperadorEnLote(seleccionados, destino, (hechos, total) =>
          setProgreso({ hechos, total }),
        ),
        ['reasignó', 'reasignaron'],
        yaAsignados,
        destino
          ? ['ya tenía ese operador', 'ya tenían ese operador']
          : ['ya estaba sin operador', 'ya estaban sin operador'],
      ),
    )
  }

  async function eliminar() {
    const aceptado = await confirmar({
      titulo: `Eliminar ${contarReportes(seleccionados.length)}`,
      mensaje: (
        <p>
          Se eliminarán junto con su <strong>foto, confirmaciones e historial de estados</strong>.
          Desaparecen del mapa y de la app del ciudadano. Esta acción no se puede deshacer.
        </p>
      ),
      confirmar: 'Eliminar',
      peligroso: true,
    })
    if (!aceptado) return
    await ejecutar(async () =>
      describir(
        await eliminarReportes(seleccionados, (hechos, total) => setProgreso({ hechos, total })),
        ['eliminó', 'eliminaron'],
      ),
    )
  }

  return (
    <div className={styles.barraSeleccion} role="region" aria-label="Acciones con los seleccionados">
      <div className={styles.barraFila}>
        <strong className={styles.barraCuenta}>
          {seleccionados.length === 1 ? '1 seleccionado' : `${seleccionados.length} seleccionados`}
        </strong>

        <div className={styles.barraAcciones}>
          <button
            type="button"
            className={`${styles.accionBoton} ${accion === 'estado' ? styles.accionActiva : ''}`}
            onClick={() => abrir('estado')}
            aria-expanded={accion === 'estado'}
            disabled={ocupado || opcionesEstado.length === 0}
            title={opcionesEstado.length === 0 ? 'Todos están en un estado final' : undefined}
          >
            Cambiar estado
          </button>
          {operadores && (
            <button
              type="button"
              className={`${styles.accionBoton} ${accion === 'operador' ? styles.accionActiva : ''}`}
              onClick={() => abrir('operador')}
              aria-expanded={accion === 'operador'}
              disabled={ocupado}
            >
              Cambiar operador
            </button>
          )}
          {permitirEliminar && (
            <button type="button" className={styles.eliminarBoton} onClick={eliminar} disabled={ocupado}>
              Eliminar
            </button>
          )}
          <button type="button" className={styles.enlaceBoton} onClick={onLimpiar} disabled={ocupado}>
            Quitar selección
          </button>
        </div>
      </div>

      {progreso && (
        <p className={styles.estadoCarga} aria-live="polite">
          Procesando {progreso.hechos} de {progreso.total}…
        </p>
      )}

      {!ocupado && accion === 'estado' && (
        <div className={styles.barraPanel}>
          <label className={styles.campo}>
            <span className={styles.etiqueta}>Nuevo estado</span>
            <select
              className={styles.entrada}
              value={estadoNuevo}
              onChange={(e) => setEstadoNuevo(e.target.value)}
            >
              <option value="">Elige un estado</option>
              {opcionesEstado.map((estado) => (
                <option key={estado} value={estado}>
                  {ETIQUETA_POR_ESTADO[estado] ?? estado}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.campo}>
            <span className={styles.etiqueta}>Comentario (opcional, igual para todos)</span>
            <input
              type="text"
              className={styles.entrada}
              value={comentario}
              maxLength={512}
              onChange={(e) => setComentario(e.target.value)}
            />
          </label>
          <div className={styles.barraPanelPie}>
            {estadoNuevo && aplicables.length < seleccionados.length && (
              <span className={styles.estadoCarga}>
                Se aplica a {aplicables.length} de {seleccionados.length}: los demás no pueden pasar
                a ese estado.
              </span>
            )}
            <button
              type="button"
              className={styles.accionBoton}
              onClick={aplicarEstado}
              disabled={!estadoNuevo || aplicables.length === 0 || !autor}
            >
              Aplicar
            </button>
          </div>
        </div>
      )}

      {!ocupado && accion === 'operador' && operadores && (
        <div className={styles.barraPanel}>
          <label className={styles.campo}>
            <span className={styles.etiqueta}>Operador</span>
            <select
              className={styles.entrada}
              value={operadorNuevo}
              onChange={(e) => setOperadorNuevo(e.target.value)}
            >
              <option value="">Elige un operador</option>
              <option value="__ninguno__">Sin asignar</option>
              {operadores
                .filter((op) => op.activo)
                .map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.nombre}
                  </option>
                ))}
            </select>
          </label>
          <div className={styles.barraPanelPie}>
            <button
              type="button"
              className={styles.accionBoton}
              onClick={aplicarOperador}
              disabled={operadorNuevo === ''}
            >
              Aplicar
            </button>
          </div>
        </div>
      )}

      {dialogo}
    </div>
  )
}
