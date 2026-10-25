/**
 * Servicios simulados de la maqueta: hacen lo mismo que los de la app, pero
 * contra la base en memoria (base.ts) en vez de Firebase.
 *
 * Solo se simula lo que habla con Firebase o con la nube. Las pantallas, los
 * componentes, los guards, el sistema de módulos, la comuna por límites
 * oficiales, la ubicación (del navegador), las preferencias, el tema y el
 * borrador sin conexión son los de la app.
 *
 * Cada simulación declara al final qué métodos imita (`Imita<…>`): si un
 * servicio de la app cambia su firma, la maqueta deja de compilar.
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { FirebaseError } from 'firebase/app';
import type { User } from 'firebase/auth';
import { DocumentReference, Timestamp, Transaction } from 'firebase/firestore';
import { BehaviorSubject, Observable, map } from 'rxjs';
import {
  AUTOR_CUENTA_ELIMINADA,
  VERSION_TERMINOS,
  permisoDeGestion,
  transicionesDisponibles,
  validacionCompleta,
} from '@ciudad-alerta/comun';

import { AuthFailure, AuthService } from '../../src/app/services/auth.service';
import { ReportQueryService, FiltrosBandejaReportes, FiltrosMapa, PaginaReportes, RegionConsultable, ReportesDeRegion } from '../../src/app/services/report-query.service';
import { RoutingService } from '../../src/app/services/routing.service';
import { TerminosService } from '../../src/app/services/terminos.service';
import { NearbyReport, Report, ReportStatus, StatusChange } from '../../src/app/models/report.model';
import { UserProfile } from '../../src/app/models/user-profile.model';
import { ReportError, ReportService, NuevoReporte } from '../../src/app/modulos/reportes/datos/report.service';
import { ConfirmationError, ConfirmationService } from '../../src/app/modulos/reportes/datos/confirmation.service';
import { ContactoOrganismoService, contactoDeOperador } from '../../src/app/modulos/reportes/datos/contacto-organismo.service';
import { CameraService, CapturedPhoto } from '../../src/app/modulos/reportes/datos/camera.service';
import { EstadoServicioPrivacidad, PrivacidadError, PrivacidadService } from '../../src/app/modulos/reportes/datos/privacidad.service';
import { MiReporteService } from '../../src/app/modulos/reportes/datos/mi-reporte.service';
import { BorradorService } from '../../src/app/modulos/reportes/datos/borrador.service';
import { DuplicateDetectionService } from '../../src/app/modulos/reportes/datos/duplicate-detection.service';
import { AvisosService } from '../../src/app/modulos/avisos/datos/avisos.service';
import { Aviso } from '../../src/app/modulos/avisos/modelo/aviso.model';
import { ConfianzaService, CupoDelDia, Disponibilidad, EstadoConfianza, ResultadoConfirmacion, motivoDeBloqueo } from '../../src/app/modulos/confianza/datos/confianza.service';
import { VeredictoService, PermisoVeredicto } from '../../src/app/modulos/confianza/datos/veredicto.service';
import { CambioEstadoError, CambioEstadoService } from '../../src/app/modulos/gestion-reportes/datos/cambio-estado.service';
import { ResumenGestion, ResumenGestionService } from '../../src/app/modulos/gestion-reportes/datos/resumen-gestion.service';
import { SupportService } from '../../src/app/modulos/soporte/datos/support.service';
import { EstadoTicket, RolMensaje, SupportMessage, SupportTicket, TipoTicket } from '../../src/app/modulos/soporte/modelo/support.model';
import { PerfilService } from '../../src/app/modulos/perfil/datos/perfil.service';
import { EliminarCuentaService } from '../../src/app/modulos/perfil/datos/eliminar-cuenta.service';
import { OrganismosService } from '../../src/app/modulos/municipalidades/datos/organismos.service';
import { OrganismoDoc } from '../../src/app/models/organismo.model';
import { Base, Cuenta, ReportePlano, base, cambiar, nuevoId } from './base';
import { escenario } from './escenario';

/** Comprueba en compilación que la simulación tiene los métodos con la firma de la app. */
type Imita<Simulado extends Real, Real> = Simulado;

const ts = (ms: number | undefined) => (ms === undefined ? undefined : Timestamp.fromMillis(ms));
const espera = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));
/** Lo que tarda «la red»: suficiente para ver estados de carga, poco para las pruebas. */
const RED_MS = 120;

function aReporte(r: ReportePlano): Report {
  return {
    id: r.id,
    uid: r.uid,
    descripcion: r.descripcion,
    categoria: r.categoria as Report['categoria'],
    ubicacion: r.ubicacion,
    comuna: r.comuna ?? undefined,
    region: r.region ?? undefined,
    autorNombre: r.autorNombre,
    foto: r.foto ? ({ tipo: 'firestore', ruta: `reportPhotos/${r.id}` } as unknown as Report['foto']) : null,
    estado: r.estado as ReportStatus,
    confirmaciones: 0,
    organismo: r.organismo as Report['organismo'],
    operadorId: r.operadorId,
    geohash: '',
    embedding: null,
    createdAt: Timestamp.fromMillis(r.creadoMs),
    updatedAt: Timestamp.fromMillis(r.actualizadoMs),
    ...(r.editadoMs ? { editadoAt: Timestamp.fromMillis(r.editadoMs) } : {}),
    ...(r.retiradoPorAutor ? { retiradoPorAutor: true } : {}),
    ...(r.validacion ? { validacion: r.validacion as Report['validacion'] } : {}),
  } as Report;
}

