import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Ver src/privacidad/mediapipe-stub.ts.
      '@mediapipe/face_detection': fileURLToPath(
        new URL('./src/privacidad/mediapipe-stub.ts', import.meta.url),
      ),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Las librerías van en archivos propios, separados del código de la
          // app: cambian muy rara vez, así que tras cada publicación el
          // navegador las sigue teniendo en caché y solo baja lo que cambió.
          groups: [
            { name: 'firebase-firestore', test: /node_modules[\\/]@firebase[\\/]firestore[\\/]/ },
            { name: 'firebase', test: /node_modules[\\/](@firebase|firebase)[\\/]/ },
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/,
            },
          ],
        },
      },
    },
  },
})
