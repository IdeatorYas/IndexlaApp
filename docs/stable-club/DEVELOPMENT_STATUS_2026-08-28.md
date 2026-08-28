# Stable Club — Development Status Report

**Date:** 2026-08-28  
**Baseline:** `audit-freeze/stable-club-step3-904c4c5` → commit **`904c4c5`**  
**Repository:** https://github.com/IdeatorYas/IndexlaApp  
**Type:** Read-only snapshot for audit / Command Center (not a deployment authorization)

---

## Executive summary

Stable Club **smart contracts (Step 1–3) are implemented and heavily tested** on Hardhat and Base fork. **No protocol contracts are deployed to Base mainnet.** The dev-gated app route exposes a **Step 2 UI shell** with **mock positions** and **Step 1 local execution** against a test pool only. Overall product integration is roughly **half complete**; contracts run ahead of frontend and ops.

---

## 1. Fully completed

### Smart contracts (local/fork-tested)

| Area | Evidence |
|------|----------|
| Step 1 core | `PermissionRegistry.sol`, `StableClubExecutor.sol`, `FeeRouter.sol`, `TestPoolAdapter` via `scripts/stable-club/deploy-local.cjs` |
| Step 2 automation | `StableClubAutomationExecutor.sol` — `harvest`, `compound`, `rebalance` |
| Safety / oracle / MEV | `SafetyController.sol`, `OracleGuard.sol`, `MevGuard.sol`, `OpenServProposalGate.sol` |
| DEX adapters | `UniswapV3Adapter.sol`, `AerodromeSlipstreamAdapter.sol` |
| Step 3 governance | `StableClubTimelock.sol` — 48h `MIN_DELAY` floor enforced |
| Permit2 | `UserTokenPull.sol`, dual-spender split in `src/lib/stable-club/permit2.ts` |
| Permission model | `PermissionRegistry.sol` — caps, expiry, revoke, pause, execution nonces |

### TypeScript / config

- `official-pools.ts`, `stage1-launch.ts`, `launch-params.ts`, `mvp-governance.ts`, `verified-base-addresses.ts`, `production-guards.ts`

### Frontend — Step 1 local (dev flags + Hardhat)

- `useStableClubExecution.ts` — register, deposit, remove, withdraw, pause, revoke, emergency exit
- `tests/e2e/stable-club.spec.ts` — full Step 1 cycle

### Documentation & tests at freeze

- Hardhat **106 passing**, Vitest **130 passing** (full app) at **`904c4c5`**
- Step 3 docs: `docs/stable-club/step3/`
- Bugbot 4/4 resolved before freeze; timelock adversarial tests in `StableClubStep3TimelockDelayFloor.test.cjs`

---

## 2. Partially implemented

| Area | Done | Missing |
|------|------|---------|
| Local deploy JSON | Step 1 addresses in example template | Committed `local-deployments.json` lacks Step 2 adapters (script supports them) |
| Step 2 UI | Catalogue, activation gate | Activation is React state only |
| Permit2 UX | Plan builders + preview | No on-chain txs from UI |
| OpenServ | In-memory monitor | No keeper → executor bridge |
| Positions | Data model | No indexer; fixtures only |
| USD caps | `launch-params.ts` docs | On-chain encoding deferred |
| Governance | Safe on Base | `timelockAddress: null` — not deployed |
| Production guards | Extensive checks | Stale blocker strings post-freeze |

---

## 3. Mocked, hardcoded, placeholder, UI-only

| Item | Evidence |
|------|----------|
| Position dashboard | `positions.ts` `buildIllustrativePositions()` — `dataVerifiedOnChain: false` |
| Pool activation | UI state only in `StableClubView.tsx` |
| OpenServ sim | `openserv.ts` in-memory; demo permission hash in view |
| Permit2 panel | `StableClubApprovalsPanel.tsx` — preview text only |
| Unavailable pools | `USDC-cbBTC-AERO-CL100` etc. — `poolAddress: null` |
| APY / IL | Not implemented (Bible doc only) |
| Route | `page.tsx` — `notFound()` unless `STABLE_CLUB_DEV_ENABLED` |

---

## 4. Completely missing

- Mainnet protocol deployment
- Indexer / subgraph
- APY / IL / incentives modules
- Frontend harvest / compound / rebalance
- Permit2 deposit in UI (legacy approve in hook)
- Mainnet wallet execution path
- Stable Club database tables
- Testnet deployment scripts

---

## 5. Frontend inventory

**Route:** `/app/stable-club` — `src/app/app/stable-club/page.tsx`

