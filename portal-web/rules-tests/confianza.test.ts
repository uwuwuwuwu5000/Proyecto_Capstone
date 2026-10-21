// Reglas del sistema de confianza (candidato: firestore.confianza.rules).
// Cada prueba nombra la regla de sistema_confianza.md que comprueba.
//
// Correr:  npm run test:reglas
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore'
import {
  ADMIN, CIUDADANO, DIA, OPERADOR, REGLAS_CONFIANZA, VOTANTE, crearEntorno, hace, reporteNuevo, sembrarBase,
} from './entorno'

let env: RulesTestEnvironment
beforeAll(async () => {
  env = await crearEntorno(REGLAS_CONFIANZA)
})
afterAll(async () => {
  await env.cleanup()
})

type Claims = { email_verified?: boolean }
const como = (uid: string, claims: Claims = {}) =>
  env.authenticatedContext(uid, { email: `${uid}@x.cl`, email_verified: true, ...claims }).firestore()

const VALIDACION_CERO = { puntos: 0, votos: 0, validado: false, validadoAt: null, veredicto: null }
const diaHoy = () => String(Math.floor((Date.now() - 10_800_000) / 86_400_000))
const diaAyer = () => String(Math.floor((Date.now() - 10_800_000) / 86_400_000) - 1)

interface Semilla {
  validacion?: object | null
  confianzaVotante?: object
  perfilVotante?: object
  limiteHoy?: { confirmaciones: number; ultimaAt: Timestamp }
  confianzaAutor?: object
}

async function sembrar(s: Semilla = {}) {
  await env.clearFirestore()
  await sembrarBase(env, async (db) => {
    await setDoc(doc(db, 'reports', 'r1'), {
      ...reporteNuevo(CIUDADANO, () => new Date()),
      ...(s.validacion === null ? {} : { validacion: s.validacion ?? VALIDACION_CERO }),
    })
    if (s.perfilVotante) await setDoc(doc(db, 'users', VOTANTE), s.perfilVotante, { merge: true })
    if (s.confianzaVotante) await setDoc(doc(db, 'users', VOTANTE, 'confianza', 'actual'), s.confianzaVotante)
    if (s.limiteHoy) await setDoc(doc(db, 'users', VOTANTE, 'limites', diaHoy()), s.limiteHoy)
    if (s.confianzaAutor) await setDoc(doc(db, 'users', CIUDADANO, 'confianza', 'actual'), s.confianzaAutor)
  })
}

// ---------------------------------------------------------------------------
// Confirmar con peso (sección 5.3)
// ---------------------------------------------------------------------------

interface Voto {
  uid?: string
  nivel?: number
  peso?: number
  /** Valores finales de validacion que escribe el cliente. */
  puntos?: number
  votos?: number
  validado?: boolean
  conValidacion?: boolean
  conLimite?: boolean
  limiteExistente?: boolean
  confirmacionesDia?: number
  dia?: string
}

function votar(db: ReturnType<typeof como>, v: Voto) {
  const uid = v.uid ?? VOTANTE
  const peso = v.peso ?? 10
  const lote = writeBatch(db)
  lote.set(doc(db, 'reports', 'r1', 'confirmations', uid), {
    uid, reportId: 'r1', createdAt: serverTimestamp(), nivel: v.nivel ?? 0, peso,
  })
  if (v.conValidacion !== false) {
    const campos: Record<string, unknown> = {
      'validacion.puntos': v.puntos ?? peso,
      'validacion.votos': v.votos ?? (peso > 0 ? 1 : 0),
      'validacion.validado': v.validado ?? false,
    }
    if (v.validado) campos['validacion.validadoAt'] = serverTimestamp()
    lote.update(doc(db, 'reports', 'r1'), campos)
  }
  if (v.conLimite !== false) {
    const ref = doc(db, 'users', uid, 'limites', v.dia ?? diaHoy())
    if (v.limiteExistente) {
      lote.update(ref, { confirmaciones: v.confirmacionesDia ?? 2, ultimaAt: serverTimestamp() })
    } else {
      lote.set(ref, { confirmaciones: 1, ultimaAt: serverTimestamp() })
    }
  }
  return lote.commit()
}