function aPerfil(c: Cuenta): UserProfile {
  return {
    uid: c.uid,
    email: c.email,
    displayName: c.displayName,
    role: c.role,
    trustLevel: 0,
    validatedReports: 0,
    emailVerified: c.emailVerified,
    operadorId: c.operadorId ?? null,
    ...(c.terminosVersion ? { terminosVersion: c.terminosVersion === 'vigente' ? VERSION_TERMINOS : c.terminosVersion } : {}),
    createdAt: Timestamp.fromMillis(c.creadaMs),
    updatedAt: Timestamp.fromMillis(c.creadaMs),
  };
}

/** Error de «sin red» como el de Firebase, cuando el navegador está sin conexión. */
function exigirRed(): void {
  if (!navigator.onLine) throw new FirebaseError('unavailable', 'Failed to get document because the client is offline.');
}

// ─── Sesión ──────────────────────────────────────────────────────────────────

@Injectable()
export class AuthFalso {
  private readonly estado$ = new BehaviorSubject<User | null>(this.usuarioDe(base().sesion));

  readonly authState$ = this.estado$.asObservable();
  readonly isAuthenticated$ = this.authState$.pipe(map((u) => !!u));
  readonly currentUser = signal<User | null>(this.estado$.value);

  get user(): User | null {
    return this.estado$.value;
  }

  async login(email: string, password: string): Promise<never> {
    await espera(RED_MS);
    const cuenta = Object.values(base().cuentas).find((c) => c.email === email.trim().toLowerCase() && !c.eliminada);
    if (!cuenta || cuenta.password !== password) {
      throw new AuthFailure('Correo o contraseña incorrectos.', 'auth/invalid-credential');
    }
    this.entrar(cuenta.uid);
    return undefined as never;
  }

  async register(email: string, password: string, displayName?: string): Promise<never> {
    await espera(RED_MS);
    const correo = email.trim().toLowerCase();
    if (Object.values(base().cuentas).some((c) => c.email === correo && !c.eliminada)) {
      throw new AuthFailure('Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.', 'auth/email-already-in-use');
    }
    const uid = nuevoId('cuenta');
    cambiar((b) => {
      b.cuentas[uid] = {
        uid,
        email: correo,
        password,
        displayName: (displayName ?? '').trim() || correo.split('@')[0],
        role: 'ciudadano',
        emailVerified: false,
        creadaMs: Date.now(),
        terminosVersion: 'vigente',
      };
    });
    this.entrar(uid);
    return undefined as never;
  }

  async logout(): Promise<void> {
    cambiar((b) => (b.sesion = null));
    this.publicar(null);
  }

  async resetPassword(email: string): Promise<void> {
    await espera(RED_MS);
    void email;
  }

  async getUserProfile(uid: string): Promise<UserProfile | null> {
    await espera(RED_MS / 2);
    exigirRed();
    const cuenta = base().cuentas[uid];
    return cuenta && !cuenta.eliminada ? aPerfil(cuenta) : null;
  }

  async asegurarPerfil(): Promise<void> {
    // La base ya tiene todos los perfiles.
  }

  async enviarVerificacionCorreo(): Promise<void> {
    await espera(RED_MS);
  }

  async comprobarVerificacion(): Promise<boolean> {
    const uid = this.user?.uid;
    if (!uid) return false;
    cambiar((b) => (b.cuentas[uid].emailVerified = true));
    this.publicar(this.usuarioDe(uid));
    return true;
  }

  /** Para EliminarCuentaService: la cuenta se fue. */
  cerrarPorEliminacion(): void {
    cambiar((b) => (b.sesion = null));
    this.publicar(null);
  }

  private entrar(uid: string): void {
    cambiar((b) => (b.sesion = uid));
    this.publicar(this.usuarioDe(uid));
  }

  private publicar(usuario: User | null): void {
    this.currentUser.set(usuario);
    this.estado$.next(usuario);
  }

  private usuarioDe(uid: string | null): User | null {
    const cuenta = uid ? base().cuentas[uid] : null;
    if (!cuenta || cuenta.eliminada) return null;
    return {
      uid: cuenta.uid,
      email: cuenta.email,
      emailVerified: cuenta.emailVerified,
      displayName: cuenta.displayName,
      metadata: { creationTime: new Date(cuenta.creadaMs).toUTCString() },
      providerData: [],
      getIdToken: async () => 'token-e2e',
      getIdTokenResult: async () => ({ claims: { email_verified: cuenta.emailVerified } }),
      reload: async () => undefined,
    } as unknown as User;
  }
}
type _Auth = Imita<AuthFalso, Pick<AuthService, 'login' | 'register' | 'logout' | 'resetPassword' | 'getUserProfile' | 'asegurarPerfil' | 'enviarVerificacionCorreo' | 'comprobarVerificacion' | 'user' | 'authState$' | 'isAuthenticated$'>>;

