import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToggle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  checkmarkCircleOutline,
  cloudOfflineOutline,
  copyOutline,
  personCircleOutline,
  refreshOutline,
  trashOutline,
} from 'ionicons/icons';

import { CerrarSesionComponent } from '../../../../compartido/sesion';
import { VersionDemoComponent } from '../../../../compartido/version-demo';
import { environment } from '../../../../../environments/environment';
import { VERSION_APP } from '../../../../../environments/version';
import { UserProfile } from '../../../../models/user-profile.model';
import { CONFIGURACION_MODULOS, ModulosService } from '../../../../nucleo/modulos';
import { AuthService } from '../../../../services/auth.service';
import {
  FOTO_AHORRO,
  FOTO_NORMAL,
  Preferencias,
  PreferenciasService,
} from '../../../../services/preferencias.service';
import { Tema, ThemeService } from '../../../../services/theme.service';
import { EstadoServicioPrivacidad, PARAMETROS_PRIVACIDAD, PrivacidadService } from '../../../reportes';

/**
 * Configuración: lo que cada persona ajusta en su teléfono, y para el equipo
 * los datos técnicos de la versión. Todo se guarda en el teléfono
 * (PreferenciasService, ThemeService); nada viaja a Firestore.
 */
@Component({
  selector: 'app-configuracion',
  standalone: true,
  templateUrl: './configuracion.page.html',
  styleUrls: ['./configuracion.page.scss'],
  imports: [
    RouterLink,
    CerrarSesionComponent,
    VersionDemoComponent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonButton,
    IonIcon,
    IonSegment,
    IonSegmentButton,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonToggle,
  ],
})
export class ConfiguracionPage {
  private readonly preferencias = inject(PreferenciasService);
  private readonly temaService = inject(ThemeService);
  private readonly authService = inject(AuthService);
  private readonly modulos = inject(ModulosService);
  private readonly privacidad = inject(PrivacidadService);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);
  private readonly config = inject(CONFIGURACION_MODULOS);

  readonly prefs = this.preferencias.valores;
  readonly tema = this.temaService.tema;
  readonly perfil = signal<UserProfile | null>(null);

  readonly esStaff = computed(() => ['admin', 'operador'].includes(this.perfil()?.role ?? ''));
  readonly esAdmin = computed(() => this.perfil()?.role === 'admin');

  /** Pantallas que se pueden elegir para abrir la app: los botones del inicio de esta cuenta. */
  readonly pantallas = computed(() => {
    const rol = this.perfil()?.role ?? null;
    return this.modulos
      .accesos(rol)
      .filter((acceso) => acceso.ruta !== '/configuracion')
      .map((acceso) => ({ ruta: acceso.ruta, texto: this.modulos.texto(acceso, rol) }));
  });

  /** El servicio que protege las fotos existe solo si el módulo de reportes está activo. */
  readonly conServicioDeFotos = this.modulos.activo('reportes');
  readonly comprobando = signal(false);
  readonly estadoServicio = signal<EstadoServicioPrivacidad | null>(null);

  readonly conPerfil = this.modulos.activo('perfil');
  readonly fotoNormal = FOTO_NORMAL.lado;
  readonly fotoAhorro = FOTO_AHORRO.lado;

  readonly version = VERSION_APP;
  readonly proyecto = environment.firebase.projectId;
  readonly produccion = environment.production;
  readonly urlServicio = PARAMETROS_PRIVACIDAD.url;
  readonly listaModulos = this.config.map((entrada) => ({
    id: entrada.modulo.id,
    nombre: entrada.modulo.nombre,
    descripcion: entrada.modulo.descripcion,
    activo: entrada.activo,
  }));

  constructor() {
    addIcons({
      checkmarkCircleOutline,
      cloudOfflineOutline,
      copyOutline,
      personCircleOutline,
      refreshOutline,
      trashOutline,
    });
  }

  async ionViewWillEnter(): Promise<void> {
    const usuario = this.authService.user;
    this.perfil.set(usuario ? await this.authService.getUserProfile(usuario.uid).catch(() => null) : null);
  }

  cambiarTema(valor: unknown): void {
    if (valor === 'oscuro' || valor === 'claro') this.temaService.establecer(valor as Tema);
  }

  cambiar<K extends keyof Preferencias>(clave: K, valor: unknown): void {
    this.preferencias.cambiar(clave, valor as Preferencias[K]);
  }

  cambiarPantalla(valor: unknown): void {
    this.preferencias.cambiar('abrirEn', typeof valor === 'string' && valor !== '' ? valor : null);
  }

  /** Consulta /salud: si el servicio dormía, esto lo despierta. */
  async comprobarServicio(): Promise<void> {
    if (this.comprobando()) return;
    this.comprobando.set(true);
    try {
      this.estadoServicio.set(await this.privacidad.consultarEstado());
    } finally {
      this.comprobando.set(false);
    }
  }

  textoServicio(estado: EstadoServicioPrivacidad): string {
    if (!estado.responde) return 'No responde. Revisa tu conexión y vuelve a intentar.';
    if (!estado.listo) return 'Respondió, pero todavía está cargando. Vuelve a comprobar en un minuto.';
    const segundos = Math.max(1, Math.round(estado.ms / 1000));
    return estado.ms > 5000
      ? `Estaba dormido y ya despertó (tardó ${segundos} s). Las fotos se protegerán al instante.`
      : 'Despierto: las fotos se protegerán al instante.';
  }

  async borrarDatos(): Promise<void> {
    const alerta = await this.alertCtrl.create({
      header: 'Borrar datos guardados',
      message:
        'Se borra la copia de tu nivel de confianza y las ayudas que ya viste. No se cierra tu sesión ni cambia esta configuración.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Borrar',
          role: 'destructive',
          handler: () => {
            const cantidad = this.preferencias.borrarDatosLocales();
            void this.toast(cantidad === 0 ? 'No había datos guardados.' : 'Listo: se borraron los datos guardados.');
          },
        },
      ],
    });
    await alerta.present();
  }

  async restablecer(): Promise<void> {
    this.preferencias.restablecer();
    await this.toast('Configuración restablecida.');
  }

  /**
   * Copia la versión, el teléfono, los módulos y el estado del servicio, para
   * pegarlos en un mensaje de soporte. Sin correo ni datos de la cuenta.
   */
  async copiarDiagnostico(): Promise<void> {
    const estado = this.estadoServicio();
    const texto = [
      `Ciudad Alerta ${this.version.nombre} (código ${this.version.codigo})${this.version.demo ? ' · prueba' : ''}`,
      `Compilada: ${this.version.fecha ?? 'sin fecha'} · ${this.produccion ? 'producción' : 'desarrollo'}`,
      `Rol: ${this.perfil()?.role ?? 'sin perfil'}`,
      `Teléfono: ${navigator.userAgent}`,
      `Pantalla: ${window.innerWidth}×${window.innerHeight} · texto ${this.prefs().texto} · animaciones ${this.prefs().animaciones} · ahorro ${this.prefs().ahorroDatos ? 'sí' : 'no'}`,
      `Módulos: ${this.listaModulos.map((m) => `${m.id}${m.activo ? '' : ' (apagado)'}`).join(', ')}`,
      `Servicio de fotos: ${estado ? `${estado.responde ? 'responde' : 'no responde'}, ${estado.ms} ms${estado.error ? `, ${estado.error}` : ''}` : 'sin comprobar'}`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(texto);
      await this.toast('Copiado. Pégalo en tu mensaje de soporte.');
    } catch {
      await this.toast('No se pudo copiar en este teléfono.');
    }
  }

  private async toast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      position: 'bottom',
      buttons: [{ text: 'Cerrar', role: 'cancel' }],
    });
    await toast.present();
  }
}