describe('confirmar con peso', () => {
  beforeEach(() => sembrar())

  it('un voto de nivel 0 con el peso exacto (10) se acepta', async () => {
    await assertSucceeds(votar(como(VOTANTE), {}))
  })
  it('un peso inventado se rechaza', async () => {
    await assertFails(votar(como(VOTANTE), { peso: 30, puntos: 30 }))
  })
  it('un nivel falseado se rechaza (dice nivel 5 y su confianza es 0)', async () => {
    await assertFails(votar(como(VOTANTE), { nivel: 5, peso: 22.5, puntos: 22.5 }))
  })
  it('la suma del reporte debe ser la anterior más el peso', async () => {
    await assertFails(votar(como(VOTANTE), { puntos: 50 }))
  })
  it('votos debe subir en 1', async () => {
    await assertFails(votar(como(VOTANTE), { votos: 2 }))
  })
  it('sin tocar validacion del reporte se rechaza', async () => {
    await assertFails(votar(como(VOTANTE), { conValidacion: false }))
  })
  it('sin escribir el contador del día se rechaza', async () => {
    await assertFails(votar(como(VOTANTE), { conLimite: false }))
  })
  it('el contador de otro día se rechaza', async () => {
    await assertFails(votar(como(VOTANTE), { dia: diaAyer() }))
  })
  it('no se confirma el propio reporte', async () => {
    await assertFails(votar(como(CIUDADANO), { uid: CIUDADANO }))
  })
  it('una cuenta operador no confirma', async () => {
    await assertFails(votar(como(OPERADOR), { uid: OPERADOR }))
  })
  it('no se confirma dos veces', async () => {
    await assertSucceeds(votar(como(VOTANTE), {}))
    await assertFails(votar(como(VOTANTE), { puntos: 20, votos: 2, limiteExistente: true }))
  })
  it('un voto no puede sumar a nombre de otro usuario', async () => {
    const db = como(VOTANTE)
    const lote = writeBatch(db)
    lote.set(doc(db, 'reports', 'r1', 'confirmations', CIUDADANO), {
      uid: CIUDADANO, reportId: 'r1', createdAt: serverTimestamp(), nivel: 0, peso: 10,
    })
    await assertFails(lote.commit())
  })
})

describe('peso 0 por correo o antigüedad', () => {
  it('con el correo sin verificar solo se acepta peso 0, sin sumar votos', async () => {
    await sembrar()
    const db = como(VOTANTE, { email_verified: false })
    await assertFails(votar(db, { peso: 10 }))
    await assertSucceeds(votar(db, { peso: 0, puntos: 0, votos: 0 }))
  })
  it('una cuenta de menos de 24 horas solo se acepta con peso 0', async () => {
    await sembrar({ perfilVotante: { createdAt: hace(2 * 3_600_000) } })
    const db = como(VOTANTE)
    await assertFails(votar(db, { peso: 10 }))
    await assertSucceeds(votar(db, { peso: 0, puntos: 0, votos: 0 }))
  })
})

describe('niveles', () => {
  it('un votante de nivel 4 pesa 20 y puede confirmar', async () => {
    await sembrar({ confianzaVotante: { puntosConfianza: 190, trustLevel: 4 } })
    await assertSucceeds(votar(como(VOTANTE), { nivel: 4, peso: 20, puntos: 20 }))
  })
  it('el nivel 10 pesa 34 (tope)', async () => {
    await sembrar({ confianzaVotante: { puntosConfianza: 760, trustLevel: 10 } })
    await assertSucceeds(votar(como(VOTANTE), { nivel: 10, peso: 34, puntos: 34 }))
  })
  it('el peso del nivel 10 no puede ser 35', async () => {
    await sembrar({ confianzaVotante: { puntosConfianza: 760, trustLevel: 10 } })
    await assertFails(votar(como(VOTANTE), { nivel: 10, peso: 35, puntos: 35 }))
  })
})

