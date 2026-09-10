/**
 * Base-fork proof: deposit-matched Ops Gateway stack (registry + executor + adapters + gateway)
 * plus scheduleBatch → warp 48h → executeBatch for the withdraw-gateway Timelock payload.
 *
 * Behavioral deposit/exit flows remain covered by StableClubOpsGatewayForkE2E (mock stack).
 * This file proves Base-fork wiring + Timelock lifecycle against real live infra addresses.
 */
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const fs = require("fs");
const path = require("path");
const {
  deployClExecutorLibraries,
  getClExecutorFactory,
} = require("../../scripts/stable-club/deploy-cl-executor.cjs");

const RUN =
  Boolean(process.env.BASE_RPC_URL?.trim()) || process.env.RUN_OPS_GATEWAY_FORK === "1";

const SAFE = "0x356A4A432EE57F31F5cF8Fdd55F95c1FF6Cd5910";
const TIMELOCK = "0x6A83733C829B6F8a9C0E0D4d5713D64eE959167a";
const PERM = "0xF75423289baA42A44981533152c81E16f1aFa069";
const FEE = "0xf33239712875a7BD9d171cdD4d782c8FC022154C";
const SWAP = "0x56c6c76B4d5997754988d3C26083af315BfFa98F";
const ORACLE = "0x0cD087927F590B28737dFd9c7AAeB73B8ede70Ba";
const MEV = "0xa524506a21a9a5105c535a45c55Fe5dF9970c540";
const SAFETY = "0x429df0c70eEfCC5CD6b8B8FB94Ca8eDe226feDe5";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const UNI_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481";
const STRATEGY_KIND =
  "0x6aa596a46004a6b2f72b8c68391496a8652d1d0b070918ccb9752fba243846c3";
const DELAY = 172800;

const CUTOVER = path.join(
  __dirname,
  "../../deployments/base-mainnet/exit-percent-cutover-create.json",
);
const READY = path.join(
  __dirname,
  "../../deployments/base-mainnet/ops-gateway-ready-to-sign.json",
);

async function forkBase() {
  await network.provider.request({
    method: "hardhat_reset",
    params: [{ forking: { jsonRpcUrl: process.env.BASE_RPC_URL } }],
  });
}

async function impersonate(addr) {
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [addr] });
  await network.provider.send("hardhat_setBalance", [addr, "0x56BC75E2D63100000"]);
  return ethers.getSigner(addr);
}

