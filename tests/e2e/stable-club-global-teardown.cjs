const fs = require("node:fs");
const path = require("node:path");

const PID_FILE = path.join(process.cwd(), "tmp/stable-club-e2e-node.pid");
const META_FILE = path.join(process.cwd(), "tmp/stable-club-e2e-node.meta.json");

module.exports = async function stableClubGlobalTeardown() {
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
  }

  for (const file of [PID_FILE, META_FILE]) {
    try {
      fs.unlinkSync(file);
    } catch {
      // ignore
    }
  }
};
