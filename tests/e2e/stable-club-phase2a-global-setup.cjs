/**
 * Fresh Hardhat + Phase 2a local deploy for five-pool deposit/positions Playwright.
 * Writes src/lib/stable-club/generated/local-phase2a-deployments.json (not Step-1 local-deployments.json).
 * Always restarts port 8545 so prior deposit NFTs cannot contaminate the run.
 *
 * Must remain CommonJS: Playwright loads this as globalSetup.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn, execSync } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const PORT = 8545;
const PID_FILE = path.join(process.cwd(), "tmp/stable-club-phase2a-e2e-node.pid");
const META_FILE = path.join(process.cwd(), "tmp/stable-club-phase2a-e2e-node.meta.json");
const HH_LOG = path.join(process.cwd(), "tmp/stable-club-phase2a-e2e-hardhat.log");
const PHASE2A_ARTIFACT = path.join(
  process.cwd(),
  "src/lib/stable-club/generated/local-phase2a-deployments.json",
);

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1", () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

function waitForPort(port, timeoutMs = 90_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const attempt = () => {
      const socket = net.connect(port, "127.0.0.1", () => {
        socket.end();
        resolve();
      });
      socket.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          let logTail = "";
          try {
            logTail = fs.readFileSync(HH_LOG, "utf8").slice(-2000);
          } catch {
            // ignore
          }
          reject(
            new Error(
              `Hardhat node did not start on port ${port}` +
                (logTail ? `\n--- hardhat log ---\n${logTail}` : ""),
            ),
          );
          return;
        }
        setTimeout(attempt, 400);
      });
    };
    attempt();
  });
}

function killListenerOnPort(port) {
  try {
    if (process.platform === "win32") {
      execSync(
        `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
        { stdio: "ignore" },
      );
    } else {
      execSync(`fuser -k ${port}/tcp || true`, { stdio: "ignore", shell: true });
    }
  } catch {
    // ignore
  }
}

function assertPhase2aArtifact(artifact) {
  if (
    artifact.chainId !== 31337 ||
    artifact.network !== "hardhat-local" ||
    artifact.isTestOnly !== true ||
    artifact.discoveryStartBlock == null ||
    !artifact.clExecutor ||
    !artifact.strategyRegistry ||
    !artifact.permissionRegistry ||
    !Array.isArray(artifact.adapters) ||
    artifact.adapters.length !== 5
  ) {
    throw new Error(
      `Phase 2a E2E artifact invalid after deploy: chainId=${artifact.chainId} network=${artifact.network} isTestOnly=${artifact.isTestOnly} discoveryStartBlock=${artifact.discoveryStartBlock} adapters=${artifact.adapters?.length}`,
    );
  }
}

/** SC-F09 local proof: every attestation target must have non-empty bytecode on the fresh node. */
async function assertFreshBytecodeViaRpc(artifact) {
  const targets = [
    ["permissionRegistry", artifact.permissionRegistry],
    ["strategyRegistry", artifact.strategyRegistry],
    ["feeRouter", artifact.feeRouter],
    ["clExecutor", artifact.clExecutor],
    ["swapRouter", artifact.swapRouter],
    ["oracleGuard", artifact.oracleGuard],
    ["safetyController", artifact.safetyController],
    ["permit2", artifact.permit2],
    ...artifact.adapters.map((a, i) => [`adapters[${i}]`, a.adapter]),
  ].filter(([, addr]) => Boolean(addr));

  for (const [key, address] of targets) {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getCode",
      params: [address, "latest"],
    });
    const res = await fetch(`http://127.0.0.1:${PORT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const json = await res.json();
    const code = typeof json.result === "string" ? json.result : "0x";
    if (!code || code === "0x" || code === "0x0") {
      throw new Error(`Phase 2a E2E SC-F09 bytecode check failed: empty code at ${key} (${address})`);
    }
  }
}

module.exports = async function stableClubPhase2aGlobalSetup() {
  fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
  fs.mkdirSync(path.dirname(HH_LOG), { recursive: true });

  // Fresh chain: never reuse a prior Hardhat state (deposit NFT contamination).
  if (await isPortOpen(PORT)) {
    killListenerOnPort(PORT);
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline && (await isPortOpen(PORT))) {
      await new Promise((r) => setTimeout(r, 300));
    }
    if (await isPortOpen(PORT)) {
      throw new Error(`Could not free Hardhat port ${PORT} for fresh Phase 2a E2E`);
    }
  }

  // stdio ignore can prevent Hardhat from booting on Windows; log to file instead.
  const logFd = fs.openSync(HH_LOG, "w");
  const child = spawn("npx", ["hardhat", "node", "--port", String(PORT)], {
    cwd: process.cwd(),
    stdio: ["ignore", logFd, logFd],
    shell: true,
    detached: true,
    windowsHide: true,
  });
  child.unref();
  fs.writeFileSync(PID_FILE, String(child.pid));

  try {
    await waitForPort(PORT);
  } catch (err) {
    killListenerOnPort(PORT);
    throw err;
  }

  fs.writeFileSync(
    META_FILE,
    JSON.stringify({ startedBySetup: true, port: PORT, phase2a: true }, null, 2),
  );

  execSync("npx hardhat run scripts/stable-club/deploy-phase2a-local.cjs --network localhost", {
    stdio: "inherit",
    cwd: process.cwd(),
  });

  const raw = fs.readFileSync(PHASE2A_ARTIFACT, "utf8");
  const artifact = JSON.parse(raw);
  assertPhase2aArtifact(artifact);
  await assertFreshBytecodeViaRpc(artifact);
};