**Components:** `StableClubView`, `StableClubStep2Panels`, `StableClubApprovalsPanel`, `StableClubExecutionPanel`, `useStableClubExecution`

**Wallet:** `StableClubWalletProvider.tsx` — injected provider, chain 8453, local Hardhat RPC

---

## 6. Wallet & network

- Local: `http://127.0.0.1:8545` (`constants.ts`, `package.json` `node:local`)
- Production target chain: Base 8453
- Mainnet execution not wired in UI

---

## 7. Smart contracts — deployment

| Network | Status |
|---------|--------|
| Base mainnet protocol | **Not deployed** |
| Timelock | **null** (`mvp-governance.ts`) |
| Safe (infra) | `0x356A4A432EE57F31F5cF8Fdd55F95c1FF6Cd5910` |
| Permit2 (canonical) | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| Local Hardhat | Example template only in git; runtime JSON local |

---

## 8. User operations

| Operation | Contracts | Frontend |
|-----------|-----------|----------|
| Deposit + LP | ✅ | ✅ local test pool |
| Withdraw / remove | ✅ | ✅ local |
| Rebalance / harvest / compound | ✅ automation executor | ❌ |
| Emergency exit | ✅ | ✅ local |
| Fees 1% swap | ✅ FeeRouter | ✅ minOut in deposit |

---

## 9. Permission model (on-chain)

`PermissionRegistry.sol`: `maxAmountPerTx`, `maxAmountPerDay`, `expiresAt`, `revoked`, `paused`, `executionNonce`, slippage cap, operator ACL. Emergency path skips pause but not revoke/expiry.

---

## 10. Pool integrations

- **Live in tests/fork:** Uni V3 + Aerodrome adapters, Stage 1 pool `USDC-cbBTC-UNI-005` @ `0xfBB6Eed8e7aa03B138556eeDaF5D271A5E1e43ef`
- **UI:** test adapter only for execution; catalogue static

---

## 11. Calculations

| Topic | Status |
|-------|--------|
| Swap fee 1% floor | ✅ on-chain + TS |
| Slippage / MevGuard | ✅ |
| Oracle deviation | ✅ |
| Gas ceiling 1 gwei | ✅ config + SafetyController field |
| APY / IL / incentives | ❌ |

---

## 12. Backend / API / DB

- API: `deployments`, `e2e/rpc`, `e2e/send-tx` under `src/app/api/stable-club/`
- No Stable Club DB or indexer

---

## 13. Test coverage

| Suite | Files | ~Cases |
|-------|-------|--------|
| Hardhat | 14 | ~106 |
| Vitest (SC) | 10 | ~62 |
| Playwright E2E | 1 spec | Step 1 local |

**Last green:** `904c4c5` — Hardhat 106, Vitest 130.

---

## 14. Known debt & risks

- UI ≠ working product for Step 2 surfaces
- Permit2 tested in contracts, not UI deposit path
- No mainnet deploy / audit not started at status date
- `codeFreezeBlockers()` strings partially outdated

---

## 15. Git context (status date)

- Freeze tag: `audit-freeze/stable-club-step3-904c4c5` @ `904c4c5`
- Audit branch: `audit/stable-club-command-center` (this doc added on audit branch only)
- `main` may be ahead with non–Stable Club commits; audit uses frozen tag

---

## 16. Processes / ports (local dev)

| Port | Service |
|------|---------|
| 8545 | Hardhat (`npm run node:local`) |
| 3456 | Next dev (`npm run dev`) |

Production PM2/nginx not used for Stable Club product path when dev flags off.

---

## 17. Milestone requirements

| Milestone | Key gaps |
|-----------|----------|
| Local MVP | Regenerate full local deploy; wire real pool reads |
| Testnet MVP | Deploy scripts + frontend addresses |
| Security beta | Professional audit + Timelock deploy + indexer |
| Production | Founder auth + Stage 1 single pool + automation off |

---

## Completion estimates

| Dimension | % |
|-----------|---|
| Smart contracts | ~88 |
| Frontend | ~38 |
| Integration | ~28 |
| Testing | ~72 |
| **Overall** | **~48** |

---

## Critical blockers

1. No mainnet protocol deployment  
2. Professional audit not started (audit prep only)  
3. Frontend not on real pools / Permit2 / automation  
4. No indexer  
5. USD caps off-chain only  

---

## Recommended next task

Regenerate local full stack (`node:local` + `deploy:stable-club:local`) and wire minimal on-chain position reads for `USDC-cbBTC-UNI-005` before any testnet deploy.

---

*Snapshot for auditors. UI presence does not prove functionality.*
