import type * as TF from '@tensorflow/tfjs-core';

let preparacion: Promise<typeof TF> | null = null;

/**
 * Carga TensorFlow.js y elige el backend una sola vez para toda la app.
 *
 * Lo usan la protección de privacidad y la detección de duplicados. Antes cada
 * uno activaba WebGL por su cuenta, y el segundo podía volver a encender un
 * backend que el primero ya había descartado por no funcionar.
 *
 * En muchas WebView de Android, WebGL se activa sin error pero falla al
 * ejecutar operaciones. Por eso se ejecuta una convolución de prueba —el tipo
 * de operación que usan estos modelos— y, si falla, se usa la CPU.
 */
export function prepararTensorflow(): Promise<typeof TF> {
  if (!preparacion) {
    preparacion = (async () => {
      const tf = await import('@tensorflow/tfjs-core');
      await import('@tensorflow/tfjs-converter');
      await import('@tensorflow/tfjs-backend-webgl');
      await import('@tensorflow/tfjs-backend-cpu');

      try {
        await tf.setBackend('webgl');
        await tf.ready();

        tf.tidy(() => {
          // `tensor4d` fija el rango en el tipo: conv2d exige tensores de
          // rango 4 y `ones` devuelve un rango genérico.
          const entrada = tf.tensor4d(new Float32Array(1 * 8 * 8 * 3).fill(1), [1, 8, 8, 3]);
          const filtro = tf.tensor4d(new Float32Array(3 * 3 * 3 * 4).fill(1), [3, 3, 3, 4]);
          tf.conv2d(entrada, filtro, 1, 'same').dataSync();
        });
      } catch (error) {
        console.warn('TensorFlow: WebGL no es usable en este dispositivo; se usa la CPU.', error);
        await tf.setBackend('cpu');
        await tf.ready();
      }

      console.info(`TensorFlow: backend ${tf.getBackend()}.`);
      return tf;
    })().catch((error) => {
      // Permite reintentar en el próximo uso.
      preparacion = null;
      throw error;
    });
  }

  return preparacion;
}

/**
 * Obtiene las funciones de un paquete importado con `import()` dinámico.
 *
 * Los paquetes de modelos de TensorFlow (coco-ssd, mobilenet,
 * face-detection) se publican en formato CommonJS. Al cargarlos
 * dinámicamente, el empaquetador de Angular puede entregar sus funciones en
 * el nivel superior del módulo o envueltas en una propiedad `default`, según
 * cómo resuelva cada paquete. Sin esta normalización, el código fallaba con
 * "t.load is not a function": buscaba `load` donde no estaba.
 *
 * `clave` es el nombre de una función que debe existir en el módulo real, y
 * sirve para decidir cuál de las dos formas es la correcta.
 */
export function resolverModulo<T>(importado: unknown, clave: keyof T & string): T {
  const directo = importado as Record<string, unknown>;

  if (typeof directo?.[clave] === 'function') {
    return importado as T;
  }

  const envuelto = directo?.['default'] as Record<string, unknown> | undefined;

  if (typeof envuelto?.[clave] === 'function') {
    return envuelto as T;
  }

  throw new Error(`El paquete importado no expone la función "${clave}".`);
}
