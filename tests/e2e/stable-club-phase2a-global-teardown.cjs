/**
 * Must remain CommonJS: Playwright loads this as globalTeardown.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");

const PID_FILE = path.join(process.cwd(), "tmp/stable-club-phase2a-e2e-node.pid");
const META_FILE = path.join(process.cwd(), "tmp/stable-club-phase2a-e2e-node.meta.json");

module.exports = async function stableClubPhase2aGlobalTeardown() {
  let startedBySetup = false;
  try {
    const meta = JSON.parse(fs.readFileSync(META_FILE, "utf8"));
    startedBySetup = Boolean(meta.startedBySetup);
  } catch {
    startedBySetup = false;
  }

  if (startedBySetup) {
    try {
      const pid = Number(fs.readFileSync(PID_FILE, "utf8").trim());
      if (pid > 0) {
        process.kill(pid);
      }
    } catch {
      // Node may already be stopped.
    }
    // Windows: also free the listen port if the spawn pid was a shell wrapper.
    try {
      if (process.platform === "win32") {
        const { execSync } = require("node:child_process");
        execSync(
          `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8545 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
          { stdio: "ignore" },
        );
      }
    } catch {
      // ignore
    }
  }

  for (const file of [PID_FILE, META_FILE]) {
    try {
      fs.unlinkSync(file);
    } catch {
      // ignore
    }
  }
};
