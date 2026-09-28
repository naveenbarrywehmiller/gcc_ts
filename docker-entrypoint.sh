#!/bin/sh
set -e

echo "🔍 Checking database..."

# Run migrations (idempotent — safe to run every startup)
node src/config/migrate.js

# Seed reference tables only; demo users require explicit development opt-in.
node src/config/seed.js

echo "🚀 Starting server with PM2 (cluster mode — all CPU cores)..."
exec npx pm2-runtime ecosystem.config.js
