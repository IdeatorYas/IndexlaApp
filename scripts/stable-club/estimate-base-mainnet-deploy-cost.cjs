/**
 * Read-only Base mainnet deploy cost estimate.
 * No broadcast. Uses live Base fees + L1 data fee oracle + Hardhat artifacts.
 * Hard USD cap enforced by caller (default $5 via STABLE_CLUB_DEPLOY_USD_CAP).
 *
 * Models the same CREATE + wiring steps as deploy-base-mainnet.cjs
 * (pools registered, automation NOT deployed).
 */
require("dotenv").config({ path: ".env.local", override: true });
require("dotenv").config({ override: true });

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const guards = require("./base-mainnet-deploy-guards.cjs");

const ARTIFACT_ROOT = path.join(__dirname, "../../artifacts/contracts/stable-club");
const USD_CAP = Number(process.env.STABLE_CLUB_DEPLOY_USD_CAP || "5");
const GUARDIAN = process.env.STABLE_CLUB_GUARDIAN_ADDRESS;
const SAFETY_BUFFER = 1.25; // 25% contingency for L1 fee volatility / estimate undercount

function loadArtifact(contractName) {
  const candidates = [
    path.join(ARTIFACT_ROOT, `${contractName}.sol`, `${contractName}.json`),
    path.join(__dirname, "../../artifacts/contracts", `${contractName}.sol`, `${contractName}.json`),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  }
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return null;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        const hit = walk(full);
        if (hit) return hit;
      } else if (ent.name === `${contractName}.json`) {
        return JSON.parse(fs.readFileSync(full, "utf8"));
      }
    }
    return null;
  };
  const found = walk(path.join(__dirname, "../../artifacts"));
  if (!found) throw new Error(`Artifact missing: ${contractName}`);
  return found;
}

async function getEthUsd(provider) {
  const feed = new ethers.Contract(
    "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
    [
      "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
      "function decimals() view returns (uint8)",
    ],
    provider,
  );
  const [, answer] = await feed.latestRoundData();
  const decimals = Number(await feed.decimals());
  return Number(answer) / 10 ** decimals;
}

function maxFee(feeData) {
  return feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
}

function priorityFee(feeData) {
  return feeData.maxPriorityFeePerGas ?? 0n;
}

async function l1FeeForTx(l1Oracle, unsignedFields) {
  const tx = ethers.Transaction.from({
    type: 2,
    chainId: 8453,
    nonce: unsignedFields.nonce ?? 0,
    maxPriorityFeePerGas: unsignedFields.maxPriorityFeePerGas,
    maxFeePerGas: unsignedFields.maxFeePerGas,
    gasLimit: unsignedFields.gasLimit,
    to: unsignedFields.to ?? null,
    value: unsignedFields.value ?? 0n,
    data: unsignedFields.data ?? "0x",
  });
  return l1Oracle.getL1Fee(tx.unsignedSerialized);
}

async function estimateCreate(provider, from, artifact, args, l1Oracle, feeData) {
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, provider);
  const txReq = await factory.getDeployTransaction(...args);
  txReq.from = from;
  const gas = await provider.estimateGas(txReq);
  const mf = maxFee(feeData);
  const pf = priorityFee(feeData);
  const l1Fee = await l1FeeForTx(l1Oracle, {
    data: txReq.data,
    gasLimit: gas,
    maxFeePerGas: mf,
    maxPriorityFeePerGas: pf,
    to: null,
    value: 0n,
  });
  const l2Fee = gas * mf;
  return {
    gas,
    l1Fee,
    l2Fee,
    total: l1Fee + l2Fee,
    kind: "create",
    bytes: (txReq.data.length - 2) / 2,
  };
}

async function estimateCreateFallback(artifact, l1Oracle, feeData, initOverheadGas) {
  const bytes = (artifact.bytecode.length - 2) / 2;
  const gas = BigInt(32000 + 200 * bytes + initOverheadGas);
  const mf = maxFee(feeData);
  const pf = priorityFee(feeData);
  const l2Fee = gas * mf;
  const l1Fee = await l1FeeForTx(l1Oracle, {
    data: artifact.bytecode,
    gasLimit: gas,
    maxFeePerGas: mf,
    maxPriorityFeePerGas: pf,
    to: null,
    value: 0n,
  });
  return { gas, l1Fee, l2Fee, total: l1Fee + l2Fee, kind: "create-fallback", bytes };
}

function serialize(est) {
  return {
    kind: est.kind,
    gas: est.gas.toString(),
    l1FeeWei: est.l1Fee.toString(),
    l2FeeWei: est.l2Fee.toString(),
    totalWei: est.total.toString(),
    totalEth: ethers.formatEther(est.total),
    bytes: est.bytes,
  };
}

