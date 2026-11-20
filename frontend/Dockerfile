# syntax=docker/dockerfile:1

# ---- build: compile the React app into static files ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime: serve dist/ and proxy /api to the API (vite preview) ----
# Phase 8 replaces this with Nginx, which also load-balances API instances.
FROM node:22-alpine AS runtime
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force
COPY vite.config.ts ./
COPY --from=build /app/dist ./dist
# Vite writes a temporary compiled config next to vite.config.ts at startup.
RUN chown node:node /app
USER node
EXPOSE 5173
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]