describe('límites y suspensión', () => {
  it('nivel 0: la sexta confirmación del día se rechaza', async () => {
    await sembrar({ limiteHoy: { confirmaciones: 5, ultimaAt: hace(5 * 60_000) } })
    await assertFails(votar(como(VOTANTE), { limiteExistente: true, confirmacionesDia: 6 }))
  })
  it('nivel 0: la quinta confirmación del día se acepta', async () => {
    await sembrar({ limiteHoy: { confirmaciones: 4, ultimaAt: hace(5 * 60_000) } })
    await assertSucceeds(votar(como(VOTANTE), { limiteExistente: true, confirmacionesDia: 5 }))
  })
  it('el contador no puede saltar de a más de uno', async () => {
    await sembrar({ limiteHoy: { confirmaciones: 1, ultimaAt: hace(5 * 60_000) } })
    await assertFails(votar(como(VOTANTE), { limiteExistente: true, confirmacionesDia: 4 }))
  })
  it('la pausa de 20 s: una segunda confirmación inmediata se rechaza', async () => {
    await sembrar({ limiteHoy: { confirmaciones: 1, ultimaAt: hace(5_000) } })
    await assertFails(votar(como(VOTANTE), { limiteExistente: true, confirmacionesDia: 2 }))
  })
  it('pasada la pausa se acepta', async () => {
    await sembrar({ limiteHoy: { confirmaciones: 1, ultimaAt: hace(40_000) } })
    await assertSucceeds(votar(como(VOTANTE), { limiteExistente: true, confirmacionesDia: 2 }))
  })
  it('con las confirmaciones suspendidas se rechaza', async () => {
    await sembrar({ confianzaVotante: { puntosConfianza: 0, trustLevel: 0, confirmacionesSuspendidas: true } })
    await assertFails(votar(como(VOTANTE), {}))
  })
  it('un usuario no reinicia su contador del día', async () => {
    await sembrar({ limiteHoy: { confirmaciones: 5, ultimaAt: hace(60_000) } })
    const db = como(VOTANTE)
    await assertFails(setDoc(doc(db, 'users', VOTANTE, 'limites', diaHoy()), { confirmaciones: 1, ultimaAt: serverTimestamp() }))
  })
})

describe('validación del reporte (sección 4.3)', () => {
  it('con 95 puntos y 3 votos, el voto que llega a 105 debe marcar validado', async () => {
    await sembrar({ validacion: { ...VALIDACION_CERO, puntos: 95, votos: 3 } })
    await assertFails(votar(como(VOTANTE), { puntos: 105, votos: 4, validado: false }))
    await sembrar({ validacion: { ...VALIDACION_CERO, puntos: 95, votos: 3 } })
    await assertSucceeds(votar(como(VOTANTE), { puntos: 105, votos: 4, validado: true }))
  })
  it('no se marca validado con menos de 100 puntos', async () => {
    await sembrar({ validacion: { ...VALIDACION_CERO, puntos: 50, votos: 4 } })
    await assertFails(votar(como(VOTANTE), { puntos: 60, votos: 5, validado: true }))
  })
  it('no se marca validado con menos de 3 personas, aunque sumen 100', async () => {
    await sembrar({ validacion: { ...VALIDACION_CERO, puntos: 90, votos: 1 } })
    await assertFails(votar(como(VOTANTE), { puntos: 100, votos: 2, validado: true }))
  })
  it('un voto de peso 0 no cuenta como persona', async () => {
    await sembrar({ validacion: { ...VALIDACION_CERO, puntos: 100, votos: 2 } })
    const db = como(VOTANTE, { email_verified: false })
    await assertFails(votar(db, { peso: 0, puntos: 100, votos: 3, validado: true }))
    await sembrar({ validacion: { ...VALIDACION_CERO, puntos: 100, votos: 2 } })
    await assertSucceeds(votar(como(VOTANTE, { email_verified: false }), { peso: 0, puntos: 100, votos: 2, validado: false }))
  })
})

