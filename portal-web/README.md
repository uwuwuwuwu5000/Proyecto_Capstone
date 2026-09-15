# Ciudad Alerta — Portal Web

Portal web de organismos y administradores de **Ciudad Alerta**, una
plataforma de inteligencia urbana comunitaria: los ciudadanos reportan
problemas urbanos desde la app móvil (fuga de agua, luminaria dañada,
accesibilidad, etc.), la comunidad los verifica, y este portal permite
seguir esos reportes en un mapa en tiempo real.

Comparte el mismo proyecto Firebase que la app móvil (Ionic + Angular,
repositorio aparte) — mismas colecciones de Firestore, mismas reglas de
seguridad.

## Stack

- React 19 + TypeScript + Vite
- react-router-dom
- Firebase (Authentication + Cloud Firestore), SDK modular
- Leaflet + OpenStreetMap (mapa de reportes)
- CSS Modules — sin frameworks de UI externos

## Estructura

```
src/
 ├── firebase/     # inicialización del SDK (auth, db)
 ├── context/      # AuthContext (sesión global)
 ├── components/   # Navbar, MapaSantiago
 ├── pages/        # Landing, Login, Registro
 ├── App.tsx
 └── main.tsx
```

## Funcionalidad actual

- **Landing** (pública): explica el producto y muestra el mapa de reportes.
- **Login**: correo/contraseña + recuperación de contraseña.
- **Registro**: crea la cuenta en Authentication y el perfil en
  `users/{uid}` con rol `ciudadano` fijo.
- **Mapa de reportes**: lee `reports` en tiempo real (requiere sesión,
  igual que la app móvil), pines coloreados por estado, foto y conteo de
  confirmaciones cargados bajo demanda al abrir cada reporte, y botón para
  confirmar comunitariamente un reporte ajeno.

## Desarrollo

```bash
npm install
npm run dev      # servidor de desarrollo
npm run build    # typecheck + build de producción
npm run lint      # oxlint
```

Requiere Node 20.19+ o 22.12+.

## Firestore

Las reglas de seguridad viven en [`firestore.rules`](./firestore.rules) —
es una copia del archivo real publicado en el proyecto Firebase compartido
con la app móvil. Cualquier cambio ahí debe coordinarse con quien la
mantiene, porque afecta a ambos clientes.
