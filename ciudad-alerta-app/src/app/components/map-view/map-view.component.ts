import {
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';

/** Marcador de incidencia para el mapa general. */
export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  /** Color del pin, normalmente derivado del estado del reporte. */
  color: string;
  titulo: string;
}

/**
 * CA-51 · Componente de mapa basado en Leaflet + OpenStreetMap.
 *
 * No requiere API key ni cuenta de facturación, y funciona igual en el
 * navegador y dentro de la WebView de Capacitor. La atribución a
 * OpenStreetMap es obligatoria por licencia y no debe quitarse.
 */
@Component({
  selector: 'app-map-view',
  standalone: true,
  template: `
    <div class="mapa-wrapper">
      <div #mapContainer class="mapa" [class.mapa--oculto]="!!error()"></div>

      @if (cargando() && !error()) {
        <div class="mapa-estado">Cargando mapa…</div>
      }

      @if (error(); as mensaje) {
        <div class="mapa-estado mapa-estado--error" role="alert">
          <p>{{ mensaje }}</p>
          @if (latitude() !== null && longitude() !== null) {
            <p class="mapa-estado__coords">
              Coordenadas registradas: {{ latitude()!.toFixed(5) }},
              {{ longitude()!.toFixed(5) }}
            </p>
          }
          <button type="button" class="mapa-estado__accion" (click)="reintentar()">
            Reintentar
          </button>
        </div>
      }
    </div>
  `,
  styleUrls: ['./map-view.component.scss'],
})
export class MapViewComponent implements OnDestroy {
  /** Coordenadas a representar. Si son null, el mapa espera. */
  readonly latitude = input<number | null>(null);
  readonly longitude = input<number | null>(null);
  readonly zoom = input(16);
  /** En modo vista previa se desactiva el arrastre para no pelear con el scroll. */
  readonly interactive = input(true);
  readonly markerLabel = input('Ubicación del reporte');
  /** Marcadores adicionales para el mapa de incidencias (HU-25). */
  readonly markers = input<MapMarker[]>([]);
  /** Radio en metros a dibujar alrededor del punto central. 0 lo desactiva. */
  readonly radiusMeters = input(0);

