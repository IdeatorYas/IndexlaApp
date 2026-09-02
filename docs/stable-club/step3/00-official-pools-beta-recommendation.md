# Official Base pools — factory inspection & private-beta recommendation

**Status:** read-only Base fork inspection (no transactions, no real funds)  
**Fork block:** see `official-pools-inspection.json`  
**Catalogue source:** `src/lib/stable-club/official-pools.ts`  
**REAUDIT-F02 (2026-08-31):** Aerodrome CL100 catalogue IDs bind to the **legacy** Slipstream factory (`0x5e7BB104…`), not the current-generation factory.

> **Policy superseded (2026-09):** Stage 1 private beta now targets **one atomic five-pool Stable Club strategy** on Base — one USDC deposit, equal **20%** allocation across all five verified catalogue pools. Historical single-pool / CL100-exclusion notes below are retained for audit traceability only.

**Rule:** RLUSD/USDC and PYUSD/USDC are **not** approved unless formally onboarded.

## Summary table (five official catalogue IDs)

| Catalogue ID | Protocol | Pair | Fee / tickSpacing | Factory generation | Factory-derived pool | Exists on bound factory? | Five-pool beta policy | Catalogue risk |
|---|---|---|---|---|---|---|---|---|
| `USDC-cbBTC-AERO-CL100` | Aerodrome Slipstream | USDC/cbBTC | tickSpacing **100** | **legacy** | `0x4e962bb3889bf030368f56810a9c96b83cb3e778` | **YES** (legacy factory) | **Stage 1 eligible — 20% leg** | medium |
| `USDC-cbBTC-UNI-005` | Uniswap V3 | USDC/cbBTC | fee **500** (0.05%; catalogue `feeBps=5`) | uniswap-v3 | `0xfBB6Eed8e7aa03B138556eeDaF5D271A5E1e43ef` | **YES** | **Stage 1 eligible — 20% leg** | medium |
| `cbBTC-WETH-AERO-CL10` | Aerodrome Slipstream | cbBTC/WETH | tickSpacing **10** | current | `0x42d4a22CaD0F5a49681a5715cE994Af73A43B76b` | **YES** | **Stage 1 eligible — 20% leg** | high |
| `cbBTC-WETH-AERO-CL100` | Aerodrome Slipstream | cbBTC/WETH | tickSpacing **100** | **legacy** | `0x70acdf2ad0bf2402c957154f944c19ef4e1cbae1` | **YES** (legacy factory) | **Stage 1 eligible — 20% leg** | high |
| `cbBTC-WETH-UNI-005` | Uniswap V3 | cbBTC/WETH | fee **500** (0.05%) | uniswap-v3 | `0x7AeA2E8A3843516afa07293a10Ac8E49906dabD1` | **YES** | **Stage 1 eligible — 20% leg** | high |

### Terminology (configured vs verified vs activated)

| State | Meaning |
|---|---|
| **Configured** | Pool ID exists in `official-pools.ts` with tokens, protocol, and infrastructure generation. |
| **Factory-verified** | Bound factory returns a non-zero pool address on Base (chainId 8453). CL100 uses **legacy** factory only. |
| **Stage 1 eligible** | Listed in `stage1-launch.ts` (`STAGE1_FIVE_POOL_BETA_POOL_IDS` — all five catalogue pools). |
| **Live (product)** | Trusted manifest + attestation + on-chain activation for **all five** pools — not UI-only state. |
| **Activated** | On-chain `officialPoolsActivated` + governance preflight completed for each pool leg. |

Factory verification does not imply live product status. **Automation remains disabled** (`harvestEnabled`, `compoundEnabled`, `rebalanceEnabled` = false).

### Related Aero pools that exist but are **not** in the official catalogue

Factory probe (not activation candidates until onboarding):

| Pair | tickSpacing | Pool | Notes |
|---|---|---|---|
| USDC/cbBTC | 1 | `0x9D14ff91…` | exists; not catalogue |
| USDC/cbBTC | 10 | `0x3F53aFD1…` | exists; ~1.2k USDC depth at inspection — shallow |
| USDC/cbBTC | 50 | `0x160D7E9d…` | exists; not catalogue |
| cbBTC/WETH | 1 / 50 | see probe | exists; not catalogue |

**Critical:** Never silently remap CL100 catalogue IDs to a different tickSpacing or factory generation. Onboarding must be explicit.

## Oracle availability (inspection-time)

| Feed | Result |
|---|---|
| ETH / USD (`0x71041ddd…Bb70`) | Live at inspection (`ok: true`) |
| USDC / USD & BTC / USD candidates tried | Decode failures / checksum issues — **must be re-verified against current Chainlink Base docs before launch** |
| Policy (approved) | Chainlink required + protocol TWAP where available; fail closed on stale/missing; ≤1% depeg; ≤1% oracle/TWAP deviation |

Gas at inspection: ~1.0 gwei base fee band; recommended configurable ceiling ≈ **5× observed `maxFeePerGas`** (~5.0 gwei at inspection). Re-measure before Stage 0.

## Five-pool private beta (current recommendation)

### Confirmed Stage 1 (founder) — one atomic strategy

**One USDC deposit → five equal 20% legs across all verified catalogue pools.**

- Product: single **Deposit Into 5-Pool Strategy** action; user receives five LP NFTs.
- All five pools in `STAGE1_FIVE_POOL_BETA_POOL_IDS` are eligible for Base beta activation.
- **Live** deposits require manifest, attestation, and governance activation for **every** leg.
- **Automation:** harvest / compound / rebalance remain **disabled** at launch.

### Historical recommendation notes (superseded)

Earlier drafts activated **`USDC-cbBTC-UNI-005` only** and deferred or excluded other catalogue IDs. That policy is **superseded** by the five-pool atomic strategy above. Do not use the historical single-pool notes for current runbooks.
