# ── Stage 1: Base (Entorno Común) ──────────────────────────────────────────
FROM node:24-alpine AS base

LABEL org.opencontainers.image.title="Green Alert Frontend" \
      org.opencontainers.image.description="SPA React + Vite para Green Alert" \
      org.opencontainers.image.source="https://github.com/green-alert" \
      org.opencontainers.image.licenses="MIT"

# Definir directorio de trabajo principal
WORKDIR /app

# Copiar archivos de dependencias
COPY package.json package-lock.json .npmrc ./


# ── Stage 2: Desarrollo (Para docker-compose de desarrollo) ───────────────
FROM base AS development

# Instalar todas las dependencias (incluyendo devDependencies para compilar)
RUN npm ci

# Copiar el código fuente completo del Frontend
COPY . .

# Exponer el puerto por defecto de Vite (5173)
EXPOSE 5173

# Arrancar el servidor de desarrollo escuchando en 0.0.0.0 para acceso externo
CMD ["npm", "run", "dev", "--", "--host"]


# ── Stage 3: Builder (Generación del Bundle de Producción) ─────────────────
FROM base AS builder

# Instalar dependencias usando npm ci para asegurar consistencia e inmutabilidad
RUN npm ci

# ── DEFINICIÓN DE ARGUMENTOS DE CONSTRUCCIÓN (Vite Build-time Env Vars) ───
# React/Vite inyectan las variables VITE_* de manera estática durante el build.
# Declaramos los argumentos para que puedan ser pasados en el docker-compose o comando build.
ARG VITE_API_URL
ARG VITE_APP_NAME
ARG VITE_APP_VERSION
ARG VITE_ENV=production
ARG VITE_ENABLE_MAPS
ARG VITE_ENABLE_NOTIFICATIONS
ARG VITE_ENABLE_IA_FEATURES
ARG VITE_MAPBOX_TOKEN
ARG VITE_GOOGLE_MAPS_KEY
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_VAPID_KEY
ARG VITE_GOOGLE_CLIENT_ID

# Mapear los argumentos a variables de entorno para que Vite los detecte en el build
ENV VITE_API_URL=$VITE_API_URL \
    VITE_APP_NAME=$VITE_APP_NAME \
    VITE_APP_VERSION=$VITE_APP_VERSION \
    VITE_ENV=$VITE_ENV \
    VITE_ENABLE_MAPS=$VITE_ENABLE_MAPS \
    VITE_ENABLE_NOTIFICATIONS=$VITE_ENABLE_NOTIFICATIONS \
    VITE_ENABLE_IA_FEATURES=$VITE_ENABLE_IA_FEATURES \
    VITE_MAPBOX_TOKEN=$VITE_MAPBOX_TOKEN \
    VITE_GOOGLE_MAPS_KEY=$VITE_GOOGLE_MAPS_KEY \
    VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET \
    VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID \
    VITE_FIREBASE_VAPID_KEY=$VITE_FIREBASE_VAPID_KEY \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

# Copiar el código fuente
COPY . .

# Compilar los archivos estáticos listos para producción (se generarán en /app/dist)
RUN npm run build


# ── Stage 4: Producción Ejecutable (Nginx sin privilegios de root) ────────
# Usamos nginx-unprivileged para cumplir con el estándar de mínima autorización (Non-Root User).
# Por defecto escucha en el puerto 8080.
FROM nginxinc/nginx-unprivileged:1.27.5-alpine AS production

# Configuración de Nginx: plantillas HTTPS/HTTP elegidas al arrancar según exista /etc/nginx/tls.
# El certificado y la clave se montan en tiempo de ejecución; nunca se copian a la imagen.
COPY nginx/greenalert-common.conf nginx/greenalert-api.conf /etc/nginx/
COPY nginx/templates-tls /etc/nginx/templates-tls
COPY nginx/templates-http /etc/nginx/templates-http
COPY --chmod=0755 nginx/05-greenalert-tls.envsh /docker-entrypoint.d/05-greenalert-tls.envsh

# Copiar los assets estáticos generados en la fase de builder
COPY --from=builder /app/dist /usr/share/nginx/html

# 8443: HTTPS (web). 8080: redirección a HTTPS y /api para la APK de laboratorio.
EXPOSE 8080 8443

# Health check: verifica que nginx sirve el index.html correctamente
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1

# Comando para arrancar Nginx en primer plano
CMD ["nginx", "-g", "daemon off;"]
