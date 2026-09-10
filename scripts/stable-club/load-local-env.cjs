/**
 * Load gitignored local env for Stable Club scripts / Hardhat.
 * - Absolute path from repo root (not cwd-dependent)
 * - Strips UTF-8 BOM (common on Windows editors)
 * - Does not override already-set process.env values
 * - Sibling IndexLa-App/.env.local may supply Etherscan key only
 * - Never logs secret values
 */
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const REPO_ROOT = path.resolve(__dirname, "../..");

const PRIMARY_ENV = [
  path.join(REPO_ROOT, ".env.local"),
  path.join(REPO_ROOT, ".env"),
];

const SIBLING_ENV = [
  path.join(REPO_ROOT, "..", "IndexLa-App", ".env.local"),
];

/** Accepted aliases → canonical ETHERSCAN_API_KEY (Etherscan v2 covers Base). */
const ETHERSCAN_ALIASES = [
  "ETHERSCAN_API_KEY",
  "BASESCAN_API_KEY",
  "ETHERSCAN_KEY",
  "BASESCAN_KEY",
];

/** Keys that may be imported from sibling env files (never private keys / RPCs). */
const SIBLING_IMPORT_ALLOWLIST = new Set(ETHERSCAN_ALIASES);

function stripBom(text) {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1);
  return text;
}

function loadFile(filePath, { allowlist = null } = {}) {
  if (!fs.existsSync(filePath)) return { loaded: false, path: filePath };
  let raw = fs.readFileSync(filePath);
  if (raw[0] === 0xff && raw[1] === 0xfe) {
    raw = Buffer.from(raw.toString("utf16le"));
  }
  const parsed = dotenv.parse(stripBom(raw.toString("utf8")));
  const imported = [];
  for (const [k, v] of Object.entries(parsed)) {
    if (allowlist && !allowlist.has(k)) continue;
    if (process.env[k] === undefined) {
      process.env[k] = v;
      imported.push(k);
    }
  }
  return {
    loaded: true,
    path: filePath,
    keys: Object.keys(parsed),
    imported,
  };
}

function resolveEtherscanApiKey() {
  for (const name of ETHERSCAN_ALIASES) {
    const v = process.env[name]?.trim();
    if (v) {
      process.env.ETHERSCAN_API_KEY = v;
      return { ok: true, source: name, length: v.length };
    }
  }
  return { ok: false, source: null, length: 0 };
}

/**
 * @returns {{ files: object[], etherscan: { ok: boolean, source: string|null, length: number } }}
 */
function loadLocalEnv() {
  const files = [
    ...PRIMARY_ENV.map((p) => loadFile(path.resolve(p))),
    ...SIBLING_ENV.map((p) =>
      loadFile(path.resolve(p), { allowlist: SIBLING_IMPORT_ALLOWLIST }),
    ),
  ];
  const etherscan = resolveEtherscanApiKey();
  return { files, etherscan, repoRoot: REPO_ROOT };
}

function assertEtherscanApiKey() {
  const { etherscan, files } = loadLocalEnv();
  if (etherscan.ok) return etherscan;
  const loaded = files.filter((f) => f.loaded).map((f) => f.path);
  const names = files
    .filter((f) => f.loaded)
    .flatMap((f) => f.keys || [])
    .filter((k, i, a) => a.indexOf(k) === i);
  throw new Error(
    "ETHERSCAN_API_KEY not found after loading .env.local/.env (+ sibling IndexLa-App/.env.local for Etherscan aliases only). " +
      `Loaded files: ${loaded.join(", ") || "(none)"}. ` +
      `Present keys: ${names.join(", ") || "(none)"}. ` +
      "Set ETHERSCAN_API_KEY in IndexLa-App-phase2b/.env.local or IndexLa-App/.env.local (gitignored). Never NEXT_PUBLIC_.",
  );
}

module.exports = {
  REPO_ROOT,
  loadLocalEnv,
  resolveEtherscanApiKey,
  assertEtherscanApiKey,
  ETHERSCAN_ALIASES,
};
