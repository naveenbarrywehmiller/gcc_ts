FROM node:20-alpine AS builder

# Build frontend
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Build server dependencies (requires python3, make, g++ for better-sqlite3 native compilation)
WORKDIR /app/server
RUN apk add --no-cache python3 make g++
COPY server/package*.json ./
RUN cd /app/server && npm ci --omit=dev

# Production image
FROM node:20-alpine

WORKDIR /app

# Install runtime libstdc++ required by compiled native addon (better-sqlite3)
RUN apk add --no-cache libstdc++

# Copy built server node_modules and server source
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY server/package*.json ./server/
COPY server/src ./server/src
COPY server/ecosystem.config.js ./server/

# Copy entrypoint
COPY docker-entrypoint.sh ./server/
RUN chmod +x ./server/docker-entrypoint.sh

# Copy built frontend
COPY --from=builder /app/client/dist ./client/dist

# Create data directory for SQLite
RUN mkdir -p /app/server/data /app/server/uploads

# Set environment
ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=./data/timesheet.db

WORKDIR /app/server

EXPOSE 3001

# Health check (uses Node.js — no extra dependencies needed)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health',(r)=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>process.exit(r.statusCode===200?0:1))}).on('error',()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
