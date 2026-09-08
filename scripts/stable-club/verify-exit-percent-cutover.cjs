/**
 * Verify exit-percent cutover contracts on Basescan after CREATE.
 * Requires ETHERSCAN_API_KEY + deployments/base-mainnet/exit-percent-cutover-create.json
 *
 *   npx hardhat run scripts/stable-club/verify-exit-percent-cutover.cjs --network base
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const ARTIFACT = path.join(
  __dirname,
  "../../deployments/base-mainnet/exit-percent-cutover-create.json",
);

async function verifyOne(address, constructorArguments, contract) {
  try {
    await hre.run("verify:verify", {
      address,
      constructorArguments,
      ...(contract ? { contract } : {}),
    });
    console.log(JSON.stringify({ status: "verified", address }));
    return { address, ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/already verified/i.test(msg)) {
      console.log(JSON.stringify({ status: "already_verified", address }));
      return { address, ok: true, already: true };
    }
    console.error(JSON.stringify({ status: "failed", address, error: msg }));
    return { address, ok: false, error: msg };
  }
}

async function main() {
  if (!process.env.ETHERSCAN_API_KEY?.trim()) {
    throw new Error("ETHERSCAN_API_KEY required");
  }
  if (!fs.existsSync(ARTIFACT)) {
    throw new Error(`Missing ${ARTIFACT} — run deploy-exit-percent-cutover-create.cjs first`);
  }
  const artifact = JSON.parse(fs.readFileSync(ARTIFACT, "utf8"));
  const results = [];
  const cl = artifact.contracts.clExecutor;
  results.push(
    await verifyOne(
      cl.address,
      cl.constructorArgs,
      "contracts/stable-club/StableClubConcentratedLiquidityExecutor.sol:StableClubConcentratedLiquidityExecutor",
    ),
  );
  for (const a of artifact.adapters) {
    const contract =
      a.protocol === "uniswap-v3"
        ? "contracts/stable-club/adapters/UniswapV3Adapter.sol:UniswapV3Adapter"
        : "contracts/stable-club/adapters/AerodromeSlipstreamAdapter.sol:AerodromeSlipstreamAdapter";
    results.push(await verifyOne(a.adapter, a.constructorArgs, contract));
  }
  const out = path.join(
    __dirname,
    "../../deployments/base-mainnet/basescan-verify-exit-percent-cutover.json",
  );
  fs.writeFileSync(
    out,
    JSON.stringify({ verifiedAt: new Date().toISOString(), results }, null, 2),
  );
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
