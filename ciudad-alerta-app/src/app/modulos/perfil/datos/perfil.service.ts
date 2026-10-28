import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc } from 'firebase/firestore';

import { FIRESTORE } from '../../../core/firebase.providers';
import { OperadorDoc, OrganismoDoc } from '../../../models/organismo.model';

/**
 * Datos complementarios de «Mi perfil». El perfil en sí lo lee AuthService,
 * que es de toda la app; aquí va lo que solo muestra esta pantalla.
 */
@Injectable({ providedIn: 'root' })
export class PerfilService {
  private readonly firestore = inject<Firestore>(FIRESTORE);

  /**
   * Nombre del organismo al que pertenece un operador ("Municipalidad de
   * Maipú"); null si el operador no existe, no tiene organismo o no hay red.
   * Las reglas permiten leer `operadores` y `organismos` con sesión iniciada.
   */
  async organismoDeOperador(operadorId: string): Promise<string | null> {
    try {
      const operador = await getDoc(doc(this.firestore, 'operadores', operadorId));
      const organismoId = (operador.data() as OperadorDoc | undefined)?.organismoId;
      if (!organismoId) return null;

      return this.nombreDeOrganismo(organismoId);
    } catch {
      return null;
    }
  }

  /** 1.2 · Nombre de un organismo del catálogo (el de una cuenta de organismo). */
  async nombreDeOrganismo(organismoId: string): Promise<string | null> {
    try {
      const organismo = await getDoc(doc(this.firestore, 'organismos', organismoId));
      return (organismo.data() as OrganismoDoc | undefined)?.nombre ?? null;
    } catch {
      return null;
    }
  }
}
