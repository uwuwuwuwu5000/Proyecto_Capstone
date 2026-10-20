import { Injectable, inject } from '@angular/core';
import { FirebaseError } from 'firebase/app';
import { User, getIdTokenResult } from 'firebase/auth';
import {
  DocumentReference,
  Firestore,
  Timestamp,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';

import { FIRESTORE } from '../../../core/firebase.providers';
import { Report, ValidacionReporte } from '../../../models/report.model';
import { AuthService } from '../../../services/auth.service';
import {
  MotivoSinPeso,
  cuentaEsAntigua,
  inicioDeDia,
  limiteDiario,
  numeroDeDia,
  pesoDeVoto,
  sumarConfirmacion,
  validacionCompleta,
  PARAMETROS_CONFIANZA,
} from '@ciudad-alerta/comun';

/** Datos de `users/{uid}/confianza/actual`. Sin documento = nivel 0. */
export interface EstadoConfianza {
  puntos: number;
  nivel: number;
  validados: number;
  falsos: number;
  suspendido: boolean;
  /** Vino de la copia local porque no hubo conexión (A2.5). */
  desactualizado: boolean;
}

/** Contador de hoy, `users/{uid}/limites/{día}`. */
export interface CupoDelDia {
  usadas: number;
  limite: number;
  restantes: number;
  /** Hora de la última confirmación de hoy, para la pausa de 20 s. */
  ultimaMs: number | null;
  /** Cuándo vuelve a 0 el contador. */
  reinicioMs: number;
}

export type MotivoBloqueo =
  | 'confirmado'
  | 'propio'
  | 'operador'
  | 'revisado'
  | 'suspendido'
  | 'limite'
  | 'pausa';

/** Lo que la pantalla necesita para mostrar o bloquear el botón de confirmar. */
export interface Disponibilidad {
  bloqueo: MotivoBloqueo | null;
  nivel: number;
  peso: number;
  motivoSinPeso: MotivoSinPeso;
  cupo: CupoDelDia;
  /** Milisegundos que faltan para terminar la pausa; 0 si no hay pausa. */
  pausaRestanteMs: number;
  /** Peso que aportó el usuario, si ya había confirmado con el formato nuevo. */
  pesoAportado: number | null;
}

export interface ResultadoConfirmacion {
  peso: number;
  motivoSinPeso: MotivoSinPeso;
  /** `validacion` del reporte tal como quedó. */
  validacion: ValidacionReporte;
  recienValidado: boolean;
  restantesHoy: number;
}

export type CodigoErrorConfianza =
  | MotivoBloqueo
  | 'no_autenticado'
  | 'no_existe'
  | 'red'
  | 'rechazada'
  | 'desconocido';

export class ConfianzaError extends Error {
  constructor(
    override readonly message: string,
    readonly code: CodigoErrorConfianza,
  ) {
    super(message);
    this.name = 'ConfianzaError';
  }
}

const SIN_CONFIANZA: Omit<EstadoConfianza, 'desactualizado'> = {
  puntos: 0,
  nivel: 0,
  validados: 0,
  falsos: 0,
  suspendido: false,
};

/**
 * Margen para el reloj del teléfono: cerca del cambio de día o de las 24 h de
 * la cuenta, la hora del teléfono y la del servidor pueden dar resultados
 * distintos. Se reintenta con la hora corregida en este margen (5.3, «Borde de
 * la medianoche»).
 */
const MARGEN_RELOJ_MS = 2 * 60_000;

/**
 * Sistema de confianza: lectura del nivel propio y confirmación con peso.
 *
 * Todo lo que escribe lo comprueban las reglas de Firestore (no hay servidor).
 * Por eso cada número se calcula aquí con las mismas funciones de
 * `comun/src/confianza/calculos.ts`, y la escritura va en una transacción: si dos vecinos
 * confirman a la vez, Firestore repite la segunda con la suma nueva.
 */
@Injectable({ providedIn: 'root' })
export class ConfianzaService {
  private readonly firestore = inject<Firestore>(FIRESTORE);
  private readonly authService = inject(AuthService);

  /** Nivel y puntos propios. Sin red, devuelve la última copia guardada. */
  async miConfianza(): Promise<EstadoConfianza> {
    const usuario = this.exigirUsuario();

    try {
      const snapshot = await getDoc(this.refConfianza(usuario.uid));
      const estado = { ...this.leerConfianza(snapshot.data()), desactualizado: false };
      this.guardarCopia(usuario.uid, estado);
      return estado;
    } catch (error) {
      const copia = this.leerCopia(usuario.uid);
      if (copia) return { ...copia, desactualizado: true };
      throw this.traducir(error);
    }
  }

  /** Confirmaciones de hoy. */
  async miCupoDeHoy(nivel: number): Promise<CupoDelDia> {
    const usuario = this.exigirUsuario();
    const dia = numeroDeDia(Date.now());
    const snapshot = await getDoc(this.refLimite(usuario.uid, dia));
    return this.cupo(snapshot.data(), nivel, dia);
  }

  /**
   * Si el usuario puede confirmar este reporte y cuánto valdría su voto. Lee
   * su confianza, su contador de hoy, su perfil y si ya confirmó (4 lecturas).
   */
  async disponibilidad(reporte: Report): Promise<Disponibilidad> {
    const usuario = this.exigirUsuario();
    const ahora = Date.now();
    const dia = numeroDeDia(ahora);

    const [confianza, limite, voto, perfil, correoVerificado] = await Promise.all([
      getDoc(this.refConfianza(usuario.uid)),
      getDoc(this.refLimite(usuario.uid, dia)),
      getDoc(this.refVoto(reporte.id, usuario.uid)),
      getDoc(doc(this.firestore, 'users', usuario.uid)),
      this.correoVerificadoEnToken(usuario),
    ]);

    const estado = this.leerConfianza(confianza.data());
    const cupo = this.cupo(limite.data(), estado.nivel, dia);
    const cuentaCreadaMs = this.milisegundos(perfil.data()?.['createdAt']);
    const { peso, motivoSinPeso } = pesoDeVoto({
      nivel: estado.nivel,
      correoVerificado,
      cuentaAntigua: cuentaEsAntigua(cuentaCreadaMs, ahora),
    });
    const pausaRestanteMs = this.pausaRestante(cupo.ultimaMs, ahora);

    if (cuentaCreadaMs === null && perfil.exists()) {
      void this.completarFechaDeCuenta(usuario.uid);
    }

    const base = { nivel: estado.nivel, peso, motivoSinPeso, cupo, pausaRestanteMs };
    const datosVoto = voto.data();

    if (voto.exists()) {
      return {
        ...base,
        bloqueo: 'confirmado',
        pesoAportado: typeof datosVoto?.['peso'] === 'number' ? datosVoto['peso'] : null,
      };
    }

    const bloqueo: MotivoBloqueo | null =
      reporte.uid === usuario.uid
        ? 'propio'
        : perfil.data()?.['role'] === 'operador'
          ? 'operador'
          : validacionCompleta(reporte.validacion).veredicto !== null
            ? 'revisado'
            : estado.suspendido
              ? 'suspendido'
              : cupo.restantes <= 0
                ? 'limite'
                : pausaRestanteMs > 0
                  ? 'pausa'
                  : null;

    return { ...base, bloqueo, pesoAportado: null };
  }

  /**
   * Confirma un reporte con el peso del nivel del usuario. En una sola
   * transacción: el voto, la suma en el reporte y el contador del día.
   */
  async confirmar(reportId: string): Promise<ResultadoConfirmacion> {
    const usuario = this.exigirUsuario();
    const [perfil, correoVerificado] = await Promise.all([
      getDoc(doc(this.firestore, 'users', usuario.uid)).catch((error: unknown) => {
        throw this.traducir(error);
      }),
      this.correoVerificadoEnToken(usuario),
    ]);

    if (perfil.data()?.['role'] === 'operador') {
      throw this.error('operador');
    }

    const cuentaCreadaMs = this.milisegundos(perfil.data()?.['createdAt']);

    /**
     * Normalmente es un solo intento. Cerca de la medianoche o de las 24 h de
     * la cuenta se agregan los resultados que daría un reloj adelantado o
     * atrasado, y se prueban solo si las reglas rechazan el primero.
     */
    const intentos = this.intentosSegunReloj(cuentaCreadaMs);
    let ultimoError: unknown = null;

    for (const intento of intentos) {
      try {
        return await this.transaccionDeConfirmacion(
          usuario.uid,
          reportId,
          intento.dia,
          intento.antigua,
          correoVerificado,
        );
      } catch (error) {
        ultimoError = error;
        const rechazada = error instanceof FirebaseError && error.code === 'permission-denied';
        if (!rechazada) break;
      }
    }

    throw this.traducir(ultimoError);
  }

  /**
   * La primera vez que se ve un nivel no se anuncia (cuentas existentes); si
   * después es mayor que el último visto, devuelve true una sola vez (A2.4).
   */
  subioDeNivel(nivel: number): boolean {
    const uid = this.authService.user?.uid;
    if (!uid) return false;

    const clave = `ca.confianza.nivelVisto.${uid}`;
    const visto = this.leerLocal(clave);
    this.escribirLocal(clave, String(nivel));
    return visto !== null && nivel > Number(visto);
  }

  /** La explicación de A11 se ofrece una sola vez, tras la primera confirmación. */
  explicacionPendiente(): boolean {
    const clave = 'ca.confianza.explicacionVista';
    const vista = this.leerLocal(clave) !== null;
    this.escribirLocal(clave, '1');
    return !vista;
  }

  // ---------------------------------------------------------------------

  private async transaccionDeConfirmacion(
    uid: string,
    reportId: string,
    dia: number,
    cuentaAntigua: boolean,
    correoVerificado: boolean,
  ): Promise<ResultadoConfirmacion> {
    const refReporte = doc(this.firestore, 'reports', reportId);
    const refVoto = this.refVoto(reportId, uid);
    const refConfianza = this.refConfianza(uid);
    const refLimite = this.refLimite(uid, dia);

    return runTransaction(this.firestore, async (tx) => {
      const [reporte, voto, confianza, limite] = await Promise.all([
        tx.get(refReporte),
        tx.get(refVoto),
        tx.get(refConfianza),
        tx.get(refLimite),
      ]);

      if (!reporte.exists()) throw this.error('no_existe');
      if (reporte.data()['uid'] === uid) throw this.error('propio');
      if (voto.exists()) throw this.error('confirmado');

      const datosReporte = reporte.data() as Partial<Report>;
      if (validacionCompleta(datosReporte.validacion).veredicto !== null) {
        throw this.error('revisado');
      }

      const estado = this.leerConfianza(confianza.data());
      if (estado.suspendido) throw this.error('suspendido');

      const cupo = this.cupo(limite.data(), estado.nivel, dia);
      if (cupo.restantes <= 0) throw this.error('limite', cupo);

      const pausa = this.pausaRestante(cupo.ultimaMs, Date.now());
      if (pausa > 0) throw this.error('pausa', cupo, pausa);

      // Mismo cálculo que la regla, con la antigüedad del intento en curso.
      const { peso, motivoSinPeso } = pesoDeVoto({
        nivel: estado.nivel,
        correoVerificado,
        cuentaAntigua,
      });
      const suma = sumarConfirmacion(datosReporte.validacion, peso);

      // 1 · El voto, con nivel y peso congelados.
      tx.set(refVoto, {
        uid,
        reportId,
        createdAt: serverTimestamp(),
        nivel: estado.nivel,
        peso,
      });

      // 2 · La suma en el reporte. Con peso 0 no cambia nada y no se escribe.
      if (peso > 0) {
        tx.update(refReporte, {
          'validacion.puntos': suma.puntos,
          'validacion.votos': suma.votos,
          'validacion.validado': suma.validado,
          ...(suma.recienValidado ? { 'validacion.validadoAt': serverTimestamp() } : {}),
        });
      }

      // 3 · El contador del día: nace en 1 o sube de a uno.
      if (limite.exists()) {
        tx.update(refLimite, { confirmaciones: cupo.usadas + 1, ultimaAt: serverTimestamp() });
      } else {
        tx.set(refLimite, { confirmaciones: 1, ultimaAt: serverTimestamp() });
      }

      return {
        peso,
        motivoSinPeso,
        validacion: {
          ...datosReporte.validacion,
          puntos: suma.puntos,
          votos: suma.votos,
          validado: suma.validado,
        },
        recienValidado: suma.recienValidado,
        restantesHoy: cupo.restantes - 1,
      };
    });
  }

  /** Día y antigüedad que darían el reloj del teléfono y uno corrido ± 2 min. */
  private intentosSegunReloj(cuentaCreadaMs: number | null): { dia: number; antigua: boolean }[] {
    const ahora = Date.now();
    const vistos = new Set<string>();
    const intentos: { dia: number; antigua: boolean }[] = [];

    for (const ajuste of [0, MARGEN_RELOJ_MS, -MARGEN_RELOJ_MS]) {
      const momento = ahora + ajuste;
      const dia = numeroDeDia(momento);
      const antigua = cuentaEsAntigua(cuentaCreadaMs, momento);
      const clave = `${dia}:${antigua}`;

      if (!vistos.has(clave)) {
        vistos.add(clave);
        intentos.push({ dia, antigua });
      }
    }

    return intentos;
  }

  /**
   * Las reglas miran `email_verified` del token de sesión, no el del perfil.
   * Si Auth ya sabe que se verificó pero el token es anterior, se renueva.
   */
  private async correoVerificadoEnToken(usuario: User): Promise<boolean> {
    try {
      let token = await getIdTokenResult(usuario);

      if (token.claims['email_verified'] !== true && usuario.emailVerified) {
        token = await getIdTokenResult(usuario, true);
      }

      return token.claims['email_verified'] === true;
    } catch {
      return usuario.emailVerified;
    }
  }

  /**
   * Las reglas permiten completar una sola vez la fecha de creación de un
   * perfil antiguo que no la tiene. Sin ella el voto pesa 0 para siempre; con
   * ella, empieza a pesar 24 horas después. Lo ideal es que el script de
   * migración (A9) copie la fecha real desde Firebase Auth.
   */
  private async completarFechaDeCuenta(uid: string): Promise<void> {
    try {
      await updateDoc(doc(this.firestore, 'users', uid), {
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Un perfil con campos fuera de la lista blanca no se puede completar
      // desde la app; queda para el script de migración.
    }
  }

  private leerConfianza(datos: Record<string, unknown> | undefined): Omit<EstadoConfianza, 'desactualizado'> {
    if (!datos) return { ...SIN_CONFIANZA };

    const numero = (valor: unknown) => (typeof valor === 'number' ? valor : 0);
    return {
      puntos: numero(datos['puntosConfianza']),
      nivel: numero(datos['trustLevel']),
      validados: numero(datos['validatedReports']),
      falsos: numero(datos['reportesFalsos']),
      suspendido: datos['confirmacionesSuspendidas'] === true,
    };
  }

  private cupo(datos: Record<string, unknown> | undefined, nivel: number, dia: number): CupoDelDia {
    const usadas = typeof datos?.['confirmaciones'] === 'number' ? datos['confirmaciones'] : 0;
    const limite = limiteDiario(nivel);

    return {
      usadas,
      limite,
      restantes: Math.max(0, limite - usadas),
      ultimaMs: this.milisegundos(datos?.['ultimaAt']),
      reinicioMs: inicioDeDia(dia + 1),
    };
  }

  /** Con 1 s de margen, porque el reloj del teléfono puede ir adelantado. */
  private pausaRestante(ultimaMs: number | null, ahora: number): number {
    if (ultimaMs === null) return 0;
    return Math.max(0, ultimaMs + PARAMETROS_CONFIANZA.pausaEntreConfirmacionesMs + 1000 - ahora);
  }

  private milisegundos(valor: unknown): number | null {
    return valor instanceof Timestamp ? valor.toMillis() : null;
  }

  private refConfianza(uid: string): DocumentReference {
    return doc(this.firestore, 'users', uid, 'confianza', 'actual');
  }

  private refLimite(uid: string, dia: number): DocumentReference {
    return doc(this.firestore, 'users', uid, 'limites', String(dia));
  }

  private refVoto(reportId: string, uid: string): DocumentReference {
    return doc(this.firestore, 'reports', reportId, 'confirmations', uid);
  }

  private exigirUsuario(): User {
    const usuario = this.authService.user;
    if (!usuario) throw this.error('no_autenticado');
    return usuario;
  }

  /** A4 · Un mensaje claro por motivo, sin códigos técnicos. */
  private error(code: CodigoErrorConfianza, cupo?: CupoDelDia, pausaMs = 0): ConfianzaError {
    const hora = cupo
      ? new Date(cupo.reinicioMs).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
      : '';

    const mensajes: Record<CodigoErrorConfianza, string> = {
      confirmado: 'Ya confirmaste este reporte.',
      propio: 'Este es tu reporte: lo confirman otros vecinos.',
      operador: 'Las cuentas de operador gestionan reportes; no los confirman.',
      revisado: 'Un operador ya revisó este reporte, así que no hace falta confirmarlo.',
      suspendido:
        'Tus confirmaciones están suspendidas por un administrador. Si crees que es un error, escríbenos en Quejas y sugerencias.',
      limite: `Llegaste a tus ${cupo?.limite ?? ''} confirmaciones de hoy. Se reinician a las ${hora}.`,
      pausa: `Espera ${Math.ceil(pausaMs / 1000)} segundos antes de confirmar otro reporte.`,
      no_autenticado: 'Necesitas iniciar sesión para confirmar un reporte.',
      no_existe: 'Este reporte ya no existe.',
      red: 'Sin conexión con el servidor. Tu confirmación no se registró.',
      rechazada:
        'No pudimos registrar tu confirmación. Revisa que la fecha y hora de tu teléfono estén en automático y vuelve a intentarlo.',
      desconocido: 'No pudimos registrar tu confirmación. Intenta nuevamente.',
    };

    return new ConfianzaError(mensajes[code], code);
  }

  private traducir(error: unknown): ConfianzaError {
    if (error instanceof ConfianzaError) return error;

    if (error instanceof FirebaseError) {
      if (error.code === 'permission-denied') return this.error('rechazada');
      if (error.code === 'unavailable' || error.code === 'failed-precondition') {
        return this.error('red');
      }
    }

    return this.error('desconocido');
  }

  private guardarCopia(uid: string, estado: EstadoConfianza): void {
    this.escribirLocal(`ca.confianza.copia.${uid}`, JSON.stringify(estado));
  }

  private leerCopia(uid: string): Omit<EstadoConfianza, 'desactualizado'> | null {
    const texto = this.leerLocal(`ca.confianza.copia.${uid}`);
    if (!texto) return null;

    try {
      return this.leerConfianza(this.aFirestore(JSON.parse(texto)));
    } catch {
      return null;
    }
  }

  /** La copia local guarda los nombres de la app; se pasan a los de Firestore. */
  private aFirestore(copia: EstadoConfianza): Record<string, unknown> {
    return {
      puntosConfianza: copia.puntos,
      trustLevel: copia.nivel,
      validatedReports: copia.validados,
      reportesFalsos: copia.falsos,
      confirmacionesSuspendidas: copia.suspendido,
    };
  }

  /** localStorage puede no existir o fallar (modo privado): nunca rompe la app. */
  private leerLocal(clave: string): string | null {
    try {
      return localStorage.getItem(clave);
    } catch {
      return null;
    }
  }

  private escribirLocal(clave: string, valor: string): void {
    try {
      localStorage.setItem(clave, valor);
    } catch {
      // Sin almacenamiento local solo se pierde la copia sin conexión.
    }
  }
}