async function main() {
  const rpc = process.env.BASE_RPC_URL;
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!rpc || !key) throw new Error("BASE_RPC_URL and DEPLOYER_PRIVATE_KEY required");
  if (!GUARDIAN || !ethers.isAddress(GUARDIAN)) {
    throw new Error("STABLE_CLUB_GUARDIAN_ADDRESS required");
  }

  const wallet = new ethers.Wallet(key);
  const provider = new ethers.JsonRpcProvider(rpc);
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== 8453) throw new Error(`Wrong chain ${net.chainId}`);

  const feeData = await provider.getFeeData();
  const balance = await provider.getBalance(wallet.address);
  const ethUsd = await getEthUsd(provider);

  const l1Oracle = new ethers.Contract(
    "0x420000000000000000000000000000000000000F",
    ["function getL1Fee(bytes) view returns (uint256)"],
    provider,
  );

  const lines = [];
  let totalWei = 0n;

  // Dummy non-zero addresses for constructor arg sizing (CREATE gas dominated by bytecode).
  const dummy = (n) => ethers.getAddress(`0x${(0x1000 + n).toString(16).padStart(40, "0")}`);
  const addrs = {
    PermissionRegistry: dummy(1),
    StrategyPermissionRegistry: dummy(2),
    FeeRouter: dummy(3),
    StableClubSwapRouter: dummy(4),
    OracleGuard: dummy(5),
    MevGuard: dummy(6),
    SafetyController: dummy(7),
    StableClubConcentratedLiquidityExecutor: dummy(8),
  };

  const plan = [
    { name: "PermissionRegistry", args: [] },
    {
      name: "StrategyPermissionRegistry",
      argsBuilder: () => [addrs.PermissionRegistry, guards.strategyKind(), guards.USDC],
    },
    { name: "FeeRouter", args: [guards.MVP_FEE] },
    { name: "StableClubSwapRouter", args: [] },
    { name: "OracleGuard", args: [] },
    { name: "MevGuard", args: [] },
    { name: "SafetyController", args: [] },
    {
      name: "StableClubConcentratedLiquidityExecutor",
      argsBuilder: () => [
        addrs.PermissionRegistry,
        addrs.StrategyPermissionRegistry,
        addrs.FeeRouter,
        addrs.StableClubSwapRouter,
        addrs.MevGuard,
        addrs.OracleGuard,
        addrs.SafetyController,
        guards.USDC,
      ],
    },
  ];

  for (const step of plan) {
    const art = loadArtifact(step.name);
    const args = step.argsBuilder ? step.argsBuilder() : step.args;
    try {
      const est = await estimateCreate(provider, wallet.address, art, args, l1Oracle, feeData);
      lines.push({ step: `CREATE ${step.name}`, ...serialize(est) });
      totalWei += est.total;
    } catch (e) {
      const est = await estimateCreateFallback(art, l1Oracle, feeData, 500_000);
      lines.push({
        step: `CREATE ${step.name} (fallback)`,
        error: String(e.message || e).slice(0, 160),
        ...serialize(est),
      });
      totalWei += est.total;
    }
  }

  // Five pool adapters — same ctor args as deploy-base-mainnet.cjs
  const adapterSpecs = guards.buildAdapterSpecs(addrs.StableClubConcentratedLiquidityExecutor);
  if (adapterSpecs.length !== guards.EXPECTED_POOL_COUNT) {
    throw new Error(`Expected ${guards.EXPECTED_POOL_COUNT} adapters, got ${adapterSpecs.length}`);
  }
  for (const [i, spec] of adapterSpecs.entries()) {
    const contractName =
      spec.protocol === "uniswap-v3" ? "UniswapV3Adapter" : "AerodromeSlipstreamAdapter";
    const artifact = loadArtifact(contractName);
    const ctorArgs =
      spec.protocol === "uniswap-v3"
        ? [spec.executor, spec.poolId, spec.npm, spec.router, spec.poolAddress, spec.factory, spec.fee]
        : [
            spec.executor,
            spec.poolId,
            spec.npm,
            spec.router,
            spec.poolAddress,
            spec.factory,
            spec.tickSpacing,
            ethers.ZeroAddress,
          ];
    try {
      const est = await estimateCreate(provider, wallet.address, artifact, ctorArgs, l1Oracle, feeData);
      lines.push({ step: `CREATE adapter[${i}] ${contractName}`, ...serialize(est) });
      totalWei += est.total;
    } catch (e) {
      const est = await estimateCreateFallback(artifact, l1Oracle, feeData, 400_000);
      lines.push({
        step: `CREATE adapter[${i}] ${contractName} (fallback)`,
        error: String(e.message || e).slice(0, 160),
        ...serialize(est),
      });
      totalWei += est.total;
    }
  }

  // Timelock CREATE — matches deploy: [proposers, executors, admin]
  {
    const art = loadArtifact("StableClubTimelock");
    const args = [[guards.MVP_SAFE], [guards.MVP_SAFE], guards.MVP_SAFE];
    try {
      const est = await estimateCreate(provider, wallet.address, art, args, l1Oracle, feeData);
      lines.push({ step: "CREATE StableClubTimelock", ...serialize(est) });
      totalWei += est.total;
    } catch (e) {
      const est = await estimateCreateFallback(art, l1Oracle, feeData, 600_000);
      lines.push({
        step: "CREATE StableClubTimelock (fallback)",
        error: String(e.message || e).slice(0, 160),
        ...serialize(est),
      });
      totalWei += est.total;
    }
  }

  // Wiring / ownership / pool register — conservative live-priced model of sendStep txs.
  // Includes: permissions, oracles, routes, adapter approvals, registerPool, guardian, gas ceiling, transferOwnership ×8.
  const wiringTxCount = 45;
  const wiringGasEach = 180_000n;
  const wiringCalldata = `0x${"ab".repeat(200)}`;
  const mf = maxFee(feeData);
  const pf = priorityFee(feeData);
  const wiringL1Each = await l1FeeForTx(l1Oracle, {
    data: wiringCalldata,
    gasLimit: wiringGasEach,
    maxFeePerGas: mf,
    maxPriorityFeePerGas: pf,
    to: addrs.StableClubConcentratedLiquidityExecutor,
    value: 0n,
  });
  const wiringL2Each = wiringGasEach * mf;
  const wiringTotal = (wiringL1Each + wiringL2Each) * BigInt(wiringTxCount);
  lines.push({
    step: `WIRING+OWNERSHIP x${wiringTxCount}`,
    ...serialize({
      gas: wiringGasEach * BigInt(wiringTxCount),
      l1Fee: wiringL1Each * BigInt(wiringTxCount),
      l2Fee: wiringL2Each * BigInt(wiringTxCount),
      total: wiringTotal,
      kind: "wiring",
      bytes: 200 * wiringTxCount,
    }),
  });
  totalWei += wiringTotal;

  const buffered = BigInt(Math.ceil(Number(totalWei) * SAFETY_BUFFER));
  const totalEth = Number(ethers.formatEther(totalWei));
  const bufferedEth = Number(ethers.formatEther(buffered));
  const totalUsd = totalEth * ethUsd;
  const bufferedUsd = bufferedEth * ethUsd;
  const balanceEth = Number(ethers.formatEther(balance));
  const balanceUsd = balanceEth * ethUsd;

  const underCap = bufferedUsd <= USD_CAP;
  const funded = buffered <= balance;

  const report = {
    mode: "read-only-estimate",
    chainId: 8453,
    deployer: wallet.address,
    guardian: ethers.getAddress(GUARDIAN),
    ethUsd,
    usdCap: USD_CAP,
    safetyBuffer: SAFETY_BUFFER,
    fees: {
      maxFeePerGasGwei: feeData.maxFeePerGas
        ? Number(ethers.formatUnits(feeData.maxFeePerGas, "gwei"))
        : null,
      maxPriorityFeePerGasGwei: feeData.maxPriorityFeePerGas
        ? Number(ethers.formatUnits(feeData.maxPriorityFeePerGas, "gwei"))
        : null,
      gasPriceGwei: feeData.gasPrice ? Number(ethers.formatUnits(feeData.gasPrice, "gwei")) : null,
    },
    balanceEth,
    balanceUsd,
    estimateEth: totalEth,
    estimateUsd: totalUsd,
    bufferedEth,
    bufferedUsd,
    underCap,
    funded,
    mayBroadcast: underCap && funded,
    lines,
    automation: { harvestEnabled: false, compoundEnabled: false, rebalanceEnabled: false },
    note: "No 0.10 ETH artificial floor. Cap is STABLE_CLUB_DEPLOY_USD_CAP (default $5) on buffered total.",
  };

  const outPath = path.join(__dirname, "../../tmp/base-deploy-cost-estimate.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        mayBroadcast: report.mayBroadcast,
        underCap: report.underCap,
        funded: report.funded,
        ethUsd: report.ethUsd,
        estimateUsd: Number(report.estimateUsd.toFixed(4)),
        bufferedUsd: Number(report.bufferedUsd.toFixed(4)),
        usdCap: report.usdCap,
        estimateEth: Number(report.estimateEth.toFixed(8)),
        bufferedEth: Number(report.bufferedEth.toFixed(8)),
        balanceEth: Number(report.balanceEth.toFixed(8)),
        balanceUsd: Number(report.balanceUsd.toFixed(4)),
        lineCount: lines.length,
        outPath,
      },
      null,
      2,
    ),
  );

  if (!underCap) {
    console.error(
      `STOP_BEFORE_BROADCAST: buffered deploy cost $${bufferedUsd.toFixed(4)} exceeds hard cap $${USD_CAP}`,
    );
    process.exit(2);
  }
  if (!funded) {
    console.error(
      `STOP_BEFORE_BROADCAST: buffered ${bufferedEth.toFixed(8)} ETH exceeds balance ${balanceEth.toFixed(8)} ETH`,
    );
    process.exit(3);
  }
}

main().catch((e) => {
  console.error("ESTIMATE_FAIL=" + String(e && e.message ? e.message : e).split("\n")[0]);
  process.exit(1);
});
