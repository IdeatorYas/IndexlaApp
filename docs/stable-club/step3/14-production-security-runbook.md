# Stable Club — production security runbook

**Audience:** Founder, Safe signers, on-call eng.  
**Scope:** Operational closures for audit findings SC-06, SC-07, SC-09, SC-11, SC-12.  
**Label:** Internal ops/security runbook. **Not a professional audit.**  
**Status:** Documentation only. **Production deployment remains blocked** until the SC-12 ownership gate below is satisfied.

Do not invent or paste unverified Safe addresses, Timelock addresses, or mainnet deployment values into this document. Record verified values only after on-chain confirmation in the go-live checklist.

Related: [12-deployment-runbook-rollback.md](./12-deployment-runbook-rollback.md), [02-governance-multisig-timelock.md](./02-governance-multisig-timelock.md), [13-post-mvp-disaster-recovery.md](./13-post-mvp-disaster-recovery.md).

---

## SC-06 — Adapter remap / de-approval

### Policy

- **Do not** remove, replace, or remap a strategy/pool adapter while any user positions for that binding remain open.
- Adapter allowlist changes (`setAdapterApproval`, pool↔adapter binding updates, strategy leg adapter remaps) require **Safe → Timelock** (minimum delay per SC-12 decision). No EOA admin path in production.
- Treat adapter de-approval as a **breaking** ops change: it can strand executor-mediated exits that depend on the approved adapter.

### Pre-change checklist

1. Pause new deposits for the affected pool/strategy (guardian / SafetyController as applicable).
2. Inventory open positions: strategyId, legIndex, poolId, adapter, positionTokenId, NFT owner.
3. Confirm each NFT is still user-held (non-custodial); INDEXLA must not custody NFTs.
4. Schedule the Timelock operation only after inventory sign-off.

### Post-change verification

1. Confirm Timelock execution succeeded and on-chain adapter/pool bindings match the intended map.
2. Re-read position inventory; verify no open position still points at a removed/unapproved adapter without a documented recovery path.
3. Smoke-check: deposit path remains paused until explicitly unpaused via Timelock; sample exit path documented for remaining positions.

### Emergency recovery when executor/adapter path is unavailable

Recovery uses the **user-held NFT / direct NonfungiblePositionManager (NPM) path**. The user owns the LP NFT and can exit through the NPM without relying on INDEXLA executor adapter approval. This is the independent break-glass path (see SC-11).

---

## SC-07 — Unused enforcement fields (metadata only)

The following strategy/leg fields are stored on-chain for registration/UX metadata and **are not currently enforced** as security controls during deposit or exit validation:

| Field | Location | Status |
|---|---|---|
| `maxLegPerDay` | `StrategyPermissionRegistry.PoolLegBinding` | **Metadata only — not enforced** |
| `allowedActions` | `StrategyPermissionRegistry.StrategyPermission` | **Metadata only — not enforced** |

**Do not** treat these fields as active on-chain limits or action allowlists.

Other fields (for example `maxTotalPerTx`, `maxTotalPerDay`, `maxLegPerTx`, per-leg `PermissionRegistry` action bits on bound leg permissions) may still be enforced where implemented — this section closes only the two unused fields above.

If product copy or operator runbooks previously implied these two fields gate execution, that implication is **incorrect** until a future contract change explicitly enforces them.

### PermissionRegistry amount caps and `amount=0` validation paths

`PermissionRegistry.maxAmountPerTx` and `maxAmountPerDay` are enforced **only when the operator passes a non-zero `amount`** to `validateExecution`.

Production paths that pass **`amount=0`** (tx/daily caps **not** enforced at validation):

| Path | Call site |
|---|---|
| Harvest | `StableClubAutomationExecutor._executeHarvest` |
| Exit (remove / withdraw-all) | `StrategyPermissionRegistry.validateStrategyLegExit` |
| Emergency | `PermissionRegistry.validateEmergencyExecution` (no amount parameter) |

**Do not** describe harvest or exit monetary caps as enforced via leg `PermissionRegistry` tx/daily fields. Deposit, swap, compound and rebalance pass authoritative non-zero amounts.

Harvest opt-in registration uses `maxAmountPerTx=0` / `maxAmountPerDay=0` in client scope builders — these are **non-applicable** on the harvest path (validation passes `amount=0`), not authoritative monetary caps. Do not describe them as active enforcement.

Harvest passes `slippage=0` to `validateExecution` — `maxSlippageBps` is **non-applicable** on the harvest path (not an active slippage cap at validation). Swap slippage is not part of harvest execution.

Exit and emergency monetary caps are likewise **non-applicable** at `PermissionRegistry` validation (`amount=0` or nonce-only emergency path). Exit slippage (`leg.slippageBps`) remains **enforced**.

