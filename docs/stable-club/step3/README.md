# Stable Club — Step 3 index

Baseline: `6654dfa` · Governance scaffolding: `feature/stable-club-step3` @ `abafe49`  
**Safe/Permit2 migration branch:** `feature/stable-club-step3-safe-permit2`  
**Pre-migration checkpoint:** `checkpoint/2026-08-27-stable-club-step3-pre-safe-permit2`

| Doc | Purpose |
|---|---|
| [00-official-pools-beta-recommendation.md](./00-official-pools-beta-recommendation.md) | Factory inspection + safest beta pools |
| [official-pools-inspection.json](./official-pools-inspection.json) | Raw fork inspection artifact |
| [01-safe-permit2-impact-report.md](./01-safe-permit2-impact-report.md) | Pre-implementation migration impact |
| [02-governance-multisig-timelock.md](./02-governance-multisig-timelock.md) | MVP 2-of-3 Safe, guardian, 48h timelock |
| [03-security-suite-and-audit-rfq.md](./03-security-suite-and-audit-rfq.md) | Security suite + auditor RFQ (≠ professional audit) |
| [05-safe-permit2-recommendation-summary.md](./05-safe-permit2-recommendation-summary.md) | Pre-migration recommendation |
| [06-safe-permit2-migration-impact.md](./06-safe-permit2-migration-impact.md) | **Post-implementation** compatibility/security impact |
| [07-verified-base-addresses.md](./07-verified-base-addresses.md) | Permit2 / Safe / oracle verification |
| [verified-base-addresses.json](./verified-base-addresses.json) | Machine-readable verification artifact |
| [08-gas-ceiling-recommendation.md](./08-gas-ceiling-recommendation.md) | Evidence-based gas ceiling (not hardcoded) |
| [09-pre-audit-hardening.md](./09-pre-audit-hardening.md) | Oracle peg + Safe/Permit2 UX + freeze gates |

## Explicit non-actions

- No deploy, no real funds, no signer hardcoding, no pool activation, no paid Bugbot, no audit kickoff
- No Ethereum / cross-chain implementation
- Gas ceiling remains unset until founder approval of measured value
