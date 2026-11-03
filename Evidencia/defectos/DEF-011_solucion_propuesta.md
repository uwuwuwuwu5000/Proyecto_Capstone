# DEF-011 · La página de inicio desborda en teléfono (393 px) por la nueva columna «Legal» del pie

**Detectado el 2026-11-02** en la regresión de la Fase 6: falló WA6 («Sin desplazamiento horizontal»), que antes pasaba.
`/ a 393px: esperado <= 1, recibido 87` (87 px de desplazamiento horizontal).

**Evidencia:** `DEF-011_inicio-393px.png` (la página de inicio a 393 px) y la prueba WA6.

## Causa

Para enlazar los términos y la política de privacidad se agregó una tercera columna («Legal») al pie de la página de inicio.
`.footerColumnas` es una fila sin salto de línea (`display: flex`, sin `flex-wrap`) con columnas de al menos 120 px y 48 px de
separación: 3 × 120 + 2 × 48 = 456 px, más ancho que un teléfono de 393 px.

## Cómo corregirlo

En `Landing.module.css`, dentro de la regla de pantallas pequeñas que ya ajusta `.footerColumnas`, permitir que las columnas
pasen a la línea siguiente (`flex-wrap: wrap`) y reducir la separación (`gap: 24px 40px`). Así caben dos columnas por fila y la
tercera baja. No cambia el aspecto en escritorio.
