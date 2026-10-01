import { ESTADOS_EN_ORDEN, ETIQUETA_POR_ESTADO } from '../../constants/reportes'
import { useCategorias } from '../../context/CategoriasContext'
import { FILTROS_VACIOS, SIN_OPERADOR, hayFiltrosActivos } from './filtros'
import type { Filtros } from './filtros'
import type { OperadorResumen } from './reporte'
import styles from './Reportes.module.css'

interface FiltrosReportesProps {
  filtros: Filtros
  onChange: (filtros: Filtros) => void
  /** Si se entrega, se muestra el filtro por operador (solo tiene sentido para el admin). */
  operadores?: OperadorResumen[]
  visibles: number
  total: number
}

export default function FiltrosReportes({
  filtros,
  onChange,
  operadores,
  visibles,
  total,
}: FiltrosReportesProps) {
  // Incluye las inactivas: hay reportes antiguos con categorías desactivadas.
  const { categorias } = useCategorias()

  function cambiar<K extends keyof Filtros>(clave: K, valor: Filtros[K]) {
    onChange({ ...filtros, [clave]: valor })
  }

  return (
    <section className={styles.filtros} aria-label="Filtros">
      <label className={`${styles.campo} ${styles.filtroAncho}`}>
        <span className={styles.etiqueta}>Buscar</span>
        <input
          type="search"
          className={styles.entrada}
          value={filtros.texto}
          onChange={(e) => cambiar('texto', e.target.value)}
          placeholder="Descripción, autor, comuna, organismo o id…"
        />
      </label>

      <label className={styles.campo}>
        <span className={styles.etiqueta}>Categoría</span>
        <select
          className={styles.entrada}
          value={filtros.categoria}
          onChange={(e) => cambiar('categoria', e.target.value)}
        >
          <option value="">Todas</option>
          {categorias.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.nombre}
              {categoria.activa ? '' : ' (inactiva)'}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.campo}>
        <span className={styles.etiqueta}>Estado</span>
        <select
          className={styles.entrada}
          value={filtros.estado}
          onChange={(e) => cambiar('estado', e.target.value)}
        >
          <option value="">Todos</option>
          {ESTADOS_EN_ORDEN.map((estado) => (
            <option key={estado} value={estado}>
              {ETIQUETA_POR_ESTADO[estado]}
            </option>
          ))}
        </select>
      </label>

      {operadores && (
        <label className={styles.campo}>
          <span className={styles.etiqueta}>Operador</span>
          <select
            className={styles.entrada}
            value={filtros.operador}
            onChange={(e) => cambiar('operador', e.target.value)}
          >
            <option value="">Todos</option>
            <option value={SIN_OPERADOR}>Sin asignar</option>
            {operadores.map((op) => (
              <option key={op.id} value={op.id}>
                {op.nombre}
                {op.activo ? '' : ' (inactivo)'}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className={styles.campo}>
        <span className={styles.etiqueta}>Foto</span>
        <select
          className={styles.entrada}
          value={filtros.foto}
          onChange={(e) => cambiar('foto', e.target.value as Filtros['foto'])}
        >
          <option value="">Todas</option>
          <option value="con">Con foto</option>
          <option value="sin">Sin foto</option>
        </select>
      </label>

      <label className={styles.campo}>
        <span className={styles.etiqueta}>Desde</span>
        <input
          type="date"
          className={styles.entrada}
          value={filtros.desde}
          max={filtros.hasta || undefined}
          onChange={(e) => cambiar('desde', e.target.value)}
        />
      </label>

      <label className={styles.campo}>
        <span className={styles.etiqueta}>Hasta</span>
        <input
          type="date"
          className={styles.entrada}
          value={filtros.hasta}
          min={filtros.desde || undefined}
          onChange={(e) => cambiar('hasta', e.target.value)}
        />
      </label>

      <div className={styles.filtrosPie}>
        <span className={styles.estadoCarga}>
          Mostrando {visibles} de {total} reportes
        </span>
        {hayFiltrosActivos(filtros) && (
          <button type="button" className={styles.enlaceBoton} onClick={() => onChange(FILTROS_VACIOS)}>
            Limpiar filtros
          </button>
        )}
      </div>
    </section>
  )
}
