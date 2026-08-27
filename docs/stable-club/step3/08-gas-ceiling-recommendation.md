# Base gas ceiling — founder-approved (encoded)

**Status:** Founder approved **`gasCeilingWei = 1000000000` (1 gwei)** for capped MVP.  
Encoded in `PRIVATE_BETA_LAUNCH_PARAMS.safety.gasCeilingWei`.  
**On-chain adjustments only** via Safe → **48h Timelock** → `SafetyController.setMaxGasPriceWei`.

**Evidence artifact:** `docs/stable-club/step3/gas-ceiling-evidence.json`  
**Code:** `src/lib/stable-club/gas-ceiling-recommendation.ts` (`encodeInLaunchParams: true`)

## Observation window (2026-08-27, Base mainnet RPC)

| Metric | Sample |
|---|---|
| `baseFeePerGas` (12 samples) | flat `5_000_000` wei (0.005 gwei) |
| OP `GasPriceOracle.l1BaseFee` | ~`71_334_913` wei |
| `getL1Fee` sample | ~`703_386_724` wei |

`SafetyController` enforces **`tx.gasprice` (L2)** only. L1 data fee remains ops-monitored separately.

## Fork rehearsal L2 gas

| Path | gasUsed |
|---|---|
| Test-pool deposit | 275,897 |
| withdrawAll | 178,669 |

## Policy

1. Launch params encode `1000000000`.
2. Deploy sets `SafetyController.maxGasPriceWei` to the same value before ownership transfer to Timelock.
3. Any change requires 2-of-3 Safe schedule + **48h** delay + execute.
4. No immutable Solidity constant for the ceiling.

## Explicit non-action

Do **not** deploy or activate pools until separate founder authorization.
