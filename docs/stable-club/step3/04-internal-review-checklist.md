# Internal Step 3 review checklist

> **This checklist is an internal engineering / AI-assisted review aid.**  
> **It is NOT a professional smart-contract audit and must never be presented as one.**

## Process

1. Complete checklist against freeze commit SHA  
2. File gaps as tracked issues  
3. Re-run Hardhat + Vitest + fork suites  
4. Only then prepare auditor RFQ package  

## Non-custodial invariants

- [ ] No vault / pooled ledger  
- [ ] LP NFT / LP tokens minted to user (or user Safe)  
- [ ] Executor ends each flow with zero token balances  
- [ ] Emergency exit does not charge swap fee  

## Authorization

- [ ] No unlimited ERC20 approvals in product paths  
- [ ] No `setApprovalForAll` in product paths  
- [ ] Permission expiry / pause / revoke work  
- [ ] Official pools require catalogue + activation  

## Fees

- [ ] Fee only on executed swaps  
- [ ] Floor rounding `(gross * 100) / 10000`  
- [ ] Fee amount 0 ⇒ charge 0 (no dust min)  

## Oracles / safety

- [ ] Fail closed on stale/missing oracle  
- [ ] Depeg threshold configurable (proposed 1%)  
- [ ] Guardian can pause immediately  
- [ ] Unpause requires timelock (when wired)  

## Launch posture

- [ ] Automation harvest/compound/rebalance **disabled** for Stage 1  
- [ ] Caps loaded from configurable launch params  
- [ ] No signer addresses in repo  

## Reviewer attestation

Reviewer: ______________  
Commit: ______________  
Date: ______________  
Result: Pass / Gaps filed  
Explicit statement: “This is not a professional audit.”  
