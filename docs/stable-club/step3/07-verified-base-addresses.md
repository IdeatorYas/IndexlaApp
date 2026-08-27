# Verified Base addresses — Permit2, Safe, Chainlink feeds

**Date:** 2026-08-27  
**Method:** Official docs listings + Base mainnet / fork bytecode + AggregatorV3 `description` / `decimals` / `latestRoundData`.  
**Rule:** Do not guess. Reject empty-bytecode candidates. Pending docs confirmation stays pending.

## Permit2

| Field | Value |
|---|---|
| Address | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| Sources | [Uniswap V4 deployments](https://developers.uniswap.org/docs/protocols/v4/deployments), [Base preinstalls](https://docs.base.org/base-chain/specs/protocol/execution/evm/preinstalls) |
| Fork check | Bytecode present (~9KB); `DOMAIN_SEPARATOR()` non-zero |

## Safe stack (Base preinstalls + ProxyFactory)

| Component | Address | Fork check |
|---|---|---|
| SafeL2 singleton (prefer) | `0xfb1bffC9d739B8D520DaF37dF666da4C687191EA` | bytecode present |
| Safe singleton | `0x69f4D1788e39c87893C980c06EdF4b7f686e2938` | bytecode present |
| MultiSend | `0x998739BFdAAdde7C933B942a68053933098f9EDa` | bytecode present |
| MultiSendCallOnly | `0xA1dabEF33b3B82c7814B6D82A79e50F4AC44102B` | bytecode present |
| SafeSingletonFactory | `0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7` | bytecode present |
| ProxyFactory v1.3.0 | `0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2` | `proxyCreationCode()` succeeds |

Sources: Base preinstalls docs; Safe `safe-deployments` for ProxyFactory.

**Not pinned:** Individual 3-of-5 governance Safe **instance** address (TBD — never invent).

## Oracle feeds

| Pair | Address | Decimals | On-chain description | Official docs confirmed? |
|---|---|---|---|---|
| ETH / USD | `0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70` | 8 | `ETH / USD` | Yes (widely published Chainlink Base proxy) |
| USDC / USD | `0x7e860098F58bBFC8648a4311b374B1D669a2bc6B` | 8 | `USDC / USD` | **Pending** data.chain.link human confirm (ecosystem listing + live rounds OK) |
| BTC / USD (for cbBTC) | `0x3A932b286715abc4A86a4ACAF68A6cdD89E0d446` | 8 | `BTC / USD` | **Pending** data.chain.link human confirm (Aave V3 Base cbBTC oracle + live rounds OK) |

### Rejected (empty bytecode — do not use)

- `0x7e860098f58bbfC8648a4311B374b1D669Be50Fe` (old USDC candidate)
- `0x64C911996D3c6AC71F9Bda319F22AD0632DD249B` (old BTC candidate)
- `0x07DA0e77e10873DEfA36220b89218952090bD270` (old BTC candidate)

### Notes

- USDC feed heartbeat can be multi-hour; configure `OracleGuard` staleness accordingly for stables.
- cbBTC uses BTC/USD; depeg/deviation policy still applies vs pool TWAP.
- Production guards block mainnet until `officialDocsConfirmed` for USDC and BTC.

Artifact mirror: `src/lib/stable-club/verified-base-addresses.ts` · fork test: `test/stable-club/StableClubStep3Permit2.test.cjs`
