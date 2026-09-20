FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@11.19.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN --mount=type=cache,id=church-pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts --store-dir=/pnpm/store
COPY . .
RUN pnpm rebuild @prisma/engines @prisma/client prisma esbuild && pnpm db:generate && pnpm build

FROM build AS api
ENV NODE_ENV=production
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]

FROM nginx:1.28-alpine AS web
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY deploy/web.conf /etc/nginx/conf.d/default.conf

FROM nginx:1.28-alpine AS gateway
COPY deploy/gateway.conf /etc/nginx/conf.d/default.conf
