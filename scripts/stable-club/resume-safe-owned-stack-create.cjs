#!/usr/bin/env node
/**
 * Resume P0-B CREATE after Ownables landed but adapters/ownership transfer did not.
 * Broadcasts ONLY: adapter CREATEs + transferOwnership(Safe). No protocol config.
 *
 * Requires: BASE_RPC_URL, DEPLOYER_PRIVATE_KEY, STABLE_CLUB_BASE_DEPLOY_CONFIRMATION
 */
require("dotenv").config({ path: ".env.local" });
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");
const guards = require("./base-mainnet-deploy-guards.cjs");

const SAFE = guards.MVP_SAFE;

/** Partial CREATE from failed run (preflight passed; selector check raced RPC). */
const OWNABLES = {
  permissionRegistry: {
    address: "0xF75423289baA42A44981533152c81E16f1aFa069",
    createTx: "0x793820196edca5d386363747c99c06c57b4e1d9d18d8e4e856fac66b8eb6e687",
  },
  strategyRegistry: {
    address: "0xf6696C45A1A186712c530696a5B392Ed9E18ae24",
    createTx: "0x49b229a66cc37bfe5f2f27bdbc09be6bc3ae8b9b190746bb78a5f61e50a74fd6",
  },
  feeRouter: {
    address: "0xf33239712875a7BD9d171cdD4d782c8FC022154C",
    createTx: "0x34dafa028b6be8b28703a704151b30fb4e33372f0ee97332401fd277848ce7c6",
  },
  swapRouter: {
    address: "0x56c6c76B4d5997754988d3C26083af315BfFa98F",
    createTx: "0x8c3e139f666b602c29849e3b3993dcf235f2b611793ed039895ae7a957a72daa",
  },
  oracleGuard: {
    address: "0x0cD087927F590B28737dFd9c7AAeB73B8ede70Ba",
    createTx: "0x9b80b70bd50861097bd3225fdd3d68efce4d51410e546df1ed7e58eaaadcbdb4",
  },
  mevGuard: {
    address: "0xa524506a21a9a5105c535a45c55Fe5dF9970c540",
    createTx: "0x698c2610dd857620769f9884cc94c8cbd3b695a60b4d33c9d8ed5a4c7eeefca3",
  },
  safetyController: {
    address: "0x429df0c70eEfCC5CD6b8B8FB94Ca8eDe226feDe5",
    createTx: "0x8b9ce748303423b97e3e4cbfc4d774f359fd3041cbb081239454fadbe3fafedc",
  },
  clExecutor: {
    address: "0x488f0680ff28908F49CC85C05b9E4813e657FcD2",
    createTx: "0x01f699f59e09c01076ee73bb5ef344df2dc15c4c6e22aff849be820b15027e40",
  },
};

const OWNABLE_META = [
  { key: "permissionRegistry", name: "PermissionRegistry" },
  { key: "strategyRegistry", name: "StrategyPermissionRegistry" },
  { key: "feeRouter", name: "FeeRouter" },
  { key: "swapRouter", name: "StableClubSwapRouter" },
  { key: "oracleGuard", name: "OracleGuard" },
  { key: "mevGuard", name: "MevGuard" },
  { key: "safetyController", name: "SafetyController" },
  { key: "clExecutor", name: "StableClubConcentratedLiquidityExecutor" },
];

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function getCodeWithRetry(addr, attempts = 8) {
  let code = "0x";
  for (let i = 0; i < attempts; i++) {
    code = await ethers.provider.getCode(addr);
    if (guards.isNonEmptyBytecode(code)) return code;
    await sleep(1500);
  }
  return code;
}

async function deployNamed(name, args) {
  const factory = await ethers.getContractFactory(name);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const tx = contract.deploymentTransaction();
  await sleep(400); // soft RPC throttle
  return {
    contract,
    address,
    createTx: tx?.hash ?? null,
  };
}

async function transferToSafe(contract, key) {
  const tx = await contract.transferOwnership(SAFE);
  const receipt = await tx.wait();
  let owner = await contract.owner();
  for (let i = 0; i < 8 && !guards.addrEq(owner, SAFE); i++) {
    await sleep(1500);
    owner = await contract.owner();
  }
  if (!guards.addrEq(owner, SAFE)) {
    throw new Error(`Ownership transfer failed for ${key} (owner=${owner})`);
  }
  await sleep(400);
  return receipt.hash;
}

