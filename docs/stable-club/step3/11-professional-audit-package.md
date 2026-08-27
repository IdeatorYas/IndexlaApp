# Stable Club — professional audit package (pre-engagement)

> **Not a professional audit.** Internal prep for an independent firm after **code freeze**.  
> Do **not** begin paid audit or Bugbot until founder authorizes.

## Candidate audit-freeze SHA

| Field | Value |
|---|---|
| **Candidate freeze SHA** | `0b805a8924dcd2bfbb94cebdfd3205416855d0ca` (Safe/Permit2 integration merge) |
| **Docs tip** | `feature/stable-club-step3` @ `cae10e3` (freeze-metadata only; no contract delta vs merge) |
| **Branch** | `feature/stable-club-step3` |
| **Checkpoint** | `checkpoint/2026-08-27-stable-club-step3-pre-audit-freeze` |
| **Freeze policy** | Founder tags `audit-freeze/stable-club-step3-0b805a8` only after explicit ack; do not start paid audit until authorized |
| **Status** | **CANDIDATE** — not yet founder-tagged freeze |

## Scope (contracts)

1. `PermissionRegistry`  
2. `FeeRouter` (+ Permit2 / `UserTokenPull`)  
3. `StableClubExecutor`  
4. `StableClubAutomationExecutor`  
5. `OracleGuard` (+ peg monitor)  
6. `MevGuard`  
7. `SafetyController`  
8. `OpenServProposalGate`  
9. `StableClubTimelock`  
10. `UniswapV3Adapter` / `AerodromeSlipstreamAdapter`  
11. Libraries: `ClNpmPositionValue`, `LiquidityAmounts`, `TickMath`, `FullMath`, `UserTokenPull`

Exclude: `contracts/stable-club/test-only/**` from opinion (harness only).

## Governance / addresses (MVP — verified Base)

| Role | Address |
|---|---|
| Safe (2-of-3) | `0x356A4A432EE57F31F5cF8Fdd55F95c1FF6Cd5910` |
| Signers | `0x977e…f168`, `0xd31a…8f1b`, `0xF133…8720` |
| Fee recipient | `0x9d269f7A3d3f781740081D35F086D68a4a21442D` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

Model: **Safe → 48h Timelock → all protocol owners**. Fee wallet is receive-only.

## Stage 1 product constraints (auditor context)

- Pool: **USDC-cbBTC-UNI-005 only**  
- Automation: **off** at launch  
- Aero CL100: unavailable (no silent remap)  
- `gasCeilingWei`: recommended **1 gwei**; **not** encoded in launch params until founder approval  

## Deliverables expected from auditor

1. Findings board (C/H/M/L) with PoCs  
2. Fix-review round  
3. Final PDF report  
4. Explicit coverage of Permit2 pulls, Timelock ownership, fee floor, oracle fail-closed  

## RFQ checklist

See `03-security-suite-and-audit-rfq.md`. Fill firm details only after freeze.

## Explicit non-actions

- No mainnet deploy  
- No pool activation  
- No real funds  
- No paid Bugbot until authorized  