describe('reporte antiguo sin el mapa validacion', () => {
  it('la primera confirmación con peso crea el mapa', async () => {
    await sembrar({ validacion: null })
    await assertSucceeds(votar(como(VOTANTE), {}))
  })
})

describe('formato antiguo de confirmación (transición)', () => {
  beforeEach(() => sembrar())
  it('se acepta sin peso y no toca la validación', async () => {
    const db = como(VOTANTE)
    await assertSucceeds(
      setDoc(doc(db, 'reports', 'r1', 'confirmations', VOTANTE), { uid: VOTANTE, reportId: 'r1', createdAt: serverTimestamp() }),
    )
  })
  it('el formato antiguo no puede llevar un peso escondido', async () => {
    const db = como(VOTANTE)
    await assertFails(
      setDoc(doc(db, 'reports', 'r1', 'confirmations', VOTANTE), {
        uid: VOTANTE, reportId: 'r1', createdAt: serverTimestamp(), peso: 34,
      }),
    )
  })
  it('un voto sin el formato antiguo ni el nuevo no suma a la validación', async () => {
    const db = como(VOTANTE)
    await assertFails(updateDoc(doc(db, 'reports', 'r1'), { 'validacion.puntos': 100, 'validacion.votos': 3, 'validacion.validado': true }))
  })
})

// ---------------------------------------------------------------------------
// Veredicto (secciones 5.5 y 5.6)
// ---------------------------------------------------------------------------

interface Veredicto {
  quien?: string
  veredicto?: 'real' | 'falso'
  comentario?: string
  puntosAplicados?: number
  puntosNuevos?: number
  nivelNuevo?: number
  validados?: number
  falsos?: number
  conConfianza?: boolean
  conEspejo?: boolean
  espejoNivel?: number
  reporte?: string
}

function dar(db: ReturnType<typeof como>, v: Veredicto) {
  const quien = v.quien ?? OPERADOR
  const lote = writeBatch(db)
  const campos: Record<string, unknown> = {
    'validacion.veredicto': v.veredicto ?? 'real',
    'validacion.veredictoPor': quien,
    'validacion.veredictoAt': serverTimestamp(),
    'validacion.veredictoPuntos': v.puntosAplicados ?? 10,
    updatedAt: serverTimestamp(),
  }
  if (v.comentario !== undefined) campos['validacion.veredictoComentario'] = v.comentario
  lote.update(doc(db, 'reports', v.reporte ?? 'r1'), campos)
  if (v.conConfianza !== false) {
    lote.set(doc(db, 'users', CIUDADANO, 'confianza', 'actual'), {
      puntosConfianza: v.puntosNuevos ?? 10,
      trustLevel: v.nivelNuevo ?? 0,
      validatedReports: v.validados ?? 1,
      reportesFalsos: v.falsos ?? 0,
      confirmacionesSuspendidas: false,
      ultimoReporteId: v.reporte ?? 'r1',
      updatedAt: serverTimestamp(),
    })
  }
  if (v.conEspejo !== false) {
    lote.update(doc(db, 'users', CIUDADANO), {
      trustLevel: v.espejoNivel ?? v.nivelNuevo ?? 0,
      validatedReports: v.validados ?? 1,
      updatedAt: serverTimestamp(),
    })
  }
  return lote.commit()
}

