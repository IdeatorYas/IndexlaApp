# Safe / Permit2 / NFT-approval — migration & design impact report

**Label:** Internal design analysis for Step 3. **Not a professional smart-contract audit.**  
**Rule:** No Step 1/2 architecture changes until this report is approved and a follow-up implementation plan is explicitly authorized.

## Current Step 1/2 model (as of `6654dfa`)

| Surface | Current behavior |
|---|---|
| ERC20 | Direct `approve` / `transferFrom` from user EOA to FeeRouter / adapters |
| LP NFT (Uni / Aero) | Per-token `npm.approve(adapter, tokenId)` — never `setApprovalForAll` in product path |
| Permissions | `PermissionRegistry` scoped actions, caps, expiry, pause/revoke |
| Account | EOA-centric UI (`StableClubWalletProvider`) |
| Automation | Harvest / compound / rebalance via `StableClubAutomationExecutor` + per-token NFT approval |

## Target model (founder-approved)

1. User-owned **Safe / smart account** with bounded, expiring, revocable permissions  
2. **Permit2** for ERC20 approvals  
3. **Per-token ERC721** approval for LP NFTs (keep; never unlimited)  
4. Never unlimited approvals  

## Impact by component

### Contracts

| Component | Impact | Notes |
|---|---|---|
| `FeeRouter.applySwapFee` | **High** | Today pulls via `transferFrom(user, …)`. Must accept Permit2 AllowanceTransfer (or Safe module pull) while preserving floor fee math. |
| `StableClubExecutor` deposit/swap/add paths | **High** | Token pulls assume EOA allowances. Need Permit2 signature + spender allowlist (Permit2 contract only). |
| `StableClubAutomationExecutor` | **High** | Compound/rebalance pull tokens; Stage 1 launch keeps these **disabled**, but design must still account for later stages. |
| Uni / Aero adapters | **Medium** | Keep per-token NFT approve. Safe as NFT owner: `ownerOf` checks must accept Safe address as `perm.user`. |
| `PermissionRegistry` | **Medium** | `perm.user` becomes Safe address; registration UX and permission-id binding change. |
| `OpenServProposalGate` | **Low–Medium** | Proposals must target Safe-scoped permissions; still no keys / no arbitrary calldata. |
| Ownership (`owner` EOAs) | **High (governance)** | Replace with multisig + timelock (separate design doc). Not Permit2 itself. |

### Frontend / wallet

| Area | Impact |
|---|---|
| Wallet connect | Support Safe as primary execution account; EOA may be owner/signer only |
| Approvals UI | Replace raw ERC20 approve with Permit2 signature flow; keep NFT per-token approve UI |
| Transaction preview | Show Permit2 spender, amount, expiration, nonce; show NFT tokenId + adapter |
| Feature flag | Gate Safe/Permit2 behind Step 3 flag; preserve Step 1/2 EOA path until cutover |

### Tests

- New unit tests: Permit2 allowance bounds, expiry, revoke, zero-amount fee floor  
- Fork tests: Safe owns NPM NFT; adapter collect after per-token approve  
- Negative: unlimited approve forbidden; wrong spender; expired permit  

## Migration options (no selection yet)

1. **Parallel adapters:** Keep EOA path; add Permit2-capable pull helpers; migrate users gradually  
2. **Hard cutover after audit:** Deploy new immutable stack; users revoke old allowances and re-register Safe permissions  
3. **Safe Module:** INDEXLA module on user Safe for typed automation (larger design surface)

**Recommendation for next design gate:** Option 1 for development/testing; Option 2 for production freeze — subject to founder approval after audit RFQ.

## Non-goals (this phase)

- No production deployment  
- No signer address hardcoding  
- No automatic pool activation  
- No paid Bugbot  
- No Ethereum / cross-chain work  

## Open items before coding the migration

1. Safe vendor/stack (Safe{Wallet} official vs other audited smart account)  
2. Permit2 deployment address on Base (canonical Uniswap Permit2) confirmation  
3. Whether EOA-only beta is allowed for Stage 0 team wallets before Safe cutover  
4. Founder approval to begin implementation PR after this report  

## Conclusion

Safe + Permit2 + per-token NFT approve is compatible with INDEXLA’s non-custodial model but **touches FeeRouter, both executors, permission binding, and the wallet UI**. Treat as a **breaking authorization redesign**, not a drop-in patch. Step 1/2 behavior must remain frozen until an explicit implementation authorization follows this report.
