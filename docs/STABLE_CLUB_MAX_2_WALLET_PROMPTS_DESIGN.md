# Stable Club — Guaranteed ≤2 Wallet Prompts (Contract Design)

**Status:** Design only — not implemented.  
**Goal:** Guarantee maximum **2** wallet confirmations on first deposit and ideally **1** on later deposits, for **all** wallets (not only EIP-5792-capable ones).  
**Constraint:** Preserve exact-amount spending limits, short Permit2 TTL, non-custodial architecture, and existing five-pool safety gates.

EIP-5792 `wallet_sendCalls` is useful as an optional UX upgrade but **cannot** satisfy this requirement alone (many wallets ignore or partially support batching).

---

## Current prompt stack (problem)

First deposit today can require:

1. `registerFivePoolStrategy`
2. `USDC.approve(Permit2, exact)`
3. `Permit2.approve(USDC, CL executor, exact, short expiry)`
4. `depositFivePoolStrategy`

Later deposits can already be **1** prompt when registration exists and Permit2 coverage is still valid.

---

## Recommended design: `StableClubDepositGateway` (new peripheral contract)

Deploy a **non-custodial gateway** owned by the same Safe / Timelock as the CL executor. Users never grant the gateway open-ended spending; it only orchestrates already-bounded steps in **one user transaction**.

### Responsibilities (single `depositFirst` / `depositAgain` entry)

**First deposit (`depositFirst`)** — one user tx:

1. If strategy not registered for `msg.sender`: call `StrategyPermissionRegistry.registerFivePoolStrategy` **on behalf of user** via a one-time user signature **or** by having the registry accept `registerFor(user, …)` only when `msg.sender == gateway` **and** `user` supplied a typed-data consent in the same call.
2. Pull exact USDC via **Permit2 `permit` signature** (SignatureTransfer or AllowanceTransfer permit) — **signature, not a prior approve tx**.
3. Call `CLExecutor.depositFivePoolStrategy` with the same calldata the app builds today.

Net wallet UX:

| Step | Type |
|------|------|
| Typed-data: strategy consent + Permit2 permit (combined domain or two sigs in one wallet UI where supported) | **Signature(s)** — count as confirmation #1 if wallet merges; otherwise design for **one** Permit2+registration typed-data blob |
| `gateway.depositFirst(...)` | **Transaction** confirmation #2 |

Hard guarantee of ≤2 requires **collapsing registration + Permit2 into one signature payload** (custom EIP-712) plus **one** on-chain tx.

**Later deposit (`depositAgain`)** — ideally one user tx:

1. Skip registration.
2. If Permit2 allowance still covers exact amount + unexpired: gateway only calls deposit (user already approved) → **1 tx**.
3. If allowance missing/expired: include Permit2 permit signature in the same tx → **1 signature + 1 tx** (still ≤2).

### Why not put this inside `CLExecutor`?

- Keeps executor surface minimal and audited.
- Gateway can be upgraded/paused independently.
- Avoids expanding executor authorization surface.

### Security invariants (must hold)

1. **Exact amount only** — Permit2 permit / pull amount == `grossUsdc` for this deposit (no unlimited approve).
2. **Short expiry** — Permit2 signature deadline ≤ existing TTL policy (≤ 30 minutes); no TTL relaxation.
3. **User is strategy owner** — registry registration always binds `user == signer`; gateway cannot register for arbitrary third parties without their EIP-712 consent.
4. **Same allowlists** — gateway cannot choose adapters/routes; it forwards app-built legs to executor unchanged; executor retain pool/adapter/token/safety checks.
5. **No custody** — gateway ends each call with zero USDC / zero non-dust token balances; reverts on residual.
6. **Nonce / replay** — EIP-712 includes chainId, gateway address, strategyId/user, grossUsdc, deposit execution nonce, deadline.
7. **Pause** — gateway respects SafetyController deposit pause; cannot bypass executor gates.

### EIP-712 sketch (illustrative)

```text
DepositAuthorization {
  address user;
  bytes32 strategyId;      // 0 if first-time (gateway registers)
  uint256 grossUsdc;
  uint256 depositNonce;
  uint256 deadline;
  bytes32 legsHash;        // keccak of canonical leg encoding
}
```

Plus standard Permit2 `PermitSingle` / `PermitWitnessTransferFrom` for USDC → gateway or → executor (prefer **executor** as spender so gateway never holds lasting allowance).

### Preferred fund path

`User --Permit2 signature--> Executor pulls USDC` (gateway only calls executor; executor already Permit2-aware).  
Registration: either

- **A)** Registry gains `registerFivePoolStrategyWithSig(user, strategy, legs, sig)`, or  
- **B)** Gateway is briefly `msg.sender` only for a registry method that still stores `strategy.user = user` from the signed payload.

Option **A** is cleaner for auditors.

### App changes after gateway ships

1. Build quotes/legs as today.
2. Request **one** combined signature (registration witness + Permit2).
3. Submit **one** `gateway.depositFirst` / `depositAgain` tx with gas floor ≥ 10M + preflight.
4. Keep legacy sequential path as fallback only for broken RPC — not as the primary UX.

### Out of scope / rejected

- Unlimited `USDC.approve`
- Longer Permit2 TTL to reduce prompts
- Relying solely on EIP-5792
- Relayer custody of user keys

### Rollout

1. Audit gateway + registry sig method.
2. Safe/Timelock deploy; pin in phase2a manifest.
3. Feature-flag gateway deposits; keep executor ABI unchanged.
4. Base fork E2E: first deposit ≤2 prompts; second deposit 1 prompt; pause/depeg/slippage still revert.

---

## Summary

| Approach | Guarantees ≤2 on all wallets? |
|----------|-------------------------------|
| EIP-5792 batch only | **No** |
| App-only approve skipping | Later deposits only |
| **Gateway + EIP-712 register + Permit2 sig + one tx** | **Yes** |

Implement only after explicit product/security approval; this document is the concrete design target.
