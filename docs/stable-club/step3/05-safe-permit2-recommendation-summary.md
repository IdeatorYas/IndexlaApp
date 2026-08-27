# Safe + Permit2 — executive recommendation (pre-migration)

**Status:** Migration **implemented** on `feature/stable-club-step3-safe-permit2` (local/fork only — no deploy).  
**Full analysis:** [01-safe-permit2-impact-report.md](./01-safe-permit2-impact-report.md) · [06-safe-permit2-migration-impact.md](./06-safe-permit2-migration-impact.md)

## Recommendation (locked)

1. **Keep** per-token ERC721 `approve(adapter, tokenId)` for Uni/Aero NFTs.
2. **Adopt Permit2** for ERC20 bounded allowances into FeeRouter / executors.
3. **Adopt user-owned Safe** as `perm.user` / NFT owner for durable stages; governance Safe = 3-of-5 Timelock controller.
4. Stage 0 EOAs allowed **only** for local/testnet — never mainnet governance.
5. Never unlimited approvals.

## Prerequisites before mainnet

- [x] Dedicated migration branch authorized
- [x] Canonical Base Permit2 verified on fork
- [x] Safe stack preinstalls verified on fork
- [ ] USDC/BTC addresses confirmed in Chainlink data.chain.link UI
- [ ] Founder-supplied 3-of-5 signer set + governance Safe instance
- [ ] Owners wired to 48h Timelock
- [ ] Gas ceiling measured and approved (still null)
- [ ] Code freeze SHA for auditor RFQ

## Non-actions

No mainnet deploy · no pool activation · no real funds · no Bugbot · no professional audit yet.
