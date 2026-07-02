# ── Producción: multi-stage build ───────────────────────────
FROM node:22-alpine3.20 AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build

# ── Runtime: nginx sirviendo estáticos ───────────────────────
FROM nginx:1.26-alpine3.20

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
