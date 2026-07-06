#!/bin/bash
set -e
cd /var/www/infuso
echo "=== $(date -u) : deploy started ==="
git fetch origin main
git reset --hard origin/main
npm install --omit=dev
npx prisma generate
npx prisma migrate deploy
pm2 restart infuso
echo "=== $(date -u) : deploy finished ==="
