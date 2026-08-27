# Safe + Permit2 — executive recommendation (pre-migration)

**Label:** Internal design summary. **Not a professional smart-contract audit.**  
**Full analysis:** [01-safe-permit2-impact-report.md](./01-safe-permit2-impact-report.md)  
**Status:** Migration **code not started** (awaiting explicit authorization after this summary).

## Recommendation

1. **Keep** per-token ERC721 `approve(adapter, tokenId)` for Uni/Aero NFTs (already aligns with policy).  
2. **Adopt Permit2** for ERC20 bounded allowances into FeeRouter / executors (replace unlimited EOA `approve`).  
3. **Adopt user-owned Safe** as `perm.user` / NFT owner for durable automation stages (post Stage 1).  
4. **Do not** migrate during Stage 1 private beta if Stage 1 remains manual enter/exit only — optional EOA path may remain for Stage 0/1 **only** if founder confirms; otherwise require Safe before any public deposit.  
5. Implement as a **dedicated follow-up PR** after governance scaffolding lands and audit RFQ freeze commit is chosen.

## Why not code now

- Touches FeeRouter, both executors, permission binding, and wallet UX  
- Breaking authorization redesign relative to Step 1/2 EOA allowances  
- Must not land half-migrated beside Stage 1 single-pool config  

## Prerequisites before migration PR

- [ ] Founder approval of Option (parallel adapters vs hard cutover) from impact report  
- [ ] Canonical Base Permit2 address confirmed  
- [ ] Safe stack selected  
- [ ] Code freeze SHA for auditor RFQ  

## Non-actions

No Permit2/Safe Solidity or UI migration in the current branch commit series until explicitly authorized.
