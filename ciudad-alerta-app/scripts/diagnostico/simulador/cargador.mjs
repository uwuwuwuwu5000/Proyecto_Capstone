/** Gancho de resolución de módulos de Node (ver registrar.mjs). */
const REEMPLAZOS = {
  'firebase/firestore': new URL('./firestore.mjs', import.meta.url).href,
  '@firebase/rules-unit-testing': new URL('./rules-unit-testing.mjs', import.meta.url).href,
};

export async function resolve(especificador, contexto, siguiente) {
  if (REEMPLAZOS[especificador]) return { url: REEMPLAZOS[especificador], shortCircuit: true };
  return siguiente(especificador, contexto);
}