@Injectable()
export class TerminosFalso extends TerminosService {
  private readonly auth = inject(AuthService);

  override async aceptar(): Promise<void> {
    await espera(RED_MS);
    const uid = this.auth.user?.uid;
    if (!uid) throw new Error('Sin sesión');
    cambiar((b) => (b.cuentas[uid].terminosVersion = 'vigente'));
  }
}

// ─── Reportes: lectura ───────────────────────────────────────────────────────

@Injectable()
export class ConsultasFalsas {
  private readonly auth = inject(AuthService);

  private todos(): Report[] {
    return Object.values(base().reportes)
      .sort((a, b) => b.creadoMs - a.creadoMs)
      .map(aReporte);
  }

  async findNearby(centro: { lat: number; lng: number }, radioMetros: number, filtros: FiltrosMapa = { categoria: 'todas', estado: 'todos' }): Promise<NearbyReport[]> {
    await espera(RED_MS);
    exigirRed();
    return this.todos()
      .filter((r) => (filtros.categoria === 'todas' || r.categoria === filtros.categoria) && (filtros.estado === 'todos' || r.estado === filtros.estado))
      .map((report) => ({ report, distanciaMetros: Math.round(distancia(centro, report.ubicacion)) }))
      .filter((r) => r.distanciaMetros <= radioMetros)
      .sort((a, b) => a.distanciaMetros - b.distanciaMetros);
  }

  async porRegion(region: RegionConsultable, filtros: FiltrosMapa = { categoria: 'todas', estado: 'todos' }): Promise<ReportesDeRegion> {
    await espera(RED_MS);
    exigirRed();
    const reportes = this.todos().filter(
      (r) =>
        (r.region === region.nombre || (!r.region && region.comunas.includes(r.comuna ?? ''))) &&
        (filtros.categoria === 'todas' || r.categoria === filtros.categoria) &&
        (filtros.estado === 'todos' || r.estado === filtros.estado),
    );
    return { reportes, hayMas: false };
  }

  async todosLosReportes(filtros: FiltrosBandejaReportes = { categoria: 'todas', estado: 'todos', comuna: 'todas' }): Promise<PaginaReportes> {
    await espera(RED_MS);
    exigirRed();
    const reportes = this.todos().filter(
      (r) =>
        (filtros.comuna === 'todas' || r.comuna === filtros.comuna) &&
        (filtros.categoria === 'todas' || r.categoria === filtros.categoria) &&
        (filtros.estado === 'todos' || r.estado === filtros.estado),
    );
    return { reportes, cursor: null };
  }

  async reportesDeOperador(operadorId: string): Promise<Report[]> {
    await espera(RED_MS);
    exigirRed();
    return this.todos().filter((r) => r.operadorId === operadorId);
  }

  async getById(reportId: string): Promise<Report | null> {
    await espera(RED_MS);
    exigirRed();
    const r = base().reportes[reportId];
    return r ? aReporte(r) : null;
  }

  async getMyReports(): Promise<PaginaReportes> {
    await espera(RED_MS);
    exigirRed();
    const uid = this.auth.user?.uid;
    return { reportes: this.todos().filter((r) => r.uid === uid), cursor: null };
  }

  formatearFecha(valor: Report['createdAt']): string {
    return valor instanceof Timestamp
      ? valor.toDate().toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : 'Hace unos instantes';
  }
}
type _Consultas = Imita<ConsultasFalsas, Pick<ReportQueryService, 'getById' | 'getMyReports' | 'formatearFecha'>>;

