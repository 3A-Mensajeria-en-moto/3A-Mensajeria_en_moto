# Backend (NestJS). Lo usa docker-compose.yml; también sirve solo:
#   docker build -t mensajeria-backend . && docker run -p 8080:8080 mensajeria-backend

FROM node:24-bookworm-slim AS build
# Herramientas por si better-sqlite3 no encuentra binario precompilado y tiene que compilar.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN mkdir -p data && chown node:node data
USER node
EXPOSE 8080
CMD ["node", "dist/main.js"]
