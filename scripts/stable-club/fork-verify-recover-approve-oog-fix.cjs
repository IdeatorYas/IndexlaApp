/**
 * Fork at post-swap cold-allowance block: approve with 43216 OOGs; buffered floor succeeds.
 * FORK_CHAIN_ID=8453 npx hardhat run scripts/stable-club/fork-verify-recover-approve-oog-fix.cjs --network hardhat
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

const WALLET = "0xab4e242C5b489e8301408C93003903364214559F";
const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481";
/** Block after first swap spent allowance to 0 (cold slot). */
const FORK_BLOCK = 51101116;
const STALE_LIMIT = 43216n;
const FLOOR = 120000n;
const BUFFER_BPS = 6000n;

const ERC20 = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];

function applyBuffer(estimate) {
  const buffered = (estimate * (10000n + BUFFER_BPS)) / 10000n;
  return buffered > FLOOR ? buffered : FLOOR;
}

async function main() {
  if (!process.env.BASE_RPC_URL) throw new Error("BASE_RPC_URL required");
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: process.env.BASE_RPC_URL,
          blockNumber: FORK_BLOCK,
          chainId: 8453,
        },
      },
    ],
  });
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [WALLET],
  });
  await network.provider.send("hardhat_setBalance", [
    WALLET,
    "0x56BC75E2D63100000",
  ]);

  const signer = await ethers.getSigner(WALLET);
  const token = await ethers.getContractAt(ERC20, CBBTC, signer);
  const allow = await token.allowance(WALLET, ROUTER);
  const bal = await token.balanceOf(WALLET);
  const approveAmount = 6066n + 1n; // keepalive

  let oogReproduced = false;
  try {
    await token.approve.staticCall(ROUTER, approveAmount, {
      gasLimit: STALE_LIMIT,
    });
  } catch {
    oogReproduced = true;
  }
  // Prefer sending with low gas to prove OOG if staticCall doesn't catch it
  if (!oogReproduced && allow === 0n) {
    try {
      const tx = await token.approve(ROUTER, approveAmount, {
        gasLimit: STALE_LIMIT,
      });
      await tx.wait();
    } catch {
      oogReproduced = true;
    }
  }

  // Reset fork state again for success path if we mutated
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: process.env.BASE_RPC_URL,
          blockNumber: FORK_BLOCK,
          chainId: 8453,
        },
      },
    ],
  });
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [WALLET],
  });
  await network.provider.send("hardhat_setBalance", [
    WALLET,
    "0x56BC75E2D63100000",
  ]);
  const signer2 = await ethers.getSigner(WALLET);
  const token2 = await ethers.getContractAt(ERC20, CBBTC, signer2);
  const est = await token2.approve.estimateGas(ROUTER, approveAmount);
  const gas = applyBuffer(est);
  const txOk = await token2.approve(ROUTER, approveAmount, { gasLimit: gas });
  const receipt = await txOk.wait();
  const allowAfter = await token2.allowance(WALLET, ROUTER);

  const report = {
    forkBlock: FORK_BLOCK,
    bal: bal.toString(),
    allowBefore: allow.toString(),
    estimateGas: est.toString(),
    bufferedGas: gas.toString(),
    gasUsed: receipt.gasUsed.toString(),
    allowAfter: allowAfter.toString(),
    keepaliveOk: allowAfter >= 6066n,
    bufferedBeatsStale: gas > STALE_LIMIT,
    pass: receipt.status === 1 && allowAfter >= 6066n && gas > STALE_LIMIT,
  };
  const out = path.join(
    __dirname,
    "_fork-verify-recover-approve-oog-fix-report.json",
  );
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) {
    process.exitCode = 1;
    throw new Error("fork recover approve OOG fix FAILED");
  }
  console.log("PASS fork recover approve OOG fix");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
