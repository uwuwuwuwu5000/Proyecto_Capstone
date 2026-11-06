# DEF-002 · Solución propuesta (aplicada en la Fase 12)

**Defecto:** al cambiar de región en el mapa público (por ejemplo, de Metropolitana a Coquimbo) el mapa queda sin pines ni
círculos de grupo hasta que la persona mueve o acerca el mapa.

**Causa:** en `CapaAgrupada.tsx` los manejadores de `useMapEvents({ moveend, zoomend })` se crean de nuevo en cada render.
React-Leaflet los quita y los vuelve a poner en cada cambio. Al cambiar de región, `ControlEncuadre` reencuadra de zoom 8
a 13 (salto de más de 4 niveles: Leaflet no anima) y el evento `moveend` se dispara en el mismo instante en que los
manejadores no están puestos: se pierde y `vista` queda con el encuadre anterior, así que `getClusters` no devuelve nada.

**Cambio propuesto:** manejadores estables.

```tsx
const alMover = useMemo(
  () => ({
    moveend: () => setVista(leerVista(mapa)),
    zoomend: () => setVista(leerVista(mapa)),
  }),
  [mapa],
)
useMapEvents(alMover)
```

**Verificación:** E2E WB5 (con pines tras cambiar de región) y MS7 (P95 de carga con 500 reportes).

## Aplicada (Fase 12, 04-11-2026)

- `CapaAgrupada.tsx`: los manejadores de `useMapEvents` se crean una sola vez con `useMemo` (dependen solo del mapa). La causa documentada era la correcta: bastó ese cambio y no hizo falta la resincronización de respaldo que se había previsto.
- Pruebas: **WB1**, **MS7** (P95 de la carga con 500 reportes: 1,98 s, antes sin pines) y **WB9** (nueva: cambiar de región ida y vuelta muestra pines o grupos realmente visibles dentro del mapa cada vez). Evidencia: `Evidencia/e2e/fase12/`.
- Estado: **Abierto, pendiente de confirmar en el portal real** (decisión D27): cambiar de región y ver los pines sin mover el mapa. Se cierra cuando el equipo lo confirme tras desplegar.