---

## OpenServ proposal gate — global circuit-breaker policy

`OpenServProposalGate` uses **gate-wide** (not per-user/pool/strategy) accounting:

| Field | Scope | Behavior |
|---|---|---|
| `failedExecutionStreak` | Global | Any owner rejection (non-expiry) increments once |
| `circuitBroken` | Global | Trips when streak ≥ `autoBreakAfterFailures`; blocks all publisher submits and keeper execute |
| `positionProposalCount` | Per `keccak256(user, poolId, positionTokenId)` | Isolated active-proposal counter |

**Intentional coupling:** compound/harvest/rebalance failures share one circuit. Expiry cleanup (`finalizeExpired*Proposal`) remains allowed while circuit is open to decrement counters without incrementing the streak.

**Deadline rule (consistent across execute / reject / finalize):**

- Active while `block.timestamp <= deadline` (execute allowed; owner reject allowed; finalize **not** yet)
- Expired when `block.timestamp > deadline` (execute reverts; owner reject reverts `ProposalExpired`; finalize allowed)

---

## SC-09 — Equal five-way deposit (exact divisibility)

Canonical five-pool deposit allocates **exactly 20% (2_000 bps) per leg** across five legs (10_000 bps total).

### Rule

- Gross USDC (`grossUsdc`, 6 decimals) **must divide exactly by five** so each leg budget is identical with no remainder.
- On-chain, `StableClubConcentratedLiquidityExecutor.depositFivePoolStrategy` sums per-leg budgets and requires `budgetSum == grossUsdc`. Any mismatch reverts with **`GrossDepositMismatch`**.
- Non-divisible input **fails closed** (no partial deposit, no silent rebalancing of remainder).

### Operator / UI expectation

Reject or prevent submission of amounts that cannot allocate exactly 20% × 5 before wallet prompts. Do not describe unequal or remainder-bearing deposits as supported.

---

## SC-11 — Emergency NFT approval vs direct NPM break-glass

### Executor emergency exit (conditional)

Executor paths such as `emergencyExitLeg` / sequential emergency exit are **not unconditional**.

They require:

1. Valid strategy/leg binding and emergency validation on the registry path.
2. **Per-token ERC721 approval** of the position NFT **to the adapter** (`approve(adapter, tokenId)`). `setApprovalForAll` remains forbidden in product paths.
3. Non-zero minimum outputs per SC-01 (both mins must not be zero).

Without NFT approval to the adapter, the executor **cannot** close/decrease the position on the user’s behalf.

### Independent break-glass path

Because the **user owns the NFT**, the **direct NPM exit** (user wallet → NonfungiblePositionManager, without INDEXLA executor mediation) is the independent recovery path when:

- Executor emergency cannot run (missing approval, paused adapter, registry/operator issues), or
- Adapter remap/de-approval has removed the executor-mediated path (SC-06).

Do **not** document executor emergency as always available or as the sole recovery mechanism.

---

## SC-12 — Production ownership gate (Safe + Timelock)

### Hard block

**Production deployment / mainnet activation is blocked** until owner, operator, and registrar (and equivalent admin) roles are transferred **off EOAs** onto **Safe-controlled Timelock** governance.

Until that transfer is verified on-chain:

- Do not activate pools.
- Do not open deposits with real user funds.
- Do not treat any EOA-retained `owner` / operator admin key as production-ready.

### Role checklist (fill verified addresses only after deploy)

| Role / capability | Required controller | Verified address (placeholder) | Verified (Y/N) |
|---|---|---|---|
| Protocol `owner` (executors, registries, FeeRouter, guards, SafetyController, etc.) | Timelock (Safe as proposer/executor/admin) | `_TBD_TIMELOCK_` | [ ] |
| Timelock proposer | Production Safe | `_TBD_SAFE_` | [ ] |
| Timelock executor | Production Safe | `_TBD_SAFE_` | [ ] |
| Timelock admin | Production Safe | `_TBD_SAFE_` | [ ] |
| Guardian (emergency pause) | Designated guardian role (not protocol owner) | `_TBD_GUARDIAN_` | [ ] |
| Operator (execution callers as designed) | Timelock-managed operator set | `_TBD_OPERATOR_SET_` | [ ] |
| Registrar / pool–adapter allowlist admin | Timelock-owned setters only | via Timelock | [ ] |
| Fee recipient | Receive-only wallet (not owner) | `_TBD_FEE_RECIPIENT_` | [ ] |

Do not invent values for the `_TBD_*` placeholders here.

### Minimum delay decision (placeholder)

| Decision | Value | Owner sign-off |
|---|---|---|
| Timelock minimum delay | `_TBD_MIN_DELAY_` (target design reference: 48h — confirm before mainnet) | [ ] Founder |
| Unpause / config / adapter changes | Must respect minimum delay | [ ] |
| Guardian pause | Immediate (no Timelock delay) | [ ] |

