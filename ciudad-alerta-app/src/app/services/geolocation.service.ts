import { Injectable } from '@angular/core';
import { Geolocation } from '@capacitor/geolocation';

import { GeoPoint } from '../models/report.model';

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
  async requestPermission(): Promise<boolean> {
    try {
      const estado = await Geolocation.checkPermissions();

      if (estado.location === 'granted') {
        return true;
      }

      if (estado.location === 'denied') {
        return false;
      }

      const solicitado = await Geolocation.requestPermissions({
        permissions: ['location'],
      });

      return solicitado.location === 'granted';
    } catch {
      // En navegador `checkPermissions` puede no estar disponible; en ese caso
      // el propio getCurrentPosition dispara el diálogo del navegador.
      return true;
    }
  }

  /** Obtiene las coordenadas actuales. Lanza LocationError si no es posible. */
  async getCurrentPosition(): Promise<GeoPoint> {
    const autorizado = await this.requestPermission();

    if (!autorizado) {
      throw new LocationError(
        'Sin permiso de ubicación no podemos situar el reporte en el mapa. Puedes activarlo en los ajustes del teléfono.',
        'denegado',
      );
    }

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
    const mensaje = error instanceof Error ? error.message.toLowerCase() : '';

    if (mensaje.includes('denied') || mensaje.includes('permission')) {
      return new LocationError(
        'El permiso de ubicación está denegado. Actívalo en los ajustes del teléfono para continuar.',
        'denegado',
      );
    }

    if (mensaje.includes('timeout')) {
      return new LocationError(
        'La señal GPS está tardando demasiado. Muévete a un lugar despejado e intenta otra vez.',
        'timeout',
      );
    }

    if (mensaje.includes('unavailable') || mensaje.includes('disabled')) {
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
