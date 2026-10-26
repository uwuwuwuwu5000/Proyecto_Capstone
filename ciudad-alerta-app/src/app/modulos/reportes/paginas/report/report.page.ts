import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  LoadingController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  cameraOutline,
  closeOutline,
  cloudOfflineOutline,
  imagesOutline,
  locateOutline,
  mapOutline,
  refreshOutline,
  shieldCheckmarkOutline,
  shieldOutline,
  trashOutline,
} from 'ionicons/icons';

import { MapViewComponent } from '../../../../compartido/mapa';
import { SimilarReportsComponent } from '../../componentes/similar-reports/similar-reports.component';
import { AvisoEmergenciaComponent } from '../../componentes/aviso-emergencia/aviso-emergencia.component';
import { ElegirPuntoComponent, PuntoElegido } from '../../componentes/elegir-punto/elegir-punto.component';
import { AuthService } from '../../../../services/auth.service';
import { ComunaDetectada, ComunaService } from '../../../../services/comuna.service';
import { DuplicateDetectionService } from '../../datos/duplicate-detection.service';
import { CameraService, CapturedPhoto, PhotoError } from '../../datos/camera.service';
import { PrivacidadError, PrivacidadService } from '../../datos/privacidad.service';
import { GeolocationService, LocationError } from '../../../../services/geolocation.service';
import { ReportError, ReportService } from '../../datos/report.service';
import { BorradorService } from '../../datos/borrador.service';
import {
  DESCRIPCION_MAX,
  DESCRIPCION_MIN,
  GeoPoint,
  REPORT_CATEGORIES,
  ReportCategory,
} from '../../../../models/report.model';
import { MatchCandidate } from '../../modelo/coincidencias';
import { creacionDeCuenta, permisoElegirEnMapa, textoEsperaElegirEnMapa } from '../../ubicacion';

@Component({
  selector: 'app-report',
  standalone: true,
  templateUrl: './report.page.html',
  styleUrls: ['./report.page.scss'],
  imports: [
    ReactiveFormsModule,
    MapViewComponent,
    ElegirPuntoComponent,
    SimilarReportsComponent,
    AvisoEmergenciaComponent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonTextarea,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonButton,
    IonIcon,
    IonNote,
  ],
})
export class ReportPage implements OnDestroy {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly cameraService = inject(CameraService);
  private readonly geolocationService = inject(GeolocationService);
  private readonly duplicateDetection = inject(DuplicateDetectionService);
  private readonly comunaService = inject(ComunaService);
  private readonly privacidadService = inject(PrivacidadService);

