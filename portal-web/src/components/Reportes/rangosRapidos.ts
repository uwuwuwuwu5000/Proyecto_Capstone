/** Rangos de fecha predefinidos, como strings yyyy-mm-dd para <input type="date">. */

export interface RangoFechas {
  desde: string
  hasta: string
}

export interface RangoRapido {
  clave: string
  etiqueta: string
  calcular: (hoy: Date) => RangoFechas
}

/** yyyy-mm-dd en hora local (toISOString usaría UTC y podría correr el día). */
export function fechaInput(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  return `${fecha.getFullYear()}-${mes}-${dia}`
}

function haceMeses(hoy: Date, meses: number): Date {
  return new Date(hoy.getFullYear(), hoy.getMonth() - meses, hoy.getDate())
}

export const RANGOS_RAPIDOS: RangoRapido[] = [
  {
    clave: 'hoy',
    etiqueta: 'Hoy',
    calcular: (hoy) => ({ desde: fechaInput(hoy), hasta: fechaInput(hoy) }),
  },
  {
    clave: 'semana',
    etiqueta: 'Esta semana',
    calcular: (hoy) => {
      const lunes = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - ((hoy.getDay() + 6) % 7))
      return { desde: fechaInput(lunes), hasta: fechaInput(hoy) }
    },
  },
  {
    clave: 'ultimoMes',
    etiqueta: 'Último mes',
    calcular: (hoy) => ({ desde: fechaInput(haceMeses(hoy, 1)), hasta: fechaInput(hoy) }),
  },
  {
    clave: 'mesAnterior',
    etiqueta: 'Mes anterior',
    calcular: (hoy) => ({
      desde: fechaInput(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)),
      hasta: fechaInput(new Date(hoy.getFullYear(), hoy.getMonth(), 0)),
    }),
  },
  {
    clave: 'tresMeses',
    etiqueta: '3 meses',
    calcular: (hoy) => ({ desde: fechaInput(haceMeses(hoy, 3)), hasta: fechaInput(hoy) }),
  },
  {
    clave: 'seisMeses',
    etiqueta: '6 meses',
    calcular: (hoy) => ({ desde: fechaInput(haceMeses(hoy, 6)), hasta: fechaInput(hoy) }),
  },
  {
    clave: 'anio',
    etiqueta: 'Este año',
    calcular: (hoy) => ({
      desde: fechaInput(new Date(hoy.getFullYear(), 0, 1)),
      hasta: fechaInput(hoy),
    }),
  },
  {
    clave: 'todo',
    etiqueta: 'Todo',
    calcular: () => ({ desde: '', hasta: '' }),
  },
]

export function rangoRapido(clave: string, hoy = new Date()): RangoFechas {
  return (RANGOS_RAPIDOS.find((r) => r.clave === clave) ?? RANGOS_RAPIDOS[0]).calcular(hoy)
}
