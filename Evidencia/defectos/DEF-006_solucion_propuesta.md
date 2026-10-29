# DEF-006 · Redirección al inicio al abrir directamente una pantalla de administración (CORREGIDO el 2026-10-29)

> Pendiente de registrar en la hoja «Lista de defectos» del plan de pruebas (DEF-003 a DEF-005 son las brechas de reglas CB-SEC-54 a 56).

**Qué pasa:** al cargar directamente una pantalla de administración (por ejemplo `/admin/operadores?sinCuenta=1`) con una sesión ya guardada,
a veces el portal redirige al inicio (`/`) aunque la cuenta sea administradora. Depende de la velocidad con que se descarga la pantalla
(se carga por partes) frente a la de leer el perfil de la cuenta, así que aparece de forma intermitente.

**Evidencia:** en el E2E completo de la Fase 0, 6 pruebas fallaron una vez (WK1, WK2, WK3, IN1, WA2, WA3) y de forma repetible
WO4, WO5, WK1 y WK2 al correr `catalogos.spec.ts`. Con la corrección propuesta aplicada de forma temporal, el E2E completo dio
92 de 95 (solo fallan los tres defectos ya registrados WB1, WB5 y MS7). Después se documentó el defecto y recién entonces se aplicó la corrección.

**Causa:** `portal-web/src/context/AuthContext.tsx`. `perfilCargando` empieza en `true`, pero el efecto que se ejecuta mientras aún no hay sesión
lo pone en `false`. Cuando llega la sesión, durante un render `user` ya existe, `loading` es `false` y `perfilCargando` sigue en `false`
con `perfil` en `null`. `useRequiereAdmin` (y los guardas parecidos) interpretan eso como «ya se resolvió y no es admin» y redirigen
al inicio antes de que se empiece a leer el perfil.

**Cambio aplicado:** que `perfilCargando` sea verdadero mientras haya sesión y el perfil de esa cuenta aún no haya llegado.

```ts
const [perfilUid, setPerfilUid] = useState<string | null>(null)
// en onSnapshot (éxito y error): setPerfilUid(user.uid)
// en el valor del contexto:
perfilCargando: perfilCargando || (!!user && perfilUid !== user.uid),
// y agregar perfilUid a las dependencias del useMemo
```

**Verificación:** prueba WX3 (`e2e/sesion.spec.ts`) NOK antes de la corrección (2 de 2 corridas) y OK después; E2E completo 93 de 96 OK (solo fallan WB1, WB5 y MS7). Evidencia: `Evidencia/defectos/DEF-006.png` (antes) y `Evidencia/e2e/fase0/e2e-portal.xml` (después).