function distancia(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

@Injectable()
export class RuteoFalso {
  async getStatusHistory(reportId: string): Promise<StatusChange[] | null> {
    await espera(RED_MS);
    if (!navigator.onLine) return null;
    return (base().historial[reportId] ?? []).map(
      (c) =>
        ({
          reportId,
          desde: c.desde,
          hacia: c.hacia,
          autorUid: c.autorUid,
          autorNombre: c.autorNombre,
          ...(c.autorRol && c.autorRol !== 'ciudadano' ? { autorRol: c.autorRol } : {}),
          comentario: c.comentario,
          createdAt: Timestamp.fromMillis(c.creadoMs),
        }) as StatusChange,
    );
  }

  async resolveOrganismo(): Promise<Report['organismo']> {
    return { id: 'muni_13119', nombre: 'Municipalidad de Maipú', tipo: 'municipio', comuna: 'Maipú' } as Report['organismo'];
  }

  async resolveOperador(): Promise<string | null> {
    return 'op_maipu';
  }
}
type _Ruteo = Imita<RuteoFalso, Pick<RoutingService, 'getStatusHistory'>>;

// ─── Reportes: escritura ─────────────────────────────────────────────────────

@Injectable()
export class ReportesFalsos {
  private readonly auth = inject(AuthService);

  async createReport(datos: NuevoReporte): Promise<string> {
    const usuario = this.auth.user;
    if (!usuario) throw new ReportError('Tu sesión expiró. Vuelve a iniciar sesión para reportar.');
    if (datos.foto && datos.foto.privacidad?.aplicada !== true) {
      throw new ReportError('La foto no pasó por la protección de privacidad. Vuelve a adjuntarla.');
    }
    await espera(RED_MS * 2);
    if (!navigator.onLine) throw new ReportError('Sin conexión con el servidor. Tu reporte no se guardó, inténtalo nuevamente.', 'red');

    const id = datos.id ?? nuevoId('reporte');
    const cuenta = base().cuentas[usuario.uid];
    cambiar((b) => {
      b.reportes[id] = {
        id,
        uid: usuario.uid,
        descripcion: datos.descripcion.trim(),
        categoria: datos.categoria,
        ubicacion: { lat: datos.ubicacion.lat, lng: datos.ubicacion.lng, accuracy: datos.ubicacion.accuracy },
        comuna: datos.comuna?.comuna ?? null,
        region: datos.comuna?.region ?? null,
        autorNombre: cuenta.displayName,
        foto: datos.foto ? { dataUrl: datos.foto.dataUrl } : null,
        estado: 'reportado',
        organismo: datos.comuna?.organismoId
          ? { id: datos.comuna.organismoId, nombre: `Municipalidad de ${datos.comuna.comuna}`, tipo: 'municipio', comuna: datos.comuna.comuna }
          : { id: 'muni_oirs', nombre: 'OIRS Municipal', tipo: 'municipio' },
        operadorId: datos.comuna?.organismoId === 'muni_13119' ? 'op_maipu' : null,
        creadoMs: Date.now(),
        actualizadoMs: Date.now(),
      };
    });
    return id;
  }

  async resolvePhotoUrl(reporte: Report): Promise<string> {
    await espera(RED_MS);
    const foto = base().reportes[reporte.id]?.foto;
    if (!foto) throw new ReportError('El reporte no tiene fotografía.');
    return foto.dataUrl;
  }
}
type _Reportes = Imita<ReportesFalsos, Pick<ReportService, 'createReport' | 'resolvePhotoUrl'>>;

/** El servicio real, con la transacción contra la base en memoria. */
@Injectable()
export class MiReporteE2E extends MiReporteService {
  protected override async correr(fn: (transaccion: Transaction) => Promise<void>): Promise<void> {
    await espera(RED_MS);
    exigirRed();
    const escrituras: (() => void)[] = [];
    const transaccion = {
      get: async (ref: DocumentReference) => {
        const r = base().reportes[ref.id];
        return { exists: () => !!r, data: () => (r ? { estado: r.estado } : undefined) };
      },
      set: (ref: DocumentReference, datos: Record<string, unknown>) => {
        const reportId = ref.path.split('/')[1];
        escrituras.push(() =>
          cambiar((b) => {
            (b.historial[reportId] ??= []).push({
              id: ref.id,
              desde: String(datos['desde']),
              hacia: String(datos['hacia']),
              autorUid: String(datos['autorUid']),
              autorNombre: String(datos['autorNombre']),
              comentario: String(datos['comentario'] ?? ''),
              creadoMs: Date.now(),
            });
          }),
        );
        return transaccion;
      },
      update: (ref: DocumentReference, datos: Record<string, unknown>) => {
        escrituras.push(() =>
          cambiar((b) => {
            const r = b.reportes[ref.id];
            if (typeof datos['descripcion'] === 'string') r.descripcion = datos['descripcion'];
            if (datos['editadoAt']) r.editadoMs = Date.now();
            if (typeof datos['estado'] === 'string') r.estado = datos['estado'];
            if (datos['retiradoPorAutor'] === true) r.retiradoPorAutor = true;
            r.actualizadoMs = Date.now();
          }),
        );
        return transaccion;
      },
    } as unknown as Transaction;
    await fn(transaccion);
    escrituras.forEach((escribir) => escribir());
  }
}

/** El borrador real; solo la comprobación de «¿ya llegó?» va a la base en memoria. */
@Injectable()
export class BorradorE2E extends BorradorService {
  protected override async yaExiste(id: string): Promise<boolean> {
    await espera(RED_MS);
    exigirRed();
    return !!base().reportes[id];
  }
}

/** El detector real; solo la consulta por cercanía va a la base en memoria. */
export function deteccionE2E(): DuplicateDetectionService {
  const servicio = new DuplicateDetectionService();
  (servicio as unknown as { consultarPorGeohash: (c: [number, number], cat: string) => Promise<Report[]> }).consultarPorGeohash =
    async (_centro, categoria) => {
      await espera(RED_MS);
      exigirRed();
      return Object.values(base().reportes).filter((r) => r.categoria === categoria).map(aReporte);
    };
  return servicio;
}

@Injectable()
export class ConfirmacionesFalsas {
  private readonly auth = inject(AuthService);

  async confirm(reportId: string): Promise<void> {
    const uid = this.auth.user?.uid;
    if (!uid) throw new ConfirmationError('Necesitas iniciar sesión para confirmar un reporte.', 'no_autenticado');
    await espera(RED_MS);
    cambiar((b) => (b.confirmaciones[reportId] ??= []).push(uid));
  }

  async hasConfirmed(reportId: string): Promise<boolean | null> {
    await espera(RED_MS);
    return (base().confirmaciones[reportId] ?? []).includes(this.auth.user?.uid ?? '');
  }

  async countConfirmations(reportId: string): Promise<number | null> {
    await espera(RED_MS);
    return (base().confirmaciones[reportId] ?? []).length;
  }

  async countMany(ids: string[]): Promise<Map<string, number>> {
    return new Map(ids.map((id) => [id, (base().confirmaciones[id] ?? []).length]));
  }
}
type _Confirmaciones = Imita<ConfirmacionesFalsas, Pick<ConfirmationService, 'confirm' | 'hasConfirmed' | 'countConfirmations' | 'countMany'>>;

@Injectable()
export class ContactoFalso {
  async deOperador(operadorId: string) {
    await espera(RED_MS);
    exigirRed();
    const op = base().operadores[operadorId];
    return op ? contactoDeOperador({ nombre: op.nombre, telefonoContacto: op.telefono, correoContacto: op.correo, direccionContacto: op.direccion }) : null;
  }
}
type _Contacto = Imita<ContactoFalso, Pick<ContactoOrganismoService, 'deOperador'>>;

// ─── Fotos ───────────────────────────────────────────────────────────────────

/** Una foto de 640×480 dibujada en el navegador: cielo, calle y un «bache». */
async function fotoDePrueba(): Promise<CapturedPhoto> {
  const lienzo = document.createElement('canvas');
  lienzo.width = 640;
  lienzo.height = 480;
  const g = lienzo.getContext('2d')!;
  g.fillStyle = '#9ec5e8';
  g.fillRect(0, 0, 640, 240);
  g.fillStyle = '#555';
  g.fillRect(0, 240, 640, 240);
  g.fillStyle = '#222';
  g.beginPath();
  g.ellipse(320, 360, 120, 40, 0, 0, Math.PI * 2);
  g.fill();
  const blob = await new Promise<Blob>((resolver) => lienzo.toBlob((b) => resolver(b!), 'image/jpeg', 0.7));
  return { dataUrl: lienzo.toDataURL('image/jpeg', 0.7), blob, mimeType: 'image/jpeg', sizeBytes: blob.size, width: 640, height: 480 };
}

@Injectable()
export class CamaraFalsa {
  takePhoto(): Promise<CapturedPhoto> {
    return fotoDePrueba();
  }

  pickFromGallery(): Promise<CapturedPhoto> {
    return fotoDePrueba();
  }
}
type _Camara = Imita<CamaraFalsa, Pick<CameraService, 'takePhoto' | 'pickFromGallery'>>;

@Injectable()
export class PrivacidadFalsa {
  readonly estado = signal<'inactivo' | 'enviando' | 'despertando'>('inactivo');
  readonly ultimoErrorTecnico = signal<string | null>(null);

  despertar(): void {
    // El servicio simulado nunca duerme.
  }

  cancelar(): void {
    this.estado.set('inactivo');
  }

  async consultarEstado(): Promise<EstadoServicioPrivacidad> {
    await espera(RED_MS);
    return navigator.onLine
      ? { responde: true, listo: true, similitud: true, backend: 'maqueta', version: 'e2e', ms: RED_MS, error: null }
      : { responde: false, listo: false, similitud: false, backend: null, version: null, ms: 0, error: 'TypeError: Failed to fetch' };
  }

  async anonimizar(foto: CapturedPhoto): Promise<CapturedPhoto> {
    this.estado.set('enviando');
    try {
      await espera(RED_MS * 2);
      if (!navigator.onLine || escenario().privacidadCaida) {
        this.ultimoErrorTecnico.set('TypeError: Failed to fetch');
        throw new PrivacidadError('No pudimos conectar con el servicio de privacidad. Revisa tu conexión.', 'red');
      }
      this.ultimoErrorTecnico.set(null);
      return { ...foto, privacidad: { aplicada: true, rostros: 0, personas: 0, version: 'nube:e2e' }, embedding: [0.6, 0.8] };
    } finally {
      this.estado.set('inactivo');
    }
  }
}
type _Privacidad = Imita<PrivacidadFalsa, Pick<PrivacidadService, 'anonimizar' | 'despertar' | 'cancelar' | 'consultarEstado' | 'estado' | 'ultimoErrorTecnico'>>;

// ─── Avisos, confianza y gestión ─────────────────────────────────────────────

@Injectable()
export class AvisosFalsos {
  private readonly auth = inject(AuthService);
  private readonly version = signal(0);
  private readonly uid = signal<string | null>(null);

  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  readonly avisos = computed<Aviso[]>(() => {
    this.version();
    const uid = this.uid();
    if (!uid) return [];
    const b = base();
    const vistos = new Set(b.vistos[uid] ?? []);
    return Object.values(b.reportes)
      .filter((r) => r.uid === uid)
      .flatMap((r) =>
        (b.historial[r.id] ?? [])
          .filter((c) => c.autorUid !== uid)
          .map(
            (c): Aviso => ({
              tipo: 'estado',
              id: `${r.id}_${c.id}`,
              reportId: r.id,
              reporte: r.descripcion.length <= 60 ? r.descripcion : `${r.descripcion.slice(0, 57)}…`,
              desde: c.desde as ReportStatus,
              hacia: c.hacia as ReportStatus,
              autor: c.autorNombre,
              comentario: c.comentario || null,
              fecha: new Date(c.creadoMs),
              visto: vistos.has(`${r.id}_${c.id}`),
            }),
          ),
      )
      .sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0));
  });

  readonly noVistos = computed(() => this.avisos().filter((a) => !a.visto).length);

  constructor() {
    this.auth.authState$.subscribe((u) => this.uid.set(u?.uid ?? null));
  }

  async marcarVisto(id: string): Promise<void> {
    const uid = this.uid();
    if (!uid) return;
    cambiar((b) => (b.vistos[uid] ??= []).push(id));
    this.version.update((v) => v + 1);
  }

  async marcarTodos(): Promise<void> {
    const uid = this.uid();
    if (!uid) return;
    const ids = this.avisos().map((a) => a.id);
    cambiar((b) => (b.vistos[uid] = ids));
    this.version.update((v) => v + 1);
  }
}
type _Avisos = Imita<AvisosFalsos, Pick<AvisosService, 'avisos' | 'noVistos' | 'cargando' | 'error' | 'marcarVisto' | 'marcarTodos'>>;