describe('veredicto del operador', () => {
  beforeEach(() => sembrar())

  it('real: el autor sube de 0 a 10 PC y validatedReports a 1', async () => {
    await assertSucceeds(dar(como(OPERADOR), {}))
  })
  it('real: con 35 PC pasa a 45 y sube al nivel 1', async () => {
    await sembrar({ confianzaAutor: { puntosConfianza: 35, trustLevel: 0, validatedReports: 3, reportesFalsos: 0 } })
    await assertSucceeds(dar(como(OPERADOR), { puntosNuevos: 45, nivelNuevo: 1, validados: 4 }))
  })
  it('real: un nivel mal calculado se rechaza', async () => {
    await sembrar({ confianzaAutor: { puntosConfianza: 35, trustLevel: 0, validatedReports: 3, reportesFalsos: 0 } })
    await assertFails(dar(como(OPERADOR), { puntosNuevos: 45, nivelNuevo: 3, validados: 4 }))
  })
  it('real: puntos que no son la suma exacta se rechazan', async () => {
    await assertFails(dar(como(OPERADOR), { puntosNuevos: 50, puntosAplicados: 50 }))
  })
  it('real: el tope de 760 (755 + 10 = 760)', async () => {
    await sembrar({ confianzaAutor: { puntosConfianza: 755, trustLevel: 9, validatedReports: 70, reportesFalsos: 0 } })
    await assertSucceeds(dar(como(OPERADOR), { puntosNuevos: 760, nivelNuevo: 10, validados: 71, puntosAplicados: 5, espejoNivel: 10 }))
  })
  it('real: pasar de 760 se rechaza', async () => {
    await sembrar({ confianzaAutor: { puntosConfianza: 755, trustLevel: 9, validatedReports: 70, reportesFalsos: 0 } })
    await assertFails(dar(como(OPERADOR), { puntosNuevos: 765, nivelNuevo: 10, validados: 71, puntosAplicados: 10 }))
  })
  it('falso: con 20 PC baja a 5 y suma un falso', async () => {
    await sembrar({ confianzaAutor: { puntosConfianza: 20, trustLevel: 0, validatedReports: 2, reportesFalsos: 0 } })
    await assertSucceeds(
      dar(como(OPERADOR), { veredicto: 'falso', comentario: 'Foto ajena', puntosNuevos: 5, puntosAplicados: -15, validados: 2, falsos: 1 }),
    )
  })
  it('falso: el piso es 0 (con 5 PC queda en 0 y se aplican -5)', async () => {
    await sembrar({ confianzaAutor: { puntosConfianza: 5, trustLevel: 0, validatedReports: 0, reportesFalsos: 0 } })
    await assertSucceeds(
      dar(como(OPERADOR), { veredicto: 'falso', comentario: 'No existe', puntosNuevos: 0, puntosAplicados: -5, validados: 0, falsos: 1 }),
    )
  })
  it('falso: bajar de 0 se rechaza', async () => {
    await sembrar({ confianzaAutor: { puntosConfianza: 5, trustLevel: 0, validatedReports: 0, reportesFalsos: 0 } })
    await assertFails(
      dar(como(OPERADOR), { veredicto: 'falso', comentario: 'No existe', puntosNuevos: -10, puntosAplicados: -15, validados: 0, falsos: 1 }),
    )
  })
  it('falso: sin comentario se rechaza', async () => {
    await sembrar({ confianzaAutor: { puntosConfianza: 20, trustLevel: 0, validatedReports: 2, reportesFalsos: 0 } })
    await assertFails(dar(como(OPERADOR), { veredicto: 'falso', puntosNuevos: 5, puntosAplicados: -15, validados: 2, falsos: 1 }))
  })
  it('falso: el comentario no puede ser solo espacios', async () => {
    await sembrar({ confianzaAutor: { puntosConfianza: 20, trustLevel: 0, validatedReports: 2, reportesFalsos: 0 } })
    await assertFails(dar(como(OPERADOR), { veredicto: 'falso', comentario: '   ', puntosNuevos: 5, puntosAplicados: -15, validados: 2, falsos: 1 }))
  })
  it('sin escribir los puntos del autor en el mismo lote se rechaza', async () => {
    await assertFails(dar(como(OPERADOR), { conConfianza: false, conEspejo: false }))
  })
  it('el espejo en users debe coincidir con confianza/actual', async () => {
    await sembrar({ confianzaAutor: { puntosConfianza: 35, trustLevel: 0, validatedReports: 3, reportesFalsos: 0 } })
    await assertFails(dar(como(OPERADOR), { puntosNuevos: 45, nivelNuevo: 1, validados: 4, espejoNivel: 5 }))
  })
  it('un veredicto no se cambia una vez dado', async () => {
    await assertSucceeds(dar(como(OPERADOR), {}))
    await assertFails(dar(como(OPERADOR), { veredicto: 'falso', comentario: 'Cambio', puntosNuevos: 0, puntosAplicados: -10, validados: 1, falsos: 1 }))
  })
  it('un segundo veredicto sobre el mismo reporte se rechaza aunque no toque los puntos', async () => {
    await assertSucceeds(dar(como(OPERADOR), {}))
    const db = como(OPERADOR)
    await assertFails(
      updateDoc(doc(db, 'reports', 'r1'), {
        'validacion.veredicto': 'falso',
        'validacion.veredictoPor': OPERADOR,
        'validacion.veredictoAt': serverTimestamp(),
        'validacion.veredictoComentario': 'Me arrepentí',
        'validacion.veredictoPuntos': 0,
        updatedAt: serverTimestamp(),
      }),
    )
  })
  it('el administrador también da veredicto', async () => {
    await assertSucceeds(dar(como(ADMIN), { quien: ADMIN }))
  })
  it('un ciudadano no da veredicto', async () => {
    await assertFails(dar(como(VOTANTE), { quien: VOTANTE }))
  })
  it('un operador de otro organismo no da veredicto', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'operadores', 'opr2'), { organismoId: 'org2', activo: true, nombre: 'Op 2' })
      await setDoc(doc(db, 'users', 'oper2'), {
        uid: 'oper2', email: 'o2@x.cl', displayName: 'Op2', role: 'operador', operadorId: 'opr2',
        trustLevel: 0, validatedReports: 0, createdAt: hace(DIA), updatedAt: hace(DIA),
      })
    })
    await assertFails(dar(como('oper2'), { quien: 'oper2' }))
  })
  it('nadie da veredicto a su propio reporte', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'reports', 'r2'), {
        ...reporteNuevo(ADMIN, () => new Date()), validacion: VALIDACION_CERO,
      })
    })
    const db = como(ADMIN)
    const lote = writeBatch(db)
    lote.update(doc(db, 'reports', 'r2'), {
      'validacion.veredicto': 'real', 'validacion.veredictoPor': ADMIN,
      'validacion.veredictoAt': serverTimestamp(), 'validacion.veredictoPuntos': 10, updatedAt: serverTimestamp(),
    })
    lote.set(doc(db, 'users', ADMIN, 'confianza', 'actual'), {
      puntosConfianza: 10, trustLevel: 0, validatedReports: 1, reportesFalsos: 0,
      confirmacionesSuspendidas: false, ultimoReporteId: 'r2', updatedAt: serverTimestamp(),
    })
    await assertFails(lote.commit())
  })
  it('el reporte de un autor que no es ciudadano no da puntos', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'reports', 'r3'), {
        ...reporteNuevo(ADMIN, () => new Date()), validacion: VALIDACION_CERO,
      })
    })
    const db = como(OPERADOR)
    const lote = writeBatch(db)
    lote.update(doc(db, 'reports', 'r3'), {
      'validacion.veredicto': 'real', 'validacion.veredictoPor': OPERADOR,
      'validacion.veredictoAt': serverTimestamp(), 'validacion.veredictoPuntos': 10, updatedAt: serverTimestamp(),
    })
    lote.set(doc(db, 'users', ADMIN, 'confianza', 'actual'), {
      puntosConfianza: 10, trustLevel: 0, validatedReports: 1, reportesFalsos: 0,
      confirmacionesSuspendidas: false, ultimoReporteId: 'r3', updatedAt: serverTimestamp(),
    })
    await assertFails(lote.commit())
  })
})

