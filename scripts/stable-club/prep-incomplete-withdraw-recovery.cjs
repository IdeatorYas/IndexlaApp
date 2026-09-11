/**
 * Live-read only (no broadcast): attribute wallet residue vs open LPs for
 * incomplete withdraw recovery after OOG tx 0xd73deb70…
 *
 *   node scripts/stable-club/prep-incomplete-withdraw-recovery.cjs
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const { ethers } = require("ethers");

const WALLET = "0xab4e242C5b489e8301408C93003903364214559F";
const FAILED_TX =
  "0xd73deb7050e6847d1ac1dd6c5c38491d91c2a08812663e7fd44177463f261e79";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const WETH = "0x4200000000000000000000000000000000000006";
const NPMS = [
  {
    label: "aero-legacy",
    address: "0x827922686190790b37229fd06084350e74485b72",
  },
  {
    label: "aero-current",
    address: "0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53",
  },
  {
    label: "uni-v3",
    address: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
  },
];

const ERC20 = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];
const ERC721 = [
  "function balanceOf(address) view returns (uint256)",
  "function tokenOfOwnerByIndex(address,uint256) view returns (uint256)",
  "function ownerOf(uint256) view returns (address)",
];

async function main() {
  const rpc = process.env.BASE_RPC_URL;
  if (!rpc) throw new Error("BASE_RPC_URL required");
  const provider = new ethers.JsonRpcProvider(rpc, 8453);

  const tx = await provider.getTransaction(FAILED_TX);
  const receipt = await provider.getTransactionReceipt(FAILED_TX);
  const failed = {
    hash: FAILED_TX,
    blockNumber: receipt?.blockNumber ?? null,
    status: receipt?.status,
    to: tx?.to,
    gasLimit: tx?.gasLimit?.toString(),
    gasUsed: receipt?.gasUsed?.toString(),
    nonce: tx?.nonce,
    oogExact:
      receipt &&
      tx &&
      receipt.gasUsed != null &&
      tx.gasLimit != null &&
      receipt.gasUsed === tx.gasLimit,
  };

  const usdc = new ethers.Contract(USDC, ERC20, provider);
  const cbbtc = new ethers.Contract(CBBTC, ERC20, provider);
  const weth = new ethers.Contract(WETH, ERC20, provider);
  const [u, c, w] = await Promise.all([
    usdc.balanceOf(WALLET),
    cbbtc.balanceOf(WALLET),
    weth.balanceOf(WALLET),
  ]);

  const owned = [];
  for (const npm of NPMS) {
    const c721 = new ethers.Contract(npm.address, ERC721, provider);
    const bal = await c721.balanceOf(WALLET);
    for (let i = 0n; i < bal; i += 1n) {
      try {
        const tokenId = await c721.tokenOfOwnerByIndex(WALLET, i);
        owned.push({
          npm: npm.label,
          npmAddress: npm.address,
          tokenId: tokenId.toString(),
        });
      } catch (e) {
        owned.push({
          npm: npm.label,
          npmAddress: npm.address,
          error: String(e?.shortMessage || e?.message || e),
        });
      }
    }
  }

  const dustCb = 1000n; // ~dust filter alignment
  const dustWeth = 10n ** 12n;
  const report = {
    note: "READ-ONLY — no transactions broadcast. User must sign any recovery.",
    wallet: WALLET,
    failedTx: failed,
    balances: {
      usdc: u.toString(),
      usdcHuman: Number(u) / 1e6,
      cbBTC: c.toString(),
      cbBtcHuman: Number(c) / 1e8,
      weth: w.toString(),
      wethHuman: Number(w) / 1e18,
    },
    ownedLpNfts: owned,
    attribution: {
      ambiguousWithoutBaseline:
        "Without the browser withdraw checkpoint baseline, any cbBTC/WETH above dust may mix pre-existing wallet holdings with withdrawal residue.",
      suggestedRecoverIfAllResidue: {
        cbBTC: c > dustCb ? c.toString() : "0",
        WETH: w > dustWeth ? w.toString() : "0",
        action:
          owned.length > 0
            ? "Resume incomplete withdraw: finish remaining NPM legs first (do not re-apply % to completed NPMs), then residue→USDC only."
            : "No open IndexLa NPMs — Resume recover-only (Uni→USDC) for attributed residue, or confirm residual amounts before signing.",
      },
    },
    nextStep:
      "After deploy: open My Position → Resume incomplete withdraw (or clear stale checkpoint and recover with attributed maxByToken).",
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