@Injectable()
export class ConfianzaFalsa {
  private readonly auth = inject(AuthService);

  async miConfianza(): Promise<EstadoConfianza> {
    await espera(RED_MS);
    return { puntos: 85, nivel: 2, validados: 6, falsos: 0, suspendido: false, desactualizado: false };
  }

  async miCupoDeHoy(nivel: number): Promise<CupoDelDia> {
    void nivel;
    return { usadas: 1, limite: 8, restantes: 7, ultimaMs: null, reinicioMs: Date.now() + 6 * 3_600_000 };
  }

  async disponibilidad(reporte: Report): Promise<Disponibilidad> {
    await espera(RED_MS);
    const uid = this.auth.user?.uid ?? '';
    const cuenta = base().cuentas[uid];
    const cupo = await this.miCupoDeHoy(2);
    const ya = (base().confirmaciones[reporte.id] ?? []).includes(uid);
    const bloqueo = ya
      ? 'confirmado'
      : motivoDeBloqueo({
          propio: reporte.uid === uid,
          operador: cuenta?.role === 'operador',
          estadoReporte: reporte.estado,
          conVeredicto: validacionCompleta(reporte.validacion).veredicto !== null,
          suspendido: false,
          restantesHoy: cupo.restantes,
          pausaRestanteMs: 0,
        });
    return { bloqueo, nivel: 2, peso: 15, motivoSinPeso: null, cupo, pausaRestanteMs: 0, pesoAportado: ya ? 15 : null };
  }

