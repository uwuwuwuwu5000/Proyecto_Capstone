import { Component, computed, inject, signal } from '@angular/core';
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
  IonTextarea,
  IonTitle,
  IonToolbar,
  LoadingController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  cameraOutline,
  imagesOutline,
  locateOutline,
  trashOutline,
} from 'ionicons/icons';

import { MapViewComponent } from '../../components/map-view/map-view.component';
import { SimilarReportsComponent } from '../../components/similar-reports/similar-reports.component';
import { DuplicateDetectionService } from '../../services/duplicate-detection.service';
import { ImageSimilarityService } from '../../services/image-similarity.service';
import { CameraService, CapturedPhoto, PhotoError } from '../../services/camera.service';
import { GeolocationService, LocationError } from '../../services/geolocation.service';
import { ReportService } from '../../services/report.service';
import {
  DESCRIPCION_MAX,
  DESCRIPCION_MIN,
  GeoPoint,
  MatchCandidate,
  REPORT_CATEGORIES,
  ReportCategory,
} from '../../models/report.model';

@Component({
  selector: 'app-report',
  standalone: true,
  templateUrl: './report.page.html',
  styleUrls: ['./report.page.scss'],
  imports: [
    ReactiveFormsModule,
    MapViewComponent,
    SimilarReportsComponent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonTextarea,
    IonSelect,
    IonSelectOption,
    IonButton,
    IonIcon,
    IonNote,
  ],
})
export class ReportPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly cameraService = inject(CameraService);
  private readonly geolocationService = inject(GeolocationService);
  private readonly duplicateDetection = inject(DuplicateDetectionService);
  private readonly similarityService = inject(ImageSimilarityService);
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

  /** Coincidencias detectadas y estado del análisis. */
  readonly coincidencias = signal<MatchCandidate[]>([]);
  readonly analizando = signal(false);
  /** Vector visual de la foto actual, reutilizado al guardar el reporte. */
  private embedding: number[] | null = null;

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

  /** El reporte solo se envía con ubicación confirmada y formulario válido. */
  readonly puedeEnviar = computed(() => this.ubicacion() !== null);

  constructor() {
    addIcons({ cameraOutline, imagesOutline, locateOutline, trashOutline });
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
          handler: () => this.foto.set(null),
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
      await this.detectarCoincidencias();
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
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    const coordenadas = this.ubicacion();

    if (!coordenadas) {
      await this.toast('Registra la ubicación antes de enviar el reporte.', 'warning');
      return;
    }

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
    try {
      const foto = await origen();
      this.foto.set(foto);

      // El vector se calcula una vez y se reutiliza en la detección y al guardar.
      this.embedding = await this.similarityService.computeEmbedding(foto.dataUrl);
      await this.detectarCoincidencias();
    } catch (error) {
      if (error instanceof PhotoError && error.code === 'cancelado') {
        return;
      }

      this.embedding = null;

      const mensaje =
        error instanceof Error ? error.message : 'No se pudo obtener la fotografía.';
      await this.toast(mensaje, 'danger');
    }
  }

  private limpiar(): void {
    this.formulario.reset({ categoria: 'microbasural', descripcion: '' });
    this.foto.set(null);
    this.ubicacion.set(null);
    this.coincidencias.set([]);
    this.embedding = null;
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
