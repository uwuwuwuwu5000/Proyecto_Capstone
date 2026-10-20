// Carga de TensorFlow.js y elección del backend, una sola vez. Portado de
// core/tensorflow.ts de la app móvil.
import type * as TF from '@tensorflow/tfjs-core'

let preparacion: Promise<typeof TF> | null = null

/**
 * Carga TensorFlow.js con WebGL; si no es usable (se prueba con una
 * convolución, el tipo de operación que usan los modelos), usa la CPU.
 */
export function prepararTensorflow(): Promise<typeof TF> {
  if (!preparacion) {
    preparacion = (async () => {
      const tf = await import('@tensorflow/tfjs-core')
      await import('@tensorflow/tfjs-converter')
      await import('@tensorflow/tfjs-backend-webgl')
      await import('@tensorflow/tfjs-backend-cpu')

      try {
        await tf.setBackend('webgl')
        await tf.ready()
        tf.tidy(() => {
          const entrada = tf.tensor4d(new Float32Array(1 * 8 * 8 * 3).fill(1), [1, 8, 8, 3])
          const filtro = tf.tensor4d(new Float32Array(3 * 3 * 3 * 4).fill(1), [3, 3, 3, 4])
          tf.conv2d(entrada, filtro, 1, 'same').dataSync()
        })
      } catch (error) {
        console.warn('TensorFlow: WebGL no es usable; se usa la CPU.', error)
        await tf.setBackend('cpu')
        await tf.ready()
      }
      return tf
    })().catch((error) => {
      // Permite reintentar en el próximo uso.
      preparacion = null
      throw error
    })
  }
  return preparacion
}

/**
 * Los paquetes de modelos de TensorFlow son CommonJS: con `import()` dinámico
 * sus funciones llegan en el nivel superior o envueltas en `default`. `clave`
 * es una función que debe existir en el módulo real.
 */
export function resolverModulo<T>(importado: unknown, clave: keyof T & string): T {
  const directo = importado as Record<string, unknown>
  if (typeof directo?.[clave] === 'function') return importado as T
  const envuelto = directo?.['default'] as Record<string, unknown> | undefined
  if (typeof envuelto?.[clave] === 'function') return envuelto as T
  throw new Error(`El paquete importado no expone la función "${clave}".`)
}