  /** Emite el id del marcador seleccionado. */
  readonly markerSelected = output<string>();

  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);

  private readonly mapContainer =
    viewChild.required<ElementRef<HTMLDivElement>>('mapContainer');

  private map: L.Map | null = null;
  private marker: L.Marker | null = null;
  private capaMarcadores: L.LayerGroup | null = null;
  private circulo: L.Circle | null = null;
  private tileErrores = 0;
  /** BUG 50 · Se guardan para poder cancelarlos si el componente se destruye. */
  private temporizadores: ReturnType<typeof setTimeout>[] = [];
  private readonly alRecuperarRed = () => this.reintentar();
  private readonly alPerderRed = () => {
    this.cargando.set(false);
    this.error.set(
      'Se perdió la conexión. El mapa volverá a cargarse cuando vuelva la red.',
    );
  };

  constructor() {
    afterNextRender(() => {
      this.inicializar();

      // BUG 48 y 51 · El estado de red se consultaba una sola vez, así que un
      // corte dejaba el mapa roto hasta salir de la pantalla. Ahora se reacciona
      // a los eventos del navegador.
      window.addEventListener('online', this.alRecuperarRed);
      window.addEventListener('offline', this.alPerderRed);
    });

    // Reposiciona el marcador cada vez que cambian las coordenadas de entrada.
    effect(() => {
      const lat = this.latitude();
      const lng = this.longitude();

      if (this.map && lat !== null && lng !== null) {
        this.mostrarUbicacion(lat, lng);
      }
    });

    // Redibuja los marcadores de incidencias cuando cambian los filtros.
    effect(() => {
      const marcadores = this.markers();

      if (this.map) {
        this.dibujarMarcadores(marcadores);
      }
    });

    effect(() => {
      const radio = this.radiusMeters();
      const lat = this.latitude();
      const lng = this.longitude();

      if (this.map && lat !== null && lng !== null) {
        this.dibujarRadio(lat, lng, radio);
      }
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('online', this.alRecuperarRed);
    window.removeEventListener('offline', this.alPerderRed);
    this.temporizadores.forEach((id) => clearTimeout(id));
    this.temporizadores = [];
    this.map?.remove();
    this.map = null;
    this.marker = null;
    this.capaMarcadores = null;
    this.circulo = null;
  }

  reintentar(): void {
    this.error.set(null);
    this.cargando.set(true);
    this.tileErrores = 0;
    this.map?.remove();
    this.map = null;
    this.inicializar();
  }

  private inicializar(): void {
    if (this.map) {
      return;
    }

    if (!navigator.onLine) {
      this.cargando.set(false);
      this.error.set(
        'Sin conexión a Internet no podemos cargar el mapa. La ubicación queda guardada igual.',
      );
      return;
    }

    try {
      // Centro por defecto: Plaza de Armas de Santiago, hasta que lleguen coordenadas.
      const lat = this.latitude() ?? -33.4372;
      const lng = this.longitude() ?? -70.6506;

      this.map = L.map(this.mapContainer().nativeElement, {
        center: [lat, lng],
        zoom: this.zoom(),
        zoomControl: this.interactive(),
        dragging: this.interactive(),
        scrollWheelZoom: this.interactive(),
        attributionControl: true,
      });

      const capa = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; colaboradores de OpenStreetMap',
      });

      capa.on('tileerror', () => this.registrarErrorDeTiles());

      // BUG 47 · Un tile que carga bien significa que el servicio respondió:
      // se limpia también el mensaje de error, no solo el contador.
      capa.on('tileload', () => {
        this.tileErrores = 0;

        if (this.error()) {
          this.error.set(null);
        }
      });

      capa.on('load', () => {
        this.cargando.set(false);
        this.tileErrores = 0;
      });

      capa.addTo(this.map);

      if (this.latitude() !== null && this.longitude() !== null) {
        this.mostrarUbicacion(this.latitude()!, this.longitude()!);
        this.dibujarRadio(this.latitude()!, this.longitude()!, this.radiusMeters());
      }

      this.dibujarMarcadores(this.markers());

      // Ionic monta el contenedor con altura 0 en el primer ciclo, y en pantallas
      // que renderizan el mapa dentro de un @if la altura llega todavía más
      // tarde. Se recalcula varias veces en lugar de una sola.
      for (const espera of [100, 400, 900]) {
        this.temporizadores.push(
          setTimeout(() => this.map?.invalidateSize(), espera),
        );
      }

      this.temporizadores.push(setTimeout(() => this.cargando.set(false), 250));
    } catch {
      this.cargando.set(false);
      this.error.set('No se pudo inicializar el mapa en este dispositivo.');
    }
  }

  /** Centra el mapa y coloca el marcador en las coordenadas indicadas. */
  private mostrarUbicacion(lat: number, lng: number): void {
    if (!this.map) {
      return;
    }

    const posicion: L.LatLngExpression = [lat, lng];
    this.map.setView(posicion, this.zoom());

    if (this.marker) {
      this.marker.setLatLng(posicion);
      return;
    }

    // divIcon en vez del marcador por defecto: evita depender de los PNG de
    // Leaflet, que los bundlers de Angular no resuelven automáticamente.
    const icono = L.divIcon({
      className: 'marcador-ciudad-alerta',
      html: '<span class="marcador-ciudad-alerta__pin"></span>',
      iconSize: [26, 26],
      iconAnchor: [13, 26],
    });

    this.marker = L.marker(posicion, { icon: icono, title: this.markerLabel() }).addTo(
      this.map,
    );
  }

  /** Pinta los marcadores de incidencias, reemplazando los anteriores. */
  private dibujarMarcadores(marcadores: MapMarker[]): void {
    if (!this.map) {
      return;
    }

    this.capaMarcadores?.remove();

    if (marcadores.length === 0) {
      this.capaMarcadores = null;
      return;
    }

    this.capaMarcadores = L.layerGroup(
      marcadores.map((marcador) => {
        /**
         * BUG 54 · El pin se construye con la API del DOM en vez de
         * interpolar el color dentro de una cadena HTML. Hoy el color viene de
         * una constante interna, pero así la ruta queda cerrada aunque mañana
         * llegue de otra parte.
         */
        const pin = document.createElement('span');
        pin.className = 'marcador-incidencia__pin';
        pin.style.background = marcador.color;

        const icono = L.divIcon({
          className: 'marcador-incidencia',
          html: pin,
          iconSize: [20, 20],
          iconAnchor: [10, 20],
        });

        const marcadorLeaflet = L.marker([marcador.lat, marcador.lng], {
          icon: icono,
          title: marcador.titulo,
        });

        // BUG 53 · Un toque muestra el resumen; el enlace abre el detalle.
        marcadorLeaflet.bindPopup(
          `<strong>${this.escapar(marcador.titulo)}</strong><br><em>Toca de nuevo para ver el detalle</em>`,
          { closeButton: false, autoPan: true },
        );

        marcadorLeaflet.on('click', () => {
          if (marcadorLeaflet.isPopupOpen()) {
            this.markerSelected.emit(marcador.id);
          }
        });

        return marcadorLeaflet;
      }),
    ).addTo(this.map);
  }

  /** Dibuja el radio de búsqueda alrededor del usuario. */
  private dibujarRadio(lat: number, lng: number, radio: number): void {
    if (!this.map) {
      return;
    }

    this.circulo?.remove();
    this.circulo = null;

    if (radio <= 0) {
      return;
    }

    this.circulo = L.circle([lat, lng], {
      radius: radio,
      color: '#1ca9c9',
      weight: 1,
      fillColor: '#1ca9c9',
      fillOpacity: 0.08,
    }).addTo(this.map);

    this.map.fitBounds(this.circulo.getBounds(), { padding: [16, 16] });
  }

  /** Escapa el texto que va dentro del popup de Leaflet. */
  private escapar(texto: string): string {
    const nodo = document.createElement('span');
    nodo.textContent = texto;
    return nodo.innerHTML;
  }

  /**
   * Los tiles fallan de a uno. Un par de errores sueltos es normal al hacer
   * zoom rápido; solo avisamos cuando el fallo es sostenido.
   */
  private registrarErrorDeTiles(): void {
    this.tileErrores += 1;

    if (this.tileErrores >= 6) {
      this.cargando.set(false);
      this.error.set(
        'El servicio de mapas no está respondiendo. La ubicación del reporte se guardó igualmente.',
      );
    }
  }
}
