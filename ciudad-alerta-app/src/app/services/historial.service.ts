import { Injectable, inject } from '@angular/core';
import { Timestamp } from 'firebase/firestore';

import { RoutingService } from './routing.service';
import {
  EventoHistorial,
  NOMBRE_ADMINISTRACION,
  Report,
  StatusChange,
} from '../models/report.model';

/**
 * Línea de tiempo pública de un reporte.
 *
 * Arma, a partir del reporte y de su historial de estados, la secuencia que ve
 * cualquier usuario: la creación primero y luego cada cambio, del más antiguo
 * al más reciente.
 */
@Injectable({ providedIn: 'root' })
export class HistorialService {
  private readonly routingService = inject(RoutingService);

  /**
   * Carga y arma la línea de tiempo. Lanza error si el historial no se pudo
   * leer, para que la interfaz muestre el mensaje de fallo en lugar de una
   * línea de tiempo incompleta que parezca correcta.
   */
  async lineaDeTiempo(reporte: Report): Promise<EventoHistorial[]> {
    const cambios = await this.routingService.getStatusHistory(reporte.id);

    if (cambios === null) {
      throw new Error('No se pudo leer el historial de estados.');
    }

    // El nombre del ciudadano no se muestra: la línea de tiempo es pública.
    const creacion: EventoHistorial = {
      fecha: this.aFecha(reporte.createdAt),
      desde: null,
      hacia: 'reportado',
      autor: 'Creado por un ciudadano',
      comentario: null,
    };

    // getStatusHistory ya ordena por fecha ascendente.
    return [creacion, ...cambios.map((cambio) => this.aEvento(cambio))];
  }

  /**
   * Cómo se muestra quién hizo un cambio.
   *
   * El rol tiene prioridad sobre el nombre guardado: un cambio de un
   * administrador siempre se muestra como la administración, aunque el campo
   * de nombre traiga otra cosa. Las reglas validan el rol contra el perfil,
   * así que no puede falsificarse.
   */
  etiquetaAutor(cambio: Pick<StatusChange, 'autorRol' | 'autorNombre'>): string {
    if (cambio.autorRol === 'admin') {
      return NOMBRE_ADMINISTRACION;
    }

    const nombre = cambio.autorNombre?.trim();
    return nombre ? nombre : 'Autor no registrado';
  }

  aFecha(valor: unknown): Date | null {
    return valor instanceof Timestamp ? valor.toDate() : null;
  }

  formatear(fecha: Date | null): string {
    if (!fecha) {
      return 'Fecha no disponible';
    }

    return fecha.toLocaleString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private aEvento(cambio: StatusChange): EventoHistorial {
    const comentario = cambio.comentario?.trim();

    return {
      fecha: this.aFecha(cambio.createdAt),
      desde: cambio.desde,
      hacia: cambio.hacia,
      autor: this.etiquetaAutor(cambio),
      comentario: comentario ? comentario : null,
    };
  }
}