// ---------------------------------------------------------------------------
// Acceso a los datos de confianza y protecciones del perfil
// ---------------------------------------------------------------------------

describe('acceso a confianza/actual', () => {
  beforeEach(() => sembrar({ confianzaAutor: { puntosConfianza: 50, trustLevel: 1 } }))

  it('el dueño lee la suya', async () => {
    await assertSucceeds(getDoc(doc(como(CIUDADANO), 'users', CIUDADANO, 'confianza', 'actual')))
  })
  it('otro ciudadano no la lee (el nivel es privado)', async () => {
    await assertFails(getDoc(doc(como(VOTANTE), 'users', CIUDADANO, 'confianza', 'actual')))
  })
  it('un operador la lee', async () => {
    await assertSucceeds(getDoc(doc(como(OPERADOR), 'users', CIUDADANO, 'confianza', 'actual')))
  })
  it('el dueño no la modifica', async () => {
    await assertFails(setDoc(doc(como(CIUDADANO), 'users', CIUDADANO, 'confianza', 'actual'), { puntosConfianza: 760, trustLevel: 10 }))
  })
  it('un operador no la modifica por su cuenta (sin veredicto)', async () => {
    await assertFails(updateDoc(doc(como(OPERADOR), 'users', CIUDADANO, 'confianza', 'actual'), { puntosConfianza: 760 }))
  })
  it('el administrador suspende confirmaciones sin cambiar los puntos', async () => {
    await assertSucceeds(
      setDoc(doc(como(ADMIN), 'users', CIUDADANO, 'confianza', 'actual'), {
        puntosConfianza: 50, trustLevel: 1, confirmacionesSuspendidas: true,
      }),
    )
  })
  it('el administrador no puede cambiar los puntos al suspender', async () => {
    await assertFails(
      setDoc(doc(como(ADMIN), 'users', CIUDADANO, 'confianza', 'actual'), {
        puntosConfianza: 760, trustLevel: 10, confirmacionesSuspendidas: true,
      }),
    )
  })
})

