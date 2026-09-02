# Stable Club — post-MVP disaster-recovery checklist

**Audience:** Founder + Safe signers + on-call eng.  
**Assumption:** Protocol live on Base; Safe 2-of-3; Timelock owns admin; Stage 1 **five-pool atomic strategy** (all legs must be activated for live deposits).

## Severity triage

| Severity | Examples | First action |
|---|---|---|
| **S0 — funds / exploit** | Drain, approval abuse, oracle fail-open | Guardian **global pause**; stop all UI entry; notify signers |
| **S1 — incorrect fees / config** | Wrong fee recipient, bad ceiling | Pause deposits; Timelock schedule fix |
| **S2 — degraded UX** | RPC outage, high L1 fees | Communicate; no ownership change |
| **S3 — process** | Lost signer device | Safe owner rotation per Safe UI (off Timelock critical path) |

## Immediate controls (no Timelock delay)

- Guardian: `setGlobalPause(true)`, pool/deposit/automation/swap pauses, depeg flags  
- Users: revoke permissions / exit via documented paths only — executor emergency requires per-token NFT `approve(adapter, tokenId)` and is **not** unconditional; if that path is unavailable, use the user-held NFT **direct NPM** break-glass path (see [14-production-security-runbook.md](./14-production-security-runbook.md) SC-11)

## Delayed controls (Safe → Timelock ≥48h)

- Unpause any global/config pause  
- Change fee recipient, gas ceiling, oracle feeds, allowlists, operators  
- Transfer ownership (should already be Timelock-only)

## Recovery playbooks

### 1. Suspected exploit

1. Guardian pause all  
2. Freeze app entry points (feature flags) — do not take marketing site offline  
3. Preserve tx hashes / block number  
4. Engage auditor / incident response  
5. Do **not** unpause until root cause + fix reviewed  

### 2. Compromised Safe signer (1 of 3)

1. Remaining 2 signers: rotate out compromised owner via Safe  
2. Review pending Timelock ops; cancel malicious scheduled ops if any  
3. Confirm Timelock roles still Safe-only  

### 3. Compromised fee recipient EOA

1. Pause if needed  
2. Timelock schedule new fee recipient  
3. Sweep only if keys still controlled — else treat as loss of future fees  

### 4. Oracle / depeg incident

1. Flag depeg / pause deposits  
2. Users may exit per product rules  
3. Clear depeg only via Timelock after review  

### 5. Keys / ops

- Never store private keys in repo or CI  
- Safe signers use hardware wallets  
- Document offsite recovery contacts  

## Explicit non-goals

- INDEXLA does not custody user LP / tokens  
- DR does not include refunding lost user keys  
- Do not bypass Timelock for unpause “to save time”  
