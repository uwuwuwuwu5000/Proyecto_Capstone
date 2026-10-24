import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cameraOutline, notificationsOutline, ribbonOutline } from 'ionicons/icons';

import { ModulosService } from '../../../../nucleo/modulos';
import { BienvenidaService } from '../../datos/bienvenida.service';

interface Paso {
  icono: string;
  titulo: string;
  texto: string;
  puntos: readonly string[];
}

const REPORTAR: Paso = {
  icono: 'camera-outline',
  titulo: 'Reporta lo que ves en tu barrio',
  texto: 'Un microbasural, una luminaria, una fuga de agua: toma una foto, marca dónde está y elige qué es.',
  puntos: [
    'Antes de publicarla, difuminamos las caras de las personas.',
    'El reporte llega al organismo de tu comuna.',
    'Si hay peligro ahora, llama al 133, 132 o 131.',
  ],
};

const SEGUIR: Paso = {
  icono: 'notifications-outline',
  titulo: 'Sigue tu reporte',
  texto: 'Cada cambio de estado te llega a la campana, con la respuesta del organismo si la deja.',
  puntos: [
    'Mientras nadie lo revise, puedes corregir la descripción o retirarlo.',
    'Desde el detalle puedes llamar o escribir al organismo.',
    'Si no hay señal, el reporte se guarda y se envía después.',
  ],
};

const CONFIANZA: Paso = {
  icono: 'ribbon-outline',
  titulo: 'Tu confianza suma',
  texto: 'Confirma los reportes de tus vecinos: con varias confirmaciones, un reporte queda validado.',
  puntos: [
    'Cuando el organismo verifica tu reporte como real, ganas puntos; si es falso, los pierdes.',
    'Con más puntos subes de nivel y tus confirmaciones pesan más.',
  ],
};

const SIN_CONFIANZA: Paso = {
  icono: 'ribbon-outline',
  titulo: 'Entre vecinos',
  texto: 'Confirma los reportes de tus vecinos: así el organismo sabe que el problema es real y cuántos lo ven.',
  puntos: ['Busca primero en el mapa: si alguien ya lo reportó, confírmalo en vez de repetirlo.'],
};

/** Tres pantallas, con «Siguiente», «Atrás» y «Saltar». */
@Component({
  selector: 'app-bienvenida',
  standalone: true,
  templateUrl: './bienvenida.page.html',
  styleUrls: ['./bienvenida.page.scss'],
  imports: [IonContent, IonButton, IonIcon],
})
export class BienvenidaPage {
  private readonly router = inject(Router);
  private readonly bienvenida = inject(BienvenidaService);

  readonly pasos: readonly Paso[] = [
    REPORTAR,
    SEGUIR,
    inject(ModulosService).activo('confianza') ? CONFIANZA : SIN_CONFIANZA,
  ];
  readonly indice = signal(0);
  readonly ultimo = computed(() => this.indice() === this.pasos.length - 1);

  constructor() {
    addIcons({ cameraOutline, notificationsOutline, ribbonOutline });
  }

  siguiente(): void {
    if (this.ultimo()) {
      void this.terminar();
    } else {
      this.indice.update((i) => i + 1);
    }
  }

  atras(): void {
    this.indice.update((i) => Math.max(0, i - 1));
  }

  async terminar(): Promise<void> {
    this.bienvenida.marcarVista();
    await this.router.navigateByUrl('/home', { replaceUrl: true });
  }
}
