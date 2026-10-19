// Ilustraciones de la Landing: SVG propios, de trazo fino y figuras de palos, en el
// celeste del portal. Son decorativas (aria-hidden): el significado está en los
// textos que las acompañan. Pesan unos pocos KB y se ven nítidas en cualquier pantalla.
import { COLOR_POR_ESTADO, ESTADOS_EN_ORDEN, ETIQUETA_POR_ESTADO } from '../../constants/reportes'
import styles from './Landing.module.css'

type Vector = [number, number]

interface PersonaProps {
  x: number
  /** Coordenada y de los pies. */
  suelo: number
  alto: number
  /** Dónde termina cada brazo, como fracción del alto, desde el hombro. */
  izq: Vector
  der: Vector
  clase?: string
}

/** Punto donde queda la mano (para colgarle un teléfono, una lupa…). */
function mano(p: Pick<PersonaProps, 'x' | 'suelo' | 'alto'>, v: Vector): Vector {
  const cuello = p.suelo - p.alto + p.alto * 0.2
  const hombro = cuello + p.alto * 0.1
  return [p.x + v[0] * p.alto, hombro + v[1] * p.alto]
}

/** Figura de palos: cabeza, tronco, piernas y dos brazos. */
function Persona({ x, suelo, alto, izq, der, clase = styles.tz }: PersonaProps) {
  const r = alto * 0.1
  const cy = suelo - alto + r
  const cuello = cy + r
  const cadera = suelo - alto * 0.42
  const hombro = cuello + alto * 0.1
  const [ix, iy] = mano({ x, suelo, alto }, izq)
  const [dx, dy] = mano({ x, suelo, alto }, der)
  return (
    <g className={clase}>
      <circle cx={x} cy={cy} r={r} />
      <line x1={x} y1={cuello} x2={x} y2={cadera} />
      <line x1={x} y1={cadera} x2={x - alto * 0.14} y2={suelo} />
      <line x1={x} y1={cadera} x2={x + alto * 0.14} y2={suelo} />
      <line x1={x} y1={hombro} x2={ix} y2={iy} />
      <line x1={x} y1={hombro} x2={dx} y2={dy} />
    </g>
  )
}

