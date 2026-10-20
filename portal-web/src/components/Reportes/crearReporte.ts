// Creación de un reporte desde el portal (solo administradores).
//
// Escribe el mismo documento que la app móvil (createReport en
// report.service.ts de main-mobile), para que pase la misma regla de creación
// y el resto del sistema no distinga su origen salvo por el campo `origen`.
//
// La fotografía es opcional y llega ya difuminada (privacidad/privacidad.ts):
// la regla fotoProtegida() exige `foto.privacidad.aplicada`. Se guarda igual
// que en la app: imagen en `reportPhotos/{id}` y referencia en `reports/{id}`,
// las dos en un mismo lote para que no quede una sin la otra.
import { collection, doc, getDoc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore'
import { FirebaseError } from 'firebase/app'
import { geohashForLocation } from 'geofire-common'
import { db } from '../../firebase/config'
import type { FotoProtegida } from '../../privacidad/privacidad'
import { LIMITE_DATA_URL } from '../../privacidad/comprimir'
import { calcularAsignacion } from './asignacion'
import type { Punto } from './asignacion'

/** Mismos límites que descripcionValida() en firestore.rules. */
export const DESCRIPCION_MIN = 10
export const DESCRIPCION_MAX = 500

/** Igual que intervaloMinimoMs() en firestore.rules. */
const INTERVALO_MINIMO_MS = 30_000

/** Marca de los reportes creados desde el panel de administración. */
export const ORIGEN_PORTAL_ADMIN = 'portal_admin'

export interface NuevoReporteAdmin {
  uid: string
  punto: Punto
  categoria: string
  descripcion: string
  /** Foto ya difuminada; sin ella el reporte se crea sin imagen. */
  foto?: FotoProtegida | null
}

export async function crearReporteAdmin(datos: NuevoReporteAdmin): Promise<string> {
  const descripcion = datos.descripcion.trim()
  if (descripcion.length < DESCRIPCION_MIN || descripcion.length > DESCRIPCION_MAX) {
    throw new Error(`La descripción debe tener entre ${DESCRIPCION_MIN} y ${DESCRIPCION_MAX} caracteres.`)
  }

  // El perfil aporta el control de frecuencia y el nombre del autor.
  const perfil = (await getDoc(doc(db, 'users', datos.uid))).data()

  const ultimo = perfil?.ultimoReporteAt
  if (typeof ultimo?.toMillis === 'function') {
    const espera = INTERVALO_MINIMO_MS - (Date.now() - ultimo.toMillis())
    if (espera > 0) {
      throw new Error(`Espera ${Math.ceil(espera / 1000)} s antes de crear otro reporte.`)
    }
  }

  // Se recalcula al guardar, aunque la pantalla ya la mostró: un organismo u
  // operador pudo cambiar mientras se llenaba el formulario.
  const { comuna, organismo, operadorId } = await calcularAsignacion(datos.punto, datos.categoria)

  if (datos.foto) {
    if (!datos.foto.privacidad.aplicada) {
      throw new Error('La fotografía no pasó por el difuminado de privacidad.')
    }
    if (datos.foto.dataUrl.length > LIMITE_DATA_URL) {
      throw new Error('La fotografía es demasiado pesada. Elige otra.')
    }
  }

  const referencia = doc(collection(db, 'reports'))

  const reporte: Record<string, unknown> = {
    uid: datos.uid,
    descripcion,
    categoria: datos.categoria,
    ubicacion: { lat: datos.punto.lat, lng: datos.punto.lng },
    comuna: comuna.comuna,
    region: comuna.region,
    comunaFuente: comuna.fuente,
    foto: datos.foto
      ? {
          kind: 'firestore',
          path: `reportPhotos/${referencia.id}`,
          url: null,
          mimeType: datos.foto.mimeType,
          sizeBytes: datos.foto.sizeBytes,
          privacidad: datos.foto.privacidad,
        }
      : null,
    estado: 'reportado',
    confirmaciones: 0,
    organismo,
    operadorId,
    geohash: geohashForLocation([datos.punto.lat, datos.punto.lng]),
    // El portal no calcula el vector de la foto (detección de duplicados del móvil).
    embedding: null,
    origen: ORIGEN_PORTAL_ADMIN,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  // La regla exige que el nombre sea exactamente el displayName del perfil.
  // Sin displayName se omite (la regla lo permite): inventar uno la haría fallar.
  if (typeof perfil?.displayName === 'string' && perfil.displayName.trim()) {
    reporte.autorNombre = perfil.displayName.slice(0, 60)
  }

  try {
    const lote = writeBatch(db)
    lote.set(referencia, reporte)
    if (datos.foto) {
      lote.set(doc(db, 'reportPhotos', referencia.id), {
        reportId: referencia.id,
        ownerUid: datos.uid,
        dataUrl: datos.foto.dataUrl,
        mimeType: datos.foto.mimeType,
        sizeBytes: datos.foto.sizeBytes,
        createdAt: serverTimestamp(),
      })
    }
    await lote.commit()
  } catch (err) {
    console.error('Error al crear el reporte:', err)
    if (err instanceof FirebaseError && err.code === 'permission-denied') {
      throw new Error('Firestore rechazó el reporte. Revisa que la categoría siga activa y vuelve a intentarlo.')
    }
    throw new Error('No se pudo crear el reporte. Inténtalo nuevamente.')
  }

  // Para el control de frecuencia. El reporte ya existe: si esto falla no se revierte.
  void updateDoc(doc(db, 'users', datos.uid), {
    ultimoReporteAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }).catch(() => undefined)

  return referencia.id
}
