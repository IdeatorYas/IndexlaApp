# INDEXLA App (`IndexLa-App`)

Separate application for **https://app.indexla.tech**

Product authority: `../Indexla Code github/content/app/INDEXLA_APP_V1_BUILD_PLAN.md` (or copy into this repo when syncing content).

## Phase 1 — Foundation

- Next.js 15 + Tailwind 4
- Dual light / dark-navy themes
- Global app shell (8 nav items)
- 12 route stubs under `/app/*`
- Shared domain models, fixtures, feature flags, fee calculator skeleton
- Disabled execution/contract adapters (no fake transaction success)
- Vitest + Playwright baseline

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open **http://localhost:3456**

## Verification

Before long verification, builds, deployments, or large refactors, push a
recovery checkpoint:

```powershell
.\scripts\checkpoint.ps1 -Topic "short-kebab-topic"
```

See `docs/CHECKPOINT_WORKFLOW.md`.

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

## Production boundary

Phase 1 does **not** configure nginx, SSL, PM2 or deploy to `app.indexla.tech`. The marketing site at `indexla.tech` is untouched.

## Ports

| Environment | URL / port |
|-------------|------------|
| App dev | `localhost:3456` |
| Website prod | `indexla.tech` → PM2 `:3000` (separate repo) |