async function main() {
  guards.assertConfirmationPhrase(process.env.STABLE_CLUB_BASE_DEPLOY_CONFIRMATION);
  guards.assertDeployerPrivateKeyPresent(process.env.DEPLOYER_PRIVATE_KEY);

  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  if (Number(net.chainId) !== guards.BASE_CHAIN_ID) {
    throw new Error(`Refuse non-Base chainId=${net.chainId}`);
  }

  const clAddr = OWNABLES.clExecutor.address;
  const code = (await getCodeWithRetry(clAddr)).toLowerCase();
  const harvestSel = ethers
    .id(
      "harvestAll(bytes32,(uint8,address,address,address,uint256,uint256,uint256,uint256)[5],uint256)",
    )
    .slice(2, 10);
  const compoundSel = ethers
    .id(
      "compoundAll(bytes32,(uint8,address,address,address,uint256,uint256,uint256,uint256)[5],uint256)",
    )
    .slice(2, 10);
  const exitSel = ethers
    .id(
      "exitAllToUsdc(bytes32,(uint8,address,address,address,uint256,uint128,uint256,uint256,uint256,bool)[5],(bytes32,uint256,uint256,uint256,uint256)[8],uint8,uint256,uint256)",
    )
    .slice(2, 10);
  for (const [label, sel] of [
    ["harvestAll", harvestSel],
    ["compoundAll", compoundSel],
    ["exitAllToUsdc", exitSel],
  ]) {
    if (!code.includes(sel)) {
      throw new Error(`CL executor ${clAddr} missing ${label} selector 0x${sel}`);
    }
  }

  // Verify wiring matches expected Ownables.
  const cl = await ethers.getContractAt(
    "StableClubConcentratedLiquidityExecutor",
    clAddr,
  );
  const expected = {
    permissionRegistry: OWNABLES.permissionRegistry.address,
    strategyRegistry: OWNABLES.strategyRegistry.address,
    feeRouter: OWNABLES.feeRouter.address,
    swapRouter: OWNABLES.swapRouter.address,
    mevGuard: OWNABLES.mevGuard.address,
    oracleGuard: OWNABLES.oracleGuard.address,
    safetyController: OWNABLES.safetyController.address,
    usdc: guards.USDC,
  };
  for (const [fn, addr] of Object.entries(expected)) {
    const live = await cl[fn]();
    if (!guards.addrEq(live, addr)) {
      throw new Error(`CL ${fn} mismatch: live=${live} expected=${addr}`);
    }
  }
  if (!guards.addrEq(await cl.owner(), deployer.address)) {
    throw new Error(`CL owner must still be deployer before resume (owner=${await cl.owner()})`);
  }

  console.log(
    JSON.stringify({
      phase: "resume_start",
      clExecutor: clAddr,
      deployer: deployer.address,
      safeOwner: SAFE,
      chainId: Number(net.chainId),
    }),
  );

  const specs = guards.buildAdapterSpecs(clAddr);
  const knownAdapters = [
    {
      // First adapter from interrupted resume (pool 0)
      poolId: specs[0].poolId,
      address: "0x518aB4069fB15dC201a00D19a9bC65CCB4D23fA8",
      createTx: "0x9f25152e37844cb1f82d2ac0fb724d9e9e4471871fa512f56c1a67b91abccd54",
    },
  ];

  const adapters = [];
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const known = knownAdapters.find((k) => k.poolId.toLowerCase() === spec.poolId.toLowerCase());
    let deployedAddr;
    let createTx;
    if (known) {
      deployedAddr = known.address;
      createTx = known.createTx;
      console.log(JSON.stringify({ phase: "adapter_reuse", adapter: deployedAddr, poolId: spec.poolId }));
    } else {
      let deployed;
      if (spec.protocol === "uniswap-v3") {
        deployed = await deployNamed("UniswapV3Adapter", [
          spec.executor,
          spec.poolId,
          spec.npm,
          spec.router,
          spec.poolAddress,
          spec.factory,
          spec.fee,
        ]);
      } else {
        deployed = await deployNamed("AerodromeSlipstreamAdapter", [
          spec.executor,
          spec.poolId,
          spec.npm,
          spec.router,
          spec.poolAddress,
          spec.factory,
          spec.tickSpacing,
          ethers.ZeroAddress,
        ]);
      }
      deployedAddr = deployed.address;
      createTx = deployed.createTx;
      console.log(
        JSON.stringify({
          phase: "adapter",
          adapter: deployedAddr,
          poolId: spec.poolId,
          createTx,
        }),
      );
    }

    const adapterContract = await ethers.getContractAt(
      spec.protocol === "uniswap-v3" ? "UniswapV3Adapter" : "AerodromeSlipstreamAdapter",
      deployedAddr,
    );
    let execLive = ethers.ZeroAddress;
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        execLive = await adapterContract.executor();
        if (guards.addrEq(execLive, clAddr)) break;
      } catch {
        // RPC lag / rate limit
      }
      await sleep(1500);
    }
    if (!guards.addrEq(execLive, clAddr)) {
      throw new Error(`Adapter executor mismatch ${deployedAddr} got=${execLive}`);
    }
    adapters.push({
      poolId: spec.poolId,
      protocol: spec.protocol,
      generation: spec.generation,
      adapter: deployedAddr,
      poolAddress: spec.poolAddress,
      factory: spec.factory,
      npm: spec.npm,
      router: spec.router,
      tickSpacing: spec.tickSpacing ?? null,
      fee: spec.fee ?? null,
      tokenA: spec.tokenA,
      tokenB: spec.tokenB,
      createTx,
      ownershipNote: guards.ADAPTER_OWNERSHIP_NOTE,
    });
  }

  const ownershipTransfers = {};
  for (const meta of OWNABLE_META) {
    const addr = OWNABLES[meta.key].address;
    const contract = await ethers.getContractAt(meta.name, addr);
    const owner = await contract.owner();
    if (guards.addrEq(owner, SAFE)) {
      ownershipTransfers[meta.key] = "already_safe";
      console.log(JSON.stringify({ phase: "transferOwnership_skip", key: meta.key, owner: SAFE }));
      continue;
    }
    if (!guards.addrEq(owner, deployer.address)) {
      throw new Error(`${meta.key} owner unexpected: ${owner}`);
    }
    ownershipTransfers[meta.key] = await transferToSafe(contract, meta.key);
    console.log(
      JSON.stringify({
        phase: "transferOwnership",
        key: meta.key,
        address: addr,
        owner: SAFE,
        tx: ownershipTransfers[meta.key],
      }),
    );
  }

  const out = {
    deployedAt: new Date().toISOString(),
    chainId: guards.BASE_CHAIN_ID,
    network: "base",
    mode: "SAFE_OWNED_CREATE_ONLY",
    resumedFromPartialCreate: true,
    deployer: deployer.address,
    safeOwner: SAFE,
    timelock: null,
    note:
      "CREATE + transferOwnership only. All protocol configuration is Safe calldata — do not broadcast config until founder approval.",
    cancelTimelockProposal:
      "0x649f22a30d1b501d36f316bcc4600f56627c3a3ecd58561479142bcd4d9bb5c4 — reject/supersede at Safe nonce 0 (pending scheduleBatch 1/2).",
    contracts: Object.fromEntries(
      OWNABLE_META.map((m) => [
        m.key,
        {
          address: OWNABLES[m.key].address,
          createTx: OWNABLES[m.key].createTx,
          owner: SAFE,
          ownershipTransferTx: ownershipTransfers[m.key],
        },
      ]),
    ),
    adapters,
    selectors: {
      harvestAll: `0x${harvestSel}`,
      compoundAll: `0x${compoundSel}`,
      exitAllToUsdc: `0x${exitSel}`,
    },
    depositsRemainDisabled: true,
    nextSteps: [
      "node scripts/stable-club/build-safe-owned-stack-config.cjs --artifact=deployments/base-mainnet/safe-owned-stack-create.json",
      "Reject Timelock proposal at Safe nonce 0, then confirm config txs (2-of-3)",
      "Tiny Base E2E before features.exitAllToUsdc=true",
    ],
  };

  const outDir = path.join(__dirname, "..", "..", "deployments", "base-mainnet");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "safe-owned-stack-create.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ phase: "done", artifact: outPath }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