  async confirmar(reportId: string): Promise<ResultadoConfirmacion> {
    await espera(RED_MS);
    const uid = this.auth.user!.uid;
    cambiar((b) => (b.confirmaciones[reportId] ??= []).push(uid));
    const votos = (base().confirmaciones[reportId] ?? []).length;
    return {
      peso: 15,
      motivoSinPeso: null,
      validacion: { puntos: 15 * votos, votos, validado: false },
      recienValidado: false,
      restantesHoy: 6,
    } as ResultadoConfirmacion;
  }

  subioDeNivel(): boolean {
    return false;
  }

  explicacionPendiente(): boolean {
    return false;
  }
}
type _Confianza = Imita<ConfianzaFalsa, Pick<ConfianzaService, 'miConfianza' | 'miCupoDeHoy' | 'disponibilidad' | 'confirmar' | 'subioDeNivel' | 'explicacionPendiente'>>;

@Injectable()
export class GestionFalsa {
  private readonly auth = inject(AuthService);

  transiciones(estado: ReportStatus): readonly ReportStatus[] {
    return transicionesDisponibles(estado) ?? [];
  }

  async permiso(reporte: Report) {
    const cuenta = base().cuentas[this.auth.user?.uid ?? ''];
    return permisoDeGestion(cuenta ? { rol: cuenta.role, operadorId: cuenta.operadorId } : null, reporte);
  }

