# Backend principal Express (Node.js 24). Multietapa: dependencias de producción desde el lockfile
# en una etapa y una imagen final sin herramientas de compilación, ejecutada como usuario sin privilegios.
FROM node:24.11.1-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

FROM node:24.11.1-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .
# uploads es un volumen: se crea con el dueño correcto para que Docker herede los permisos.
RUN mkdir -p uploads && chown node:node uploads
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
