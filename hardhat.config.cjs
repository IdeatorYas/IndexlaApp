require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const baseRpcUrl = process.env.BASE_RPC_URL?.trim();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test/stable-club",
  },
  networks: {
    hardhat: {
      chainId: 8453,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 8453,
    },
    baseFork: {
      url: baseRpcUrl ?? "http://127.0.0.1:8545",
      chainId: 8453,
    },
  },
};
