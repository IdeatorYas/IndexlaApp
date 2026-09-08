/**
 * Verify live Safe-owned stack contracts on Basescan (Etherscan API v2, chainid=8453).
 *
 * Requires ETHERSCAN_API_KEY in env (not committed).
 *
 *   npx hardhat run scripts/stable-club/verify-safe-owned-stack.cjs --network base
 *
 * Reconstructs constructor args from deployments/base-mainnet/safe-owned-stack-create.json
 * + trusted shared addresses. Does not redeploy.
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const CREATE_ARTIFACT = path.join(
  __dirname,
  "../../deployments/base-mainnet/safe-owned-stack-create.json",
);

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

async function verifyOne(address, constructorArguments, contract) {
  const label = contract ?? address;
  try {
    await hre.run("verify:verify", {
      address,
      constructorArguments,
      ...(contract ? { contract } : {}),
    });
    console.log(JSON.stringify({ status: "verified", address, label }));
    return { address, ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/Already Verified/i.test(msg) || /already verified/i.test(msg)) {
      console.log(JSON.stringify({ status: "already_verified", address, label }));
      return { address, ok: true, already: true };
    }
    console.error(JSON.stringify({ status: "failed", address, label, error: msg }));
    return { address, ok: false, error: msg };
  }
}

async function main() {
  if (!process.env.ETHERSCAN_API_KEY?.trim()) {
    throw new Error(
      "ETHERSCAN_API_KEY required for Basescan v2 verify (set in .env.local — do not commit)",
    );
  }

  const artifact = JSON.parse(fs.readFileSync(CREATE_ARTIFACT, "utf8"));
  const c = artifact.contracts;
  const results = [];

  results.push(
    await verifyOne(
      c.clExecutor.address,
      [
        c.permissionRegistry.address,
        c.strategyRegistry.address,
        c.feeRouter.address,
        c.swapRouter.address,
        c.mevGuard.address,
        c.oracleGuard.address,
        c.safetyController.address,
        USDC,
      ],
      "contracts/stable-club/StableClubConcentratedLiquidityExecutor.sol:StableClubConcentratedLiquidityExecutor",
    ),
  );

  results.push(
    await verifyOne(
      c.swapRouter.address,
      [],
      "contracts/stable-club/StableClubSwapRouter.sol:StableClubSwapRouter",
    ),
  );

  for (const a of artifact.adapters) {
    if (a.protocol === "uniswap-v3") {
      results.push(
        await verifyOne(
          a.adapter,
          [
            c.clExecutor.address,
            a.poolId,
            a.npm,
            a.router,
            a.poolAddress,
            a.factory,
            a.fee,
          ],
          "contracts/stable-club/adapters/UniswapV3Adapter.sol:UniswapV3Adapter",
        ),
      );
    } else {
      results.push(
        await verifyOne(
          a.adapter,
          [
            c.clExecutor.address,
            a.poolId,
            a.npm,
            a.router,
            a.poolAddress,
            a.factory,
            a.tickSpacing,
            "0x0000000000000000000000000000000000000000",
          ],
          "contracts/stable-club/adapters/AerodromeSlipstreamAdapter.sol:AerodromeSlipstreamAdapter",
        ),
      );
    }
  }

  const failed = results.filter((r) => !r.ok);
  const outPath = path.join(
    __dirname,
    "../../deployments/base-mainnet/basescan-verify-live-stack.json",
  );
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        chainId: 8453,
        results,
        note: "Source verification is required for trust; wallet warnings may still appear for ERC721 approve(selector 0x095ea7b3).",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ wrote: outPath, failed: failed.length }));
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
