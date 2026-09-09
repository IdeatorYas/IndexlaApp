require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const {
  assertProductionBaseRpcUrl,
  isBaseNetworkSelected,
} = require("./scripts/stable-club/base-rpc-url-guards.cjs");

const baseRpcUrl = process.env.BASE_RPC_URL?.trim();
const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();

/**
 * Base mainnet network is registered only when --network base is selected.
 * Missing/invalid BASE_RPC_URL fails closed for that selection without printing the URL.
 * Local tests / hardhat / baseFork are unaffected.
 */
const networks = {
  // Browser / E2E / local deploy — distinct from Base (SC-F02).
  hardhat: {
    // FORK_CHAIN_ID=8453 for live-state Base forks (strategy.chainId checks).
    chainId: process.env.FORK_CHAIN_ID ? Number(process.env.FORK_CHAIN_ID) : 31337,
    hardfork: "cancun",
    // Required whenever hardhat_reset forks Base; without this EDR rejects historical blocks.
    chains: {
      8453: {
        hardforkHistory: {
          london: 0,
          shanghai: 0,
          cancun: 0,
        },
      },
    },
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
};

if (isBaseNetworkSelected()) {
  const validatedUrl = assertProductionBaseRpcUrl(baseRpcUrl);
  networks.base = {
    url: validatedUrl,
    chainId: 8453,
    accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
  };
}

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
  networks,
  // Etherscan API v2 — single key covers Base (chainid 8453). Never commit the key.
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY?.trim() || "",
  },
};
