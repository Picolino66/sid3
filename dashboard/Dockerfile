# Stage 1: build
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.27.0 --activate
WORKDIR /app

ARG SID3_API_BASE_URL=http://localhost:3000/api/v1

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN printf 'window.__SID3_RUNTIME_CONFIG__ = {\n  apiBaseUrl: "%s"\n};\n' "${SID3_API_BASE_URL%/}" > public/runtime-config.js
RUN pnpm exec ng build

# Stage 2: serve
FROM nginx:alpine

COPY --from=builder /app/dist/dashboard/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
