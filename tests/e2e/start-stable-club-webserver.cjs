const fs = require("node:fs");
const path = require("node:path");
const { execSync, spawn } = require("node:child_process");

const PORT = 4010;
const BUILD_ID = path.join(process.cwd(), ".next", "BUILD_ID");
const WEBSERVER_PID_FILE = path.join(process.cwd(), "tmp/stable-club-e2e-webserver.pid");
const WEBSERVER_META_FILE = path.join(process.cwd(), "tmp/stable-club-e2e-webserver.meta.json");

function ensureProductionBuild() {
  const e2eDevBuild =
    process.env.STABLE_CLUB_DEV_ENABLED === "true" ||
    process.env.STABLE_CLUB_DEV_ENABLED?.toLowerCase() === "true";
  if (!e2eDevBuild && fs.existsSync(BUILD_ID)) {
    return;
  }
  execSync("npm run build", {
    stdio: "inherit",
    cwd: process.cwd(),
    env: process.env,
  });
}

function writeWebServerMeta(meta) {
  fs.mkdirSync(path.dirname(WEBSERVER_META_FILE), { recursive: true });
  fs.writeFileSync(WEBSERVER_META_FILE, JSON.stringify(meta, null, 2));
  fs.writeFileSync(WEBSERVER_PID_FILE, String(meta.rootPid));
}

function terminateChildTree(childPid) {
  if (!childPid || childPid <= 0) return;
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /PID ${childPid} /T /F`, { stdio: "ignore" });
    } catch {
      // Child tree may already be exiting.
    }
    return;
  }
  try {
    process.kill(-childPid, "SIGTERM");
  } catch {
    try {
      process.kill(childPid, "SIGTERM");
    } catch {
      // Child may already be gone.
    }
  }
}

ensureProductionBuild();

const rootPid = process.pid;
const child = spawn("npx", ["next", "start", "-p", String(PORT)], {
  cwd: process.cwd(),
  stdio: "inherit",
  shell: true,
  env: process.env,
});

writeWebServerMeta({
  startedByWebServer: true,
  rootPid,
  nextPid: child.pid ?? null,
  port: PORT,
  startedAt: new Date().toISOString(),
});

child.on("exit", (code, signal) => {
  try {
    fs.unlinkSync(WEBSERVER_PID_FILE);
  } catch {
    // ignore
  }
  try {
    fs.unlinkSync(WEBSERVER_META_FILE);
  } catch {
    // ignore
  }
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

function shutdownChild() {
  terminateChildTree(child.pid);
}

process.on("SIGINT", () => {
  shutdownChild();
  process.exit(130);
});
process.on("SIGTERM", () => {
  shutdownChild();
  process.exit(143);
});
