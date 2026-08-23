# Zero-loss checkpoint workflow (IndexlaApp)

Permanent recovery process for the **INDEXLA App** repo only  
(`https://github.com/IdeatorYas/IndexlaApp`).  
Never use this against the website repository.

## Why

Substantial work must not exist only on a local machine or inside a long
test/deploy window. A **pushed** `checkpoint/*` branch is the durable backup
before verification or deploy. The VPS often deploys from a **tarball**, not
`git pull`, so GitHub is the source of truth for recovery.

## Command

```powershell
cd C:\Users\hp\Desktop\IndexLa-App
.\scripts\checkpoint.ps1 -Topic "short-kebab-topic"
```

Optional empty marker (no eligible files):

```powershell
.\scripts\checkpoint.ps1 -Topic "marker-only" -AllowEmpty
```

## What it does

1. Creates `checkpoint/<yyyy-mm-dd>-<topic>` from the current HEAD  
2. Stages intentional project changes (honors `.gitignore`)  
3. Blocks `.env*`, secrets, keys, `node_modules`, `.next`, `tmp`, reports, archives  
4. Creates a WIP recovery commit  
5. Pushes immediately to `origin`  
6. Checks out the original branch and restores WIP as **local uncommitted** changes (`cherry-pick -n`)  

It never runs `reset --hard`, `clean`, or force-push.

## When required

Before:

- Long verification (`typecheck` / `lint` / `test` / `build` / e2e)  
- Production or preview builds for the VPS  
- Deployments to `app.indexla.tech`  
- Large refactors  

## Completion report fields

Every app task report must include:

- Working branch  
- Main commit  
- Recovery checkpoint branch / commit (or `n/a` if founder waived)  
- Remote push status  
- Deployed commit (or `not deployed`)  
- Working-tree status  

## Agent rules

See `.cursor/rules/zero-loss-checkpoint.mdc` and `.cursor/rules/always-deploy.mdc`.
