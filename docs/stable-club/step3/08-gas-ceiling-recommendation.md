# Base gas ceiling — evidence-based recommendation (not hardcoded)

**Status:** Recommendation only. `PRIVATE_BETA_LAUNCH_PARAMS.safety.gasCeilingWei` remains **`null`**.  
**Configurable via Timelock** after founder approval.

## Observation window (2026-08-27, Base mainnet RPC sample)

| Metric | Sample |
|---|---|
| Latest `baseFeePerGas` | `5_000_000` wei (0.005 gwei) |
| Block gas used (sample) | ~34.9M |

Base L2 execution gas is typically cheap; **L1 data availability fees** dominate user-facing cost volatility for calldata-heavy txs (CL mint/increase/swap).

## Expected Stage 1 tx surface (manual; automation off)

1. ERC20 `approve(Permit2, bounded)` (optional if allowance remains)
2. Permit2 `approve(spender, amount, expiration)`
3. Permission registration (if new)
4. `depositAndAddLiquidity` / exit paths (adapter + NPM interactions)

Rough L2 gas envelopes (order-of-magnitude from similar Uniswap V3 Base flows; **measure on fork before locking**):

| Path | Approx L2 gas |
|---|---|
| ERC20 + Permit2 approve pair | 50k–120k |
| Deposit + optional swap + add liquidity | 250k–550k |
| Remove / withdraw | 150k–350k |

## Recommendation (do not encode yet)

1. **Instrument** a dry-run fork script for Stage 1 UNI-005 enter/exit with Permit2 and record:
   - L2 gas used
   - Effective `tx.gasprice` / priority fee
   - Estimated L1 data fee component (OP-stack `gasPriceOracle.getL1Fee`)
2. Set Timelock-configurable ceiling as:
   - `maxEffectiveWeiPerTx = (p95_total_fee_wei_observed) * 1.5` during private beta
   - Revisit weekly or after Base fee regime changes
3. Fail closed when projected fee > ceiling; user pays gas (already policy).
4. Keep ceiling **out of** Solidity immutables — owner/Timelock setter on `SafetyController` or execution gate when implemented.

## Explicit non-action

Do **not** hardcode `gasCeilingWei` in `launch-params.ts` until founder signs off on a measured value from the fork evidence pack.
