### Step 1 — Base Foundation + Core Execution

Base Mainnet first · wallet connection · no vault or internal balance ledger · scoped permissions/revocation · stateless Executor · Fee Router charging 1% only on swaps · deposit/swap/add/remove liquidity · user owns LP token/NFT · emergency exit · private internal Base test pool · Base mainnet-fork tests.

### Step 2 — Base Pools + Dashboard + Automation

Integrate Uniswap V3 and Aerodrome · Stage 1 private beta is **one atomic five-pool Stable Club strategy** on Base — **one USDC deposit**, equal **20%** allocation across all five verified catalogue pools (`STAGE1_FIVE_POOL_BETA_POOL_IDS`) after test-pool validation and governance preflight · CL100 Aero pools bind to the legacy factory (catalogue-resolvable; included as strategy legs) · position dashboard · OpenServ monitoring and proposals · **keeper-gated** harvest / compound / rebalance (**disabled in Stage 1**: `harvestEnabled`, `compoundEnabled`, `rebalanceEnabled` = false) · oracle, MEV, gas, rate-limit and depeg circuit breakers · complete action testing.

### Step 3 — Security + Mainnet Launch

Claude/Kimi internal reviews · full security suite · independent audit and fixes · multisig and timelock · verified deployment · launch **five-pool atomic strategy** with caps · monitor and raise limits gradually · add Ethereum pools and cross-chain only after Base is stable.

---

---

---

---

---

---

---

---

- **USDC/cbBTC CL100 — Aerodrome Slipstream**
- **USDC/cbBTC 0.05% — Uniswap V3**
- **cbBTC/WETH CL10 — Aerodrome Slipstream**
- **cbBTC/WETH CL100 — Aerodrome Slipstream**
- **cbBTC/WETH 0.05% — Uniswap V3**

