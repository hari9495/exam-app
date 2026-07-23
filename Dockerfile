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
CMD ["node", "apps/api/dist/main.js"]

FROM node:20-alpine AS exam-runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /repo/apps/exam-runtime/dist ./apps/exam-runtime/dist
COPY --from=build /repo/apps/exam-runtime/package.json ./apps/exam-runtime/package.json
EXPOSE 3002 3003
CMD ["node", "apps/exam-runtime/dist/main.js"]

FROM node:20-alpine AS web
WORKDIR /repo
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
