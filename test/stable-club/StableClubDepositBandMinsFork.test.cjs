/**
 * Base-fork proof: failed live deposit 0x1cf401c6… was Price slippage check (not OOG).
 * Band-window LP mins → deposit succeeds → 5 NFT transfers → gateway exit → USDC.
 *
 *   npx hardhat test test/stable-club/StableClubDepositBandMinsFork.test.cjs
 */
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { execFileSync } = require("child_process");
const path = require("path");

require("../../scripts/stable-club/load-local-env.cjs").loadLocalEnv();

const FAILED_TX =
  "0x1cf401c6d60677ae26c151cddc71a92e0f53ebd3c2259b69cadcdcb4b0bf1d4a";
const PARENT_BLOCK = 51146087;
const LEGACY_EXECUTOR = "0x488f0680ff28908F49CC85C05b9E4813e657FcD2";
const OPS_GATEWAY = "0xE82d1602c2953D805ea8Ebe3056804e4f60d4316";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const WETH = "0x4200000000000000000000000000000000000006";
const UNI_NPM = "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1";
const AERO_NPM = "0x827922686190790b37229fd06084350e74485b72";

const DEPOSIT_ABI = [
  "function depositFivePoolStrategy(bytes32 strategyId, uint256 executionNonce, uint256 grossUsdc, bytes32[5] poolIds, uint256 deadline, tuple(uint8 legIndex, address adapter, address tokenA, address tokenB, int24 tickLower, int24 tickUpper, uint256 retainUsdc, tuple(bytes32 routeId, uint256 grossUsdcIn, uint256 minOut, uint256 quotedOut, uint256 deadline)[2] swaps, uint8 swapCount, uint256 amountAMin, uint256 amountBMin, uint256 slippageBps)[5] legs)",
];

const GATEWAY_ABI = [
  "function paused() view returns (bool)",
  "function exitPercentToUsdc(tuple(address npm, uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, bool burnIfEmpty)[] exitLegs, tuple(address tokenIn, uint24 fee, uint256 amountIn, uint256 amountOutMinimum)[] swaps, uint256 minUsdcOut, uint256 deadline) returns (uint256)",
];

const NPM_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function tokenOfOwnerByIndex(address,uint256) view returns (uint256)",
  "function positions(uint256) view returns (uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
  "function setApprovalForAll(address,bool)",
  "function isApprovedForAll(address,address) view returns (bool)",
  "function ownerOf(uint256) view returns (address)",
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
];

function loadBandMins() {
  const script = path.join(
    __dirname,
    "../../scripts/stable-club/compute-failed-tx-band-mins.mts",
  );
  const raw = execFileSync(
    process.execPath,
    ["--experimental-strip-types", script],
    {
      encoding: "utf8",
      cwd: path.join(__dirname, "../.."),
      env: process.env,
    },
  );
  const line = raw.trim().split(/\r?\n/).filter(Boolean).pop();
  return JSON.parse(line);
}

