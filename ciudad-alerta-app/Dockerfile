# syntax=docker/dockerfile:1

###############################################################################
# Etapa 1 — Construcción
#
# Compila la aplicación Angular. Se usa una etapa separada para que la imagen
# final no contenga Node, la CLI ni node_modules: solo el resultado estático.
###############################################################################
FROM node:22-alpine AS build

WORKDIR /app

# Instalar dependencias antes de copiar el código aprovecha la caché de capas:
# mientras package.json no cambie, este paso no se vuelve a ejecutar.
COPY package.json package-lock.json ./

# npm ci instala exactamente las versiones del lock, sin resolver rangos.
# Es lo correcto para una compilación reproducible.
RUN npm ci

COPY . .

RUN npm run build -- --configuration production

# El builder de Angular 17+ deja el índice en www/browser según la
# configuración de outputPath. Se normaliza para que la etapa siguiente copie
# siempre desde la misma ruta.
RUN if [ -d www/browser ]; then \
      mv www/browser /tmp/sitio; \
    else \
      mv www /tmp/sitio; \
    fi

###############################################################################
# Etapa 2 — Servicio
#
# Nginx sirviendo los archivos estáticos. La imagen final pesa unos 50 MB
# frente a los cerca de 1,5 GB que ocuparía el entorno de construcción.
###############################################################################
FROM nginx:1.27-alpine AS runtime

RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /tmp/sitio /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Nginx en Alpine corre como nginx:nginx tras el arranque; se ajustan permisos
# para no depender del usuario root en tiempo de ejecución.
RUN chown -R nginx:nginx /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
