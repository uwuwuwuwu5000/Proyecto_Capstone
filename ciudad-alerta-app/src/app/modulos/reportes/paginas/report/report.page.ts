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
  imagesOutline,
  locateOutline,
  refreshOutline,
  shieldCheckmarkOutline,
  shieldOutline,
  trashOutline,
} from 'ionicons/icons';

import { MapViewComponent } from '../../../../compartido/mapa';
import { SimilarReportsComponent } from '../../componentes/similar-reports/similar-reports.component';
import { AvisoEmergenciaComponent } from '../../componentes/aviso-emergencia/aviso-emergencia.component';
import { ComunaDetectada, ComunaService } from '../../../../services/comuna.service';
import { DuplicateDetectionService } from '../../datos/duplicate-detection.service';
import { CameraService, CapturedPhoto, PhotoError } from '../../datos/camera.service';
import { PrivacidadError, PrivacidadService } from '../../datos/privacidad.service';
import { GeolocationService, LocationError } from '../../../../services/geolocation.service';
import { ReportService } from '../../datos/report.service';
import {
  DESCRIPCION_MAX,
  DESCRIPCION_MIN,
  GeoPoint,
  REPORT_CATEGORIES,
  ReportCategory,
} from '../../../../models/report.model';
import { MatchCandidate } from '../../modelo/coincidencias';

@Component({
  selector: 'app-report',
  standalone: true,
  templateUrl: './report.page.html',
  styleUrls: ['./report.page.scss'],
  imports: [
    ReactiveFormsModule,
    MapViewComponent,
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

  /**
   * Foto que no pudo protegerse. Se muestra con un aviso y bloquea el envío:
   * sin la protección no hay garantía de que no aparezcan rostros. El usuario
   * puede reintentar o quitarla y enviar el reporte sin foto.
   */
  readonly fotoSinProteger = signal<CapturedPhoto | null>(null);

  /** El reporte solo se envía con ubicación confirmada y la foto protegida (o sin foto). */
  readonly puedeEnviar = computed(
    () => this.ubicacion() !== null && !this.protegiendo() && this.fotoSinProteger() === null,
  );

  /** Por qué no se puede enviar todavía, para decírselo al usuario. */
  readonly motivoBloqueo = computed<{ icono: string; texto: string } | null>(() => {
    if (this.protegiendo()) {
      return {
        icono: 'shield-outline',
        texto: 'Estamos protegiendo la foto. Puedes esperar o cancelarla para enviar sin foto.',
      };
    }
    if (this.fotoSinProteger()) {
      return {
        icono: 'shield-outline',
        texto: 'Reintenta la protección de la foto o quítala para enviar el reporte.',
      };
    }
    if (!this.ubicacion()) {
      return {
        icono: 'locate-outline',
        texto: 'Falta la ubicación. Pulsa "Usar mi ubicación actual" para poder enviar el reporte.',
      };
    }
    return null;
  });

  constructor() {
    addIcons({
      cameraOutline,
      closeOutline,
      imagesOutline,
      locateOutline,
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
      this.ubicacion.set(coordenadas);
      await this.toast('Ubicación registrada.', 'success');

      // Ambas consultas son independientes y corren en paralelo.
      await Promise.all([this.detectarComuna(coordenadas), this.detectarCoincidencias()]);
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
      const mensaje =
        error instanceof Error ? error.message : 'No se pudo enviar el reporte.';
      await this.toast(mensaje, 'danger');
    } finally {
      this.enviando.set(false);
    }
  }

  /** Detecta la comuna de la ubicación. Si falla, el reporte se envía igual. */
  private async detectarComuna(coordenadas: GeoPoint): Promise<void> {
    this.detectandoComuna.set(true);

    try {
      this.comuna.set(await this.comunaService.detectar(coordenadas));
    } catch {
      this.comuna.set(null);
    } finally {
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

    try {
      const encontrados = await this.duplicateDetection.findSimilar({
        ubicacion: coordenadas,
        categoria: this.formulario.controls.categoria.value,
        embedding: this.embedding,
      });

      this.coincidencias.set(encontrados);
    } catch {
      // La detección es auxiliar: si falla, el usuario igual puede reportar.
      this.coincidencias.set([]);
    } finally {
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
