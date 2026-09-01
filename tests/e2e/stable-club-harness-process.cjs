const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { execSync, spawn } = require("node:child_process");

const HARDHAT_PORT = 8545;
const WEB_SERVER_PORT = 4010;
const HARNESS_PORTS = [HARDHAT_PORT, WEB_SERVER_PORT];
const LOCAL_CHAIN_ID = "0x7a69";
const STARTUP_TIMEOUT_MS = 180_000;
const SHUTDOWN_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 400;

const PID_FILE = path.join(process.cwd(), "tmp/stable-club-e2e-node.pid");
const META_FILE = path.join(process.cwd(), "tmp/stable-club-e2e-node.meta.json");
const LOG_FILE = path.join(process.cwd(), "tmp/stable-club-e2e-node.log");
const WEBSERVER_PID_FILE = path.join(process.cwd(), "tmp/stable-club-e2e-webserver.pid");
const WEBSERVER_META_FILE = path.join(process.cwd(), "tmp/stable-club-e2e-webserver.meta.json");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1", () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

async function waitForJsonRpc(port, timeoutMs = STARTUP_TIMEOUT_MS) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      const json = await res.json();
      if (json.result?.toLowerCase() === LOCAL_CHAIN_ID) {
        return;
      }
    } catch {
      // Hardhat still booting or compiling.
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    `Hardhat JSON-RPC not ready on port ${port} within ${timeoutMs}ms (expected chainId ${LOCAL_CHAIN_ID})`,
  );
}

function readMeta() {
  try {
    return JSON.parse(fs.readFileSync(META_FILE, "utf8"));
  } catch {
    return null;
  }
}

function readWebServerMeta() {
  try {
    return JSON.parse(fs.readFileSync(WEBSERVER_META_FILE, "utf8"));
  } catch {
    return null;
  }
}

function writeMeta(meta) {
  fs.mkdirSync(path.dirname(META_FILE), { recursive: true });
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
}

function writePidFile(rootPid) {
  fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
  fs.writeFileSync(PID_FILE, String(rootPid));
}

function appendStartupLogTail(error) {
  try {
    if (!fs.existsSync(LOG_FILE)) return error;
    const tail = fs.readFileSync(LOG_FILE, "utf8").slice(-8000);
    if (!tail.trim()) return error;
    error.message += `\n\nHardhat node startup log (tail):\n${tail}`;
    return error;
  } catch {
    return error;
  }
}

