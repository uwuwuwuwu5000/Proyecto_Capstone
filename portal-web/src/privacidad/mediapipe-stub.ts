// @mediapipe/face_detection no publica un módulo ESM utilizable y el
// empaquetador falla al resolverlo. Solo lo usa el runtime 'mediapipe' de
// face-detection; el portal usa el runtime 'tfjs', así que este sustituto
// nunca se ejecuta (vite.config.ts lo enlaza en su lugar).
export class FaceDetection {
  constructor() {
    throw new Error('El runtime "mediapipe" no está disponible; se usa "tfjs".')
  }
}
