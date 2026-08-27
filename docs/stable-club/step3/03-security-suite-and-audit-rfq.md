# Step 3 security suite & audit RFQ package

## Important label

> **Internal AI / engineering review materials are NOT a professional smart-contract audit.**  
> An independent auditor must be selected after **code freeze**. This package prepares scope only.

## Commit under review (baseline)

- Merge commit: `6654dfa`  
- Feature branch for Step 3 prep: `feature/stable-club-step3`  
- Safe/Permit2 + pre-deploy prep: `feature/stable-club-step3-safe-permit2`  
- Pre-checkpoint: `checkpoint/2026-08-27-stable-club-step3-pre-safe-permit2` @ `abafe49`  
- Candidate freeze: see `11-professional-audit-package.md` (tag after integration merge)

## In-scope contracts (audit)

1. `PermissionRegistry`  
2. `FeeRouter`  
3. `StableClubExecutor`  
4. `StableClubAutomationExecutor`  
5. `OracleGuard`  
6. `MevGuard`  
7. `SafetyController`  
8. `OpenServProposalGate`  
9. `UniswapV3Adapter`  
10. `AerodromeSlipstreamAdapter`  
11. Libraries: `ClNpmPositionValue`, `LiquidityAmounts`, `TickMath`, `FullMath`  
12. `StableClubTimelock` + Permit2 / `UserTokenPull` integration surface  
13. Launch-cap / gas-ceiling Timelock setters (when encoded)  

Exclude test-only mocks from audit opinion except as harness context.

## Threat model (summary)

| Threat | Control posture at Step 2 baseline |
|---|---|
| Executor retains funds | Zero-balance asserts; non-custodial LP NFT to user |
| OpenServ compromise | Typed proposals only; no keys; circuit breaker |
| Oracle manipulation | Chainlink + deviation; fail closed (to be tightened to ≤1%) |
| Approval abuse | Per-token NFT approve; ERC20 approve today → Permit2 planned |
| Reentrancy | `nonReentrant` on executors |
| Unauthorized pool/token | Allowlists + official catalogue activation gate |
| Fee overcharge | Floor `(gross*100)/10000`; fee only on swaps |
| Single-EOA governance | **Gap for production** — multisig+timelock designed, not yet wired |

## Required security-suite expansion (engineering)

Already strong: unit + remediation + pool-identity + Base fork smoke.  
Step 3 prep adds:

- Fee floor / zero-dust tests (explicit)  
- Launch-cap configuration unit tests  
- Automation **disabled-at-launch** gate tests  
- Governance design coverage docs (contracts deferred until authorized)  
- Invariant sketches: executor balance 0; fee ≤1%; no setApprovalForAll  

## RFQ request (for auditor — fill after code freeze)

Please provide:

1. Firm name, lead auditors, prior DeFi/CL AMM audit samples  
2. Fixed fee or time-and-materials for the in-scope set above  
3. Timeline from kickoff to final report  
4. Coverage of Permit2/Safe migration if included in freeze commit  
5. Confirmation of public report rights  

Deliverables expected: findings board (C/H/M/L), PoCs, fix review round, final PDF.

## Out of scope for this prep PR

- Hiring an auditor  
- Mainnet deploy  
- Paid Bugbot  
- Real funds  