  /** Causa técnica de un fallo de la protección, visible en pantalla. */
  readonly errorTecnico = this.privacidadService.ultimoErrorTecnico;
  /** 'despertando' cuando el servicio tarda: el plan gratuito lo duerme. */
  readonly estadoProteccion = this.privacidadService.estado;
  private readonly reportService = inject(ReportService);
  private readonly borrador = inject(BorradorService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly loadingCtrl = inject(LoadingController);
  private readonly toastCtrl = inject(ToastController);
  private readonly alertCtrl = inject(AlertController);

  readonly categorias = REPORT_CATEGORIES;
  readonly descripcionMin = DESCRIPCION_MIN;
  readonly descripcionMax = DESCRIPCION_MAX;

  readonly foto = signal<CapturedPhoto | null>(null);
  readonly ubicacion = signal<GeoPoint | null>(null);
  readonly buscandoUbicacion = signal(false);

  /**
   * Elegir el punto en el mapa, en vez de la ubicación actual: solo cuentas
   * con al menos 7 días (ubicacion.ts). La hora se toma al entrar a la
   * página, porque la antigüedad cambia con los días.
   */
  private readonly momento = signal(Date.now());
  readonly permisoMapa = computed(() => {
    // La señal llega un instante después de abrir; `user` ya está.
    const usuario = this.authService.currentUser() ?? this.authService.user;
    return permisoElegirEnMapa(creacionDeCuenta(usuario?.metadata.creationTime), this.momento());
  });
  readonly esperaMapa = computed(() => textoEsperaElegirEnMapa(this.permisoMapa()));
  /** El selector del mapa está abierto. */
  readonly eligiendoEnMapa = signal(false);
  /** Mientras se busca dónde empezar el mapa (la ubicación actual). */
  readonly preparandoMapa = signal(false);
  /** Dónde empieza el mapa; null si no se pudo usar la ubicación actual. */
  readonly inicioMapa = signal<PuntoElegido | null>(null);

  /** Comuna detectada para la ubicación actual. */
  readonly comuna = signal<ComunaDetectada | null>(null);
  readonly detectandoComuna = signal(false);

  /** Coincidencias detectadas y estado del análisis. */
  readonly coincidencias = signal<MatchCandidate[]>([]);
  readonly analizando = signal(false);
  /** BUG 41 · Impide que un doble toque dispare dos creaciones de reporte. */
  readonly enviando = signal(false);
  /** Vector visual de la foto actual, reutilizado al guardar el reporte. */
  private embedding: number[] | null = null;
  private destruida = false;

  readonly formulario = this.fb.group({
    // Tipado explícito: con la sintaxis de array, TypeScript infiere `string`
    // y no `ReportCategory`, lo que rompe la llamada a createReport().
    categoria: this.fb.control<ReportCategory>('microbasural', [Validators.required]),
    descripcion: [
      '',
      [
        Validators.required,
        Validators.minLength(DESCRIPCION_MIN),
        Validators.maxLength(DESCRIPCION_MAX),
      ],
    ],
  });

  /** Categoría elegida, para el aviso de emergencia. */
  readonly categoriaActual = toSignal(this.formulario.controls.categoria.valueChanges, {
    initialValue: this.formulario.controls.categoria.value,
  });

  /**
   * Mientras se difuminan rostros y personas de la foto recién tomada. Ocurre
   * en la nube: el formulario sigue disponible mientras tanto.
   */
  readonly protegiendo = signal(false);

  /** Sin señal, «Enviar» guarda el reporte en el teléfono (BorradorService). */
  readonly enLinea = this.borrador.enLinea;

  /**
   * Foto que no pudo protegerse. Se muestra con un aviso y bloquea el envío:
   * sin la protección no hay garantía de que no aparezcan rostros. El usuario
   * puede reintentar o quitarla y enviar el reporte sin foto.
   */
  readonly fotoSinProteger = signal<CapturedPhoto | null>(null);

  /**
   * El reporte solo se envía con ubicación confirmada y la foto protegida (o
   * sin foto). Sin señal, la foto sin proteger se guarda con el borrador y se
   * protege antes de subirla.
   */
  readonly puedeEnviar = computed(
    () =>
      this.ubicacion() !== null &&
      !this.protegiendo() &&
      (this.fotoSinProteger() === null || !this.enLinea()),
  );

  /** Por qué no se puede enviar todavía, para decírselo al usuario. */
  readonly motivoBloqueo = computed<{ icono: string; texto: string } | null>(() => {
    if (this.protegiendo()) {
      return {
        icono: 'shield-outline',
        texto: 'Estamos protegiendo la foto. Puedes esperar o cancelarla para enviar sin foto.',
      };
    }
    if (this.fotoSinProteger() && this.enLinea()) {
      return {
        icono: 'shield-outline',
        texto: 'Reintenta la protección de la foto o quítala para enviar el reporte.',
      };
    }
    if (!this.ubicacion()) {
      return {
        icono: 'locate-outline',
        texto: this.eligiendoEnMapa()
          ? 'Falta la ubicación. Mueve el mapa y pulsa "Usar este punto" para poder enviar el reporte.'
          : this.permisoMapa().permitido
            ? 'Falta la ubicación. Pulsa "Usar mi ubicación actual" o "Elegir en el mapa" para poder enviar el reporte.'
            : 'Falta la ubicación. Pulsa "Usar mi ubicación actual" para poder enviar el reporte.',
      };
    }
    return null;
  });

  constructor() {
    addIcons({
      cameraOutline,
      closeOutline,
      cloudOfflineOutline,
      imagesOutline,
      locateOutline,
      mapOutline,
      refreshOutline,
      shieldCheckmarkOutline,
      shieldOutline,
      trashOutline,
    });
  }

  /**
   * Despierta el servicio de privacidad apenas se abre la página: si estaba
   * dormido, aprovecha el tiempo que el usuario tarda en tomar la foto.
   */
  ionViewWillEnter(): void {
    this.privacidadService.despertar();
    this.momento.set(Date.now());
  }

  /** Si el usuario sale con una foto en proceso, no tiene sentido esperarla. */
  ngOnDestroy(): void {
    this.destruida = true;
    if (this.protegiendo()) {
      this.privacidadService.cancelar();
    }
  }

  get descripcionControl() {
    return this.formulario.controls.descripcion;
  }

  async tomarFotografia(): Promise<void> {
    await this.capturar(() => this.cameraService.takePhoto());
  }

  async elegirDeGaleria(): Promise<void> {
    await this.capturar(() => this.cameraService.pickFromGallery());
  }

  /** Permite cambiar o eliminar la evidencia antes de enviar. */
  async quitarFotografia(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Quitar fotografía',
      message: 'El reporte se enviará sin evidencia visual.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Quitar',
          role: 'destructive',
          handler: () => {
            this.foto.set(null);
            // BUG 16 · Sin esto el vector de la imagen borrada seguía viajando
            // al reporte y alimentando la detección de coincidencias.
            this.embedding = null;
            void this.detectarCoincidencias();
          },
        },
      ],
    });

    await alert.present();
  }

  /** CA-52 · Solicita permiso y obtiene las coordenadas actuales. */
  /** Recalcula coincidencias cuando cambia la categoría. */
  async onCategoriaChange(): Promise<void> {
    await this.detectarCoincidencias();
  }

  async obtenerUbicacion(): Promise<void> {
    this.buscandoUbicacion.set(true);

    try {
      const coordenadas = await this.geolocationService.getCurrentPosition();
      await this.registrarUbicacion({ ...coordenadas, fuente: 'gps' }, 'Ubicación registrada.');
    } catch (error) {
      const mensaje =
        error instanceof LocationError
          ? error.message
          : 'No pudimos obtener tu ubicación.';
      await this.toast(mensaje, 'danger');
    } finally {
      this.buscandoUbicacion.set(false);
    }
  }

  /**
   * Abre el selector del mapa. Empieza en la ubicación ya registrada o, si no
   * hay, en la actual del teléfono; sin ella, en el centro de Santiago.
   */
  async elegirEnMapa(): Promise<void> {
    if (!this.permisoMapa().permitido || this.eligiendoEnMapa() || this.preparandoMapa()) {
      return;
    }

    const registrada = this.ubicacion();

    if (registrada) {
      this.inicioMapa.set({ lat: registrada.lat, lng: registrada.lng });
    } else {
      this.preparandoMapa.set(true);
      try {
        const actual = await this.geolocationService.getCurrentPosition();
        this.inicioMapa.set({ lat: actual.lat, lng: actual.lng });
      } catch {
        // Sin permiso o sin señal GPS igual se puede buscar el lugar a mano.
        this.inicioMapa.set(null);
      } finally {
        this.preparandoMapa.set(false);
      }
    }

    if (!this.destruida) {
      this.eligiendoEnMapa.set(true);
    }
  }

  /** El punto elegido pasa a ser la ubicación del reporte. */
  async usarPuntoDelMapa(punto: PuntoElegido): Promise<void> {
    if (!this.permisoMapa().permitido) {
      return;
    }

    this.eligiendoEnMapa.set(false);
    // Sin precisión de GPS: el punto lo eligió la persona.
    await this.registrarUbicacion({ lat: punto.lat, lng: punto.lng, accuracy: 0, fuente: 'mapa' }, 'Punto del mapa registrado.');
  }

  /** Cierra el selector; la ubicación que hubiera sigue igual. */
  cancelarMapa(): void {
    this.eligiendoEnMapa.set(false);
  }

  /** La comuna y los reportes parecidos se buscan con el punto nuevo, en paralelo. */
  private async registrarUbicacion(coordenadas: GeoPoint, aviso: string): Promise<void> {
    this.ubicacion.set(coordenadas);
    await this.toast(aviso, 'success');
    await Promise.all([this.detectarComuna(coordenadas), this.detectarCoincidencias()]);
  }

  async enviar(): Promise<void> {
    if (this.enviando()) {
      return;
    }

    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    const coordenadas = this.ubicacion();

    if (!coordenadas) {
      await this.toast('Registra la ubicación antes de enviar el reporte.', 'warning');
      return;
    }

    // Sin señal ni se intenta: se guarda y se envía cuando vuelva.
    if (!this.enLinea()) {
      await this.guardarParaDespues();
      return;
    }

    this.enviando.set(true);

    const loading = await this.loadingCtrl.create({
      message: 'Enviando reporte',
      spinner: 'crescent',
      backdropDismiss: false,
    });
    await loading.present();

    try {
      const { categoria, descripcion } = this.formulario.getRawValue();

      await this.reportService.createReport({
        descripcion,
        categoria,
        ubicacion: coordenadas,
        foto: this.foto(),
        embedding: this.embedding,
        comuna: this.comuna(),
      });

      await loading.dismiss();
      await this.toast('Reporte enviado. Puedes seguir su estado desde tu historial.', 'success');
      this.limpiar();
      await this.router.navigateByUrl('/home', { replaceUrl: true });
    } catch (error) {
      await loading.dismiss();
      if (error instanceof ReportError && error.code === 'red') {
        await this.guardarParaDespues();
        return;
      }
      const mensaje =
        error instanceof Error ? error.message : 'No se pudo enviar el reporte.';
      await this.toast(mensaje, 'danger');
    } finally {
      this.enviando.set(false);
    }
  }

  /**
   * 1.0 · Guarda el reporte en el teléfono para enviarlo cuando vuelva la
   * señal. La tarjeta «Reporte por enviar» del inicio muestra cómo va.
   */
  private async guardarParaDespues(): Promise<void> {
    const coordenadas = this.ubicacion();
    if (!coordenadas) return;

    const { categoria, descripcion } = this.formulario.getRawValue();
    const resultado = this.borrador.guardar(
      {
        descripcion,
        categoria,
        ubicacion: coordenadas,
        foto: this.foto(),
        embedding: this.embedding,
        comuna: this.comuna(),
      },
      this.fotoSinProteger(),
    );

    switch (resultado) {
      case 'ok':
        await this.toast('Sin señal: guardamos tu reporte y lo enviaremos solo cuando vuelva la conexión.', 'success');
        this.limpiar();
        await this.router.navigateByUrl('/home', { replaceUrl: true });
        return;
      case 'ocupado':
        await this.toast('Ya tienes un reporte esperando señal. Cuando se envíe podrás guardar otro.', 'warning');
        return;
      case 'sin_espacio':
        await this.toast('No hay espacio en el teléfono para guardar la foto. Quítala o envía el reporte con señal.', 'danger');
        return;
      case 'sin_sesion':
        await this.toast('Tu sesión expiró. Vuelve a iniciar sesión para reportar.', 'danger');
    }
  }

  /**
   * Detecta la comuna de la ubicación. Si falla, el reporte se envía igual.
   * Si la ubicación cambió mientras tanto (otro punto del mapa, por ejemplo),
   * la respuesta ya no sirve y se descarta.
   */
  private async detectarComuna(coordenadas: GeoPoint): Promise<void> {
    this.detectandoComuna.set(true);
    let comuna: ComunaDetectada | null = null;

    try {
      comuna = await this.comunaService.detectar(coordenadas);
    } catch {
      comuna = null;
    }

    if (this.ubicacion() === coordenadas) {
      this.comuna.set(comuna);
      this.detectandoComuna.set(false);
    }
  }

  /**
   * HU-20 · Busca reportes cercanos que puedan ser el mismo incidente.
   * Solo corre cuando ya hay ubicación; sin coincidencias no muestra nada, que
   * es el caso habitual.
   */
  private async detectarCoincidencias(): Promise<void> {
    const coordenadas = this.ubicacion();

    if (!coordenadas) {
      return;
    }

    this.analizando.set(true);
    // BUG 30 · Vaciar antes de consultar evita el parpadeo de resultados
    // antiguos mientras llega la búsqueda nueva.
    this.coincidencias.set([]);

    let encontrados: MatchCandidate[] = [];

    try {
      encontrados = await this.duplicateDetection.findSimilar({
        ubicacion: coordenadas,
        categoria: this.formulario.controls.categoria.value,
        embedding: this.embedding,
      });
    } catch {
      // La detección es auxiliar: si falla, el usuario igual puede reportar.
      encontrados = [];
    }

    // Los parecidos a un punto que ya no es el del reporte no sirven.
    if (this.ubicacion() === coordenadas) {
      this.coincidencias.set(encontrados);
      this.analizando.set(false);
    }
  }

  /** Al confirmar un reporte existente, el usuario ya no necesita crear el suyo. */
  async alConfirmarCoincidencia(): Promise<void> {
    this.limpiar();
    await this.router.navigateByUrl('/home', { replaceUrl: true });
  }

  private async capturar(origen: () => Promise<CapturedPhoto>): Promise<void> {
    let original: CapturedPhoto;

    try {
      original = await origen();
    } catch (error) {
      if (error instanceof PhotoError && error.code === 'cancelado') {
        return;
      }

      const mensaje =
        error instanceof Error ? error.message : 'No se pudo obtener la fotografía.';
      await this.toast(mensaje, 'danger');
      return;
    }

    // El vector anterior deja de ser válido apenas cambia la imagen.
    this.embedding = null;
    this.foto.set(null);
    this.fotoSinProteger.set(null);

    await this.proteger(original);
  }

  /** Reintenta la protección de una foto que no pudo procesarse. */
  async reintentarProteccion(): Promise<void> {
    const pendiente = this.fotoSinProteger();

    if (pendiente) {
      await this.proteger(pendiente);
    }
  }

  /** Descarta la foto que no pudo protegerse, para enviar el reporte sin ella. */
  descartarFotoSinProteger(): void {
    this.fotoSinProteger.set(null);
  }

  /** Deja de esperar al servicio; la foto se descarta y el reporte puede ir sin ella. */
  cancelarProteccion(): void {
    this.privacidadService.cancelar();
  }

  /**
   * Difumina rostros y personas antes de mostrar la vista previa.
   *
   * Ocurre antes de la vista previa, no al enviar, para que el usuario vea
   * exactamente la imagen que se publicará. El servicio devuelve también el
   * vector de la imagen protegida para la detección de duplicados.
   */
  private async proteger(original: CapturedPhoto): Promise<void> {
    this.protegiendo.set(true);

    try {
      const protegida = await this.privacidadService.anonimizar(original);
      if (this.destruida) {
        return;
      }
      this.foto.set(protegida);
      this.fotoSinProteger.set(null);
      this.embedding = protegida.embedding ?? null;

      const { rostros, personas } = protegida.privacidad!;
      const total = rostros + personas;

      if (total > 0) {
        await this.toast(
          total === 1
            ? 'Difuminamos a 1 persona para proteger su privacidad.'
            : `Difuminamos a ${total} personas para proteger su privacidad.`,
          'success',
        );
      }
    } catch (error) {
      this.foto.set(null);

      if (this.destruida) {
        return;
      }

      if (error instanceof PrivacidadError && error.code === 'cancelado') {
        this.fotoSinProteger.set(null);
        await this.toast('Quitamos la foto. Puedes tomar otra o enviar el reporte sin foto.', 'warning');
        return;
      }

      this.fotoSinProteger.set(original);

      const mensaje =
        error instanceof PrivacidadError
          ? error.message
          : 'No pudimos proteger la privacidad de la foto.';
      await this.toast(mensaje, 'warning');
      return;
    } finally {
      this.protegiendo.set(false);
    }

    // Sin vector (MobileNet no disponible en el servidor) la detección de
    // duplicados sigue funcionando con ubicación, categoría y tiempo.
    await this.detectarCoincidencias();
  }

  private limpiar(): void {
    this.formulario.reset({ categoria: 'microbasural', descripcion: '' });
    this.foto.set(null);
    this.fotoSinProteger.set(null);
    this.ubicacion.set(null);
    this.coincidencias.set([]);
    this.embedding = null;
    this.comuna.set(null);
    // Una búsqueda que siga en curso ya no los apagará: es de otro punto.
    this.analizando.set(false);
    this.detectandoComuna.set(false);
    this.eligiendoEnMapa.set(false);
    this.inicioMapa.set(null);
  }

  private async toast(
    message: string,
    color: 'success' | 'danger' | 'warning',
  ): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3200,
      color,
      position: 'bottom',
      buttons: [{ text: 'Cerrar', role: 'cancel' }],
    });
    await toast.present();
  }
}
