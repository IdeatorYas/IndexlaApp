const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

/**
 * Measure Base L2 baseFee history + OP L1 data fee samples.
 * Writes docs/stable-club/step3/gas-ceiling-evidence.json — no deploy.
 * Rate-limit aware (QuickNode free tier ~15 rps).
 */
function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    const p = path.join(__dirname, "../..", f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const k = m[1].trim();
      if (!process.env[k]) process.env[k] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  loadEnv();
  if (!process.env.BASE_RPC_URL?.trim()) {
    throw new Error("BASE_RPC_URL required");
  }
  const p = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
  const L1 = "0x420000000000000000000000000000000000000F";
  const oracle = new ethers.Contract(
    L1,
    [
      "function l1BaseFee() view returns (uint256)",
      "function getL1Fee(bytes) view returns (uint256)",
    ],
    p,
  );

  const tip = await p.getBlockNumber();
  await sleep(250);
  const baseFees = [];
  // 12 samples spaced ~200 blocks; ≥250ms between calls to stay under 15 rps
  for (let i = 0; i < 12; i++) {
    const b = await p.getBlock(tip - i * 200);
    if (b?.baseFeePerGas != null) baseFees.push(b.baseFeePerGas.toString());
    await sleep(300);
  }
  const nums = baseFees.map(BigInt).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const pct = (arr, pctl) => arr[Math.min(arr.length - 1, Math.floor(arr.length * pctl))];

  const calldataSizes = [100, 500, 1200];
  const l1Fees = {};
  for (const n of calldataSizes) {
    const data = `0x${"ab".repeat(n)}`;
    l1Fees[`${n}b`] = (await oracle.getL1Fee(data)).toString();
    await sleep(300);
  }

  const l1BaseFee = (await oracle.l1BaseFee()).toString();
  const recommended = "1000000000"; // 1 gwei

  const artifact = {
    measuredAt: new Date().toISOString(),
    chainId: 8453,
    tipBlock: tip,
    baseFeeWei: {
      samples: nums.length,
      min: nums[0].toString(),
      max: nums[nums.length - 1].toString(),
      p50: pct(nums, 0.5).toString(),
      p95: pct(nums, 0.95).toString(),
    },
    l1BaseFeeWei: l1BaseFee,
    l1DataFeeWeiByCalldata: l1Fees,
    recommendation: {
      gasCeilingWei: recommended,
      gasCeilingGwei: "1",
      rationale:
        "L2 baseFee observed ~5e6 wei; 1 gwei (~200×) ceiling for SafetyController.maxGasPriceWei with Timelock configurability. L1 data fee monitored separately (not enforced by maxGasPriceWei).",
      encodeInLaunchParams: false,
      mapsTo: "SafetyController.setMaxGasPriceWei (Timelock-owned)",
    },
  };

  const out = path.join(__dirname, "../../docs/stable-club/step3/gas-ceiling-evidence.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(JSON.stringify(artifact, null, 2));
  console.log("Wrote", out);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
