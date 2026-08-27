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

### 1. Primary — `USDC-cbBTC-UNI-005` (Uniswap V3 0.05%)

- Only **medium**-risk official ID that **exists**
- Deep USDC inventory relative to the set
- Factory-verified address
- Matches Bible preference for stable→BTC before BTC→ETH

### 2. Secondary — hold until governance chooses one of:

**Option A (preferred for risk):** Do **not** enable a second pool in Stage 1. Run single-pool private beta on `USDC-cbBTC-UNI-005` under the approved caps, then onboard a second USDC/cbBTC venue (e.g. Aero at a **verified** tickSpacing) through the catalogue process.

**Option B (if two pools are mandatory from the current five):** `cbBTC-WETH-AERO-CL10` — exists and has deeper inventory than `cbBTC-WETH-UNI-005`, but is **high** risk (volatile/volatile). Use **tighter** per-pool/user caps than the USDC/cbBTC pool and keep automation off.

**Do not recommend:** non-existent `*-AERO-CL100` IDs; RLUSD/USDC; PYUSD/USDC.

## Decision required from founder

Confirm private-beta set as either:

1. **Single pool:** `USDC-cbBTC-UNI-005` only, or  
2. **Two pools:** `USDC-cbBTC-UNI-005` + `cbBTC-WETH-AERO-CL10` (with tighter BTC/ETH caps)

No pools are activated by this report.
