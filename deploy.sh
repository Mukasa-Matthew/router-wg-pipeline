#!/bin/bash
set -e
echo "=== RouterHub Production Deployment ==="

# Install Node.js 20 if needed
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi

# Install PM2
npm install -g pm2

# MySQL already configured:
# Host: localhost | Database: routerhub | User: routerhub | Password: RouterHub2026

# Backend setup
cd /var/www/html/routerhub/backend
npm install --production
cp .env.production .env
node db/init.js
node db/migrate.js
node db/seed.js

# Start with PM2
pm2 delete routerhub-backend 2>/dev/null || true
pm2 start server.js --name routerhub-backend --env production
pm2 save
pm2 startup

# Frontend build
cd /var/www/html/routerhub/frontend
npm install
cp .env.production .env
npm run build
mkdir -p /var/www/html/dashboard
cp -r dist/* /var/www/html/dashboard/

# WireGuard sudoers
echo "www-data ALL=(ALL) NOPASSWD: /usr/bin/wg" >> /etc/sudoers
echo "root ALL=(ALL) NOPASSWD: /usr/bin/wg" >> /etc/sudoers

# Install Apache config (VPS uses Apache, not nginx)
a2enmod proxy proxy_http headers rewrite 2>/dev/null || true
cp /var/www/html/routerhub/apache-routerhub.conf /etc/apache2/sites-available/routerhub.conf
a2ensite routerhub 2>/dev/null || true
# Disable default site so RouterHub handles all requests (fixes /api 404)
a2dissite 000-default 2>/dev/null || true
apache2ctl configtest && systemctl reload apache2

# Permissions for MikHmon config
chown www-data:www-data /var/www/html/mikhmon/include/config.php
chmod 664 /var/www/html/mikhmon/include/config.php

echo "=== Deployment Complete ==="
echo "Dashboard: http://198.199.76.158/dashboard"
echo "API: http://198.199.76.158/api"
echo "MikHmon: http://198.199.76.158/mikhmon"
