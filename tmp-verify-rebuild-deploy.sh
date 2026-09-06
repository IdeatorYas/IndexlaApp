#!/usr/bin/env bash
set -euo pipefail

echo "=== deploy source ==="
cat /var/www/IndexLa-App/.deploy-source-commit
cat /var/www/IndexLa-App/.deploy-state

echo "=== source files present ==="
ls -la /var/www/IndexLa-App/src/components/stable-club/StableClubPositionDashboard.tsx \
       /var/www/IndexLa-App/src/components/stable-club/StableClubCompactDeposit.tsx

echo "=== chunk strings ==="
CHUNK=$(ls /var/www/IndexLa-App/.next/static/chunks/app/app/stable-club/page-*.js | head -1)
echo "chunk=$CHUNK"
python3 - <<'PY'
from pathlib import Path
import re
chunk = next(Path("/var/www/IndexLa-App/.next/static/chunks/app/app/stable-club").glob("page-*.js"))
text = chunk.read_text(errors="ignore")
needles = [
    "My Stable Club Position",
    "Deposit USDC",
    "Harvest All",
    "Compound All",
    "Withdraw All",
    "Coming soon",
    "UPCOMING",
    "Opt in Auto",
    "StableClubAutomationPanel",
    "One Deposit. Five Pools",
]
for n in needles:
    print(f"{text.count(n):3d}  {n}")
PY

echo "=== http ==="
curl -s -o /dev/null -w "app:%{http_code}\n" https://app.indexla.tech/app
curl -s -o /dev/null -w "sc:%{http_code}\n" https://app.indexla.tech/app/stable-club
curl -s -o /dev/null -w "web:%{http_code}\n" https://indexla.tech/

echo "=== live HTML body snippet check ==="
curl -sL https://app.indexla.tech/app/stable-club -o /tmp/sc-live.html
python3 - <<'PY'
from pathlib import Path
text = Path("/tmp/sc-live.html").read_text(errors="ignore")
for n in ["Connect Wallet", "My Stable Club Position", "Deposit USDC", "UPCOMING", "automation"]:
    print(f"{text.count(n):3d}  {n}")
print("status", 200 if "Connect Wallet" in text or "__next" in text else "unexpected")
PY
