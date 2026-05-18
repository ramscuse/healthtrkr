# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
# postinstall runs `prisma generate`, which needs the schema present at install time
COPY db/ ./db/
RUN npm ci

COPY . .

# VITE_API_URL is intentionally left empty so the built frontend uses relative
# paths — Express serves both the API and the static files on the same origin.
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# OpenSSL is required by the Prisma query engine on Alpine
# curl is required by the food database seed scripts
RUN apk add --no-cache openssl curl

# Install production dependencies only.
# Schema is copied first so the package.json `postinstall` (prisma generate) succeeds.
COPY package*.json ./
COPY db/ ./db/
RUN npm ci --omit=dev

# Copy built frontend
COPY --from=builder /app/src/dist ./src/dist

# Copy server source (routes live under server/routes/ now;
# api/index.js is the Vercel entry and is harmless in Docker)
COPY server/ ./server/
COPY api/ ./api/
COPY lib/ ./lib/

# Copy entrypoint
COPY entrypoint.sh ./

# Set up non-root user and permissions
RUN addgroup -g 1001 -S nodejs \
 && adduser  -S nodejs -u 1001 -G nodejs \
 && chmod +x entrypoint.sh \
 && chown -R nodejs:nodejs /app

USER nodejs
EXPOSE 3001
ENTRYPOINT ["./entrypoint.sh"]