  async cambiar(reporte: Report, nuevoEstado: ReportStatus, comentario = ''): Promise<Report> {
    await espera(RED_MS);
    exigirRed();
    if (!this.transiciones(reporte.estado).includes(nuevoEstado)) {
      throw new CambioEstadoError(`No es posible pasar de "${reporte.estado}" a "${nuevoEstado}".`, 'transicion_invalida');
    }
    const cuenta = base().cuentas[this.auth.user!.uid];
    cambiar((b: Base) => {
      const r = b.reportes[reporte.id];
      (b.historial[reporte.id] ??= []).push({
        id: nuevoId('h'),
        desde: r.estado,
        hacia: nuevoEstado,
        autorUid: cuenta.uid,
        autorNombre: cuenta.role === 'admin' ? 'Administración Ciudad Alerta' : 'Municipalidad de Maipú',
        autorRol: cuenta.role,
        comentario,
        creadoMs: Date.now(),
      });
      r.estado = nuevoEstado;
      r.actualizadoMs = Date.now();
    });
    return aReporte(base().reportes[reporte.id]);
  }
}
type _Gestion = Imita<GestionFalsa, Pick<CambioEstadoService, 'transiciones' | 'permiso' | 'cambiar'>>;

@Injectable()
export class VeredictoFalso {
  async permiso(): Promise<PermisoVeredicto> {
    return { gestiona: false, puede: false, motivo: null };
  }

  async dar(reporte: Report): Promise<Report> {
    return reporte;
  }
}
type _Veredicto = Imita<VeredictoFalso, Pick<VeredictoService, 'permiso'>>;

@Injectable()
export class ResumenGestionFalso {
  private calcular(filtro: (r: ReportePlano) => boolean): ResumenGestion {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const lista = Object.values(base().reportes).filter(filtro);
    return {
      abiertos: lista.filter((r) => r.estado !== 'resuelto' && r.estado !== 'cerrado').length,
      sinRevisar: lista.filter((r) => r.estado === 'reportado').length,
      nuevosHoy: lista.filter((r) => r.creadoMs >= hoy.getTime()).length,
    };
  }

  async deAdministrador(): Promise<ResumenGestion> {
    await espera(RED_MS);
    return this.calcular(() => true);
  }

  async deOperador(operadorId: string): Promise<ResumenGestion> {
    await espera(RED_MS);
    return this.calcular((r) => r.operadorId === operadorId);
  }
}
type _ResumenGestion = Imita<ResumenGestionFalso, Pick<ResumenGestionService, 'deAdministrador' | 'deOperador'>>;

// ─── Soporte ─────────────────────────────────────────────────────────────────

@Injectable()
export class SoporteFalso {
  private readonly auth = inject(AuthService);
  private readonly cambios = new BehaviorSubject(0);

  private aTicket(t: Base['tickets'][string]): SupportTicket {
    return {
      id: t.id,
      uid: t.uid,
      autorNombre: t.autorNombre,
      autorEmail: t.autorEmail,
      tipo: t.tipo,
      asunto: t.asunto,
      estado: t.estado,
      asignadoA: null,
      lastMessageAt: Timestamp.fromMillis(t.ultimoMs),
      lastMessagePreview: t.adelanto,
      createdAt: Timestamp.fromMillis(t.creadoMs),
      updatedAt: Timestamp.fromMillis(t.ultimoMs),
    };
  }

  async crearTicket(tipo: TipoTicket, asunto: string, mensaje: string): Promise<string> {
    await espera(RED_MS);
    const cuenta = base().cuentas[this.auth.user!.uid];
    const id = nuevoId('ticket');
    cambiar((b) => {
      b.tickets[id] = { id, uid: cuenta.uid, autorNombre: cuenta.displayName, autorEmail: cuenta.email, tipo, asunto: asunto.trim(), estado: 'abierto', creadoMs: Date.now(), ultimoMs: Date.now(), adelanto: mensaje.trim().slice(0, 90) };
      b.mensajes[id] = [{ id: nuevoId('m'), ticketId: id, autorUid: cuenta.uid, autorNombre: cuenta.displayName, autorRol: 'ciudadano', texto: mensaje.trim(), creadoMs: Date.now() }];
    });
    return id;
  }

  async enviarMensaje(ticketId: string, texto: string, rol: RolMensaje): Promise<void> {
    await espera(RED_MS);
    const cuenta = base().cuentas[this.auth.user!.uid];
    cambiar((b) => {
      (b.mensajes[ticketId] ??= []).push({ id: nuevoId('m'), ticketId, autorUid: cuenta.uid, autorNombre: cuenta.displayName, autorRol: rol, texto: texto.trim(), creadoMs: Date.now() });
      b.tickets[ticketId].ultimoMs = Date.now();
      b.tickets[ticketId].adelanto = texto.trim().slice(0, 90);
    });
    this.cambios.next(this.cambios.value + 1);
  }

  escucharMensajes(ticketId: string): Observable<SupportMessage[]> {
    return this.cambios.pipe(
      map(() =>
        (base().mensajes[ticketId] ?? []).map((m) => ({
          id: m.id,
          ticketId,
          autorUid: m.autorUid,
          autorNombre: m.autorNombre,
          autorRol: m.autorRol,
          texto: m.texto,
          createdAt: Timestamp.fromMillis(m.creadoMs),
        })),
      ),
    );
  }