describe('perfil y reportes', () => {
  beforeEach(() => sembrar())

  it('createdAt no se puede cambiar (antigüedad de la cuenta)', async () => {
    await assertFails(updateDoc(doc(como(VOTANTE), 'users', VOTANTE), { createdAt: hace(400 * DIA), updatedAt: serverTimestamp() }))
  })
  it('un perfil sin createdAt puede completarlo una vez, con la hora del servidor', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'viejo1'), {
        uid: 'viejo1', email: 'v@x.cl', displayName: 'Viejo', role: 'ciudadano', trustLevel: 0, validatedReports: 0,
      })
    })
    const db = env.authenticatedContext('viejo1', { email: 'v@x.cl', email_verified: true }).firestore()
    await assertFails(updateDoc(doc(db, 'users', 'viejo1'), { createdAt: hace(400 * DIA), updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(doc(db, 'users', 'viejo1'), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))
  })
  it('al registrarse, createdAt debe ser la hora del servidor', async () => {
    const db = env.authenticatedContext('nuevo1', { email: 'n@x.cl', email_verified: true }).firestore()
    const base = { uid: 'nuevo1', email: 'n@x.cl', displayName: 'Nuevo', role: 'ciudadano', trustLevel: 0, validatedReports: 0, emailVerified: true }
    await assertFails(setDoc(doc(db, 'users', 'nuevo1'), { ...base, createdAt: hace(400 * DIA), updatedAt: serverTimestamp() }))
    await assertSucceeds(setDoc(doc(db, 'users', 'nuevo1'), { ...base, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))
  })
  it('un reporte nuevo no puede nacer con puntos o validado', async () => {
    const db = como(CIUDADANO)
    await assertFails(setDoc(doc(db, 'reports', 'n1'), reporteNuevo(CIUDADANO, serverTimestamp, { validacion: { ...VALIDACION_CERO, puntos: 100, votos: 3, validado: true } })))
    await assertSucceeds(setDoc(doc(db, 'reports', 'n2'), reporteNuevo(CIUDADANO, serverTimestamp, { validacion: VALIDACION_CERO })))
  })
  it('el autor no modifica la validación de su reporte', async () => {
    await assertFails(updateDoc(doc(como(CIUDADANO), 'reports', 'r1'), { 'validacion.validado': true, 'validacion.puntos': 100 }))
  })
})
