import { Injectable } from '@angular/core';
import { Geolocation } from '@capacitor/geolocation';

import { GeoPoint } from '../models/report.model';

/**
 * v2-E4 · Antes `requestPermission` devolvía `true` en el catch, así que un
 * fallo del sistema era indistinguible de un permiso concedido y el flujo
 * seguía hasta fallar más adelante con un mensaje confuso.
 */
export type EstadoPermiso = 'concedido' | 'denegado' | 'error';

export class LocationError extends Error {
  constructor(
    override readonly message: string,
    readonly code: 'denegado' | 'no_disponible' | 'timeout' | 'desconocido',
  ) {
    super(message);
    this.name = 'LocationError';
  }
}

@Injectable({ providedIn: 'root' })
export class GeolocationService {
  /**
   * Solicita el permiso de ubicación solo cuando el usuario va a usar la
   * funcionalidad, nunca al arrancar la app.
   */
  async requestPermission(): Promise<EstadoPermiso> {
    try {
      const estado = await Geolocation.checkPermissions();

      if (estado.location === 'granted') {
        return 'concedido';
      }

      if (estado.location === 'denied') {
        return 'denegado';
      }

      const solicitado = await Geolocation.requestPermissions({
        permissions: ['location'],
      });

      return solicitado.location === 'granted' ? 'concedido' : 'denegado';
    } catch {
      // En navegador `checkPermissions` no siempre está implementado. No es un
      // rechazo: se deja que getCurrentPosition dispare el diálogo nativo.
      return 'error';
    }
  }

  /** Obtiene las coordenadas actuales. Lanza LocationError si no es posible. */
  async getCurrentPosition(): Promise<GeoPoint> {
    const permiso = await this.requestPermission();

    if (permiso === 'denegado') {
      throw new LocationError(
        'Sin permiso de ubicación no podemos situar el reporte en el mapa. Puedes activarlo en los ajustes del teléfono.',
        'denegado',
      );
    }

    // Con 'error' se continúa: el navegador pedirá el permiso por su cuenta y,
    // si algo falla de verdad, getCurrentPosition lo reportará con detalle.

    try {
      const posicion = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });

      return {
        lat: posicion.coords.latitude,
        lng: posicion.coords.longitude,
        accuracy: Math.round(posicion.coords.accuracy ?? 0),
      };
    } catch (error) {
      throw this.traducirError(error);
    }
  }

  private traducirError(error: unknown): LocationError {
    // En Android llega un Error de Capacitor; en el navegador (ionic serve),
    // un GeolocationPositionError, que no es Error pero trae message y code
    // (1 permiso, 2 sin señal, 3 tiempo). Antes ese caso caía siempre en
    // «No pudimos obtener tu ubicación», aunque fuera un permiso denegado.
    const datos = (typeof error === 'object' && error !== null ? error : {}) as { message?: unknown; code?: unknown };
    const mensaje = typeof datos.message === 'string' ? datos.message.toLowerCase() : '';
    const codigo = typeof datos.code === 'number' ? datos.code : null;

    if (codigo === 1 || mensaje.includes('denied') || mensaje.includes('permission')) {
      return new LocationError(
        'El permiso de ubicación está denegado. Actívalo en los ajustes del teléfono para continuar.',
        'denegado',
      );
    }

    if (codigo === 3 || mensaje.includes('timeout')) {
      return new LocationError(
        'La señal GPS está tardando demasiado. Muévete a un lugar despejado e intenta otra vez.',
        'timeout',
      );
    }

    if (codigo === 2 || mensaje.includes('unavailable') || mensaje.includes('disabled')) {
      return new LocationError(
        'El servicio de ubicación no está disponible. Revisa que el GPS esté encendido.',
        'no_disponible',
      );
    }

    return new LocationError(
      'No pudimos obtener tu ubicación. Intenta nuevamente en unos segundos.',
      'desconocido',
    );
  }
}
