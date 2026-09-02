/**
 * Pure Base RPC URL / endpoint isolation guards.
 * No Hardhat, no secrets printed, safe for hardhat.config.cjs.
 */

const LOCAL_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  "host.docker.internal",
  "hardhat",
  "anvil",
]);

const LOCAL_CLIENT_MARKERS = [
  "hardhat",
  "anvil",
  "ganache",
  "ethereumjs",
  "foundry",
];

function isPrivateOrLoopbackIpv4(hostname) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!m) return false;
  const oct = m.slice(1).map((x) => Number(x));
  if (oct.some((n) => n > 255)) return true; // treat invalid as rejected via other checks
  const [a, b] = oct;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isPrivateOrLoopbackIpv6(hostname) {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "::1") return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // ULA
  if (h.startsWith("fe80")) return true; // link-local
  return false;
}

/**
 * Validate BASE_RPC_URL for production Base broadcasts.
 * Never includes the URL value in thrown errors.
 * @returns {string} validated URL (caller must not log it)
 */
function assertProductionBaseRpcUrl(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    throw new Error("BASE_RPC_URL required for Base mainnet network");
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("BASE_RPC_URL is invalid");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("BASE_RPC_URL must use HTTPS for Base mainnet");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    throw new Error("BASE_RPC_URL is invalid");
  }
  if (LOCAL_HOSTNAMES.has(hostname)) {
    throw new Error("BASE_RPC_URL must not target a local or loopback host");
  }
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("BASE_RPC_URL must not target a local or private host");
  }
  if (isPrivateOrLoopbackIpv4(hostname) || isPrivateOrLoopbackIpv6(hostname)) {
    throw new Error("BASE_RPC_URL must not target a private or loopback address");
  }

  return value;
}

/**
 * Reject Hardhat / Anvil / local ethereum clients by web3_clientVersion.
 * Never prints the client string in a way that embeds RPC URL.
 */
function assertNotLocalEthereumClient(clientVersion) {
  const v = String(clientVersion || "").toLowerCase();
  if (!v) {
    throw new Error("Unable to read Ethereum client version from Base RPC");
  }
  for (const marker of LOCAL_CLIENT_MARKERS) {
    if (v.includes(marker)) {
      throw new Error("BASE_RPC_URL points at a local Hardhat/Anvil-style client — refusing Base deploy");
    }
  }
}

function isBaseNetworkSelected(argv = process.argv, env = process.env) {
  if (String(env.HARDHAT_NETWORK || "").trim() === "base") return true;
  const idx = argv.indexOf("--network");
  if (idx >= 0 && argv[idx + 1] === "base") return true;
  return false;
}

module.exports = {
  LOCAL_HOSTNAMES,
  LOCAL_CLIENT_MARKERS,
  assertProductionBaseRpcUrl,
  assertNotLocalEthereumClient,
  isBaseNetworkSelected,
  isPrivateOrLoopbackIpv4,
  isPrivateOrLoopbackIpv6,
};