function listProcessesWindows() {
  const script = [
    "Get-CimInstance Win32_Process",
    "| Select-Object ProcessId,ParentProcessId,CommandLine",
    "| ConvertTo-Json -Compress",
  ].join(" ");
  const raw = execSync(`powershell -NoProfile -Command "${script}"`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function listProcessesPosix() {
  try {
    const raw = execSync("ps -eo pid=,ppid=,command=", { encoding: "utf8" });
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d+)\s+(\d+)\s+(.*)$/);
        if (!match) return null;
        return {
          ProcessId: Number(match[1]),
          ParentProcessId: Number(match[2]),
          CommandLine: match[3],
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function listProcesses() {
  return process.platform === "win32" ? listProcessesWindows() : listProcessesPosix();
}

function isHarnessHardhatCommandLine(commandLine) {
  if (!commandLine) return false;
  const normalized = commandLine.toLowerCase();
  return (
    normalized.includes("hardhat") &&
    normalized.includes("bootstrap.js") &&
    normalized.includes("node") &&
    (normalized.includes(`--port ${HARDHAT_PORT}`) ||
      normalized.includes(`--port=${HARDHAT_PORT}`))
  );
}

function isHarnessWebServerCommandLine(commandLine) {
  if (!commandLine) return false;
  const normalized = commandLine.toLowerCase();
  return (
    normalized.includes("start-stable-club-webserver.cjs") ||
    (normalized.includes("next") &&
      normalized.includes("start") &&
      (normalized.includes(`-p ${WEB_SERVER_PORT}`) ||
        normalized.includes(`-p${WEB_SERVER_PORT}`) ||
        normalized.includes(`--port ${WEB_SERVER_PORT}`) ||
        normalized.includes(`--port=${WEB_SERVER_PORT}`)))
  );
}

function collectDescendantPids(rootPid, processes) {
  const byParent = new Map();
  for (const proc of processes) {
    const parent = Number(proc.ParentProcessId);
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent).push(Number(proc.ProcessId));
  }

  const seen = new Set();
  const queue = [rootPid];
  const tree = [];
  while (queue.length > 0) {
    const current = queue.shift();
    if (seen.has(current)) continue;
    seen.add(current);
    tree.push(current);
    for (const child of byParent.get(current) ?? []) {
      queue.push(child);
    }
  }
  return tree;
}

function discoverHarnessWebServerTree(rootPid) {
  const processes = listProcesses();
  const treePids = collectDescendantPids(rootPid, processes);
  const procById = new Map(processes.map((proc) => [Number(proc.ProcessId), proc]));

  const rootProc = procById.get(rootPid);
  if (!rootProc) {
    throw new Error(`WebServer root PID ${rootPid} is not running or not owned by this harness`);
  }

  if (!isHarnessWebServerCommandLine(rootProc.CommandLine)) {
    throw new Error(
      `WebServer root PID ${rootPid} command line is not a validated Stable Club webServer process`,
    );
  }

  const nextPids = [];
  for (const pid of treePids) {
    const proc = procById.get(pid);
    if (proc && isHarnessWebServerCommandLine(proc.CommandLine) && pid !== rootPid) {
      nextPids.push(pid);
    }
  }

  return {
    rootPid,
    nextPid: nextPids[nextPids.length - 1] ?? rootPid,
    nextPids,
    rootCommandLine: rootProc.CommandLine ?? "",
  };
}

function discoverHarnessProcessTree(rootPid) {
  const processes = listProcesses();
  const treePids = collectDescendantPids(rootPid, processes);
  const procById = new Map(processes.map((proc) => [Number(proc.ProcessId), proc]));

  const rootProc = procById.get(rootPid);
  if (!rootProc) {
    throw new Error(`Harness root PID ${rootPid} is not running or not owned by this harness`);
  }

  const hardhatPids = [];
  for (const pid of treePids) {
    const proc = procById.get(pid);
    if (proc && isHarnessHardhatCommandLine(proc.CommandLine)) {
      hardhatPids.push(pid);
    }
  }

  if (hardhatPids.length === 0) {
    throw new Error(
      `No Hardhat child process found in harness tree for root PID ${rootPid}`,
    );
  }

  const hardhatPidSet = new Set(hardhatPids);
  const leafHardhatPids = hardhatPids.filter((pid) => {
    const hasHardhatChild = processes.some(
      (proc) =>
        Number(proc.ParentProcessId) === pid &&
        hardhatPidSet.has(Number(proc.ProcessId)),
    );
    return !hasHardhatChild;
  });
  const hardhatPid = leafHardhatPids[leafHardhatPids.length - 1] ?? hardhatPids[hardhatPids.length - 1];
  return {
    rootPid,
    hardhatPid,
    hardhatPids,
    rootCommandLine: rootProc.CommandLine ?? "",
  };
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return !(err && typeof err === "object" && "code" in err && err.code === "ESRCH");
  }
}

async function waitForPidsExit(pids, timeoutMs = SHUTDOWN_TIMEOUT_MS) {
  const targets = [...new Set(pids.filter((pid) => pid > 0))];
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const alive = targets.filter((pid) => isPidAlive(pid));
    if (alive.length === 0) return;
    await sleep(POLL_INTERVAL_MS);
  }
  const alive = targets.filter((pid) => isPidAlive(pid));
  if (alive.length > 0) {
    throw new Error(`Harness process(es) still alive after ${timeoutMs}ms: ${alive.join(", ")}`);
  }
}

async function waitForPortsClear(ports, timeoutMs = SHUTDOWN_TIMEOUT_MS) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const states = await Promise.all(ports.map((port) => isPortOpen(port)));
    if (states.every((open) => !open)) return;
    await sleep(POLL_INTERVAL_MS);
  }
  const blocked = [];
  for (const port of ports) {
    if (await isPortOpen(port)) blocked.push(port);
  }
  if (blocked.length > 0) {
    throw new Error(`Port(s) still listening after ${timeoutMs}ms: ${blocked.join(", ")}`);
  }
}

