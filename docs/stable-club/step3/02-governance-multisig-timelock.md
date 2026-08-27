# Governance design — multisig, guardian, timelock

**Label:** Internal governance design for Step 3. **Not a professional audit.**  
**Signer addresses:** intentionally **TBD** — do not hardcode.

## Approved parameters

| Item | Decision |
|---|---|
| Production multisig | **3-of-5** |
| Signers | TBD (not in repo) |
| Emergency guardian | Separate role; **immediate pause** only |
| Unpause | Multisig + **timelock** |
| Config changes (pools, tokens, adapters, fees, risk limits) | Multisig + **48h timelock** |
| Core contracts | **Immutable** (no upgradeable proxies) |
| Adapters | Replaceable only via **governed registry + timelock**; new versions deployed explicitly |

## Role matrix

| Action | Guardian | Multisig (no wait) | Multisig + 48h timelock |
|---|---|---|---|
| Global / pool / automation / deposit **pause** | Yes | Yes | — |
| **Unpause** any pause flag | No | No | Yes |
| Register / replace adapter | No | No | Yes |
| Approve token / activate official pool | No | No | Yes |
| Change fee recipient / fee bps (if ever mutable) | No | No | Yes |
| Change caps / depeg / oracle deviation / gas ceiling | No | No | Yes |
| Transfer `owner` to new governance | No | No | Yes |
| Cancel malicious queued op | — | Yes (if timelock supports cancellation) | — |

## Target ownership wiring (conceptual)

After deploy (Stage 0+), each `owner` on:

- `PermissionRegistry` operators remain executor-bound  
- `StableClubExecutor` / `StableClubAutomationExecutor`  
- `FeeRouter`  
- `OracleGuard` / `MevGuard` / `SafetyController` / `OpenServProposalGate`  

…moves from deployer EOA → **Timelock** as `owner`, with **Multisig** as timelock proposer/executor, and **Guardian** set on `SafetyController` (and any future pause hubs) for pause-only.

Exact Safe/Multisig addresses remain out of git until founder supplies them in a secure channel.

## Timelock policy

- Delay: **48 hours**  
- Immediate: emergency pause only  
- Unpause: queued ≥48h  
- No bypass for adapter/token/pool/fee/risk changes  

## Implementation plan (deferred coding until authorized)

1. Add `StableClubTimelock` (OZ TimelockController pattern) — immutable once delay set, or delay changeable only via itself  
2. Add thin `StableClubGovernorRoles` doc + tests for pause vs timelock paths  
3. Deploy scripts: wire owners to timelock; set guardian; **no mainnet** without explicit approval  
4. Never embed signer addresses in source; use env / sealed config excluded by `.gitignore`

## Safety defaults to enforce in config module (not permanent constants)

See `src/lib/stable-club/launch-params.ts` for proposed private-beta defaults (configurable).