describe("StableClub deposit band-mins Base fork (tx 0x1cf401c6)", function () {
  this.timeout(600_000);

  before(async function () {
    if (!process.env.BASE_RPC_URL?.trim()) this.skip();
    // strategy.chainId is 8453 on live; Hardhat defaults to 31337 without this.
    if (process.env.FORK_CHAIN_ID !== "8453") {
      throw new Error("Set FORK_CHAIN_ID=8453 before running this fork proof");
    }
  });

  it("original PSC-reverts; band mins deposit 5 LPs; gateway exits to USDC", async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.BASE_RPC_URL,
            blockNumber: PARENT_BLOCK,
          },
        },
      ],
    });

    const live = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    const failed = await live.getTransaction(FAILED_TX);
    expect(failed.to.toLowerCase()).to.equal(LEGACY_EXECUTOR.toLowerCase());
    expect(failed.gasLimit).to.equal(6188074n);
    // gasUsed on mined receipt was 2578532 — not OOG (asserted in unit investigation).

    const user = failed.from;
    const iface = new ethers.Interface(DEPOSIT_ABI);
    const decoded = iface.parseTransaction({ data: failed.data });
    const [strategyId, nonce, grossUsdc, poolIds, deadline, legs] = decoded.args;

    // 1) Original calldata reverts with Price slippage check at parent.
    let originalMsg = "";
    try {
      await ethers.provider.call({
        from: user,
        to: LEGACY_EXECUTOR,
        data: failed.data,
        gasLimit: failed.gasLimit,
      });
      expect.fail("original calldata should revert");
    } catch (err) {
      originalMsg = err?.shortMessage || err?.message || String(err);
    }
    expect(originalMsg).to.match(/Price slippage check|PSC/i);

    // 2) Band mins from library; patch legs.
    const bandMins = loadBandMins();
    expect(bandMins).to.have.length(5);
    // Leg1 must be loose enough vs exec consume ~2064.
    const leg1 = bandMins.find((m) => m.legIndex === 1);
    expect(BigInt(leg1.amountBMin)).to.be.lte(2064n);

    const patchedLegs = legs.map((leg, i) => {
      const m = bandMins[i];
      return {
        legIndex: leg.legIndex,
        adapter: leg.adapter,
        tokenA: leg.tokenA,
        tokenB: leg.tokenB,
        tickLower: leg.tickLower,
        tickUpper: leg.tickUpper,
        retainUsdc: leg.retainUsdc,
        swaps: leg.swaps,
        swapCount: leg.swapCount,
        amountAMin: BigInt(m.amountAMin),
        amountBMin: BigInt(m.amountBMin),
        slippageBps: leg.slippageBps,
      };
    });

    const fixedData = iface.encodeFunctionData("depositFivePoolStrategy", [
      strategyId,
      nonce,
      grossUsdc,
      poolIds,
      deadline,
      patchedLegs,
    ]);

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [user],
    });
    await network.provider.send("hardhat_setBalance", [
      user,
      "0x56BC75E2D63100000",
    ]);
    const signer = await ethers.getSigner(user);

    const usdc = await ethers.getContractAt(ERC20_ABI, USDC);
    const usdcBeforeDeposit = await usdc.balanceOf(user);

    const depositTx = await signer.sendTransaction({
      to: LEGACY_EXECUTOR,
      data: fixedData,
      gasLimit: 12_000_000n,
    });
    const depositReceipt = await depositTx.wait();
    expect(depositReceipt.status).to.equal(1);

    const transferTopic = ethers.id("Transfer(address,address,uint256)");
    let minted = 0;
    const mintNpms = new Set();
    for (const log of depositReceipt.logs) {
      if (log.topics[0] === transferTopic && log.topics.length === 4) {
        const to = ethers.getAddress(`0x${log.topics[2].slice(26)}`);
        if (to.toLowerCase() === user.toLowerCase()) {
          minted += 1;
          mintNpms.add(log.address.toLowerCase());
        }
      }
    }
    expect(minted).to.equal(5);
    // eslint-disable-next-line no-console
    console.log(
      `\n[band-mins-fork] deposit ok gas=${depositReceipt.gasUsed} minted=${minted} npms=${[...mintNpms].join(",")}\n`,
    );

    // 3) Gateway full exit → USDC (preserve withdraw gateway path).
    const gateway = await ethers.getContractAt(GATEWAY_ABI, OPS_GATEWAY);
    expect(await gateway.paused()).to.equal(false);

    // Live gateway may still need one-time owner ops: router ERC20 allowances + third NPM.
    const SAFE = "0x356A4A432EE57F31F5cF8Fdd55F95c1FF6Cd5910";
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [SAFE],
    });
    await network.provider.send("hardhat_setBalance", [
      SAFE,
      "0x56BC75E2D63100000",
    ]);
    const safeSigner = await ethers.getSigner(SAFE);
    const gatewayOwnerAbi = [
      "function approveRouterForToken(address token_)",
      "function setAllowedNpm(address npm_, bool allowed)",
      "function allowedNpm(address) view returns (bool)",
      "function owner() view returns (address)",
    ];
    const gatewayAdmin = await ethers.getContractAt(gatewayOwnerAbi, OPS_GATEWAY);
    expect((await gatewayAdmin.owner()).toLowerCase()).to.equal(SAFE.toLowerCase());
    await (await gatewayAdmin.connect(safeSigner).approveRouterForToken(CBBTC)).wait();
    await (await gatewayAdmin.connect(safeSigner).approveRouterForToken(WETH)).wait();
    for (const npmAddr of mintNpms) {
      if (!(await gatewayAdmin.allowedNpm(npmAddr))) {
        await (
          await gatewayAdmin.connect(safeSigner).setAllowedNpm(npmAddr, true)
        ).wait();
      }
    }

    // Discover NPMs that received mints + known catalogue NPMs.
    const npmCandidates = [
      ...mintNpms,
      UNI_NPM.toLowerCase(),
      AERO_NPM.toLowerCase(),
    ];
    const uniqueNpms = [...new Set(npmCandidates)].map((a) =>
      ethers.getAddress(a),
    );

    const exitLegs = [];
    for (const npmAddr of uniqueNpms) {
      const npm = await ethers.getContractAt(NPM_ABI, npmAddr);
      let bal;
      try {
        bal = await npm.balanceOf(user);
      } catch {
        continue;
      }
      for (let i = 0n; i < bal; i++) {
        const tokenId = await npm.tokenOfOwnerByIndex(user, i);
        const pos = await npm.positions(tokenId);
        const liquidity = pos[7];
        if (liquidity === 0n) continue;
        exitLegs.push({
          npm: npmAddr,
          tokenId,
          liquidity,
          amount0Min: 0n,
          amount1Min: 0n,
          burnIfEmpty: true,
        });
      }
      if (bal > 0n && !(await npm.isApprovedForAll(user, OPS_GATEWAY))) {
        await (await npm.connect(signer).setApprovalForAll(OPS_GATEWAY, true)).wait();
      }
    }
    // Prefer the five just minted: take last 5 with liquidity
    const legsToExit = exitLegs.slice(-5);
    expect(legsToExit.length).to.equal(5);

    const usdcBeforeExit = await usdc.balanceOf(user);
    const block = await ethers.provider.getBlock("latest");
    const exitDeadline = BigInt(block.timestamp) + 3600n;
    const swaps = [
      { tokenIn: CBBTC, fee: 500, amountIn: 0n, amountOutMinimum: 1n },
      { tokenIn: WETH, fee: 500, amountIn: 0n, amountOutMinimum: 1n },
    ];

    const exitTx = await gateway
      .connect(signer)
      .exitPercentToUsdc(legsToExit, swaps, 1n, exitDeadline, {
        gasLimit: 8_000_000n,
      });
    const exitReceipt = await exitTx.wait();
    expect(exitReceipt.status).to.equal(1);

    const usdcAfterExit = await usdc.balanceOf(user);
    const delta = usdcAfterExit - usdcBeforeExit;
    expect(delta).to.be.gt(ethers.parseUnits("1", 6));
    // eslint-disable-next-line no-console
    console.log(
      `[band-mins-fork] gateway exit ok usdcDelta=${ethers.formatUnits(delta, 6)} ` +
        `depositSpent≈${ethers.formatUnits(usdcBeforeDeposit - usdcBeforeExit > 0n ? usdcBeforeDeposit - usdcBeforeExit : 0n, 6)}\n`,
    );
  });

  after(async function () {
    await network.provider.request({ method: "hardhat_reset", params: [] });
  });
});
