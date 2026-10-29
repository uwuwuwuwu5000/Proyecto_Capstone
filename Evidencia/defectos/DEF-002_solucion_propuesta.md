# DEF-002 · Solución propuesta (NO aplicada)

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
