# Exit-percent Safe cutover — live status

## CREATE complete (Base)

| Role | Address |
|------|---------|
| **New CL executor** (owner = Safe) | `0x455cc33194f82E253F41d91C1201eB4095c9D1Fa` |
| Previous CL executor (keep for open positions) | `0x488f0680ff28908F49CC85C05b9E4813e657FcD2` |
| Adapter[0] | `0x426dF92067335e3B5Df01a8e0165Ac7BFCA27E8D` |
| Adapter[1] | `0x6d81BC4748483D61a16dDB9F44C2F4C98301e3ae` |
| Adapter[2] | `0x60DD0546b4816DAaEb864F1A3EbF3619D60646d3` |
| Adapter[3] | `0x76C480a97589f4384E20d35F08436FA2758CE58b` |
| Adapter[4] | `0x5831Dbc39a336e22A54F828fDcd3d75CfE26Ef1D` |
| Ownership transfer tx | `0x29bc464834e46ab48bd517ae38134af73b4292b0a7e257a6232ec60077a8ca73` |

Shared registries/swapRouter/oracle/mev/safety **reused** from `safe-owned-stack-create.json`.

## Safe 2-of-3 — ACTION REQUIRED

- **Queue:** https://app.safe.global/transactions/queue?safe=base:0x356A4A432EE57F31F5cF8Fdd55F95c1FF6Cd5910
- **safeTxHash:** `0x9da1c5f2b5f8ddbdaf86b3553e20c23a82371d7e4edaa985b499f6f1bbe0db08`
- **Nonce:** 2 · **Threshold:** 2 · **1 confirmation already proposed**
- **18 inner calls** — see `exit-percent-cutover-approval-pack.json`

Review every inner call (`setOperator`, `setExecutorApproved`, `setPermit2`, token/adapter approvals, `registerPool`). Confirm & execute as remaining owner(s).

## Do not enable % until

1. Safe MultiSend executed on-chain  
2. Basescan verify new executor + 5 adapters (`ETHERSCAN_API_KEY` in `.env.local`)  
3. Tiny Base E2E on **new** stack: deposit → 20% → 50% → 100% `exitAllToUsdc`  
4. Pin trusted manifest + `features.exitPercentToUsdc=true` + app deploy  

## Existing open positions

Strategy legs pin **old** adapters permanently.  
**Required:** 100% `exitAllToUsdc` on **current** product stack (`0x488f…`), then register a **new** strategy against the new adapters before using partial %.

## Etherscan key

Paste into local `.env.local` line `ETHERSCAN_API_KEY=` (file opened in editor; never commit).
