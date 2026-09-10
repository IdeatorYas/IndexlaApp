/**
 * Verify Ops Gateway create + deposit stacks on Basescan (Etherscan API v2).
 * Loads .env.local via load-local-env.cjs (BOM-safe, absolute path, aliases).
 * Never prints the API key.
 *
 *   npx hardhat run scripts/stable-club/verify-ops-gateway.cjs --network base
 */
const { assertEtherscanApiKey } = require("./load-local-env.cjs");
const etherscanMeta = assertEtherscanApiKey();

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const CREATE = path.join(
  __dirname,
  "../../deployments/base-mainnet/ops-gateway-create.json",
);
const DEPOSIT = path.join(
  __dirname,
  "../../deployments/base-mainnet/ops-gateway-deposit-stack.json",
);
const OUT = path.join(
  __dirname,
  "../../deployments/base-mainnet/basescan-verify-ops-gateway.json",
);

const LIVE = {
  permissionRegistry: "0xF75423289baA42A44981533152c81E16f1aFa069",
  strategyRegistry: "0xf6696C45A1A186712c530696a5B392Ed9E18ae24",
  feeRouter: "0xf33239712875a7BD9d171cdD4d782c8FC022154C",
  swapRouter: "0x56c6c76B4d5997754988d3C26083af315BfFa98F",
  mevGuard: "0xa524506a21a9a5105c535a45c55Fe5dF9970c540",
  oracleGuard: "0x0cD087927F590B28737dFd9c7AAeB73B8ede70Ba",
  safetyController: "0x429df0c70eEfCC5CD6b8B8FB94Ca8eDe226feDe5",
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  uniSwapRouter02: "0x2626664c2603336E57B271c5C0b26F421741e481",
};

async function verifyOne(address, constructorArguments, contract, libraries) {
  try {
    await hre.run("verify:verify", {
      address,
      constructorArguments,
      ...(contract ? { contract } : {}),
      ...(libraries ? { libraries } : {}),
    });
    console.log(JSON.stringify({ status: "verified", address }));
    return { address, ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/already verified/i.test(msg)) {
      console.log(JSON.stringify({ status: "already_verified", address }));
      return { address, ok: true, already: true };
    }
    // Never echo full error if it might contain query strings with keys
    const safe = msg.replace(/apikey=[^&\s]+/gi, "apikey=REDACTED");
    console.error(JSON.stringify({ status: "failed", address, error: safe }));
    return { address, ok: false, error: safe };
  }
}

async function main() {
  console.log(
    JSON.stringify({
      phase: "etherscan_key",
      loaded: true,
      source: etherscanMeta.source,
      length: etherscanMeta.length,
      // never print the key
    }),
  );

  if (!fs.existsSync(CREATE)) {
    throw new Error(`Missing ${CREATE}`);
  }
  const create = JSON.parse(fs.readFileSync(CREATE, "utf8"));
  const results = [];

  results.push(
    await verifyOne(
      create.libraries.ClFivePoolDepositLib,
      [],
      "contracts/stable-club/libraries/ClFivePoolDepositLib.sol:ClFivePoolDepositLib",
    ),
  );
  results.push(
    await verifyOne(
      create.libraries.ClFivePoolExitLib,
      [],
      "contracts/stable-club/libraries/ClFivePoolExitLib.sol:ClFivePoolExitLib",
    ),
  );
  results.push(
    await verifyOne(
      create.contracts.clExecutorNew,
      [
        LIVE.permissionRegistry,
        LIVE.strategyRegistry,
        LIVE.feeRouter,
        LIVE.swapRouter,
        LIVE.mevGuard,
        LIVE.oracleGuard,
        LIVE.safetyController,
        LIVE.usdc,
      ],
      "contracts/stable-club/StableClubConcentratedLiquidityExecutor.sol:StableClubConcentratedLiquidityExecutor",
      create.libraries,
    ),
  );
  results.push(
    await verifyOne(
      create.contracts.opsGateway,
      [
        LIVE.strategyRegistry,
        create.contracts.clExecutorNew,
        LIVE.safetyController,
        LIVE.permit2,
        LIVE.usdc,
        LIVE.uniSwapRouter02,
      ],
      "contracts/stable-club/StableClubOpsGateway.sol:StableClubOpsGateway",
    ),
  );

  if (fs.existsSync(DEPOSIT)) {
    const dep = JSON.parse(fs.readFileSync(DEPOSIT, "utf8"));
    if (dep.contracts?.strategyRegistry) {
      results.push(
        await verifyOne(
          dep.contracts.strategyRegistry,
          dep.contracts.strategyRegistryConstructorArgs,
          "contracts/stable-club/StrategyPermissionRegistry.sol:StrategyPermissionRegistry",
        ),
      );
    }
    if (dep.contracts?.clExecutor) {
      results.push(
        await verifyOne(
          dep.contracts.clExecutor,
          dep.contracts.clExecutorConstructorArgs,
          "contracts/stable-club/StableClubConcentratedLiquidityExecutor.sol:StableClubConcentratedLiquidityExecutor",
          dep.libraries || create.libraries,
        ),
      );
    }
    if (dep.contracts?.opsGateway) {
      results.push(
        await verifyOne(
          dep.contracts.opsGateway,
          dep.contracts.opsGatewayConstructorArgs,
          "contracts/stable-club/StableClubOpsGateway.sol:StableClubOpsGateway",
        ),
      );
    }
    for (const a of dep.adapters || []) {
      const contract =
        a.protocol === "uniswap-v3"
          ? "contracts/stable-club/adapters/UniswapV3Adapter.sol:UniswapV3Adapter"
          : "contracts/stable-club/adapters/AerodromeSlipstreamAdapter.sol:AerodromeSlipstreamAdapter";
      results.push(await verifyOne(a.adapter, a.constructorArgs, contract));
    }
  }

  const summary = {
    verifiedAt: new Date().toISOString(),
    etherscanKeySource: etherscanMeta.source,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
  fs.writeFileSync(OUT, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(
    JSON.stringify({
      phase: "done",
      artifact: OUT,
      ok: summary.ok,
      failed: summary.failed,
    }),
  );
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(msg.replace(/apikey=[^&\s]+/gi, "apikey=REDACTED"));
  process.exit(1);
});
