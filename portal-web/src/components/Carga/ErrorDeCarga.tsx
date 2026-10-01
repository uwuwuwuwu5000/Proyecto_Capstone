import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import styles from './Carga.module.css'

interface Props {
  children: ReactNode
  alto?: 'pagina' | 'bloque'
}

interface State {
  fallo: boolean
}

/**
 * Atrapa el error de una página cargada por partes que no se pudo descargar.
 * El caso típico: se publicó una versión nueva y el navegador pide un archivo
 * de la versión anterior que ya no existe. Recargar trae la versión nueva.
 */
export default class ErrorDeCarga extends Component<Props, State> {
  state: State = { fallo: false }

  static getDerivedStateFromError(): State {
    return { fallo: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error al cargar una sección del portal:', error, info.componentStack)
  }

  render() {
    if (!this.state.fallo) {
      return this.props.children
    }
    return (
      <div className={this.props.alto === 'bloque' ? styles.bloque : styles.pagina} role="alert">
        <p className={styles.mensaje}>No pudimos cargar esta sección.</p>
        <button type="button" className={styles.boton} onClick={() => window.location.reload()}>
          Recargar
        </button>
      </div>
    )
  }
}
