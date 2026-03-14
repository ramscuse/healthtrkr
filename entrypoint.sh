#!/bin/sh
set -e

# Guard required environment variables
if [ -z "$JWT_SECRET" ]; then
  echo "ERROR: JWT_SECRET is not set. Aborting." >&2
  exit 1
fi
if [ -z "$HEALTH_SYNC_TOKEN" ]; then
  echo "ERROR: HEALTH_SYNC_TOKEN is not set. Aborting." >&2
  exit 1
fi
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set. Aborting." >&2
  exit 1
fi

echo "Running database migrations..."
./node_modules/.bin/prisma migrate deploy

echo "Starting healthtrkr server..."
exec node server/index.js
