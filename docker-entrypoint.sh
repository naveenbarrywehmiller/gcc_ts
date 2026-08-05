#!/bin/sh
set -e

echo "🔍 Checking database..."

# Run migrations (idempotent — safe to run every startup)
node src/config/migrate.js

# Check if admin user exists; seed if not
ADMIN_EXISTS=$(node -e "
  const db = require('./src/config/db');
  const admin = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@company.com');
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
