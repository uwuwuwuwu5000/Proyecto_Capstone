import { Link } from 'react-router-dom'
import { FECHA_TERMINOS, POLITICA_DE_PRIVACIDAD, TERMINOS_DE_USO, VERSION_TERMINOS } from '@ciudad-alerta/comun'
import type { DocumentoLegal } from '@ciudad-alerta/comun'
import Navbar from '../../components/Navbar/Navbar'
import styles from './Terminos.module.css'

/**
 * Página pública (sin sesión) con un documento legal: `/terminos` o `/privacidad`. El texto sale de
 * `comun/src/legal/terminos.ts`, el mismo que usa la app móvil.
 */
export default function Terminos({ documento }: { documento: DocumentoLegal }) {
  const otro = documento.id === TERMINOS_DE_USO.id ? POLITICA_DE_PRIVACIDAD : TERMINOS_DE_USO
  const rutaOtro = otro.id === TERMINOS_DE_USO.id ? '/terminos' : '/privacidad'

  return (
    <>
      <Navbar />
      <main className={styles.pagina}>
        <article className={styles.documento}>
          <h1 className={styles.titulo}>{documento.titulo}</h1>
          <p className={styles.version}>
            Versión {VERSION_TERMINOS} · {FECHA_TERMINOS}
          </p>
          {documento.secciones.map((seccion) => (
            <section key={seccion.titulo} className={styles.seccion}>
              <h2 className={styles.subtitulo}>{seccion.titulo}</h2>
              {seccion.parrafos.map((parrafo) => (
                <p key={parrafo} className={styles.parrafo}>
                  {parrafo}
                </p>
              ))}
            </section>
          ))}
          <p className={styles.otro}>
            Lee también: <Link to={rutaOtro}>{otro.titulo}</Link>
          </p>
        </article>
      </main>
    </>
  )
}
