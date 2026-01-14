FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
RUN npm install -g npm@11.7.0
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci --ignore-scripts

FROM node:20-alpine AS builder
RUN npm install -g npm@11.7.0
WORKDIR /app
RUN apk add --no-cache bash openssl
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

ARG DATABASE_URL
ARG BETTER_AUTH_SECRET
ARG BETTER_AUTH_URL
ARG COMPOSIO_API_KEY
ARG LANGFLOW_API_KEY
ARG LANGFLOW_API_URL
ARG NEXT_PUBLIC_APP_URL

# DATABASE_URL factice pour le build (prisma generate n'en a pas besoin)
ENV DATABASE_URL=${DATABASE_URL:-postgresql://dummy:dummy@localhost:5432/dummy}
ENV BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
ENV BETTER_AUTH_URL=${BETTER_AUTH_URL}
ENV COMPOSIO_API_KEY=${COMPOSIO_API_KEY}
ENV LANGFLOW_API_KEY=${LANGFLOW_API_KEY}
ENV LANGFLOW_API_URL=${LANGFLOW_API_URL}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

# Skip env validation during build
ENV SKIP_ENV_VALIDATION=1

RUN ./node_modules/.bin/prisma generate && npm run build:docker

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache openssl libc6-compat netcat-openbsd && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/@noble ./node_modules/@noble
COPY --from=builder /app/node_modules/@better-auth ./node_modules/@better-auth
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin ./node_modules/.bin
COPY docker-entrypoint.sh ./

RUN chmod +x docker-entrypoint.sh && \
    chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000
# PORT sera défini par Railway au runtime
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