function gracefulTerminateRoot(rootPid) {
  if (!isPidAlive(rootPid)) return;
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /PID ${rootPid} /T`, { stdio: "ignore" });
    } catch {
      // Process tree may already be exiting.
    }
    return;
  }
  try {
    process.kill(-rootPid, "SIGTERM");
  } catch {
    try {
      process.kill(rootPid, "SIGTERM");
    } catch {
      // Process may already be gone.
    }
  }
}

function forceTerminateRootTree(rootPid) {
  if (!isPidAlive(rootPid)) return;
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /PID ${rootPid} /T /F`, { stdio: "ignore" });
    } catch {
      if (isPidAlive(rootPid)) {
        throw new Error(`taskkill /PID ${rootPid} /T /F failed to terminate harness tree`);
      }
    }
    return;
  }
  try {
    process.kill(-rootPid, "SIGKILL");
  } catch {
    try {
      process.kill(rootPid, "SIGKILL");
    } catch {
      // Process may already be gone.
    }
  }
}

function removeHarnessHardhatFiles() {
  for (const file of [PID_FILE, META_FILE]) {
    try {
      fs.unlinkSync(file);
    } catch {
      // ignore
    }
  }
}

function removeHarnessWebServerFiles() {
  for (const file of [WEBSERVER_PID_FILE, WEBSERVER_META_FILE]) {
    try {
      fs.unlinkSync(file);
    } catch {
      // ignore
    }
  }
}

function removeAllHarnessFiles() {
  removeHarnessHardhatFiles();
  removeHarnessWebServerFiles();
}

/** @deprecated use removeHarnessHardhatFiles */
function removeHarnessFiles() {
  removeHarnessHardhatFiles();
}

async function stopHarnessWebServer(meta) {
  let effective = meta;
  if (!effective) {
    try {
      const rootPid = Number(fs.readFileSync(WEBSERVER_PID_FILE, "utf8").trim());
      if (rootPid > 0) {
        effective = { startedByWebServer: true, rootPid };
      }
    } catch {
      effective = null;
    }
  }

  if (!effective?.startedByWebServer) {
    return { stopped: false, reason: "not-started-by-webserver" };
  }

  const persistedPids = [
    Number(effective.rootPid ?? 0),
    ...(effective.nextPids ?? []).map((pid) => Number(pid)),
    Number(effective.nextPid ?? 0),
  ].filter((pid) => pid > 0);

  const killRootPid = persistedPids.find((pid) => isPidAlive(pid));
  if (!killRootPid) {
    return { stopped: true, reason: "process-already-exited" };
  }

  const tree = discoverHarnessWebServerTree(killRootPid);
  const nextPid = Number(effective.nextPid ?? tree.nextPid);
  if (tree.nextPids.length > 0 && !tree.nextPids.includes(nextPid) && killRootPid !== nextPid) {
    throw new Error(
      `Harness WebServer PID ${nextPid} is not in the validated process tree for kill root ${killRootPid}`,
    );
  }

  gracefulTerminateRoot(killRootPid);
  try {
    await waitForPidsExit([killRootPid, nextPid, ...tree.nextPids], SHUTDOWN_TIMEOUT_MS);
  } catch {
    forceTerminateRootTree(killRootPid);
    await waitForPidsExit([killRootPid, nextPid, ...tree.nextPids], SHUTDOWN_TIMEOUT_MS);
  }

  return { stopped: true, killRootPid, nextPid };
}