  async misTickets(): Promise<SupportTicket[]> {
    await espera(RED_MS);
    const uid = this.auth.user?.uid;
    return Object.values(base().tickets).filter((t) => t.uid === uid).map((t) => this.aTicket(t));
  }

  async bandeja(filtros: { tipo: TipoTicket | 'todos'; estado: EstadoTicket | 'todos' }): Promise<SupportTicket[]> {
    await espera(RED_MS);
    return Object.values(base().tickets)
      .filter((t) => (filtros.tipo === 'todos' || t.tipo === filtros.tipo) && (filtros.estado === 'todos' || t.estado === filtros.estado))
      .map((t) => this.aTicket(t));
  }

  async obtenerTicket(ticketId: string): Promise<SupportTicket | null> {
    await espera(RED_MS);
    const t = base().tickets[ticketId];
    return t ? this.aTicket(t) : null;
  }

  transicionesDisponibles(estado: EstadoTicket): readonly EstadoTicket[] {
    return ({ abierto: ['en_atencion', 'cerrado'], en_atencion: ['cerrado'], cerrado: ['en_atencion'] } as const)[estado];
  }

  async cambiarEstado(ticket: SupportTicket, nuevoEstado: EstadoTicket): Promise<void> {
    await espera(RED_MS);
    cambiar((b) => (b.tickets[ticket.id].estado = nuevoEstado));
  }

  formatearFecha(valor: SupportTicket['lastMessageAt']): string {
    return valor instanceof Timestamp
      ? valor.toDate().toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : 'Ahora';
  }
}
type _Soporte = Imita<SoporteFalso, Pick<SupportService, 'crearTicket' | 'enviarMensaje' | 'misTickets' | 'obtenerTicket' | 'cambiarEstado' | 'formatearFecha'>>;

// ─── Perfil, cuenta y municipalidades ────────────────────────────────────────

@Injectable()
export class PerfilFalso {
  async organismoDeOperador(operadorId: string): Promise<string | null> {
    await espera(RED_MS);
    return base().operadores[operadorId] ? 'Municipalidad de Maipú' : null;
  }
}
type _Perfil = Imita<PerfilFalso, Pick<PerfilService, 'organismoDeOperador'>>;

/** El servicio real de eliminar la cuenta; cada paso de Firebase, contra la base en memoria. */
@Injectable()
export class EliminarCuentaE2E extends EliminarCuentaService {
  private readonly authFalso = inject(AuthService) as unknown as AuthFalso;

  protected override async reautenticar(usuario: User, correo: string, contrasena: string): Promise<unknown> {
    await espera(RED_MS);
    exigirRed();
    if (base().cuentas[usuario.uid]?.password !== contrasena) {
      throw new FirebaseError('auth/invalid-credential', 'Firebase: Error (auth/invalid-credential).');
    }
    return correo;
  }

  protected override async propios(coleccion: 'reports' | 'supportTickets', uid: string) {
    const lista = coleccion === 'reports' ? Object.values(base().reportes) : Object.values(base().tickets);
    return lista
      .filter((d) => d.uid === uid)
      .map((d) => ({ ref: { id: d.id, path: `${coleccion}/${d.id}` } as DocumentReference, datos: { ...d } as Record<string, unknown> }));
  }

  protected override async actualizarEnLotes(refs: DocumentReference[], cambios: Record<string, string>): Promise<void> {
    cambiar((b) => {
      for (const ref of refs) {
        const [coleccion, id] = ref.path.split('/');
        Object.assign(coleccion === 'reports' ? b.reportes[id] : b.tickets[id], cambios);
      }
    });
  }

  protected override async vaciarPerfil(uid: string): Promise<void> {
    cambiar((b) => Object.assign(b.cuentas[uid], { displayName: AUTOR_CUENTA_ELIMINADA, email: '' }));
  }

  protected override async borrarCuenta(usuario: User): Promise<void> {
    cambiar((b) => (b.cuentas[usuario.uid].eliminada = true));
    this.authFalso.cerrarPorEliminacion();
  }
}

@Injectable()
export class OrganismosFalso {
  async contarMunicipalidades(): Promise<number | null> {
    await espera(RED_MS);
    return 1;
  }

  async listarPorRegion(): Promise<OrganismoDoc[]> {
    await espera(RED_MS);
    return [
      { id: 'muni_13119', nombre: 'Municipalidad de Maipú', tipo: 'municipio', comunasAtendidas: ['13119'], comuna: 'Maipú', codigoRegion: '13', region: 'Región Metropolitana de Santiago', activo: true },
    ];
  }

  async sincronizarMunicipalidades(): Promise<{ escritos: number }> {
    await espera(RED_MS);
    return { escritos: 0 };
  }
}
type _Organismos = Imita<OrganismosFalso, Pick<OrganismosService, 'contarMunicipalidades' | 'listarPorRegion'>>;
