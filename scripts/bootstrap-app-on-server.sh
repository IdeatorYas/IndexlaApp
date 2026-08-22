#!/usr/bin/env bash
# One-time VPS bootstrap for IndexLa-App preview (run as root on server)
set -euo pipefail

APP_DIR="${INDEXLA_APP_DIR:-/var/www/IndexLa-App}"
PM2_APP="${INDEXLA_APP_PM2:-indexla-app}"
PORT="${INDEXLA_APP_PORT:-3001}"
NGINX_SRC="${APP_DIR}/scripts/nginx-indexla-app.conf"
NGINX_DST="/etc/nginx/sites-available/indexla-app"

echo "== INDEXLA App bootstrap =="
echo "App dir: ${APP_DIR}"
echo "PM2: ${PM2_APP} port ${PORT}"
echo "Website indexla (PM2 indexla :3000) will NOT be touched."

mkdir -p /var/log
if [[ ! -d "$APP_DIR" ]]; then
  echo "ERROR: ${APP_DIR} missing — clone/copy app first" >&2
  exit 1
fi

cp "${APP_DIR}/scripts/deploy-indexla-app.sh" /usr/local/bin/deploy-indexla-app.sh
chmod +x /usr/local/bin/deploy-indexla-app.sh

if [[ -f "$NGINX_SRC" ]]; then
  # HTTP-only first (cert may not exist yet)
  if [[ -f "${APP_DIR}/scripts/nginx-indexla-app-http.conf" ]]; then
    cp "${APP_DIR}/scripts/nginx-indexla-app-http.conf" "$NGINX_DST"
  else
    cp "$NGINX_SRC" "$NGINX_DST"
  fi
  ln -sf "$NGINX_DST" /etc/nginx/sites-enabled/indexla-app
  nginx -t && systemctl reload nginx
fi

if ! certbot certificates 2>/dev/null | grep -q "app.indexla.tech"; then
  echo "Requesting SSL for app.indexla.tech..."
  certbot --nginx -d app.indexla.tech --non-interactive --agree-tos -m contact@indexla.tech --redirect || true
fi

if [[ -f "$NGINX_SRC" ]] && [[ -f /etc/letsencrypt/live/app.indexla.tech/fullchain.pem ]]; then
  cp "$NGINX_SRC" "$NGINX_DST"
  ln -sf "$NGINX_DST" /etc/nginx/sites-enabled/indexla-app
fi

nginx -t && systemctl reload nginx

/usr/local/bin/deploy-indexla-app.sh
echo "Bootstrap complete."
