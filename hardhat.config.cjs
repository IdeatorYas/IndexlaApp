require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const baseRpcUrl = process.env.BASE_RPC_URL?.trim();
const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();

/**
 * Base mainnet network is configured lazily:
 * - Missing DEPLOYER_PRIVATE_KEY / BASE_RPC_URL must NOT break hardhat/local tests.
 * - Broadcast requires running deploy-base-mainnet.cjs with --network base and full guards.
 */
const baseNetwork = {
  url: baseRpcUrl || "http://127.0.0.1:8545",
  chainId: 8453,
  accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
};

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: "cancun",
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test/stable-club",
  },
  networks: {
    // Browser / E2E / local deploy — distinct from Base (SC-F02).
    hardhat: {
      chainId: 31337,
      hardfork: "cancun",
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    // Explicit Base-fork network — preserves fork testing without sharing browser identity.
    baseFork: {
      url: baseRpcUrl ?? "http://127.0.0.1:8545",
      chainId: 8453,
    },
    // Production Base — accounts empty unless DEPLOYER_PRIVATE_KEY is set (script still guards).
    base: baseNetwork,
  },
};
