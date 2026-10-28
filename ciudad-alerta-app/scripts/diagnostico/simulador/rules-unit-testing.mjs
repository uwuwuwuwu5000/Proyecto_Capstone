/**
 * Imitación de `@firebase/rules-unit-testing` para el simulador: mismas
 * funciones que usan reglas.mjs y reglas-ataques.mjs.
 */
import { FirestoreError, Simulador } from './firestore.mjs';
import { NoSimulado } from './interprete.mjs';

class EntornoDePrueba {
  constructor(reglas, projectId) {
    this.simulador = new Simulador(reglas);
    this.projectId = projectId;
  }

  authenticatedContext(uid, token = {}) {
    const claims = { sub: uid, user_id: uid, firebase: { sign_in_provider: 'custom', identities: {} }, ...token };
    return { firestore: () => this.simulador.instancia({ uid, token: claims }) };
  }

  unauthenticatedContext() {
    return { firestore: () => this.simulador.instancia(null) };
  }

  async withSecurityRulesDisabled(fn) {
    return fn({ firestore: () => this.simulador.instancia(null, true) });
  }

  async clearFirestore() {
    this.simulador.limpiar();
  }

  async cleanup() {}
}

export async function initializeTestEnvironment(opciones = {}) {
  const reglas = opciones.firestore?.rules;
  if (!reglas) throw new Error('initializeTestEnvironment: faltan las reglas (firestore.rules)');
  return new EntornoDePrueba(reglas, opciones.projectId ?? 'demo-simulador');
}

const esPermisoDenegado = (e) => {
  const code = String(e?.code ?? '').toLowerCase();
  const msg = String(e?.message ?? '').toLowerCase();
  return code === 'permission-denied' || msg.includes('permission_denied') || msg.includes('permission denied');
};

export async function assertSucceeds(promesa) {
  return promesa;
}

export async function assertFails(promesa) {
  try {
    await promesa;
  } catch (e) {
    if (e instanceof NoSimulado) throw e;
    if (!esPermisoDenegado(e)) throw new Error(`Expected PERMISSION_DENIED but got unexpected error: ${e}`);
    return e;
  }
  throw new Error('Expected request to fail, but it succeeded.');
}

export { FirestoreError };
