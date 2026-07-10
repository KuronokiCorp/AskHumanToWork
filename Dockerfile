# AskHumanToWork — single image for API (+ web) and worker.
#   API+web: docker run -e SERVE_WEB=true <image>
#   Worker:  docker run <image> node packages/api/dist/worker.js
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY packages/api/package.json packages/api/
COPY packages/mcp/package.json packages/mcp/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages ./packages
RUN pnpm build

# prune dev dependencies for the runtime layer
RUN pnpm prune --prod

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages

# drizzle migrations run at container start (idempotent)
EXPOSE 3000
CMD ["node", "packages/api/dist/index.js"]
