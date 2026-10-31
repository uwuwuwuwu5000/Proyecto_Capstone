# DEF-007 · Las pestañas del panel del operador desplazan la página en un teléfono (CORREGIDO el 2026-10-30)

**Qué pasa:** en una pantalla de 393 px, las pantallas del panel del operador (Mapa, Reportes, Por veredicto y Estadísticas) se
desplazan 7 px hacia los lados. Ya ocurría antes de agregar «Por veredicto» (con la pestaña «Por verificar»).

**Evidencia:** prueba WV13 (`e2e/veredictos.spec.ts`) en NOK antes de la corrección: `Evidencia/defectos/DEF-007.png`.

**Causa:** `portal-web/src/pages/Operador/OperadorTabs.module.css`. La barra de pestañas es un `flex` sin ajuste: sus cuatro pestañas
(con 14 px de margen interior a cada lado) suman 400 px y la barra no puede ser más ancha que la pantalla, así que toda la página crece.

**Cambio aplicado:** en pantallas de hasta 560 px las pestañas usan menos margen interior y letra un poco menor, y la barra puede
desplazarse dentro de sí misma (`overflow-x: auto`) si aun así no cupieran.

**Verificación:** WV13 pasa de NOK a OK; WA6 y el E2E completo sin fallos nuevos.
