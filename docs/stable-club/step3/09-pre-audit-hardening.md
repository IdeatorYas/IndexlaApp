# Pre-audit hardening — oracle + Safe/Permit2 UX + production gates

**Branch:** `feature/stable-club-step3-safe-permit2`  
**Label:** Internal engineering. **Not a professional audit.**

## Oracle model (Stage 1)

| Asset | Feed | Role |
|---|---|---|
| USDC | `0x7e8600…a2bc6B` (`USDC / USD`) | Primary |
| cbBTC | `0x07DA0E…9f9D` (`cbBTC / USD`) | Primary valuation |
| BTC | `0x3A932b…d446` (`BTC / USD`) | Secondary peg reference for cbBTC |

`OracleGuard.configurePegMonitor` enforces ≤1% cbBTC/BTC deviation; stale/invalid rounds fail closed. Default TWAP deviation also 100 bps.

## Wallet UX

- `StableClubApprovalsPanel`: bounded Permit2 preview, revoke/zero allowance, expiry, Safe vs EOA mode
- Mainnet: Safe required as `perm.user`
- Local/testnet: EOA legacy allowed
- NFT: per-token only (unchanged)

## Production / freeze gates

Mainnet blocked until: MVP 2-of-3 Safe + Timelock ownership + canonical Permit2 + verified Stage 1 feeds + clean Bugbot.  
`gasCeilingWei` founder-approved and encoded: **`1000000000`** (adjustable only via 48h Timelock).

## Non-actions

No deploy · no pool activation · no real funds · no professional audit kickoff · no audit-freeze tag until Bugbot clean.
