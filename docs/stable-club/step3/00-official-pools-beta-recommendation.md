# Official Base pools — factory inspection & private-beta recommendation

**Status:** read-only Base fork inspection (no transactions, no real funds)  
**Fork block:** see `official-pools-inspection.json`  
**Catalogue source:** `src/lib/stable-club/official-pools.ts`  
**Rule:** RLUSD/USDC and PYUSD/USDC are **not** approved unless formally onboarded.

## Summary table (five official catalogue IDs)

| Catalogue ID | Protocol | Pair | Fee / tickSpacing | Factory-derived pool | Exists? | Approx. balances (fork) | Catalogue risk |
|---|---|---|---|---|---|---|---|
| `USDC-cbBTC-AERO-CL100` | Aerodrome Slipstream | USDC/cbBTC | tickSpacing **100** | `address(0)` | **NO** | n/a | medium |
| `USDC-cbBTC-UNI-005` | Uniswap V3 | USDC/cbBTC | fee **500** (0.05%) | `0xfBB6Eed8e7aa03B138556eeDaF5D271A5E1e43ef` | **YES** | ~5.69M USDC + ~29.13 cbBTC | medium |
| `cbBTC-WETH-AERO-CL10` | Aerodrome Slipstream | cbBTC/WETH | tickSpacing **10** | `0x42d4a22CaD0F5a49681a5715cE994Af73A43B76b` | **YES** | ~2358 WETH + ~60.67 cbBTC | high |
| `cbBTC-WETH-AERO-CL100` | Aerodrome Slipstream | cbBTC/WETH | tickSpacing **100** | `address(0)` | **NO** | n/a | high |
| `cbBTC-WETH-UNI-005` | Uniswap V3 | cbBTC/WETH | fee **500** (0.05%) | `0x7AeA2E8A3843516afa07293a10Ac8E49906dabD1` | **YES** | ~2181 WETH + ~33.21 cbBTC | high |

### Related Aero pools that exist but are **not** in the official catalogue

Factory probe (not activation candidates until onboarding):

| Pair | tickSpacing | Pool | Notes |
|---|---|---|---|
| USDC/cbBTC | 1 | `0x9D14ff91…` | exists; not catalogue |
| USDC/cbBTC | 10 | `0x3F53aFD1…` | exists; ~1.2k USDC depth at inspection — shallow |
| USDC/cbBTC | 50 | `0x160D7E9d…` | exists; not catalogue |
| cbBTC/WETH | 1 / 50 | see probe | exists; not catalogue |

**Critical:** Catalogue IDs `*-AERO-CL100` do **not** resolve on Base. Do not activate them. Correct tickSpacing (or remove the IDs) only through the formal onboarding process.

## Oracle availability (inspection-time)

| Feed | Result |
|---|---|
| ETH / USD (`0x71041ddd…Bb70`) | Live at inspection (`ok: true`) |
| USDC / USD & BTC / USD candidates tried | Decode failures / checksum issues — **must be re-verified against current Chainlink Base docs before launch** |
| Policy (approved) | Chainlink required + protocol TWAP where available; fail closed on stale/missing; ≤1% depeg; ≤1% oracle/TWAP deviation |

Gas at inspection: ~1.0 gwei base fee band; recommended configurable ceiling ≈ **5× observed `maxFeePerGas`** (~5.0 gwei at inspection). Re-measure before Stage 0.

## Safest two for private beta (recommendation)

### Confirmed Stage 1 (founder) — single pool only

**`USDC-cbBTC-UNI-005` only.**

- `cbBTC-WETH-AERO-CL10` deferred to Stage 2 after onboarding, tighter caps, and successful UNI beta monitoring.
- Unavailable Aero CL100 IDs must never activate or silently remap.

### Historical recommendation notes

1. Primary — `USDC-cbBTC-UNI-005` (Uniswap V3 0.05%) — **selected**
2. Secondary options were rejected for Stage 1; Stage 2 may reconsider Aero CL10 under governance.
