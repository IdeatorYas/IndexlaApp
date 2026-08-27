# Stable Club — deployment runbook & rollback checklist

**Status:** Pre-deployment only. **Do not execute on Base mainnet** until founder authorization.

## Preconditions (all required)

- [ ] Audit freeze SHA tagged and auditor engagement authorized (or explicit founder waiver)  
- [x] Founder-approved `gasCeilingWei` encoded (`1000000000`) — on-chain set via Timelock owner after deploy  
- [ ] MVP Safe 2-of-3 verified on Base  
- [ ] Fee recipient verified  
- [ ] Fork rehearsal green (`StableClubStep3ForkRehearsal`)  
- [ ] Production site `indexla.tech` / app health unaffected by this ops path  

## Deploy order (mainnet — when authorized)

1. Deploy `StableClubTimelock` with Safe as proposer/executor/admin  
2. Deploy protocol contracts (registry → fee router with fee recipient → guards → executors → adapters)  
3. Wire Permit2, operators, oracles, Stage 1 pool allowlist  
4. Set `SafetyController` guardian + approved `maxGasPriceWei`  
5. Transfer **every** Ownable to Timelock  
6. Verify ownership map (no EOA owners)  
7. Verify Safe Timelock roles  
8. **Stop** — do not activate pools / open deposits until separate go-live checklist  

## Rollback / abort

| Failure | Action |
|---|---|
| Deploy tx reverts mid-stack | Do not transfer ownership of partial stack; document addresses; redeploy clean set |
| Wrong owner left as EOA | Immediately schedule Timelock transfer (if Timelock already owns others) or redeploy |
| Wrong fee recipient | Timelock `setFeeRecipient` after 48h — **or** abort go-live until fixed |
| Oracle misconfigured | Keep deposits paused; Timelock fix after delay |
| Need to halt after go-live | Guardian **pause** immediately; unpause only via Timelock 48h |

## Never

- Deploy from personal EOA retaining ownership  
- Activate pools in the same session as first deploy without ownership verification  
- Use real user funds for rehearsal  
- Skip the 48h delay for configuration unpause  
