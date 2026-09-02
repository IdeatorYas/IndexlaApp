# Base mainnet deployment artifacts

This directory holds **local, non-secret** deployment state produced by:

```bash
npx hardhat run scripts/stable-club/deploy-base-mainnet.cjs --network base
```

Files:

- `stable-club-phase2a.deploy-state.json` — resumable step state (gitignored)
- `stable-club-phase2a.deploy-artifact.json` — addresses, tx hashes, runtime code hashes for later trusted-manifest pin (gitignored)

Never store private keys, RPC URLs, or mnemonics here. Do not activate pools from the deploy script.