### Verification steps (before go-live)

1. For every Ownable / admin surface in the deployment map: `owner() == Timelock`.
2. Confirm no deployer EOA, operator EOA, or Safe address incorrectly remains protocol `owner`.
3. Confirm Timelock roles: proposer / executor / admin are the intended Safe only.
4. Confirm guardian can pause immediately; unpause is Timelock-delayed only.
5. Record tx hashes / block number of ownership transfers in the go-live packet.
6. Only then proceed to pool activation checklist (separate from this ownership gate).

### Rollback / emergency procedure (ownership / admin)

| Situation | Action |
|---|---|
| Ownership transfer incomplete (EOA still owner) | **Abort go-live.** Complete Timelock transfers or redeploy clean; do not activate pools. |
| Malicious or mistaken Timelock op scheduled | Safe cancels / does not execute; review proposers; pause if funds at risk. |
| Need halt after go-live | Guardian **pause** immediately; unpause only via Timelock after minimum delay. |
| Adapter incident with open positions | Follow SC-06 inventory + SC-11 direct NPM break-glass; do not remap adapters while positions remain open. |
| Suspected key compromise | Pause; rotate Safe owners per Safe UI; review/cancel pending Timelock ops; confirm Timelock roles. |

Never bypass Timelock delay for unpause or adapter remap “to save time.”

---

## Pre-production actions still required (ops)

These are **not** closed by documentation alone:

1. Deploy/configure production Safe + Timelock; fill SC-12 checklist with verified addresses.
2. Transfer all admin roles from EOAs; complete verification steps.
3. Decide and encode `_TBD_MIN_DELAY_`.
4. Run fork rehearsal / go-live checklist with ownership map green.
5. Operator training: adapter change freeze while positions open; equal five-way deposit rule; emergency vs direct NPM distinction.
6. Founder authorization for mainnet activation (separate from this runbook).

---

## Base pool catalogue — configured vs verified vs activated

**Canonical catalogue:** `src/lib/stable-club/official-pools.ts` (chainId **8453** only).
**Stage 1 launch policy:** `src/lib/stable-club/stage1-launch.ts` — **`STAGE1_FIVE_POOL_BETA_POOL_IDS`** (all five verified catalogue pools; one atomic strategy, 20% each).

| State | Meaning | Ops rule |
|---|---|---|
| **Configured** | Pool ID, tokens, protocol, and infrastructure generation exist in catalogue | Do not treat as user-facing "active" |
| **Factory-verified** | Bound factory returns non-zero pool address on Base (CL100 uses **legacy** Aero factory `0x5e7BB104…`) | Catalogue-resolvable; required but not sufficient for live |
| **Stage 1 eligible** | Listed in `STAGE1_FIVE_POOL_BETA_POOL_IDS` | All five pools are beta activation candidates |
| **Live (product)** | Trusted manifest + attestation + on-chain activation for **all five** legs | Required before user deposits on Base |
| **Activated** | On-chain official pool activation + governance preflight per pool | Only state that may be called "active" in product copy |

**Historical note (superseded):** Earlier runbooks activated `USDC-cbBTC-UNI-005` only and excluded or deferred other catalogue IDs. Current policy is the five-pool atomic strategy above.

Local Hardhat manifests (`chainId 31337`, `isTestOnly: true`) are **isolated** from Base mainnet catalogue values. Never pair Base chainId 8453 with mock Permit2 or local deployment JSON.

### Launch automation flags (Stage 1 private beta)

`launch-params.ts` keeps **`harvestEnabled=false`**, **`compoundEnabled=false`**, **`rebalanceEnabled=false`**.

Do not describe keeper/OpenServ harvest, compound, or rebalance as **running** or **production-ready** while these flags are false. Manual wallet-signed paths may exist in development; production automation requires explicit launch-policy change plus keeper wiring.

UI/API helpers: `pool-launch-status.ts`, `local-automation-policy.ts`.

---

## Finding closure summary

| ID | Closure in this runbook |
|---|---|
| **SC-06** | No adapter remove/remap with open positions; Safe+Timelock only; pre/post inventory; recovery via user-held NFT / direct NPM |
| **SC-07** | `maxLegPerDay` and strategy `allowedActions` documented as metadata / not enforced |
| **SC-09** | Gross USDC must divide exactly by five; mismatch → `GrossDepositMismatch` fail-closed |
| **SC-11** | Executor emergency requires NFT approve(adapter); direct NPM is independent break-glass; not unconditional |
| **SC-12** | Production blocked until Safe+Timelock ownership; role checklist, delay placeholder, verify + rollback |
