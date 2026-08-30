/**
 * Phase 2a/2b deployment manifest validation.
 * Prevents wrong factory / NPM / router generations from being recorded or used.
 */
const { ethers } = require("hardhat");

const BASE_PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

/** Canonical Base infrastructure generations (must not be mixed across adapters). */
const CANONICAL_INFRA = {
  "uniswap-v3": {
    factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
    npm: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
    router: "0x2626664c2603336E57B271c5C0b26F421741e481",
  },
  "aerodrome-legacy": {
    factory: "0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A",
    npm: "0x827922686190790b37229fd06084350e74485b72",
    router: "0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5",
  },
  "aerodrome-current": {
    factory: "0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef",
    npm: "0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53",
    router: "0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F",
  },
};

/**
 * Four unique allowlisted USDC→asset routes that cover the eight-swap deposit plan
 * (2× single-leg swaps + 6× dual-leg swaps reuse these route IDs).
 */
const EXPECTED_ROUTE_IDS = {
  USDC_CBBTC_UNI: ethers.id("ROUTE_USDC_CBBTC_UNI_005"),
  USDC_CBBTC_AERO_L: ethers.id("ROUTE_USDC_CBBTC_AERO_LEGACY_100"),
  USDC_WETH_UNI: ethers.id("ROUTE_USDC_WETH_UNI_005"),
  USDC_WETH_AERO_L: ethers.id("ROUTE_USDC_WETH_AERO_LEGACY_100"),
};

const EXPECTED_ROUTE_COUNT = 4;
const EXPECTED_POOL_COUNT = 5;
/** Eight fee-bearing swaps per full five-pool deposit (coverage target). */
const EXPECTED_SWAPS_PER_DEPOSIT = 8;

function addrEq(a, b) {
  return String(a).toLowerCase() === String(b).toLowerCase();
}

function validatePhase2aManifest(manifest, opts = {}) {
  const errors = [];
  if (!manifest || typeof manifest !== "object") {
    throw new Error("manifest missing");
  }

  const required = [
    "strategyRegistry",
    "clExecutor",
    "swapRouter",
    "permit2",
    "oracleGuard",
    "mevGuard",
    "safetyController",
    "feeRouter",
    "permissionRegistry",
    "adapters",
    "routes",
  ];
  for (const k of required) {
    if (manifest[k] === undefined || manifest[k] === null) {
      errors.push(`missing ${k}`);
    }
  }

  if (!Array.isArray(manifest.adapters) || manifest.adapters.length !== EXPECTED_POOL_COUNT) {
    errors.push(`expected ${EXPECTED_POOL_COUNT} adapters, got ${manifest.adapters?.length}`);
  }

  if (!Array.isArray(manifest.routes) || manifest.routes.length !== EXPECTED_ROUTE_COUNT) {
    errors.push(
      `expected ${EXPECTED_ROUTE_COUNT} allowlisted USDC swap routes (covering ${EXPECTED_SWAPS_PER_DEPOSIT}-swap deposits), got ${manifest.routes?.length}`,
    );
  }

  const expectedIds = new Set(Object.values(EXPECTED_ROUTE_IDS).map((id) => id.toLowerCase()));
  const seen = new Set();
  for (const r of manifest.routes || []) {
    const id = String(r.routeId).toLowerCase();
    if (!expectedIds.has(id)) {
      errors.push(`unexpected routeId ${r.routeId}`);
    }
    if (seen.has(id)) errors.push(`duplicate routeId ${r.routeId}`);
    seen.add(id);
    if (r.enabled !== true) {
      errors.push(`route ${r.name || r.routeId} not enabled`);
    }
  }
  for (const [name, id] of Object.entries(EXPECTED_ROUTE_IDS)) {
    if (!seen.has(id.toLowerCase())) {
      errors.push(`missing required route ${name}`);
    }
  }

  if (!opts.localMocksOk) {
    if (!addrEq(manifest.permit2, BASE_PERMIT2)) {
      errors.push(`permit2 must be canonical Base ${BASE_PERMIT2}, got ${manifest.permit2}`);
    }
  } else if (!manifest.permit2 || manifest.permit2 === ethers.ZeroAddress) {
    errors.push("permit2 unset");
  }

  for (const a of manifest.adapters || []) {
    if (!a.adapter || a.adapter === ethers.ZeroAddress) {
      errors.push(`adapter missing for pool ${a.poolId}`);
    }
    if (opts.localMocksOk) continue;

    const gen =
      a.generation ||
      (a.protocol === "uniswap-v3"
        ? "uniswap-v3"
        : a.tickSpacing === 10 ||
            (a.factory && addrEq(a.factory, CANONICAL_INFRA["aerodrome-current"].factory))
          ? "aerodrome-current"
          : "aerodrome-legacy");
    const expected = CANONICAL_INFRA[gen];
    if (!expected) {
      errors.push(`unknown generation ${gen} for ${a.poolId}`);
      continue;
    }
    if (a.factory && !addrEq(a.factory, expected.factory)) {
      errors.push(`wrong factory generation for ${a.poolId}: ${a.factory} != ${expected.factory}`);
    }
    if (a.npm && !addrEq(a.npm, expected.npm)) {
      errors.push(`wrong NPM generation for ${a.poolId}: ${a.npm} != ${expected.npm}`);
    }
    if (a.router && !addrEq(a.router, expected.router)) {
      errors.push(`wrong router generation for ${a.poolId}: ${a.router} != ${expected.router}`);
    }
  }

  if (!opts.localMocksOk) {
    for (const a of manifest.adapters || []) {
      if (a.protocol === "uniswap-v3" && a.npm && addrEq(a.npm, CANONICAL_INFRA["aerodrome-legacy"].npm)) {
        errors.push(`uniswap adapter ${a.poolId} uses Aerodrome legacy NPM`);
      }
      if (
        a.protocol === "uniswap-v3" &&
        a.npm &&
        addrEq(a.npm, CANONICAL_INFRA["aerodrome-current"].npm)
      ) {
        errors.push(`uniswap adapter ${a.poolId} uses Aerodrome current NPM`);
      }
      if (
        (a.protocol === "aerodrome-slipstream" || a.protocol === "aerodrome") &&
        a.npm &&
        addrEq(a.npm, CANONICAL_INFRA["uniswap-v3"].npm)
      ) {
        errors.push(`aerodrome adapter ${a.poolId} uses Uniswap NPM`);
      }
    }
  }

  if (errors.length) {
    const err = new Error(`Phase2a manifest validation failed:\n- ${errors.join("\n- ")}`);
    err.errors = errors;
    throw err;
  }
  return true;
}

