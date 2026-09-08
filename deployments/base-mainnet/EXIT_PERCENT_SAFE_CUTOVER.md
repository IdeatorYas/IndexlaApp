# Exit-percent Safe cutover — required actions

## Proven gap

Live adapters on Base (`0x518a…` … `0xf51b…`) **lack** `decreaseLiquidityTo`. Partial % USDC cannot be enabled on the current pinned stack.

## Agent-prepared (no broadcast)

| Artifact / script | Purpose |
|-------------------|---------|
| `scripts/stable-club/deploy-exit-percent-cutover-create.cjs` | EOA CREATE new CL executor + 5 adapters (with `decreaseLiquidityTo`), ownership → Safe. Reuses live shared registries/swapRouter. |
| `scripts/stable-club/build-exit-percent-cutover-pack.cjs` | Builds Safe MultiSend calldata pack (no broadcast). |
| `scripts/stable-club/verify-safe-owned-stack.cjs` | Basescan verify for **current** live spenders (needs `ETHERSCAN_API_KEY`). |

## Exact confirmation required to CREATE

```bash
# .env.local (do not commit):
STABLE_CLUB_BASE_DEPLOY_CONFIRMATION=I AUTHORIZE INDEXLA STABLE CLUB BASE MAINNET DEPLOY
BASE_RPC_URL=...
DEPLOYER_PRIVATE_KEY=...
ETHERSCAN_API_KEY=...   # for verify

npx hardhat run scripts/stable-club/deploy-exit-percent-cutover-create.cjs --network base
node scripts/stable-club/build-exit-percent-cutover-pack.cjs
```

## Safe 2-of-3 (you must sign)

1. Open `deployments/base-mainnet/exit-percent-cutover-approval-pack.json` after CREATE.
2. Review every `safeTransactions[]` entry (`to`, `data`, `decoded.method`).
3. Execute via Safe UI / propose-safe Multisend pattern — **agent will not bypass**.
4. After execute: Basescan-verify new executor + adapters; tiny Base E2E (deposit → 20% → 50% → 100% `exitAllToUsdc`).
5. Only then pin trusted manifest + `features.exitPercentToUsdc=true` and unlock app %.

## Existing open positions

Strategy legs pin **old** adapter addresses permanently (IDs non-recyclable).  
**Required:** complete **100%** `exitAllToUsdc` on the **current** verified stack, then register a **new** strategy against the new adapters before using partial %.

## Current product (pre-cutover)

- Withdraw = **100% only** atomic USDC via live `0x488f…` executor.
- NFT→adapter approve is required and bounded per `tokenId`.
- Recover button removed; stranded cbBTC/WETH shown read-only.
