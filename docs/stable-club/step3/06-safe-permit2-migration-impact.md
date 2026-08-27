# Safe + Permit2 migration — compatibility & security impact

**Branch:** `feature/stable-club-step3-safe-permit2`  
**Checkpoint:** `checkpoint/2026-08-27-stable-club-step3-pre-safe-permit2` @ `abafe49`  
**Label:** Internal engineering report. **Not a professional smart-contract audit.**

## What changed

| Surface | Change |
|---|---|
| `FeeRouter` | ERC20 pull via Permit2 when set; legacy `transferFrom` only if `permit2 == 0` (local/test) |
| `StableClubExecutor` | Deposit stablecoin pull via Permit2 |
| `StableClubAutomationExecutor` | Compound/rebalance user ERC20 pulls via Permit2 |
| ERC721 LP NFTs | **Unchanged** — per-token `approve(adapter, tokenId)` only; `setApprovalForAll` still forbidden in UI helpers |
| Governance guards | Mainnet blocked while signers TBD / owner ≠ Timelock / Permit2 non-canonical / oracle docs pending |
| Gas ceiling | Remains `null` in launch params; recommendation doc only |

## Compatibility

- **Local/testnet Stage 0:** EOAs + legacy ERC20 approve path (`permit2 == 0`) still work for unit tests.
- **Mainnet:** Must wire canonical Base Permit2 on FeeRouter + executors; owner must be 48h Timelock controlled by 3-of-5 Safe; production guards refuse TBD signers.
- **Existing Step 1/2 EOA users:** Breaking for production cutover — users must revoke old ERC20 allowances to FeeRouter/executors and grant **bounded** ERC20→Permit2 + Permit2→spender allowances. NFT re-approve per tokenId if Safe becomes `perm.user` / NFT owner.
- **PermissionRegistry:** `perm.user` may be Safe address; validation still `msg.sender == perm.user` (Safe executes as itself).

## Security properties preserved

- No unlimited ERC20 approve (TS builders + MockPermit2 reject `uint160.max` / `uint256.max`)
- Permit2 allowances require future expiration
- NFT: per-token only
- Emergency pause remains immediate (guardian); unpause/config via Timelock
- Fee floor math unchanged: `(gross * 100) / 10000`

## Residual risks (pre-audit)

1. Production must never leave `permit2 == 0` on mainnet (guarded in TS; on-chain still allows owner to unset — Timelock-only owner mitigates).
2. USDC/BTC feed addresses verified on-chain; **official Chainlink docs UI confirmation still pending** for USDC + BTC before mainnet.
3. Users can still manually set unlimited ERC20 approve to Permit2 outside INDEXLA UI — product must never request it; consider on-chain max allowance checks later.
4. Safe as `perm.user` changes UX/signing; no Safe module yet (out of scope).
5. Automation paths updated but Stage 1 keeps harvest/compound/rebalance **disabled**.

## Explicit non-actions

No deploy · no pool activation · no real funds · no Bugbot · no professional audit kickoff.
