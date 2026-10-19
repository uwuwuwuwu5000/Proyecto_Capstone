# Diagnóstico de datos · ciudadalerta

Generado el 15-10-2026, 6:13:38 p. m. en 2.7 s.

| Severidad | Cantidad | Significado |
|---|---:|---|
| ✖ Errores | 1 | Rompen el build o una funcionalidad. |
| ⛨ Brechas de seguridad | 2 | Permiten algo que no debería estar permitido. |
| ⚠ Advertencias | 5 | Bugs probables o riesgos a futuro. |
| ℹ Información | 7 | Datos útiles; no requieren acción inmediata. |

## ✖ Errores

- **[Cuentas y perfiles]** Cuenta operador muni_maipu@gmail.cl sin operadorId: no ve ni gestiona ningún reporte

## ⛨ Brechas de seguridad

- **[Administradores]** rodri.hernandezc@admin.cl está en la lista de administradores pero no tiene cuenta
  - Las reglas no exigen correo verificado: quien registre ese correo primero obtiene rol admin.
  - Solución: Crea la cuenta ahora con ese correo, o quítalo de la lista en firestore.rules y admin-emails.ts.
- **[Reportes]** 16 reportes con foto sin desenfoque registrado (privacidad.aplicada ≠ true)
  - Ids: 0qzdyT26km4tyb8F1e0Y, 2ou1v3zqsYbPi1r2HfzD, 9tfPg7lewLa836SJzxxj, AhF2H3bhpP0gKOuStEXN, IN5gtk2Hk2TrDHuZ91da, JYg4gtewDIDo5YUlkLU3, JwUq4oGWCOy9uU6Lc6hT, LE7f0MSkxyc6CZ2Dx2jz … (+8)

## ⚠ Advertencias

- **[Administradores]** rodrigo@admin.cl: cuenta de administrador con el correo sin verificar
- **[Cuentas y perfiles]** 1 cuentas sin documento en users/: rodrigo@admin.cl
  - La app crea el perfil al iniciar sesión (asegurarPerfil); si persiste, esas personas no pueden aparecer como autoras.
- **[Reportes]** 3 reportes sin organismo asignado
  - Ids: 0qzdyT26km4tyb8F1e0Y, 2ou1v3zqsYbPi1r2HfzD, AhF2H3bhpP0gKOuStEXN
- **[Reportes]** 4 reportes cuyo operador pertenece a otro organismo
  - Ids: QmFlAwsc5KItlp6F9UwZ, b1jHLyw7IDTy085v6t28, kn6ZDfvuDHWw7QbHyOkV, sarVkDDvLd8oyN8YyjhK
- **[Fotos, confirmaciones, historial y soporte]** 5 cambios de estado sin firma (autorRol: 5, autorNombre: 5)
  - El historial público los muestra como "Autor no registrado". Suelen venir del portal web o de la consola.

## ℹ Información

- **[Administradores]** rodrigo@admin.cl: está en la lista pero su perfil tiene rol 'sin perfil'
  - Las reglas de gestión leen el rol del perfil; la lista solo permite crear organismos y autopromoverse.
- **[Cuentas y perfiles]** 1 perfiles de cuentas ya eliminadas en Authentication
- **[Organismos y operadores]** 345 organismos (0 inactivos). Chile tiene 345 municipalidades.
- **[Reportes]** 4 reportes de cuentas ya eliminadas
  - Ids: 2ou1v3zqsYbPi1r2HfzD, dkE1wBr5DV3yBmjNWohd, mFCf5h1X7yDvSihEnRD5, xofoZiObm5V1Y0qG2Veo
- **[Reportes]** 17 reportes sin comuna detectada
  - Ids: 0qzdyT26km4tyb8F1e0Y, 2ou1v3zqsYbPi1r2HfzD, 9tfPg7lewLa836SJzxxj, AhF2H3bhpP0gKOuStEXN, LE7f0MSkxyc6CZ2Dx2jz, QmFlAwsc5KItlp6F9UwZ, RgVL1gAB2F2tgtcvclJ4, b1jHLyw7IDTy085v6t28 … (+9)
- **[Reportes]** 14 reportes con el campo confirmaciones distinto al número real (esperable sin Cloud Functions)
  - Ids: 0MRkQi46rctNsjZQAMIQ, 0qzdyT26km4tyb8F1e0Y, 2ou1v3zqsYbPi1r2HfzD, 9tfPg7lewLa836SJzxxj, AhF2H3bhpP0gKOuStEXN, KKY2UPiJuiRMq5t7bAld, LE7f0MSkxyc6CZ2Dx2jz, QmFlAwsc5KItlp6F9UwZ … (+6)
- **[Fotos, confirmaciones, historial y soporte]** 3 tickets de soporte abiertos sin atender

## Comprobaciones ejecutadas

- Lectura de datos
- Administradores
- Cuentas y perfiles
- Organismos y operadores
- Reportes
- Fotos, confirmaciones, historial y soporte