/** Reject a deliberately wrong-generation fixture (unit-test helper). */
function assertRejectsWrongGeneration() {
  const bad = {
    strategyRegistry: "0x1",
    clExecutor: "0x2",
    swapRouter: "0x3",
    permit2: BASE_PERMIT2,
    oracleGuard: "0x4",
    mevGuard: "0x5",
    safetyController: "0x8",
    feeRouter: "0x6",
    permissionRegistry: "0x7",
    routes: Object.entries(EXPECTED_ROUTE_IDS).map(([name, routeId]) => ({
      name,
      routeId,
      enabled: true,
    })),
    adapters: [
      {
        poolId: "uni",
        protocol: "uniswap-v3",
        generation: "uniswap-v3",
        adapter: "0x10",
        factory: CANONICAL_INFRA["uniswap-v3"].factory,
        // Wrong: Aero legacy NPM on Uni adapter
        npm: CANONICAL_INFRA["aerodrome-legacy"].npm,
        router: CANONICAL_INFRA["uniswap-v3"].router,
      },
      { poolId: "a", protocol: "aerodrome-slipstream", generation: "aerodrome-legacy", adapter: "0x11", factory: CANONICAL_INFRA["aerodrome-legacy"].factory, npm: CANONICAL_INFRA["aerodrome-legacy"].npm, router: CANONICAL_INFRA["aerodrome-legacy"].router },
      { poolId: "b", protocol: "aerodrome-slipstream", generation: "aerodrome-current", adapter: "0x12", factory: CANONICAL_INFRA["aerodrome-current"].factory, npm: CANONICAL_INFRA["aerodrome-current"].npm, router: CANONICAL_INFRA["aerodrome-current"].router },
      { poolId: "c", protocol: "aerodrome-slipstream", generation: "aerodrome-legacy", adapter: "0x13", factory: CANONICAL_INFRA["aerodrome-legacy"].factory, npm: CANONICAL_INFRA["aerodrome-legacy"].npm, router: CANONICAL_INFRA["aerodrome-legacy"].router },
      { poolId: "d", protocol: "uniswap-v3", generation: "uniswap-v3", adapter: "0x14", factory: CANONICAL_INFRA["uniswap-v3"].factory, npm: CANONICAL_INFRA["uniswap-v3"].npm, router: CANONICAL_INFRA["uniswap-v3"].router },
    ],
  };
  try {
    validatePhase2aManifest(bad, { localMocksOk: false });
    return false;
  } catch {
    return true;
  }
}

/**
 * SC-F04: earliest confirmed contract-deployment receipt block (> 0).
 * Used as discoveryStartBlock — never invent; never fall back to 0/1 here.
 */
function earliestDiscoveryStartBlock(receiptBlockNumbers) {
  if (!Array.isArray(receiptBlockNumbers) || receiptBlockNumbers.length === 0) {
    throw new Error("discoveryStartBlock requires at least one deployment receipt block");
  }
  let min = null;
  for (const raw of receiptBlockNumbers) {
    const n = typeof raw === "bigint" ? Number(raw) : Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`Invalid deployment receipt block: ${String(raw)}`);
    }
    if (min === null || n < min) min = n;
  }
  return min;
}

/** Wait for a Hardhat/ethers contract deployment receipt and return its blockNumber. */
async function collectDeploymentReceiptBlock(contract) {
  const tx = contract.deploymentTransaction();
  if (!tx) {
    throw new Error("Missing deployment transaction for discoveryStartBlock");
  }
  const receipt = await tx.wait();
  if (receipt == null || receipt.blockNumber == null) {
    throw new Error("Missing deployment receipt blockNumber for discoveryStartBlock");
  }
  return earliestDiscoveryStartBlock([receipt.blockNumber]);
}

module.exports = {
  validatePhase2aManifest,
  assertRejectsWrongGeneration,
  earliestDiscoveryStartBlock,
  collectDeploymentReceiptBlock,
  EXPECTED_ROUTE_IDS,
  CANONICAL_INFRA,
  BASE_PERMIT2,
  EXPECTED_POOL_COUNT,
  EXPECTED_ROUTE_COUNT,
  EXPECTED_SWAPS_PER_DEPOSIT,
};
