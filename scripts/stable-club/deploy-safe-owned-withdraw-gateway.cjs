/**
 * Deploy Safe-owned withdraw Ops Gateway on live registry+executor (NPM exit path).
 * Configures NPMs/tokens/router, unpauses, transferOwnership(Safe) in one script.
 * Does NOT touch Timelock-owned gateways. Live deposit path unchanged.
 *
 *   npx hardhat run scripts/stable-club/deploy-safe-owned-withdraw-gateway.cjs --network base
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const guards = require("./base-mainnet-deploy-guards.cjs");

const OUT = path.join(
  __dirname,
  "../../deployments/base-mainnet/safe-owned-withdraw-gateway.json",
);

const LIVE = {
  strategyRegistry: "0xf6696C45A1A186712c530696a5B392Ed9E18ae24",
  clExecutor: "0x455cc33194f82E253F41d91C1201eB4095c9D1Fa",
  safetyController: "0x429df0c70eEfCC5CD6b8B8FB94Ca8eDe226feDe5",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  usdc: guards.USDC,
  cbbtc: guards.CBBTC,
  weth: guards.WETH,
  uniSwapRouter02: "0x2626664c2603336E57B271c5C0b26F421741e481",
};
const UNI_NPM = "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1";
const AERO_NPM_CURRENT = "0x827922686190790b37229fd06084350e74485b72";
const AERO_NPM_LEGACY = "0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53";
const SAFE = guards.MVP_SAFE;
const OLD_TIMELOCK_GATEWAY = "0xAa0a7383F15bE490388bcF2793714e59b5063a8b";

async function waitCode(provider, address) {
  for (let i = 0; i < 10; i++) {
    const code = await provider.getCode(address);
    if (code && code !== "0x" && code.length > 10) return code;
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  throw new Error(`No bytecode at ${address}`);
}

async function main() {
  guards.assertConfirmationPhrase(process.env.STABLE_CLUB_BASE_DEPLOY_CONFIRMATION);
  const { ethers, network } = hre;
  if (network.name !== "base") throw new Error(`need base, got ${network.name}`);
  const [deployer] = await ethers.getSigners();
  guards.assertBaseChainId((await ethers.provider.getNetwork()).chainId);

  const ctorArgs = [
    LIVE.strategyRegistry,
    LIVE.clExecutor,
    LIVE.safetyController,
    LIVE.permit2,
    LIVE.usdc,
    LIVE.uniSwapRouter02,
  ];
  const Gateway = await ethers.getContractFactory("StableClubOpsGateway");
  const gateway = await Gateway.deploy(...ctorArgs);
  await gateway.waitForDeployment();
  const gatewayAddr = await gateway.getAddress();
  const createTx = gateway.deploymentTransaction()?.hash ?? null;
  await waitCode(ethers.provider, gatewayAddr);

  await (await gateway.setAllowedNpm(UNI_NPM, true)).wait();
  await (await gateway.setAllowedNpm(AERO_NPM_CURRENT, true)).wait();
  await (await gateway.setAllowedNpm(AERO_NPM_LEGACY, true)).wait();
  await (await gateway.setTrackedExitToken(LIVE.cbbtc, true)).wait();
  await (await gateway.setTrackedExitToken(LIVE.weth, true)).wait();
  await (await gateway.approveRouterForToken(LIVE.cbbtc)).wait();
  await (await gateway.approveRouterForToken(LIVE.weth)).wait();
  await (await gateway.setPaused(false)).wait();
  await (await gateway.transferOwnership(SAFE)).wait();

  const owner = await gateway.owner();
  const paused = await gateway.paused();
  if (owner.toLowerCase() !== SAFE.toLowerCase()) {
    throw new Error(`owner ${owner} != Safe`);
  }
  if (paused) throw new Error("gateway must be unpaused");

  const artifact = {
    version: 1,
    mode: "SAFE_OWNED_WITHDRAW_GATEWAY",
    chainId: 8453,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      opsGateway: gatewayAddr,
      opsGatewayConstructorArgs: ctorArgs,
      createTx,
      strategyRegistryLive: LIVE.strategyRegistry,
      clExecutorLive: LIVE.clExecutor,
      oldTimelockGatewayDoNotUse: OLD_TIMELOCK_GATEWAY,
    },
    config: {
      owner: SAFE,
      paused: false,
      npms: [UNI_NPM, AERO_NPM_CURRENT, AERO_NPM_LEGACY],
      tracked: [LIVE.cbbtc, LIVE.weth],
    },
    featureFlag: {
      opsGatewayWithdraw: true,
      opsGatewayDeposit: false,
      note: "Pin opsGateway to this address only after Timelock.cancel of pending old-gateway unpause",
    },
    pendingTimelockCancel: {
      operationId: "0xb3ea796cc881a01f3eeace08a905d805ca0f0f99bf587aa0880ba25c9877d772",
      reason: "Prevent 2026-09-12 unpause of Timelock-owned 0xAa0a…",
    },
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(JSON.stringify({ phase: "done", gateway: gatewayAddr, owner, paused, createTx }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
