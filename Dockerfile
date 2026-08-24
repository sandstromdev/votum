# syntax=docker/dockerfile:1

FROM oven/bun:1.3.14 AS base
WORKDIR /app

FROM base AS install
WORKDIR /temp/dev
COPY package.json bun.lock .npmrc ./
RUN bun install --frozen-lockfile --ignore-scripts

WORKDIR /temp/prod
COPY package.json bun.lock .npmrc ./
RUN bun install --frozen-lockfile --production --ignore-scripts

FROM base AS build
COPY --from=install /temp/dev/node_modules ./node_modules
COPY . .
RUN bunx svelte-kit sync
RUN --mount=type=secret,id=SENTRY_ORG,env=SENTRY_ORG,required=false \
	--mount=type=secret,id=SENTRY_PROJECT,env=SENTRY_PROJECT,required=false \
	--mount=type=secret,id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN,required=false \
	bun run build

FROM node:24-trixie-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
	HOST=0.0.0.0 \
	PORT=3000 \
	PROTOCOL_HEADER=x-forwarded-proto \
	HOST_HEADER=x-forwarded-host

COPY --chown=node:node --from=install /temp/prod/node_modules ./node_modules
COPY --chown=node:node --from=build /app/build ./build
COPY --chown=node:node --from=build /app/drizzle ./drizzle
COPY --chown=node:node --from=build /app/scripts/server/ ./scripts/server/
COPY --chown=node:node --from=build /app/package.json ./package.json

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["sh", "-c", "node scripts/server/migrate.mjs && exec node build"]
