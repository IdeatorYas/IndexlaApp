# Governance design — MVP 2-of-3 Safe, guardian, 48h timelock

**Label:** Internal governance design. **Not a professional audit.**  
**Private keys / seeds:** never requested or stored in-repo.

## MVP parameters (Base)

| Item | Value |
|---|---|
| Multisig | **2-of-3** Safe |
| Safe | `0x356A4A432EE57F31F5cF8Fdd55F95c1FF6Cd5910` |
| Signer 1 | `0x977e7055D097bE5924fBdAd7e5a330405820f168` |
| Signer 2 | `0xd31a835ec10932919e7Dd471e915F1cF97d98f1b` |
| Signer 3 | `0xF133d2AafD456359A6e2c9F0492c19aEDF7E8720` |
| INDEXLA fee recipient | `0x9d269f7A3d3f781740081D35F086D68a4a21442D` (fees only) |
| Timelock | **48h**; controlled by Safe |
| Protocol `owner` | **Timelock only** (no production admin EOA) |

On-chain verification (Base): Safe `getThreshold() == 2` and `getOwners()` match the three signers above.

## Role matrix

| Action | Guardian | Safe (immediate) | Safe + 48h Timelock |
|---|---|---|---|
| Emergency pause | Yes | Yes | — |
| Unpause | No | No | Yes |
| Config / adapters / pools / risk | No | No | Yes |

## Fee wallet

Fee recipient receives INDEXLA swap fees only. It is **not** an owner, proposer, executor, or guardian.

## Source of truth

`src/lib/stable-club/mvp-governance.ts`
