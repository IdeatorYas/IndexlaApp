# Stable Club â€” deployment runbook & rollback checklist

**Status:** Pre-deployment only. **Do not execute on Base mainnet** until founder authorization.

## Guarded Base mainnet path (tooling)

Script: `scripts/stable-club/deploy-base-mainnet.cjs`
Network: Hardhat `base` (`BASE_RPC_URL` + `DEPLOYER_PRIVATE_KEY` â€” missing secrets do **not** break local tests)

### Required env (broadcast only)

| Name | Purpose |
|---|---|
| `BASE_RPC_URL` | Base JSON-RPC |
| `DEPLOYER_PRIVATE_KEY` | Deployer EOA (never commit) |
| `STABLE_CLUB_GUARDIAN_ADDRESS` | Emergency pause guardian |
| `STABLE_CLUB_BASE_DEPLOY_CONFIRMATION` | Exact phrase: `I AUTHORIZE INDEXLA STABLE CLUB BASE MAINNET DEPLOY` |

### Command (founder-authorized only â€” do not run without confirmation)

```bash
npx hardhat run scripts/stable-club/deploy-base-mainnet.cjs --network base
```

### What the script does

1. Fail-closed preflight: chainId 8453, confirmation phrase, canonical Base bytecode checks
2. Deploy five-pool core stack (registries â†’ FeeRouter â†’ SwapRouter â†’ guards â†’ CL executor â†’ 5 adapters)
3. Wire Permit2, allowlists, 4 USDC routes, oracle feeds + cbBTC peg monitor
4. Set guardian + `maxGasPriceWei` (1 gwei)
5. Deploy 48h `StableClubTimelock` (Safe proposer/executor/admin) and transfer all Ownables to Timelock
6. Write non-secret resume state + deploy artifact under `deployments/base-mainnet/`
7. **Stop** â€” harvest/compound/rebalance remain disabled; **no pool activation**; no automation contracts

Resumable: re-running validates saved addresses/runtime code hashes against Base and fails closed on mismatch.

## Preconditions (all required)

- [ ] Audit freeze SHA tagged and auditor engagement authorized (or explicit founder waiver)
- [x] Founder-approved `gasCeilingWei` encoded (`1000000000`) â€” on-chain set via Timelock owner after deploy
- [ ] MVP Safe 2-of-3 verified on Base
- [ ] Fee recipient verified
- [ ] Guardian address assigned
- [ ] Fork rehearsal green (`StableClubStep3ForkRehearsal`)
- [ ] Guard unit tests green (`StableClubBaseMainnetDeployGuards`)
- [ ] Production site `indexla.tech` / app health unaffected by this ops path

## Deploy order (mainnet â€” when authorized)

1. Deploy `StableClubTimelock` with Safe as proposer/executor/admin
2. Deploy protocol contracts (registry â†’ fee router with fee recipient â†’ guards â†’ CL executor â†’ adapters)
3. Wire Permit2, operators, oracles, Stage 1 pool allowlist / routes
4. Set `SafetyController` guardian + approved `maxGasPriceWei`
5. Transfer **every** Ownable to Timelock
6. Verify ownership map (no EOA owners) â€” **production remains blocked** until SC-12 gate in [14-production-security-runbook.md](./14-production-security-runbook.md) is complete
7. Verify Safe Timelock roles
8. **Stop** â€” do not activate pools / open deposits until separate go-live checklist
9. Later (separate change): pin `getTrustedPhase2aBaseManifest()` from the deploy artifact

## Rollback / abort

| Failure | Action |
|---|---|
| Deploy tx reverts mid-stack | Do not transfer ownership of partial stack; document addresses; redeploy clean set |
| Wrong owner left as EOA | Immediately schedule Timelock transfer (if Timelock already owns others) or redeploy |
| Wrong fee recipient | Timelock `setFeeRecipient` after 48h â€” **or** abort go-live until fixed |
| Oracle misconfigured | Keep deposits paused; Timelock fix after delay |
| Need to halt after go-live | Guardian **pause** immediately; unpause only via Timelock 48h |

## Never

- Deploy from personal EOA retaining ownership
- Activate pools in the same session as first deploy without ownership verification
- Deploy automation contracts for private beta
- Use real user funds for rehearsal
- Skip the 48h delay for configuration unpause
- Print or commit private keys / RPC URLs
