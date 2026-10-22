# Servicio de privacidad de Ciudad Alerta.
#
# Se construye desde la RAÍZ del repositorio, porque usa comun/ y los modelos:
#   docker build -f servicio-privacidad/Dockerfile -t ciudad-alerta-privacidad .
#   docker run -p 8080:8080 ciudad-alerta-privacidad
#
# Render lo construye solo con render.yaml (raíz del repositorio).

FROM node:22-bookworm-slim AS construccion
WORKDIR /repo
COPY comun/src ./comun/src
COPY servicio-privacidad/package.json servicio-privacidad/package-lock.json servicio-privacidad/.npmrc ./servicio-privacidad/
RUN cd servicio-privacidad && npm ci --no-audit --no-fund
COPY servicio-privacidad/src ./servicio-privacidad/src
COPY servicio-privacidad/scripts ./servicio-privacidad/scripts
RUN cd servicio-privacidad && npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=8080 \
    CARPETA_MODELOS=/app/modelos
WORKDIR /app
COPY --from=construccion /repo/servicio-privacidad/package.json ./
COPY --from=construccion /repo/servicio-privacidad/node_modules ./node_modules
COPY --from=construccion /repo/servicio-privacidad/dist ./dist
# Detectores de rostros y personas (los mismos que usaba la app).
COPY ciudad-alerta-app/src/assets/models/coco-ssd ./modelos/coco-ssd
COPY ciudad-alerta-app/src/assets/models/face-detection ./modelos/face-detection
USER node
EXPOSE 8080
CMD ["node", "dist/servidor.mjs"]
