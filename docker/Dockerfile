# ============================================================
# Stage 1: Build the Vite static bundle
# ============================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first for cache-friendliness
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .

# Generate types from upstream openapi.json (CI-equivalent step). If the
# build env can't reach GitHub, the committed src/types/api.gen.ts is used.
# We still attempt the regenerate to keep types fresh; tolerate failure.
ARG OPENAPI_URL=https://raw.githubusercontent.com/TongWu/JAVDB_AutoSpider_CICD/main/docs/api/openapi.json
RUN npm run gen:api-types || echo "gen:api-types failed; using committed snapshot"

RUN npm run build

# ============================================================
# Stage 2: nginx static server
# ============================================================
FROM nginx:1.27-alpine

# nginx config tuned for SPA + /api proxy
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built static bundle
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
