# P0-B Safe-owned stack — founder approval

## Status

- **Deposits remain disabled** until Safe config + Base E2E, then `features.exitAllToUsdc=true`.
- **Do not broadcast** Safe config until you approve every transaction in the pack.
- Cancel/ignore Timelock proposal `0x649f22a3…` (conflicts with this stack).

## Flow

1. **CREATE (EOA only)** — after you authorize with `STABLE_CLUB_BASE_DEPLOY_CONFIRMATION`:

   ```bash
   npx hardhat run scripts/stable-club/deploy-safe-owned-stack-create.cjs --network base
   ```

   Writes `safe-owned-stack-create.json` (CREATE hashes + ownership → Safe `0x356A4A43…5910`).

2. **Build approval pack (no broadcast)**:

   ```bash
   node scripts/stable-club/build-safe-owned-stack-config.cjs \
     --artifact=deployments/base-mainnet/safe-owned-stack-create.json \
     --guardian=0x157a96Bac2Bf9010445EBBe4c265Cf9C141576Cf \
     --out=deployments/base-mainnet/safe-owned-stack-approval-pack.json
   ```

3. Review `safeTransactions[]` in Safe UI (2-of-3). Each entry has `to`, `value`, `data`, `decoded.method`, `label`.

4. After on-chain config: tiny Base E2E (deposit → harvest → compound → exitAllToUsdc).
5. Only then pin trusted manifest + enable Deposit / Harvest / Compound / Withdraw together.

## Sample pack

`safe-owned-stack-approval-pack.SAMPLE.json` uses **synthetic addresses** to show the full method list and calldata shape. Replace by regenerating from the real CREATE artifact before signing.
