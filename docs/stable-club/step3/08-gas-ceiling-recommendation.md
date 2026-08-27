# Base gas ceiling — evidence-based recommendation (not hardcoded)

**Status:** Recommendation only. `PRIVATE_BETA_LAUNCH_PARAMS.safety.gasCeilingWei` remains **`null`**.  
**Configurable via Timelock** after founder approval (`SafetyController.setMaxGasPriceWei`).

**Evidence artifact:** `docs/stable-club/step3/gas-ceiling-evidence.json` (from `scripts/stable-club/measure-gas-ceiling.cjs`)  
**Code constant:** `src/lib/stable-club/gas-ceiling-recommendation.ts` (`encodeInLaunchParams: false`)

## Observation window (2026-08-27, Base mainnet RPC)

| Metric | Sample |
|---|---|
| `baseFeePerGas` (30 samples) | flat `5_000_000` wei (0.005 gwei) — min=max=p50=p95 |
| OP `GasPriceOracle.l1BaseFee` | ~`74_290_236` wei |
| `getL1Fee` ~500-byte calldata | ~`725_901_728` wei (~7.3e-10 ETH) |

Base L2 execution gas is cheap; **L1 data availability fees** dominate user-facing cost variance for calldata-heavy CL txs.  
`SafetyController` enforces **`tx.gasprice` (L2)** only — not total user cost including L1 data fee. Keep L1 fee monitoring as ops, separate from this ceiling.

## Stage 1 L2 gas envelopes

| Path | Evidence |
|---|---|
| Fork rehearsal test-pool deposit (no swap) | **275,897** L2 gas (`depositL2GasUsed`) |
| Fork rehearsal withdrawAll | **178,669** L2 gas (`exitL2GasUsed`) |
| Approx production UNI-005 (order-of-magnitude) | 250k–550k deposit; 150k–350k exit |

## Recommendation (do not encode in launch params yet)

| Field | Value |
|---|---|
| **Recommended `gasCeilingWei`** | **`1000000000` (1 gwei)** |
| Rationale | ~200× observed Base `baseFee`; fails closed on abnormal L2 fee spikes; Timelock can lower/raise |
| Map to | `SafetyController.maxGasPriceWei` via Timelock `setMaxGasPriceWei` |
| Launch params | Keep `null` until founder explicitly approves encoding |

## Timelock configurability

1. Deploy with recommended ceiling (or founder-approved alternate).
2. Changes require Safe (2-of-3) → Timelock schedule → **48h** → execute.
3. Do **not** bake the ceiling into Solidity immutables.

## Explicit non-action

Do **not** hardcode `gasCeilingWei` in `launch-params.ts` until founder signs off.
Do **not** deploy or activate pools based on this recommendation alone.
