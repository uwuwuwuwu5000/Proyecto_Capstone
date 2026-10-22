import { crearVerificador } from './autenticacion';
import { leerConfiguracion } from './configuracion';
import { proteger } from './difuminar';
import { Modelos, cargarModelos } from './modelos';
import { crearServidor } from './servidor';

/**
 * Servicio de privacidad de Ciudad Alerta.
 *
 *   POST /v1/proteger   foto (image/jpeg) + Authorization: Bearer <token de Firebase>
 *                       → foto con rostros y personas difuminados, datos de
 *                         privacidad y vector para duplicados
 *   GET  /salud         estado; la app lo llama para «despertar» el servicio
 *
 * No guarda las fotos: las procesa en memoria y las devuelve.
 */
const config = leerConfiguracion();

let modelos: Modelos | null = null;
let errorModelos: string | null = null;
const carga = cargarModelos(config.carpetaModelos, config.mobilenet).then(
  (cargados) => {
    modelos = cargados;
    console.info(`Modelos listos (backend ${cargados.backend}, rostros ${cargados.conRostros}, similitud ${cargados.conSimilitud}).`);
    return cargados;
  },
  (error: unknown) => {
    errorModelos = error instanceof Error ? error.message : String(error);
    console.error('No se pudieron cargar los modelos.', error);
    throw error;
  },
);

const servidor = crearServidor({
  config,
  verificar: crearVerificador(config.proyectoFirebase),
  procesar: async (foto) => proteger(foto, await carga),
  estado: () => ({
    listo: modelos !== null,
    rostros: modelos?.conRostros ?? false,
    similitud: modelos?.conSimilitud ?? false,
    backend: modelos?.backend ?? null,
    error: errorModelos,
  }),
});

servidor.listen(config.puerto, () => {
  console.info(`Servicio de privacidad escuchando en el puerto ${config.puerto} (proyecto ${config.proyectoFirebase}).`);
});

for (const senal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(senal, () => servidor.close(() => process.exit(0)));
}
