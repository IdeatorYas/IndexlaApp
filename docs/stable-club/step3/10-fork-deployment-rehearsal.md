# Stable Club Step 3 — Base-fork deployment rehearsal

**Scope:** Local Hardhat fork of Base only. **No mainnet deploy. No real funds. No pool activation.**

**Test:** `test/stable-club/StableClubStep3ForkRehearsal.test.cjs`  
**Requires:** `BASE_RPC_URL` in `.env` / `.env.local`

## Ownership map (post-rehearsal target)

| Contract | Owner |
|---|---|
| `PermissionRegistry` | Timelock |
| `FeeRouter` | Timelock |
| `StableClubExecutor` | Timelock |
| `StableClubAutomationExecutor` | Timelock |
| `OracleGuard` | Timelock |
| `MevGuard` | Timelock |
| `SafetyController` | Timelock |
| `OpenServProposalGate` | Timelock |

| Role | Address |
|---|---|
| Timelock proposers / executors / admin | MVP Safe `0x356A4A432EE57F31F5cF8Fdd55F95c1FF6Cd5910` |
| Fee recipient (receive-only) | `0x9d269f7A3d3f781740081D35F086D68a4a21442D` |
| Permit2 (production wiring) | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

**Assertion:** No deployer/user/guardian EOA and no Safe address retains protocol `owner`. Safe only holds Timelock roles.

Adapters are executor-bound (no separate Ownable transfer in current adapters).

## Verified in rehearsal

1. Deploy 48h `StableClubTimelock` with Safe as proposer/executor/admin  
2. Transfer all protocol Ownable roles to Timelock  
3. Wire INDEXLA fee recipient + Permit2 on production-shaped FeeRouter/executors  
4. Guardian emergency pause immediate; delayed unpause via Timelock after 48h  
5. Config change (`setMaxGasPriceWei`) requires 48h delay  
6. EOA cannot schedule Timelock ops  
7. Fee floor routes to MVP fee recipient (MockPermit2 path)  
8. Enter/exit via `deployStableClubStack` mocks (impersonation/fork only)

## Run

```bash
npx hardhat test test/stable-club/StableClubStep3ForkRehearsal.test.cjs
```
