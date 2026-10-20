import { Component, computed, inject, signal } from '@angular/core';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonProgressBar,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { businessOutline, cloudUploadOutline } from 'ionicons/icons';

import { AuthService } from '../../../../services/auth.service';
import { CatalogoComunasService } from '../../../../services/catalogo-comunas.service';
import { OrganismosService } from '../../datos/organismos.service';
import { OrganismoDoc } from '../../../../models/report.model';

const TOTAL_ESPERADO = 345;

/**
 * Catálogo de municipalidades en la base de datos.
 *
 * Muestra cuántas están cargadas y permite a un administrador sincronizarlas
 * con el catálogo oficial incluido en la app.
 */
@Component({
  selector: 'app-admin-organismos',
  standalone: true,
  templateUrl: './admin-organismos.page.html',
  styleUrls: ['./admin-organismos.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonButton,
    IonIcon,
    IonProgressBar,
    IonSelect,
    IonSelectOption,
  ],
})
export class AdminOrganismosPage {
  private readonly organismosService = inject(OrganismosService);
  private readonly catalogo = inject(CatalogoComunasService);
  private readonly authService = inject(AuthService);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);

  readonly totalEsperado = TOTAL_ESPERADO;

  readonly cargadas = signal<number | null>(null);
  readonly esAdmin = signal(false);
  readonly sincronizando = signal(false);
  readonly progreso = signal(0);

  readonly regiones = signal<{ codigo: string; nombre: string }[]>([]);
  readonly regionElegida = signal<string | null>(null);
  readonly municipalidades = signal<OrganismoDoc[]>([]);
  readonly cargandoLista = signal(false);

  readonly completo = computed(() => this.cargadas() === TOTAL_ESPERADO);

  constructor() {
    addIcons({ businessOutline, cloudUploadOutline });
  }

  async ionViewWillEnter(): Promise<void> {
    const usuario = this.authService.user;

    if (usuario) {
      const perfil = await this.authService.getUserProfile(usuario.uid).catch(() => null);
      // Solo el rol admin carga el catálogo; las reglas aplican la misma
      // restricción, esto solo evita mostrar un botón que fallaría.
      this.esAdmin.set(perfil?.role === 'admin');
    }

    this.cargadas.set(await this.organismosService.contarMunicipalidades());

    const comunas = await this.catalogo.todas();
    const unicas = new Map(comunas.map((c) => [c.codigoRegion, c.region]));

    this.regiones.set(
      [...unicas.entries()]
        .map(([codigo, nombre]) => ({ codigo, nombre }))
        .sort((a, b) => a.codigo.localeCompare(b.codigo)),
    );
  }

  async confirmarSincronizacion(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Cargar municipalidades',
      message:
        'Se escribirán las 345 municipalidades de Chile en la base de datos. Si ya existen, se actualizan sin duplicarse.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Cargar',
          role: 'confirm',
          handler: () => {
            void this.sincronizar();
            return true;
          },
        },
      ],
    });

    await alert.present();
  }

  async elegirRegion(valor: string | number | undefined): Promise<void> {
    const codigo = valor ? String(valor) : null;
    this.regionElegida.set(codigo);

    if (!codigo) {
      this.municipalidades.set([]);
      return;
    }

    this.cargandoLista.set(true);

    try {
      this.municipalidades.set(await this.organismosService.listarPorRegion(codigo));
    } catch {
      this.municipalidades.set([]);
      await this.toast('No se pudo cargar la lista de esa región.', 'danger');
    } finally {
      this.cargandoLista.set(false);
    }
  }

  private async sincronizar(): Promise<void> {
    this.sincronizando.set(true);
    this.progreso.set(0);

    try {
      const resultado = await this.organismosService.sincronizarMunicipalidades(
        (hechos, total) => this.progreso.set(hechos / total),
      );

      this.cargadas.set(await this.organismosService.contarMunicipalidades());
      await this.toast(`${resultado.escritos} municipalidades cargadas.`, 'success');
    } catch (error) {
      const mensaje =
        error instanceof Error && error.message.includes('permission')
          ? 'Tu cuenta no tiene permiso para cargar el catálogo. Se requiere rol admin.'
          : 'No se pudo completar la carga. Revisa tu conexión y vuelve a intentarlo.';
      await this.toast(mensaje, 'danger');
    } finally {
      this.sincronizando.set(false);
    }
  }

  private async toast(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3500,
      color,
      position: 'bottom',
      buttons: [{ text: 'Cerrar', role: 'cancel' }],
    });
    await toast.present();
  }
}