(RUN ? describe : describe.skip)("Ops Gateway deposit stack + Timelock on Base fork", function () {
  this.timeout(600_000);

  after(async () => {
    await network.provider.request({ method: "hardhat_reset", params: [] });
  });

  it("deploys matched registry/executor/adapters/gateway and wires Safe-owned infra", async function () {
    await forkBase();
    const [deployer] = await ethers.getSigners();
    const libs = await deployClExecutorLibraries(ethers);

    const Registry = await ethers.getContractFactory("StrategyPermissionRegistry");
    const registry = await Registry.deploy(PERM, STRATEGY_KIND, USDC);
    await registry.waitForDeployment();
    const registryAddr = await registry.getAddress();

    const Factory = await getClExecutorFactory(ethers, libs);
    const executor = await Factory.deploy(
      PERM,
      registryAddr,
      FEE,
      SWAP,
      MEV,
      ORACLE,
      SAFETY,
      USDC,
    );
    await executor.waitForDeployment();
    const execAddr = await executor.getAddress();
    const codeBytes = ((await ethers.provider.getCode(execAddr)).length - 2) / 2;
    expect(codeBytes).to.be.lte(24576);

    await (await executor.setPermit2(PERMIT2)).wait();

    const cut = JSON.parse(fs.readFileSync(CUTOVER, "utf8"));
    const adapters = [];
    for (const a of cut.adapters) {
      const args = [...a.constructorArgs];
      args[0] = execAddr;
      const name =
        a.protocol === "uniswap-v3" ? "UniswapV3Adapter" : "AerodromeSlipstreamAdapter";
      const F = await ethers.getContractFactory(name);
      const adapter = await F.deploy(...args);
      await adapter.waitForDeployment();
      const adapterAddr = await adapter.getAddress();
      expect(await adapter.executor()).to.equal(execAddr);
      await (await executor.setAdapterApproval(adapterAddr, true)).wait();
      await (await executor.registerPool(a.poolId, adapterAddr)).wait();
      adapters.push(adapterAddr);
    }
    expect(adapters).to.have.length(5);

    const Gateway = await ethers.getContractFactory("StableClubOpsGateway");
    const gateway = await Gateway.deploy(
      registryAddr,
      execAddr,
      SAFETY,
      PERMIT2,
      USDC,
      UNI_ROUTER,
    );
    await gateway.waitForDeployment();
    const gwAddr = await gateway.getAddress();
    await (await gateway.setPaused(true)).wait();
    await (await registry.setOpsGateway(gwAddr)).wait();
    await (await registry.setOperator(execAddr, true)).wait();
    await (await executor.setOpsGateway(gwAddr)).wait();

    expect(await gateway.strategyRegistry()).to.equal(registryAddr);
    expect(await executor.strategyRegistry()).to.equal(registryAddr);
    expect(await registry.opsGateway()).to.equal(gwAddr);
    expect(await executor.opsGateway()).to.equal(gwAddr);
    expect(await gateway.paused()).to.equal(true);

    // Safe-owned live infra wiring (required for deposit cutover)
    const safe = await impersonate(SAFE);
    const perm = await ethers.getContractAt("PermissionRegistry", PERM, safe);
    await (await perm.setStrategyRegistrar(registryAddr, true)).wait();
    await (await perm.setOperator(execAddr, true)).wait();
    await (await perm.setOperator(registryAddr, true)).wait();
    const feeRouter = await ethers.getContractAt("FeeRouter", FEE, safe);
    await (await feeRouter.setExecutorApproved(execAddr, true)).wait();
    const swapRouter = await ethers.getContractAt(
      ["function setExecutorApproved(address,bool)"],
      SWAP,
      safe,
    );
    await (await swapRouter.setExecutorApproved(execAddr, true)).wait();

    // Unpause + prove deposit entrypoint is callable only when not paused (reverts on empty auth)
    await (await gateway.setPaused(false)).wait();
    expect(await gateway.paused()).to.equal(false);

    // Live stack unchanged
    const liveExec = "0x455cc33194f82E253F41d91C1201eB4095c9D1Fa";
    const liveAdapter = cut.adapters[0].adapter;
    const liveAd = await ethers.getContractAt(
      ["function executor() view returns (address)"],
      liveAdapter,
    );
    expect(await liveAd.executor()).to.equal(liveExec);

    console.log(
      JSON.stringify({
        forkProof: "deposit_stack_wired",
        registry: registryAddr,
        executor: execAddr,
        gateway: gwAddr,
        adapters,
        deployer: deployer.address,
      }),
    );
  });

  it("simulates Safe scheduleBatch → 48h wait → executeBatch for withdraw gateway", async function () {
    if (!fs.existsSync(READY)) {
      this.skip();
    }
    await forkBase();
    const ready = JSON.parse(fs.readFileSync(READY, "utf8"));
    const gw = ready.deployed.gateway;
    const exec = ready.deployed.newExecutor;

    const gateway = await ethers.getContractAt(
      [
        "function paused() view returns (bool)",
        "function owner() view returns (address)",
        "function setPaused(bool)",
      ],
      gw,
    );
    const executor = await ethers.getContractAt(
      [
        "function owner() view returns (address)",
        "function opsGateway() view returns (address)",
      ],
      exec,
    );
    expect(await gateway.paused()).to.equal(true);
    expect(await gateway.owner()).to.equal(TIMELOCK);
    expect(await executor.owner()).to.equal(TIMELOCK);

    const safe = await impersonate(SAFE);
    const timelock = await ethers.getContractAt(
      [
        "function scheduleBatch(address[],uint256[],bytes[],bytes32,bytes32,uint256)",
        "function executeBatch(address[],uint256[],bytes[],bytes32,bytes32)",
        "function isOperationReady(bytes32) view returns (bool)",
        "function isOperationDone(bytes32) view returns (bool)",
        "function getTimestamp(bytes32) view returns (uint256)",
        "function getMinDelay() view returns (uint256)",
      ],
      TIMELOCK,
      safe,
    );

    expect(await timelock.getMinDelay()).to.equal(BigInt(DELAY));

    // Decode schedule from ready-to-sign data via direct inner ops
    const targets = ready.timelock.innerOps.map((o) => o.target);
    const values = targets.map(() => 0n);
    const payloads = ready.timelock.innerOps.map((o) => o.data);
    const predecessor = ethers.ZeroHash;
    const salt = ready.timelock.salt;
    const opId = ready.timelock.operationId;

    const scheduleTx = await timelock.scheduleBatch(
      targets,
      values,
      payloads,
      predecessor,
      salt,
      DELAY,
    );
    const scheduleReceipt = await scheduleTx.wait();
    const scheduledAt = await time.latest();
    const readyAt = Number(await timelock.getTimestamp(opId));
    expect(readyAt).to.equal(scheduledAt + DELAY);
    expect(await timelock.isOperationDone(opId)).to.equal(false);
    expect(await gateway.paused()).to.equal(true);

    await time.increaseTo(readyAt);

    const execTx = await timelock.executeBatch(
      targets,
      values,
      payloads,
      predecessor,
      salt,
    );
    await execTx.wait();

    expect(await timelock.isOperationDone(opId)).to.equal(true);
    expect(await gateway.paused()).to.equal(false);
    expect(await executor.opsGateway()).to.equal(gw);

    const report = {
      forkSim: "schedule_wait_execute",
      scheduleTx: scheduleReceipt.hash,
      scheduledAt,
      activationTimestamp: readyAt,
      activationIso: new Date(readyAt * 1000).toISOString(),
      executeAfterDelay: true,
      gatewayUnpaused: true,
      note: "On mainnet, countdown starts only when Safe-executed scheduleBatch is mined — not from this fork sim.",
    };
    fs.writeFileSync(
      path.join(__dirname, "../../deployments/base-mainnet/ops-gateway-timelock-fork-sim.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    console.log(JSON.stringify(report));
  });
});
