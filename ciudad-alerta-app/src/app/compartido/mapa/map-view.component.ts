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
import Supercluster from 'supercluster';

import { ETIQUETAS_ESTADO, EventoHistorial } from '../../models/report.model';

/** Marcador de incidencia para el mapa general. */
export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  /** Color del pin, normalmente derivado del estado del reporte. */
  color: string;
  titulo: string;
  /**
   * Pin con anillo y marca de verificación, para distinguirlo sin depender
   * solo del color (por ejemplo, un reporte validado por la comunidad).
   */
  destacado?: boolean;
}

/** Zona visible del mapa, en el formato que usan las búsquedas por radio. */
export interface AreaMapa {
  centro: { lat: number; lng: number };
  /** Distancia del centro a una esquina: un círculo con este radio cubre lo visible. */
  radioMetros: number;
  zoom: number;
}

/** Datos que guarda el índice de agrupación por cada reporte. */
interface PropiedadesPunto {
  id: string;
}

/** Acercamiento máximo del mapa (el de los tiles de OpenStreetMap). */
const ZOOM_MAXIMO = 19;

/**
 * Radio de agrupación en píxeles de pantalla. Con 60 px dos pines se unen
 * cuando sus centros quedan a menos de un dedo de distancia, que es justo
 * cuando dejan de poder tocarse por separado.
 */
const RADIO_AGRUPACION = 60;

/** Cuántos reportes muestra como máximo la lista de un grupo inseparable. */
const MAXIMO_EN_LISTA = 50;

