/**
 * Descarga los modelos de privacidad y los deja dentro de la app.
 *
 *   node scripts/descargar-modelos-privacidad.mjs
 *
 * Con los modelos en src/assets/models/, la protección de fotos no depende de
 * servidores externos en el teléfono: funciona sin conexión desde el primer
 * uso y no se ve afectada por la redirección de tfhub.dev.
 *
 * Garantías de esta versión:
 *  - Cada archivo de pesos se valida contra el tamaño que declara el propio
 *    modelo, antes de escribir nada.
 *  - `model.json` se escribe al final, y solo si todo lo anterior salió bien.
 *    La versión anterior lo escribía primero: si un archivo de pesos fallaba,
 *    quedaba un modelo incompleto que la app intentaba usar.
 *
 * Requiere Node 18 o superior (usa fetch nativo).
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

const MODELOS = [
  {
    nombre: 'Detector de personas (COCO-SSD lite)',
    carpeta: 'src/assets/models/coco-ssd',
    modelo: 'https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/model.json',
    pesos: (archivo) =>
      `https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/${archivo}`,
  },
  {
    nombre: 'Detector de rostros (MediaPipe full)',
    carpeta: 'src/assets/models/face-detection',
    modelo: 'https://tfhub.dev/mediapipe/tfjs-model/face_detection/full/1/model.json?tfjs-format=file',
    pesos: (archivo) =>
      `https://tfhub.dev/mediapipe/tfjs-model/face_detection/full/1/${archivo}?tfjs-format=file`,
  },
];

/** Bytes por valor según el tipo de dato, o el de la cuantización si la hay. */
const BYTES_POR_TIPO = { float32: 4, int32: 4, bool: 1, uint8: 1, uint16: 2, float16: 2 };

/** Tamaño en bytes que deben sumar los pesos de un grupo, según el manifiesto. */
function bytesEsperados(grupo) {
  return grupo.weights.reduce((total, peso) => {
    const valores = peso.shape.reduce((producto, dimension) => producto * dimension, 1);
    const tipo = peso.quantization?.dtype ?? peso.dtype;
    const porValor = BYTES_POR_TIPO[tipo];

    if (porValor === undefined) {
      throw new Error(`Tipo de dato no reconocido en el manifiesto: ${tipo}`);
    }

    return total + valores * porValor;
  }, 0);
}

async function descargar(url) {
  const respuesta = await fetch(url, { redirect: 'follow' });

  if (!respuesta.ok) {
    throw new Error(`HTTP ${respuesta.status} al descargar ${url}`);
  }

  const tipo = respuesta.headers.get('content-type') ?? '';

  // Un servidor que responde con una página de error con estado 200 es la
  // forma más silenciosa de terminar con pesos corruptos.
  if (tipo.includes('text/html')) {
    throw new Error(`Se recibió una página HTML en lugar de datos: ${url}`);
  }

  return Buffer.from(await respuesta.arrayBuffer());
}

let fallos = 0;

for (const definicion of MODELOS) {
  const destino = join(raiz, definicion.carpeta);
  console.log(`\n${definicion.nombre}`);

  try {
    // Se borra cualquier copia previa: si esta descarga falla, no debe quedar
    // un modelo a medias que la app intente usar.
    await rm(destino, { recursive: true, force: true });

    const contenidoModelo = await descargar(definicion.modelo);
    const modelo = JSON.parse(contenidoModelo.toString('utf8'));

    if (!Array.isArray(modelo.weightsManifest)) {
      throw new Error('La respuesta no es un modelo de TensorFlow.js válido.');
    }

    // 1. Descargar y validar todos los pesos en memoria.
    const archivos = [];

    for (const grupo of modelo.weightsManifest) {
      const partes = [];

      for (const ruta of grupo.paths) {
        partes.push({ ruta, datos: await descargar(definicion.pesos(ruta)) });
      }

      const recibidos = partes.reduce((total, parte) => total + parte.datos.length, 0);
      const esperados = bytesEsperados(grupo);

      if (recibidos !== esperados) {
        throw new Error(
          `Los pesos no cuadran: se esperaban ${esperados} bytes y se recibieron ${recibidos}.`,
        );
      }

      archivos.push(...partes);
    }

    // 2. Escribir los pesos.
    await mkdir(destino, { recursive: true });

    for (const { ruta, datos } of archivos) {
      await writeFile(join(destino, ruta), datos);
      console.log(`  ${ruta}  (${(datos.length / 1024).toFixed(0)} KB)`);
    }

    // 3. Escribir model.json al final: su presencia significa "modelo completo".
    await writeFile(join(destino, 'model.json'), contenidoModelo);
    console.log('  model.json');

    const total = archivos.reduce((suma, archivo) => suma + archivo.datos.length, 0);
    console.log(`  Verificado: ${archivos.length} archivos de pesos, ${(total / 1024).toFixed(0)} KB`);
  } catch (error) {
    fallos += 1;
    await rm(destino, { recursive: true, force: true });
    console.error(`  ERROR: ${error.message}`);
    console.error('  No se dejó copia local; la app usará el servidor externo para este modelo.');
  }
}

if (fallos > 0) {
  process.exitCode = 1;
} else {
  console.log('\nModelos verificados. Recompila: ionic build && npx cap sync android');
}
