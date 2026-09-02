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

/** Hosted/local-fork style endpoints that are not Base mainnet production RPCs. */
const HOSTED_FORK_HOST_PATTERNS = [
  /(^|\.)anvil(\.|$)/i,
  /(^|\.)hardhat(\.|$)/i,
  /(^|\.)ganache(\.|$)/i,
  /^virtual\.[^.]+\.rpc\.tenderly\.co$/i,
  /(^|\.)fork\./i,
  /\.fork\./i,
  /(^|\.)localhost\.run$/i,
  /(^|\.)ngrok(-free)?\.(app|io|dev)$/i,
  /(^|\.)nip\.io$/i,
  /(^|\.)sslip\.io$/i,
];

function isPrivateOrLoopbackIpv4(hostname) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!m) return false;
  const oct = m.slice(1).map((x) => Number(x));
  if (oct.some((n) => n > 255)) return true;
  const [a, b] = oct;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isPrivateOrLoopbackIpv6(hostname) {
  // Node URL may keep brackets and rewrite dotted-quad mapped forms to hex
  // (e.g. [::ffff:127.0.0.1] → [::ffff:7f00:1]).
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "::1") return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true;
  if (h.startsWith("fe80")) return true;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(h);
  if (mapped) {
    return isPrivateOrLoopbackIpv4(mapped[1]);
  }
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(h);
  if (mappedHex) {
    const hi = Number.parseInt(mappedHex[1], 16);
    const lo = Number.parseInt(mappedHex[2], 16);
    const a = (hi >> 8) & 0xff;
    const b = hi & 0xff;
    const c = (lo >> 8) & 0xff;
    const d = lo & 0xff;
    return isPrivateOrLoopbackIpv4(`${a}.${b}.${c}.${d}`);
  }
  return false;
}

function isLocalhostHostname(hostname) {
  const h = hostname.toLowerCase();
  if (LOCAL_HOSTNAMES.has(h)) return true;
  if (h === "localhost" || h.endsWith(".localhost") || h.startsWith("localhost.")) return true;
  if (/(^|\.)localhost(\.|$)/.test(h)) return true;
  return false;
}

function isHostedForkHostname(hostname) {
  const h = hostname.toLowerCase();
  return HOSTED_FORK_HOST_PATTERNS.some((re) => re.test(h));
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
  if (isLocalhostHostname(hostname)) {
    throw new Error("BASE_RPC_URL must not target a local or loopback host");
  }
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("BASE_RPC_URL must not target a local or private host");
  }
  if (isPrivateOrLoopbackIpv4(hostname) || isPrivateOrLoopbackIpv6(hostname)) {
    throw new Error("BASE_RPC_URL must not target a private or loopback address");
  }
  if (isHostedForkHostname(hostname)) {
    throw new Error("BASE_RPC_URL must not target a hosted-fork or local-dev relay endpoint");
  }

  return value;
}

function assertNotLocalEthereumClient(clientVersion) {
  const v = String(clientVersion || "").toLowerCase();
  if (!v) {
    throw new Error("Unable to read Ethereum client version from Base RPC");
  }
  for (const marker of LOCAL_CLIENT_MARKERS) {
    if (v.includes(marker)) {
      throw new Error(
        "BASE_RPC_URL points at a local Hardhat/Anvil-style client — refusing Base deploy",
      );
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
  HOSTED_FORK_HOST_PATTERNS,
  assertProductionBaseRpcUrl,
  assertNotLocalEthereumClient,
  isBaseNetworkSelected,
  isPrivateOrLoopbackIpv4,
  isPrivateOrLoopbackIpv6,
  isLocalhostHostname,
  isHostedForkHostname,
};
