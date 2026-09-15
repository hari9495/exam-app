# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
RUN apk add --no-cache python3 make g++
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/exam-runtime/package.json apps/exam-runtime/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --ignore-scripts

FROM base AS build
# Build-time Sentry source-map upload for apps/web (all optional). With SENTRY_AUTH_TOKEN set, the
# @sentry/nextjs build plugin uploads the client/server maps and deletes them from the bundle;
# without it, upload is skipped and the build is unaffected. These live only in this build stage,
# which is discarded — the api/exam-runtime/web runtime stages below never inherit them, so the auth
# token is not baked into any shipped image. (For stricter secret hygiene a BuildKit
# `RUN --mount=type=secret` can replace the token ARG; the plain ARG is fine because the stage is
# thrown away.) Pass a git SHA as SENTRY_RELEASE so the web release matches its uploaded maps and
# the node apps tag events with the same version.
ARG SENTRY_AUTH_TOKEN=""
ARG SENTRY_ORG=""
ARG SENTRY_PROJECT=""
ARG SENTRY_RELEASE=""
ENV SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN \
    SENTRY_ORG=$SENTRY_ORG \
    SENTRY_PROJECT=$SENTRY_PROJECT \
    SENTRY_RELEASE=$SENTRY_RELEASE
COPY . .
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN npm rebuild
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/api
RUN npm run build --workspace=apps/exam-runtime
RUN npm run build --workspace=apps/web

FROM node:20-alpine AS api
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
EXPOSE 3001 3505
# --enable-source-maps: the dist ships its .js.map files (tsconfig sourceMap=true), so Node applies
# them to error stacks and @sentry/node reports original TypeScript file/line positions.
CMD ["node", "--enable-source-maps", "apps/api/dist/main.js"]

FROM node:20-alpine AS exam-runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /repo/apps/exam-runtime/dist ./apps/exam-runtime/dist
COPY --from=build /repo/apps/exam-runtime/package.json ./apps/exam-runtime/package.json
EXPOSE 3002 3003
# --enable-source-maps: see the api stage — maps ship in dist, Sentry reports original TS positions.
CMD ["node", "--enable-source-maps", "apps/exam-runtime/dist/main.js"]

FROM node:20-alpine AS web
WORKDIR /repo
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
