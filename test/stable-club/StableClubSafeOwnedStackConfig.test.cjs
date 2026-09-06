#!/usr/bin/env node
/**
 * Offline unit check: Safe approval pack builder emits expected config txs
 * from a synthetic CREATE artifact (no broadcast, no RPC).
 */
const { expect } = require("chai");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { ethers } = require("hardhat");
const guards = require("../../scripts/stable-club/base-mainnet-deploy-guards.cjs");

const GUARDIAN = "0x157a96Bac2Bf9010445EBBe4c265Cf9C141576Cf";

describe("build-safe-owned-stack-config (approval pack)", function () {
  this.timeout(120_000);

  it("emits full Safe tx list with depositsRemainDisabled and Timelock cancel note", function () {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "safe-owned-pack-"));
    const artifactPath = path.join(tmpDir, "create.json");
    const outPath = path.join(tmpDir, "pack.json");

    const poolIds = guards.poolIdHashes();
    const artifact = {
      deployedAt: new Date().toISOString(),
      chainId: 8453,
      mode: "SAFE_OWNED_CREATE_ONLY",
      safeOwner: guards.MVP_SAFE,
      timelock: null,
      contracts: {
        permissionRegistry: { address: "0x1111111111111111111111111111111111111111", createTx: "0x01" },
        strategyRegistry: { address: "0x2222222222222222222222222222222222222222", createTx: "0x02" },
        feeRouter: { address: "0x3333333333333333333333333333333333333333", createTx: "0x03" },
        swapRouter: { address: "0x4444444444444444444444444444444444444444", createTx: "0x04" },
        oracleGuard: { address: "0x5555555555555555555555555555555555555555", createTx: "0x05" },
        mevGuard: { address: "0x6666666666666666666666666666666666666666", createTx: "0x06" },
        safetyController: { address: "0x7777777777777777777777777777777777777777", createTx: "0x07" },
        clExecutor: { address: "0x8888888888888888888888888888888888888888", createTx: "0x08" },
      },
      adapters: poolIds.map((poolId, i) => ({
        poolId,
        protocol: i % 2 === 0 ? "aerodrome-slipstream" : "uniswap-v3",
        adapter: ethers.getAddress(`0x${(0xa0 + i).toString(16).padStart(2, "0")}${"11".repeat(19)}`),
        createTx: `0x${(10 + i).toString(16).padStart(2, "0")}`,
      })),
    };
    fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));

    const script = path.join(
      process.cwd(),
      "scripts/stable-club/build-safe-owned-stack-config.cjs",
    );
    const result = spawnSync(
      process.execPath,
      [
        script,
        `--artifact=${artifactPath}`,
        `--guardian=${GUARDIAN}`,
        `--out=${outPath}`,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env },
      },
    );
    if (result.status !== 0) {
      throw new Error(`config builder failed:\n${result.stdout}\n${result.stderr}`);
    }

    const pack = JSON.parse(fs.readFileSync(outPath, "utf8"));
    expect(pack.status).to.equal("CALLDATA_ONLY_NO_BROADCAST");
    expect(pack.depositsRemainDisabled).to.equal(true);
    expect(pack.safe).to.equal(guards.MVP_SAFE);
    expect(pack.cancelTimelockProposal).to.match(/0x649f22a3/);
    expect(pack.txCount).to.be.greaterThan(20);
    expect(pack.safeTransactions).to.have.length(pack.txCount);

    const labels = pack.safeTransactions.map((t) => t.label);
    expect(labels.some((l) => l.includes("configureFeed USDC"))).to.equal(true);
    expect(labels.some((l) => l.includes("setExecutorApproved(clExecutor)"))).to.equal(true);
    expect(labels.some((l) => l.includes("registerPool"))).to.equal(true);
    expect(labels.some((l) => l.includes("deposit"))).to.equal(true);
    expect(labels.some((l) => l.includes("reverse"))).to.equal(true);
    expect(labels.filter((l) => l.includes("reverse")).length).to.equal(4);
    expect(labels.filter((l) => l.includes("deposit")).length).to.equal(4);

    for (const tx of pack.safeTransactions) {
      expect(tx.to).to.match(/^0x[a-fA-F0-9]{40}$/);
      expect(tx.value).to.equal("0");
      expect(tx.data).to.match(/^0x[a-fA-F0-9]+$/);
      expect(tx.decoded.method).to.be.a("string");
    }

    // Persist sample pack for founder review (synthetic addresses — replace after mainnet CREATE).
    const persistDir = path.join(process.cwd(), "deployments", "base-mainnet");
    fs.mkdirSync(persistDir, { recursive: true });
    const persistPath = path.join(persistDir, "safe-owned-stack-approval-pack.SAMPLE.json");
    fs.writeFileSync(persistPath, JSON.stringify(pack, null, 2));
  });
});
