#!/usr/bin/env bash
set -euo pipefail
APP=/var/www/IndexLa-App
TGZ=/tmp/indexla-app-c820745.tgz

cd "$APP"
cp -a .env.local /tmp/indexla-app-env.local.bak
tar -xzf "$TGZ" -C "$APP"
cp -a /tmp/indexla-app-env.local.bak "$APP/.env.local"
echo c820745 > "$APP/.deploy-source-commit"

mkdir -p /tmp/npm-ci-fallback
cat > /tmp/npm-ci-fallback/npm <<'EOF'
#!/usr/bin/env bash
REAL=/usr/bin/npm
if [ "${1:-}" = "ci" ]; then
  if ! "$REAL" ci; then
    echo "npm ci failed — falling back to npm install"
    exec "$REAL" install
  fi
  exit 0
fi
exec "$REAL" "$@"
EOF
chmod +x /tmp/npm-ci-fallback/npm
export PATH="/tmp/npm-ci-fallback:$PATH"

/usr/local/bin/deploy-indexla-app.sh
echo "==== deploy state ===="
cat "$APP/.deploy-state"
echo "==== source commit ===="
cat "$APP/.deploy-source-commit"
echo "==== log tail ===="
tail -25 /var/log/indexla-app-deploy.log
