#!/usr/bin/env bash
#
# INDEXLA App — zero-downtime preview deployment (app.indexla.tech)
# Separate from indexla.tech website — never touches /var/www/IndexLa PM2 indexla
#
set -euo pipefail

APP_DIR="${INDEXLA_APP_DIR:-/var/www/IndexLa-App}"
BRANCH="${INDEXLA_APP_BRANCH:-main}"
LOG="${INDEXLA_APP_DEPLOY_LOG:-/var/log/indexla-app-deploy.log}"
LOCK_FILE="${INDEXLA_APP_DEPLOY_LOCK:-/var/run/indexla-app-deploy.lock}"
NGINX_SITE="${INDEXLA_APP_NGINX_SITE:-/etc/nginx/sites-enabled/indexla-app}"
PM2_APP="${INDEXLA_APP_PM2:-indexla-app}"
PORT="${INDEXLA_APP_PORT:-3001}"
HEALTH_HOST="${INDEXLA_APP_HEALTH_HOST:-127.0.0.1}"

GOOD_BUILD_DIR="${APP_DIR}/.next-good"
GOOD_COMMIT_FILE="${APP_DIR}/.deploy-good-commit"
STATE_FILE="${APP_DIR}/.deploy-state"
BUILD_ROOT="${APP_DIR}/.deploy-builds"

mkdir -p /var/log "$BUILD_ROOT"
exec >>"$LOG" 2>&1

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
}

write_state() {
  local status="$1"
  local commit_short="$2"
  local message="$3"
  cat >"$STATE_FILE" <<EOF
status=${status}
commit_short=${commit_short}
updated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
message=${message}
EOF
}

acquire_lock() {
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    log "SKIP: another app deployment is in progress"
    exit 0
  fi
}

verify_build_artifacts() {
  local build_dir="$1"
  [[ -f "${build_dir}/BUILD_ID" ]] || return 1
  [[ -d "${build_dir}/server" ]] || return 1
  [[ -d "${build_dir}/static" ]] || return 1
  return 0
}

snapshot_known_good() {
  if [[ -d "${APP_DIR}/.next" ]] && verify_build_artifacts "${APP_DIR}/.next"; then
    log "SNAPSHOT: preserving current live app build"
    rm -rf "$GOOD_BUILD_DIR"
    cp -a "${APP_DIR}/.next" "$GOOD_BUILD_DIR"
    git -C "$APP_DIR" rev-parse --short HEAD >"$GOOD_COMMIT_FILE" 2>/dev/null || echo "unknown" >"$GOOD_COMMIT_FILE"
  fi
}

restore_known_good() {
  local reason="$1"
  if [[ ! -d "$GOOD_BUILD_DIR" ]]; then
    log "CRITICAL: no known-good backup (${reason})"
    write_state "failed_no_recovery" "unknown" "$reason"
    return 1
  fi
  local good_short
  good_short="$(cat "$GOOD_COMMIT_FILE" 2>/dev/null || echo unknown)"
  log "RESTORE: ${reason} → known-good ${good_short}"
  rm -rf "${APP_DIR}/.next"
  cp -a "$GOOD_BUILD_DIR" "${APP_DIR}/.next"
  pm2 restart "$PM2_APP" --update-env || pm2 start npm --name "$PM2_APP" -- start -- -p "$PORT"
  pm2 save
  write_state "restored" "$good_short" "$reason"
  return 0
}

health_check() {
  local code
  code="$(curl -s -o /tmp/indexla-app-health.html -w '%{http_code}' --max-time 15 "http://${HEALTH_HOST}:${PORT}/app" || echo "000")"
  if [[ "$code" != "200" ]]; then
    log "HEALTH FAIL: /app returned ${code}"
    return 1
  fi
  if ! grep -q "Preview · Illustrative Data" /tmp/indexla-app-health.html 2>/dev/null; then
    log "HEALTH FAIL: preview banner missing"
    return 1
  fi
  log "HEALTH OK: /app returned 200 with preview banner"
  return 0
}

run_deploy() {
  cd "$APP_DIR"

  if [[ -d .git ]]; then
    git fetch origin "$BRANCH" 2>/dev/null || true
    git pull origin "$BRANCH" 2>/dev/null || true
  fi

  snapshot_known_good

  log "DEPLOY: npm ci"
  npm ci

  log "DEPLOY: npm run build (live .next preserved until success)"
  local next_backup=""
  if [[ -d .next ]]; then
    next_backup="${APP_DIR}/.next-pre-deploy-$$"
    cp -a .next "$next_backup"
  fi

  if ! npm run build; then
    log "ABORT: build failed"
    [[ -n "$next_backup" ]] && rm -rf .next && mv "$next_backup" .next
    write_state "failed_build" "unknown" "build failed"
    exit 1
  fi

  if ! verify_build_artifacts "${APP_DIR}/.next"; then
    log "ABORT: incomplete artifacts"
    [[ -n "$next_backup" ]] && rm -rf .next && mv "$next_backup" .next
    exit 1
  fi

  [[ -n "$next_backup" ]] && rm -rf "$next_backup"

  log "DEPLOY: restarting PM2 ${PM2_APP} on port ${PORT}"
  if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
    PORT="$PORT" pm2 restart "$PM2_APP" --update-env
  else
    cd "$APP_DIR"
    PORT="$PORT" pm2 start npm --name "$PM2_APP" -- start -- -p "$PORT"
  fi
  pm2 save

  sleep 2

  if ! health_check; then
    restore_known_good "health check failed" || true
    exit 1
  fi

  rm -rf "$GOOD_BUILD_DIR"
  cp -a "${APP_DIR}/.next" "$GOOD_BUILD_DIR"
  local short
  short="$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo deployed)"
  write_state "success" "$short" "deployed successfully"
  log "SUCCESS: app preview live at commit ${short}"
}

main() {
  log "==== indexla-app deploy start ===="
  acquire_lock

  if [[ "${1:-}" == "--restore-good" ]]; then
    restore_known_good "manual restore" || exit 1
    health_check || exit 1
    exit 0
  fi

  if [[ "${1:-}" == "--health" ]]; then
    health_check || exit 1
    exit 0
  fi

  run_deploy
  log "==== indexla-app deploy complete ===="
}

main "$@"