/**
 * CA-51 · Componente de mapa basado en Leaflet + OpenStreetMap.
 *
 * Pieza compartida: la usan los módulos de reportes, cercanos y mapa de
 * incidencias. Se importa desde `compartido/mapa`, nunca desde la ruta del
 * archivo, para poder moverlo sin tocar a quienes lo usan.
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
  /**
   * Agrupa los reportes cercanos en un círculo con el total. Al tocarlo, el
   * mapa se acerca hasta que el grupo se separa. Activado por defecto.
   */
  readonly agrupar = input(true);

  /** Emite el id del marcador seleccionado. */
  readonly markerSelected = output<string>();

  /**
   * Emite la zona visible cada vez que el mapa termina de moverse o de
   * acercarse, también por código. La pantalla decide si buscar ahí.
   */
  readonly areaCambiada = output<AreaMapa>();

  /**
   * Si se entrega, el popup de cada marcador muestra el enlace "Ver historial
   * de estados" y usa esta función para cargarlo. La carga ocurre solo al
   * pulsar el enlace, nunca al abrir el mapa ni el popup.
   */
  readonly cargarHistorial = input<((id: string) => Promise<EventoHistorial[]>) | null>(null);

  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);

  private readonly mapContainer =
    viewChild.required<ElementRef<HTMLDivElement>>('mapContainer');

  private map: L.Map | null = null;
  private marker: L.Marker | null = null;
  private capaMarcadores: L.LayerGroup | null = null;
  /** Índice espacial de los reportes; null si no hay reportes o no se agrupa. */
  private indice: Supercluster<PropiedadesPunto> | null = null;
  private readonly reportesPorId = new Map<string, MapMarker>();
  /**
   * Los pines individuales se crean una vez y se reutilizan al mover el mapa.
   * Recrearlos en cada movimiento cerraría el popup abierto: Leaflet desplaza
   * el mapa al abrir un popup y eso dispara un nuevo cálculo de grupos.
   */
  private readonly pines = new Map<string, L.Marker>();
  /** Círculos de grupo visibles, por id de grupo. */
  private readonly grupos = new Map<number, L.Marker>();
  private readonly alMoverMapa = () => this.renderizarGrupos();
  private readonly alTerminarMovimiento = () => this.emitirArea();
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
      this.agrupar();

      if (this.map) {
        this.dibujarMarcadores(marcadores);
      }
    });

    /**
     * v2-D12 · `zoom` e `interactive` solo se aplicaban al inicializar, así que
     * cambiarlos en caliente no tenía efecto: Leaflet conservaba el arrastre y
     * el nivel de acercamiento originales.
     */
    effect(() => {
      const nivel = this.zoom();

      if (this.map && this.map.getZoom() !== nivel) {
        this.map.setZoom(nivel);
      }
    });

    effect(() => {
      const interactivo = this.interactive();

      if (!this.map) {
        return;
      }

      if (interactivo) {
        this.map.dragging.enable();
        this.map.scrollWheelZoom.enable();
        this.map.touchZoom.enable();
      } else {
        this.map.dragging.disable();
        this.map.scrollWheelZoom.disable();
        this.map.touchZoom.disable();
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
    this.indice = null;
    this.pines.clear();
    this.grupos.clear();
    this.reportesPorId.clear();
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
        maxZoom: ZOOM_MAXIMO,
        zoomControl: this.interactive(),
        dragging: this.interactive(),
        scrollWheelZoom: this.interactive(),
        attributionControl: true,
      });

      // Recalcula los grupos al terminar de mover o acercar, y cuando el
      // contenedor cambia de tamaño (Ionic lo monta con altura 0 al principio).
      this.map.on('moveend resize', this.alMoverMapa);
      this.map.on('moveend', this.alTerminarMovimiento);

      const capa = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: ZOOM_MAXIMO,
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

  private emitirArea(): void {
    const mapa = this.map;

    if (!mapa) {
      return;
    }

    const centro = mapa.getCenter();
    const radio = Math.round(mapa.distance(centro, mapa.getBounds().getNorthEast()));

    // Con el contenedor todavía sin altura la zona es un punto: no sirve.
    if (radio < 1) {
      return;
    }

    this.areaCambiada.emit({
      centro: { lat: centro.lat, lng: centro.lng },
      radioMetros: radio,
      zoom: mapa.getZoom(),
    });
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
    this.capaMarcadores = null;
    this.indice = null;
    this.pines.clear();
    this.grupos.clear();
    this.reportesPorId.clear();

    if (marcadores.length === 0) {
      return;
    }

    for (const marcador of marcadores) {
      this.reportesPorId.set(marcador.id, marcador);
    }

    this.capaMarcadores = L.layerGroup().addTo(this.map);

    if (!this.agrupar()) {
      for (const marcador of marcadores) {
        this.capaMarcadores.addLayer(this.pinDe(marcador));
      }
      return;
    }

    /**
     * Supercluster agrupa por distancia en pantalla para cada nivel de zoom y
     * responde en milisegundos aun con miles de puntos. `maxZoom` igual al del
     * mapa hace que dos reportes en el mismo lugar sigan agrupados con el
     * acercamiento máximo; en ese caso el grupo muestra una lista.
     */
    this.indice = new Supercluster<PropiedadesPunto>({
      radius: RADIO_AGRUPACION,
      maxZoom: ZOOM_MAXIMO,
      minPoints: 2,
    });
    this.indice.load(
      marcadores.map((marcador) => ({
        type: 'Feature' as const,
        properties: { id: marcador.id },
        geometry: { type: 'Point' as const, coordinates: [marcador.lng, marcador.lat] },
      })),
    );

    this.renderizarGrupos();
  }

  /**
   * Muestra los grupos y pines que corresponden al zoom y al área actuales.
   * Solo agrega o quita lo que cambió, para no parpadear ni cerrar popups.
   */
  private renderizarGrupos(): void {
    const mapa = this.map;
    const indice = this.indice;
    const capa = this.capaMarcadores;

    if (!mapa || !indice || !capa) {
      return;
    }

    // Un margen alrededor de lo visible evita que los pines aparezcan de golpe
    // en el borde al arrastrar.
    const area = mapa.getBounds().pad(0.25);
    const zoom = Math.round(mapa.getZoom());
    const elementos = indice.getClusters(
      [area.getWest(), area.getSouth(), area.getEast(), area.getNorth()],
      zoom,
    );

    const gruposVisibles = new Set<number>();
    const pinesVisibles = new Set<string>();

    for (const elemento of elementos) {
      const [lng, lat] = elemento.geometry.coordinates;
      const propiedades = elemento.properties;

      if ('cluster' in propiedades && propiedades.cluster) {
        const idGrupo = propiedades.cluster_id;
        gruposVisibles.add(idGrupo);

        if (!this.grupos.has(idGrupo)) {
          const grupo = this.grupoDe(idGrupo, propiedades.point_count, lat, lng);
          this.grupos.set(idGrupo, grupo);
          capa.addLayer(grupo);
        }
        continue;
      }

      const id = (propiedades as PropiedadesPunto).id;
      const datos = this.reportesPorId.get(id);

      if (!datos) {
        continue;
      }

      pinesVisibles.add(id);
      let pin = this.pines.get(id);

      if (!pin) {
        pin = this.pinDe(datos);
        this.pines.set(id, pin);
      }

      if (!capa.hasLayer(pin)) {
        capa.addLayer(pin);
      }
    }

    for (const [idGrupo, grupo] of this.grupos) {
      if (!gruposVisibles.has(idGrupo)) {
        capa.removeLayer(grupo);
        this.grupos.delete(idGrupo);
      }
    }

    for (const [id, pin] of this.pines) {
      if (!pinesVisibles.has(id) && capa.hasLayer(pin)) {
        capa.removeLayer(pin);
      }
    }
  }

  /** Círculo con el total de reportes de un grupo. */
  private grupoDe(idGrupo: number, cantidad: number, lat: number, lng: number): L.Marker {
    // El tamaño crece con la cantidad, como en los mapas de comercios.
    const diametro = cantidad < 10 ? 40 : cantidad < 50 ? 48 : 56;

    const burbuja = document.createElement('span');
    burbuja.className = 'grupo-incidencias__burbuja';
    burbuja.textContent = cantidad > 999 ? '999+' : String(cantidad);
    burbuja.style.width = `${diametro}px`;
    burbuja.style.height = `${diametro}px`;

    const icono = L.divIcon({
      className: 'grupo-incidencias',
      html: burbuja,
      iconSize: [diametro, diametro],
      iconAnchor: [diametro / 2, diametro / 2],
    });

    const grupo = L.marker([lat, lng], {
      icon: icono,
      title: `${cantidad} reportes en esta zona. Toca para acercar.`,
      keyboard: true,
      // Los grupos quedan sobre los pines sueltos que estén cerca.
      zIndexOffset: 1000,
    });

    grupo.on('click', () => this.abrirGrupo(idGrupo, lat, lng));
    return grupo;
  }

  /**
   * Acerca el mapa hasta el nivel en que el grupo se separa. Si sus reportes
   * están en el mismo punto y no se separan ni con el acercamiento máximo,
   * muestra la lista para elegir uno.
   */
  private abrirGrupo(idGrupo: number, lat: number, lng: number): void {
    const mapa = this.map;
    const indice = this.indice;

    if (!mapa || !indice) {
      return;
    }

    let zoomDestino: number;

    try {
      zoomDestino = indice.getClusterExpansionZoom(idGrupo);
    } catch {
      // El grupo ya no existe (cambiaron los filtros mientras se tocaba).
      return;
    }

    if (zoomDestino <= mapa.getMaxZoom()) {
      const sinAnimacion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

      if (sinAnimacion) {
        mapa.setView([lat, lng], zoomDestino);
      } else {
        mapa.flyTo([lat, lng], zoomDestino, { duration: 0.6 });
      }
      return;
    }

    L.popup({ className: 'popup-ciudad-alerta', maxWidth: 280, autoPan: true })
      .setLatLng([lat, lng])
      .setContent(this.construirListaDeGrupo(idGrupo))
      .openOn(mapa);
  }

  /** Lista de los reportes de un grupo que no se separa con el zoom. */
  private construirListaDeGrupo(idGrupo: number): HTMLElement {
    const hojas = this.indice?.getLeaves(idGrupo, MAXIMO_EN_LISTA) ?? [];

    const contenedor = document.createElement('div');
    contenedor.className = 'popup-ciudad-alerta__cuerpo';
    L.DomEvent.disableClickPropagation(contenedor);
    L.DomEvent.disableScrollPropagation(contenedor);

    const titulo = document.createElement('p');
    titulo.className = 'popup-ciudad-alerta__titulo';
    titulo.textContent = `${hojas.length} reportes en el mismo lugar`;

    const lista = document.createElement('ul');
    lista.className = 'popup-ciudad-alerta__lista';

    for (const hoja of hojas) {
      const datos = this.reportesPorId.get(hoja.properties.id);

      if (!datos) {
        continue;
      }

      const item = document.createElement('li');

      const punto = document.createElement('span');
      punto.className = 'popup-ciudad-alerta__punto';
      punto.style.background = datos.color;

      const texto = document.createElement('span');
      texto.className = 'popup-ciudad-alerta__texto';
      texto.textContent = datos.titulo;

      if (datos.destacado) {
        punto.classList.add('popup-ciudad-alerta__punto--destacado');
      }

      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'popup-ciudad-alerta__accion';
      boton.textContent = 'Ver detalle';
      boton.addEventListener('click', () => this.markerSelected.emit(datos.id));

      item.append(punto, texto, boton);
      lista.append(item);
    }

    contenedor.append(titulo, lista);
    return contenedor;
  }

  /** Pin de un reporte individual, con su popup. */
  private pinDe(marcador: MapMarker): L.Marker {
    /**
     * BUG 54 · El pin se construye con la API del DOM en vez de
     * interpolar el color dentro de una cadena HTML. Hoy el color viene de
     * una constante interna, pero así la ruta queda cerrada aunque mañana
     * llegue de otra parte.
     */
    const pin = document.createElement('span');
    pin.className = marcador.destacado
      ? 'marcador-incidencia__pin marcador-incidencia__pin--destacado'
      : 'marcador-incidencia__pin';
    pin.style.background = marcador.color;

    // El destacado es más grande y lleva una marca: se distingue sin color.
    const lado = marcador.destacado ? 26 : 20;
    const icono = L.divIcon({
      className: 'marcador-incidencia',
      html: pin,
      iconSize: [lado, lado],
      iconAnchor: [lado / 2, lado],
    });

    const marcadorLeaflet = L.marker([marcador.lat, marcador.lng], {
      icon: icono,
      title: marcador.titulo,
    });

    /**
     * v2-D1 · Antes el detalle se abría con el segundo toque, comprobando
     * `isPopupOpen()`. Leaflet abre el popup y dispara el click en el mismo
     * gesto, así que la comprobación ya era verdadera al primer toque y el
     * resumen nunca llegaba a verse. Ahora el popup se muestra al tocar y
     * lleva un botón explícito para abrir el detalle.
     */
    marcadorLeaflet.bindPopup(() => this.construirPopup(marcador, marcadorLeaflet), {
      closeButton: true,
      autoPan: true,
      className: 'popup-ciudad-alerta',
    });

    return marcadorLeaflet;
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

  /**
   * Construye el contenido del popup con la API del DOM, sin interpolar HTML:
   * los textos vienen de reportes de usuarios y se asignan con textContent.
   */
  private construirPopup(marcador: MapMarker, capa: L.Marker): HTMLElement {
    const contenedor = document.createElement('div');
    contenedor.className = 'popup-ciudad-alerta__cuerpo';

    // Sin esto, desplazar la línea de tiempo con el dedo movería el mapa, y un
    // toque dentro del popup podría cerrarlo.
    L.DomEvent.disableClickPropagation(contenedor);
    L.DomEvent.disableScrollPropagation(contenedor);

    const titulo = document.createElement('p');
    titulo.className = 'popup-ciudad-alerta__titulo';
    titulo.textContent = marcador.titulo;

    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'popup-ciudad-alerta__accion';
    boton.textContent = 'Ver detalle';
    boton.addEventListener('click', () => this.markerSelected.emit(marcador.id));

    contenedor.append(titulo, boton);

    const cargador = this.cargarHistorial();

    if (cargador) {
      contenedor.append(this.construirSeccionHistorial(marcador.id, cargador, capa));
    }

    return contenedor;
  }

  private construirSeccionHistorial(
    id: string,
    cargador: (id: string) => Promise<EventoHistorial[]>,
    capa: L.Marker,
  ): HTMLElement {
    const seccion = document.createElement('div');
    seccion.className = 'popup-ciudad-alerta__historial';

    const enlace = document.createElement('button');
    enlace.type = 'button';
    enlace.className = 'popup-ciudad-alerta__enlace';
    enlace.textContent = 'Ver historial de estados';

    const zona = document.createElement('div');
    zona.className = 'popup-ciudad-alerta__linea';
    zona.setAttribute('aria-live', 'polite');

    enlace.addEventListener('click', async () => {
      enlace.remove();
      zona.textContent = 'Cargando…';
      capa.getPopup()?.update();

      try {
        const eventos = await cargador(id);
        zona.replaceChildren(this.construirLineaDeTiempo(eventos));
      } catch {
        zona.textContent = 'No se pudo cargar el historial de cambios.';
      }

      // El contenido cambió de alto: se recalcula la posición del popup.
      capa.getPopup()?.update();
    });

    seccion.append(enlace, zona);
    return seccion;
  }

  private construirLineaDeTiempo(eventos: EventoHistorial[]): HTMLElement {
    const lista = document.createElement('ol');
    lista.className = 'linea-tiempo';

    for (const evento of eventos) {
      const item = document.createElement('li');
      item.className = 'linea-tiempo__evento';

      const fecha = document.createElement('span');
      fecha.className = 'linea-tiempo__fecha';
      fecha.textContent = evento.fecha
        ? evento.fecha.toLocaleString('es-CL', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'Fecha no disponible';

      const estado = document.createElement('strong');
      estado.className = 'linea-tiempo__estado';
      estado.textContent = evento.desde
        ? `${ETIQUETAS_ESTADO[evento.desde] ?? evento.desde} → ${ETIQUETAS_ESTADO[evento.hacia] ?? evento.hacia}`
        : ETIQUETAS_ESTADO[evento.hacia] ?? evento.hacia;

      const autor = document.createElement('span');
      autor.className = 'linea-tiempo__autor';
      autor.textContent = evento.autor;

      item.append(fecha, estado, autor);

      if (evento.comentario) {
        const comentario = document.createElement('p');
        comentario.className = 'linea-tiempo__comentario';
        comentario.textContent = evento.comentario;
        item.append(comentario);
      }

      lista.append(item);
    }

    return lista;
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
