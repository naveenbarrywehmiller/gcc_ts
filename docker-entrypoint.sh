#!/bin/sh
set -e

echo "🔍 Checking database..."

# Run migrations (idempotent — safe to run every startup)
node src/config/migrate.js

# Check if systemadmin user exists; seed if not
# NOTE: migrate() inserts systemadmin@barry-wehmiller.com as part of migration,
# so if it exists the full seed has already run (or is not needed).
ADMIN_EXISTS=$(node -e "
  const db = require('./src/config/db');
  const admin = db.prepare('SELECT id FROM users WHERE email = ?').get('systemadmin@barry-wehmiller.com');
  console.log(admin ? 'yes' : 'no');
")

if [ "$ADMIN_EXISTS" = "no" ]; then
  echo "🌱 First run detected — seeding database..."
  node src/config/seed.js
else
  echo "✅ Database already seeded."
fi

echo "🚀 Starting server with PM2 (cluster mode — all CPU cores)..."
exec npx pm2-runtime ecosystem.config.js
