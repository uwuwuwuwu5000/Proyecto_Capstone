import { ESTADOS_EN_ORDEN, ETIQUETA_POR_ESTADO } from '../../constants/reportes'
import { useCategorias } from '../../context/CategoriasContext'
import { FILTROS_VACIOS, SIN_OPERADOR, hayFiltrosActivos } from './filtros'
import type { Filtros } from './filtros'
import type { OperadorResumen } from './reporte'
import SelectorRangos from './SelectorRangos'
import styles from './Reportes.module.css'

interface FiltrosReportesProps {
  filtros: Filtros
  onChange: (filtros: Filtros) => void
  /** Si se entrega, se muestra el filtro por operador (solo tiene sentido para el admin). */
  operadores?: OperadorResumen[]
  /** Si se entrega, se muestra el filtro por comuna con estos nombres (solo para el admin). */
  comunas?: string[]
  /** Texto bajo los filtros ("312 reportes · …"); lo arma cada pantalla. */
  resumen: string
}

export default function FiltrosReportes({
  filtros,
  onChange,
  operadores,
  comunas,
  resumen,
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
          placeholder="En esta página: descripción, autor, comuna, organismo o id…"
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

      {comunas && (
        <label className={styles.campo}>
          <span className={styles.etiqueta}>Comuna</span>
          <select
            className={styles.entrada}
            value={filtros.comuna}
            onChange={(e) => cambiar('comuna', e.target.value)}
          >
            <option value="">Todas</option>
            {/* Si viene de un enlace con una comuna que no está en la lista, igual se muestra. */}
            {filtros.comuna && !comunas.includes(filtros.comuna) && (
              <option value={filtros.comuna}>{filtros.comuna}</option>
            )}
            {comunas.map((nombre) => (
              <option key={nombre} value={nombre}>
                {nombre}
              </option>
            ))}
          </select>
        </label>
      )}

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
        <span className={styles.etiqueta}>Foto (esta página)</span>
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
        <span className={styles.etiqueta}>Verificación / veredicto</span>
        <select
          className={styles.entrada}
          value={filtros.verificacion}
          onChange={(e) => cambiar('verificacion', e.target.value as Filtros['verificacion'])}
        >
          <option value="">Todos</option>
          <option value="validados">Validados por la comunidad</option>
          <option value="por_verificar">Por verificar</option>
          <option value="real">Veredicto: real</option>
          <option value="falso">Veredicto: falso</option>
          <option value="sin_veredicto">Sin veredicto</option>
        </select>
      </label>

      <div className={`${styles.campo} ${styles.filtroAncho}`}>
        <span className={styles.etiqueta}>Fecha</span>
        <SelectorRangos
          desde={filtros.desde}
          hasta={filtros.hasta}
          onCambiar={(desde, hasta) => onChange({ ...filtros, desde, hasta })}
          idCampoDesde="filtros-reportes-desde"
        />
      </div>

      <label className={styles.campo}>
        <span className={styles.etiqueta}>Desde</span>
        <input
          id="filtros-reportes-desde"
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
          {resumen}
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
