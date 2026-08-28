# INDEXLA App — VPS / infrastructure disaster recovery

**Infrastructure DR lives in the website repository** (single Hostinger VPS serves both domains).

| Resource | Location |
|----------|----------|
| Master runbook | [IndexLa `docs/ops/DISASTER_RECOVERY.md`](https://github.com/IdeatorYas/IndexLa/blob/master/docs/ops/DISASTER_RECOVERY.md) |
| Production inventory | [IndexLa `docs/ops/VPS_PRODUCTION_INVENTORY.md`](https://github.com/IdeatorYas/IndexLa/blob/master/docs/ops/VPS_PRODUCTION_INVENTORY.md) |
| Backup scripts | [IndexLa `scripts/dr/`](https://github.com/IdeatorYas/IndexLa/tree/master/scripts/dr) |
| App nginx template | `scripts/nginx-indexla-app.conf` (this repo) |
| App deploy | `scripts/deploy-indexla-app.sh` |

## This repository

- **Remote:** https://github.com/IdeatorYas/IndexlaApp.git  
- **Branch:** `main`  
- **Production path:** `/var/www/IndexLa-App`  
- **PM2:** `indexla-app` on port **3001**

Recover app by cloning this repo at the commit recorded in the DR `MANIFEST.json` (`deploy_source_commit`), restoring `.env.local` from encrypted backup, then running `/usr/local/bin/deploy-indexla-app.sh`.

## Stable Club protocol DR (on-chain)

Separate from VPS recovery — see `docs/stable-club/step3/13-post-mvp-disaster-recovery.md`.