async function stopHarnessHardhat(meta, { removeFiles = true } = {}) {
  let effective = meta;
  if (!effective) {
    try {
      const rootPid = Number(fs.readFileSync(PID_FILE, "utf8").trim());
      if (rootPid > 0) {
        const tree = discoverHarnessProcessTree(rootPid);
        effective = {
          startedBySetup: true,
          rootPid: tree.rootPid,
          hardhatPid: tree.hardhatPid,
          hardhatPids: tree.hardhatPids,
        };
      }
    } catch {
      effective = null;
    }
  }

  if (!effective?.startedBySetup) {
    if (removeFiles) {
      removeHarnessHardhatFiles();
    }
    return { stopped: false, reason: "not-started-by-setup" };
  }

  const persistedPids = [
    Number(effective.rootPid ?? 0),
    ...(effective.processTreePids ?? effective.hardhatPids ?? []).map((pid) => Number(pid)),
    Number(effective.hardhatPid ?? 0),
  ].filter((pid) => pid > 0);

  const killRootPid = persistedPids.find((pid) => isPidAlive(pid));
  if (!killRootPid) {
    await waitForPortsClear([HARDHAT_PORT], SHUTDOWN_TIMEOUT_MS);
    if (removeFiles) {
      removeHarnessHardhatFiles();
    }
    return { stopped: true, reason: "process-already-exited" };
  }

  const tree = discoverHarnessProcessTree(killRootPid);
  const hardhatPid = Number(effective.hardhatPid ?? tree.hardhatPid);
  if (!tree.hardhatPids.includes(hardhatPid)) {
    throw new Error(
      `Harness Hardhat PID ${hardhatPid} is not in the validated process tree for kill root ${killRootPid}`,
    );
  }

  gracefulTerminateRoot(killRootPid);
  try {
    await waitForPidsExit([killRootPid, hardhatPid, ...tree.hardhatPids], SHUTDOWN_TIMEOUT_MS);
  } catch {
    forceTerminateRootTree(killRootPid);
    await waitForPidsExit([killRootPid, hardhatPid, ...tree.hardhatPids], SHUTDOWN_TIMEOUT_MS);
  }

  await waitForPortsClear([HARDHAT_PORT], SHUTDOWN_TIMEOUT_MS);
  if (removeFiles) {
    removeHarnessHardhatFiles();
  }
  return { stopped: true, killRootPid, hardhatPid };
}

async function stopHarnessAll() {
  const webMeta = readWebServerMeta();
  const hardhatMeta = readMeta();

  await stopHarnessWebServer(webMeta);
  await stopHarnessHardhat(hardhatMeta, { removeFiles: false });
  await waitForPortsClear(HARNESS_PORTS, SHUTDOWN_TIMEOUT_MS);
  removeAllHarnessFiles();
  return { stopped: true };
}

function spawnHarnessHardhatNode() {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.writeFileSync(LOG_FILE, "");
  const logFd = fs.openSync(LOG_FILE, "a");
  const child = spawn("npx", ["hardhat", "node", "--port", String(HARDHAT_PORT)], {
    cwd: process.cwd(),
    stdio: ["ignore", logFd, logFd],
    shell: true,
    detached: process.platform !== "win32",
  });
  fs.closeSync(logFd);
  child.unref();
  return child;
}

async function startHarnessHardhatNodeIfNeeded() {
  const alreadyRunning = await isPortOpen(HARDHAT_PORT);
  if (alreadyRunning) {
    return {
      startedBySetup: false,
      rootPid: null,
      hardhatPid: null,
      port: HARDHAT_PORT,
    };
  }

  const child = spawnHarnessHardhatNode();
  const rootPid = child.pid;
  if (!rootPid) {
    throw new Error("Failed to spawn Hardhat harness process (missing root PID)");
  }

  writePidFile(rootPid);
  await waitForJsonRpc(HARDHAT_PORT, STARTUP_TIMEOUT_MS);
  const tree = discoverHarnessProcessTree(rootPid);
  const processTreePids = collectDescendantPids(rootPid, listProcesses());

  const meta = {
    startedBySetup: true,
    port: HARDHAT_PORT,
    rootPid: tree.rootPid,
    hardhatPid: tree.hardhatPid,
    hardhatPids: tree.hardhatPids,
    processTreePids,
    startedAt: new Date().toISOString(),
  };
  writeMeta(meta);
  return meta;
}

module.exports = {
  HARDHAT_PORT,
  WEB_SERVER_PORT,
  HARNESS_PORTS,
  PID_FILE,
  META_FILE,
  LOG_FILE,
  WEBSERVER_PID_FILE,
  WEBSERVER_META_FILE,
  appendStartupLogTail,
  readMeta,
  readWebServerMeta,
  writeMeta,
  startHarnessHardhatNodeIfNeeded,
  stopHarnessHardhat,
  stopHarnessWebServer,
  stopHarnessAll,
  isPortOpen,
  waitForPortsClear,
  removeHarnessFiles,
  removeAllHarnessFiles,
};
