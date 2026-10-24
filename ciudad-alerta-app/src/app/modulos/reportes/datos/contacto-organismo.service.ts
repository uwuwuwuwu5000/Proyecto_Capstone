import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc } from 'firebase/firestore';
import { correoValido, enlaceTelefono } from '@ciudad-alerta/comun';

import { FIRESTORE } from '../../../core/firebase.providers';
import { OperadorDoc } from '../../../models/organismo.model';

/** Cómo contactar a quien atiende un reporte. */
export interface ContactoOrganismo {
  /** `tel:` listo para el enlace, o null. */
  telefono: string | null;
  /** El número tal como lo escribió el organismo, para mostrarlo. */
  telefonoVisible: string | null;
  correo: string | null;
  direccion: string | null;
}

/**
 * Datos de contacto del operador asignado a un reporte (`operadores/{id}`).
 * Los escribe un administrador desde el portal (Operadores); cualquier cuenta
 * con sesión puede leerlos. Se guardan en memoria: cambian poco.
 */
@Injectable({ providedIn: 'root' })
export class ContactoOrganismoService {
  private readonly firestore = inject<Firestore>(FIRESTORE);
  private readonly cache = new Map<string, Promise<ContactoOrganismo | null>>();

  /** null si el reporte no tiene operador, el operador no existe o no está activo. */
  deOperador(operadorId: string | null | undefined): Promise<ContactoOrganismo | null> {
    if (!operadorId) return Promise.resolve(null);

    let lectura = this.cache.get(operadorId);
    if (!lectura) {
      lectura = this.leer(operadorId).catch((error: unknown) => {
        this.cache.delete(operadorId);
        throw error;
      });
      this.cache.set(operadorId, lectura);
    }
    return lectura;
  }

  private async leer(operadorId: string): Promise<ContactoOrganismo | null> {
    const snapshot = await getDoc(doc(this.firestore, 'operadores', operadorId));
    if (!snapshot.exists()) return null;

    return contactoDeOperador(snapshot.data() as OperadorDoc);
  }
}

/** Lo que se muestra de un operador: null si está inactivo. */
export function contactoDeOperador(operador: Partial<OperadorDoc>): ContactoOrganismo | null {
  if (operador.activo === false) return null;

  const telefono = enlaceTelefono(operador.telefonoContacto);
  return {
    telefono,
    telefonoVisible: telefono ? (operador.telefonoContacto ?? '').trim() : null,
    correo: correoValido(operador.correoContacto),
    direccion: operador.direccionContacto?.trim() || null,
  };
}
