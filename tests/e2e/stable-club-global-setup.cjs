const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { execSync } = require("node:child_process");

const PORT = 8545;
const PID_FILE = path.join(process.cwd(), "tmp/stable-club-e2e-node.pid");
const META_FILE = path.join(process.cwd(), "tmp/stable-club-e2e-node.meta.json");

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1", () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

function waitForPort(port, timeoutMs = 45_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const attempt = () => {
      const socket = net.connect(port, "127.0.0.1", () => {
        socket.end();
        resolve();
      });
      socket.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Hardhat node did not start on port ${port}`));
          return;
        }
        setTimeout(attempt, 400);
      });
    };
    attempt();
  });
}

module.exports = async function stableClubGlobalSetup() {
  fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });

  let startedBySetup = false;
  const alreadyRunning = await isPortOpen(PORT);

  if (!alreadyRunning) {
    const child = spawn("npx", ["hardhat", "node", "--port", String(PORT)], {
      cwd: process.cwd(),
      stdio: "ignore",
      shell: true,
      detached: true,
    });

    child.unref();
    fs.writeFileSync(PID_FILE, String(child.pid));
    startedBySetup = true;
    await waitForPort(PORT);
  }

  fs.writeFileSync(
    META_FILE,
    JSON.stringify({ startedBySetup, port: PORT }, null, 2),
  );

  execSync("npx hardhat run scripts/stable-club/deploy-local.cjs --network localhost", {
    stdio: "inherit",
    cwd: process.cwd(),
  });
};