/** Marcador de mapa con borde oscuro: el color de cada estado se distingue del fondo. */
function Pin({ x, y, color, escala = 1 }: { x: number; y: number; color: string; escala?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${escala})`}>
      <path
        d="M0 0C-14-16-17-24-17-33A17 17 0 0 1 17-33C17-24 14-16 0 0Z"
        fill={color}
        className={styles.bordePin}
      />
      <circle cy="-33" r="6" className={styles.rlBase} />
    </g>
  )
}

// ---------------------------------------------------------------------------
// 1. Reportar: alguien fotografía el problema y lo marca
// ---------------------------------------------------------------------------

export function IlustracionReportar() {
  const principal = { x: 170, suelo: 300, alto: 170 }
  const [mx, my] = mano(principal, [0.32, -0.12])
  return (
    <svg className={styles.sv} viewBox="0 0 480 360" aria-hidden="true" focusable="false">
      <line x1="30" y1="300" x2="450" y2="300" className={styles.tzFino} />

      {/* Bache */}
      <ellipse cx="345" cy="302" rx="70" ry="13" className={styles.tz} />
      <ellipse cx="345" cy="302" rx="38" ry="6" className={styles.tzSuave} />
      <path d="M290 294l-14-8M400 294l16-9M345 288v-8" className={styles.tzSuave} />

      {/* Lo que ve la cámara */}
      <line x1={mx + 24} y1={my - 8} x2="296" y2="292" className={styles.guia} />
      <line x1={mx + 24} y1={my + 8} x2="394" y2="292" className={styles.guia} />

      {/* Ubicación marcada */}
      <g transform="translate(345 238)">
        <path
          d="M0 0C-18-22-22-32-22-44A22 22 0 0 1 22-44C22-32 18-22 0 0Z"
          className={styles.rl}
        />
        <circle cy="-44" r="8" className={styles.rlBase} />
      </g>

      <Persona x={88} suelo={300} alto={140} izq={[-0.22, -0.2]} der={[0.2, 0.12]} clase={styles.tzSuave} />
      <Persona {...principal} izq={[-0.2, 0.18]} der={[0.32, -0.12]} />

      {/* Teléfono con la cámara */}
      <g transform={`translate(${mx} ${my})`}>
        <rect x="-4" y="-30" width="30" height="50" rx="6" className={`${styles.rlTarjeta} ${styles.tz}`} />
        <circle cx="11" cy="-17" r="5.5" className={styles.tz} />
        <path d="M30-36l8-8M34-22h11M30-8l8 8" className={styles.tz} />
      </g>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// 2. Verificar: la comunidad confirma un reporte
// ---------------------------------------------------------------------------

export function IlustracionVerificar() {
  const personas = [130, 240, 350]
  return (
    <svg className={styles.sv} viewBox="0 0 480 360" aria-hidden="true" focusable="false">
      {/* Tarjeta del reporte */}
      <rect x="110" y="50" width="260" height="160" rx="14" className={`${styles.rlTarjeta} ${styles.tz}`} />
      <rect x="128" y="72" width="72" height="72" rx="10" className={styles.tzSuave} />
      <path d="M150 136h28M164 136V94q0-8 12-8" className={styles.tz} />
      <circle cx="180" cy="90" r="4" className={styles.rl} />
      <rect x="216" y="74" width="120" height="10" rx="5" className={styles.rlTexto} />
      <rect x="216" y="94" width="92" height="7" rx="3.5" className={styles.rlSuave} />
      <text x="216" y="130" className={styles.txtSuave}>
        12 confirmaciones
      </text>
      <rect x="216" y="150" width="124" height="30" rx="15" className={styles.pildora} />
      <path d="M232 165l6 6 11-12" className={styles.tz} />
      <text x="256" y="170" className={styles.txtPildora}>
        Verificado
      </text>

      {/* Sello de verificación */}
      <circle cx="362" cy="56" r="28" className={styles.rl} />
      <path d="M348 57l10 10 19-21" className={styles.tzBase} />

      {/* Vecinos que confirman */}
      {personas.map((x) => (
        <g key={x}>
          <line x1={x} y1="226" x2={x} y2="212" className={styles.guia} />
          <Persona x={x} suelo={332} alto={96} izq={[-0.22, -0.2]} der={[0.22, -0.2]} />
        </g>
      ))}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// 3. Seguimiento: alguien mira cómo avanza el reporte
// ---------------------------------------------------------------------------

const FECHAS = ['3 mar', '4 mar', '5 mar', '8 mar', '12 mar', '13 mar']

export function IlustracionSeguimiento({ encendida }: { encendida: boolean }) {
  return (
    <svg className={styles.sv} viewBox="0 0 480 360" aria-hidden="true" focusable="false">
      <rect x="50" y="30" width="250" height="300" rx="14" className={`${styles.rlTarjeta} ${styles.tz}`} />
      <text x="72" y="62" className={styles.txt}>
        Bache en Av. Matta 1250
      </text>
      <line x1="74" y1="96" x2="74" y2="296" className={styles.tzFino} />

      {ESTADOS_EN_ORDEN.map((estado, i) => {
        const y = 96 + i * 40
        const ultimo = i === ESTADOS_EN_ORDEN.length - 1
        return (
          <g
            key={estado}
            className={`${styles.hito} ${encendida ? styles.hitoEncendido : ''}`}
            style={{ ['--i' as string]: i }}
          >
            <circle
              cx="74"
              cy={y}
              r="8"
              fill={COLOR_POR_ESTADO[estado]}
              className={ultimo ? styles.hitoCerrado : styles.bordePin}
            />
            <text x="96" y={y + 4.5} className={styles.txt}>
              {ETIQUETA_POR_ESTADO[estado]}
            </text>
            <text x="278" y={y + 4} textAnchor="end" className={styles.txtSuave}>
              {FECHAS[i]}
            </text>
          </g>
        )
      })}

      {/* Quien lo sigue, con una lupa */}
      <Persona x={392} suelo={320} alto={190} izq={[-0.2, 0.02]} der={[0.18, 0.2]} />
      <circle cx="326" cy="164" r="19" className={`${styles.rlTarjeta} ${styles.tz}`} />
      <line x1="340" y1="178" x2="355" y2="192" className={styles.tz} />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// 4. Mapa: alguien ve un reporte en el mapa (imagen, no mapa interactivo)
// ---------------------------------------------------------------------------

const PINES: { x: number; y: number; estado: string }[] = [
  { x: 150, y: 130, estado: 'reportado' },
  { x: 290, y: 270, estado: 'en_revision' },
  { x: 420, y: 160, estado: 'derivado' },
  { x: 215, y: 330, estado: 'en_proceso' },
  { x: 690, y: 120, estado: 'resuelto' },
  { x: 800, y: 250, estado: 'cerrado' },
  { x: 90, y: 300, estado: 'resuelto' },
  { x: 520, y: 90, estado: 'reportado' },
]

export function IlustracionMapa() {
  const persona = { x: 905, suelo: 415, alto: 150 }
  const [mx, my] = mano(persona, [-0.2, -0.05])
  return (
    <>
      <svg className={styles.svMapa} viewBox="0 0 960 440" aria-hidden="true" focusable="false">
        {/* Calles */}
        <rect width="960" height="440" className={styles.fondoMapa} />
        <polygon points="560,0 700,0 660,80 540,70" className={styles.parque} />
        <g className={styles.calleAncha}>
          <path d="M0 200 L960 160" />
          <path d="M330 0 L380 440" />
          <path d="M0 400 L520 300 L960 360" />
        </g>
        <g className={styles.calleFina}>
          <path d="M0 80H960M0 320H960M120 0V440M560 0V440M760 0V440M240 0L200 440M880 0V440" />
        </g>

        {PINES.map((p) => (
          <Pin key={`${p.x}-${p.y}`} x={p.x} y={p.y} color={COLOR_POR_ESTADO[p.estado]} />
        ))}

        {/* Reporte seleccionado */}
        <circle cx="560" cy="300" r="36" className={styles.onda} />
        <circle cx="560" cy="300" r="20" className={styles.onda} />
        <Pin x={560} y={300} color={COLOR_POR_ESTADO.en_proceso} escala={1.35} />
        <rect x="590" y="190" width="240" height="96" rx="12" className={`${styles.rlTarjeta} ${styles.tz}`} />
        <text x="610" y="222" className={styles.txt}>
          Luminaria apagada
        </text>
        <text x="610" y="244" className={styles.txtSuave}>
          Av. Los Álamos y Calle 3
        </text>
        <rect x="610" y="256" width="104" height="20" rx="10" className={styles.pildora} />
        <circle cx="624" cy="266" r="4" fill={COLOR_POR_ESTADO.en_proceso} />
        <text x="634" y="270" className={styles.txtPildora}>
          En proceso
        </text>

        {/* Quien lo mira */}
        <Persona {...persona} izq={[-0.2, -0.05]} der={[0.15, 0.2]} />
        <rect x={mx - 12} y={my - 22} width="24" height="38" rx="5" className={`${styles.rlTarjeta} ${styles.tz}`} />
      </svg>
      <ul className={styles.leyendaMapa}>
        {ESTADOS_EN_ORDEN.map((estado) => (
          <li key={estado}>
            <span className={styles.leyendaPunto} style={{ background: COLOR_POR_ESTADO[estado] }} />
            {ETIQUETA_POR_ESTADO[estado]}
          </li>
        ))}
      </ul>
    </>
  )
}

/** Nodo de radar que acompaña a cada título (repite el logo). */
export function NodoRadar() {
  return (
    <svg className={styles.radar} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" className={styles.tz} />
      <circle cx="12" cy="12" r="4" className={styles.rl} />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// 5. Municipio: una municipalidad con su lista de reportes atendidos
// ---------------------------------------------------------------------------

export function IlustracionMunicipio() {
  return (
    <svg className={styles.sv} viewBox="0 0 480 360" aria-hidden="true" focusable="false">
      <line x1="30" y1="310" x2="450" y2="310" className={styles.tzFino} />

      {/* Edificio con frontón y columnas */}
      <polygon points="100,140 230,72 360,140" className={styles.tz} />
      <line x1="100" y1="140" x2="360" y2="140" className={styles.tz} />
      <circle cx="230" cy="116" r="8" className={styles.rl} />
      {[131, 197, 263, 329].map((x) => (
        <line key={x} x1={x} y1="152" x2={x} y2="292" className={styles.tz} />
      ))}
      <line x1="112" y1="292" x2="348" y2="292" className={styles.tz} />
      <line x1="96" y1="310" x2="364" y2="310" className={styles.tz} />

      {/* Lista de reportes gestionados */}
      <rect x="290" y="176" width="170" height="140" rx="12" className={`${styles.rlTarjeta} ${styles.tz}`} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <circle cx="316" cy={206 + i * 34} r="10" className={styles.tz} />
          <path d={`M311 ${206 + i * 34}l4 4 7-8`} className={styles.tz} />
          <rect x="336" y={202 + i * 34} width={96 - i * 14} height="8" rx="4" className={styles.rlSuave} />
        </g>
      ))}

      <Persona x={52} suelo={310} alto={140} izq={[-0.22, -0.2]} der={[0.2, 0.12]} />
    </svg>
  )
}

/** Íconos de línea de los pasos de «Así de simple». */
export function IconoPaso({ tipo }: { tipo: 'reporta' | 'comunidad' | 'municipio' | 'avance' }) {
  const trazos = {
    reporta: (
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4A1.5 1.5 0 0 1 4 14.5Z" />
    ),
    comunidad: (
      <>
        <circle cx="9" cy="8.5" r="3.2" />
        <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 11l2 2 4-4" />
      </>
    ),
    municipio: <path d="M6 17v-6a6 6 0 0 1 12 0v6l1.5 2h-15ZM10 21a2 2 0 0 0 4 0" />,
    avance: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12.5 3 3 5-6" />
      </>
    ),
  }[tipo]
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {trazos}
    </svg>
  )
}
